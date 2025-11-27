import { useEffect, useMemo, useState } from 'react';
import { formatEther, getAddress, parseEther, zeroAddress } from 'viem';
import {
  useAccount,
  useBalance,
  useBlockNumber,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { decryptHexToText, encryptTextToHex } from './lib/hexCipher';
import './App.css';

type Nullable<T> = T | null;

const CHAINS = [sepolia, mainnet];
const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function App() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { sendTransactionAsync, isPending: isSendingTx } = useSendTransaction();

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [textToEncrypt, setTextToEncrypt] = useState('Hello, Sepolia!');
  const [cipherKey, setCipherKey] = useState('sepolia-demo-key');
  const [encryptedHex, setEncryptedHex] = useState('');
  const [hexToDecrypt, setHexToDecrypt] = useState('');
  const [decryptedText, setDecryptedText] = useState('');
  const [targetChain, setTargetChain] = useState<number>(sepolia.id);
  const [targetAddress, setTargetAddress] = useState(zeroAddress);
  const [transferMessage, setTransferMessage] = useState('Encrypted hello on-chain');
  const [transferValue, setTransferValue] = useState('0');
  const [txHash, setTxHash] = useState<Nullable<`0x${string}`>>(null);
  const [lookupHash, setLookupHash] = useState('');
  const [txInfo, setTxInfo] = useState<Nullable<{
    hash: string;
    from: string;
    to: string | null;
    valueEth: string;
    data: string;
    blockNumber: number | null;
    status?: number | null;
  }>>(null);
  const [txDecrypted, setTxDecrypted] = useState('');
  const [isFetchingTx, setIsFetchingTx] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const publicClient = usePublicClient({ chainId: targetChain });

  const {
    data: balanceData,
    refetch: refetchBalance,
    isFetching: isBalanceFetching,
  } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) },
  });

  const {
    data: blockNumber,
    refetch: refetchBlock,
    isFetching: isReading,
  } = useBlockNumber({
    chainId,
    query: { enabled: Boolean(chainId), refetchOnWindowFocus: false },
  });

  const [pendingHash, setPendingHash] = useState<Nullable<`0x${string}`>>(null);
  const { data: receipt } = useWaitForTransactionReceipt({
    chainId: targetChain,
    hash: pendingHash ?? undefined,
  });

  useEffect(() => {
    if (chainId) {
      setTargetChain(chainId);
    }
  }, [chainId]);

  useEffect(() => {
    if (!receipt) return;
    const statusLabel = receipt.status === 'success' ? '已上链' : '链上失败';
    setStatus(`${statusLabel}，区块 ${receipt.blockNumber}`);
    if (receipt.status !== 'success') {
      setError('交易在链上被回滚');
    } else {
      void refetchBalance();
    }
  }, [receipt, refetchBalance]);

  const latestBlock = blockNumber ? Number(blockNumber) : null;
  const balance = balanceData ? balanceData.formatted : null;

  const chainLabel = useMemo(() => {
    if (!chainId) return '未连接';
    const target = CHAINS.find((n) => n.id === chainId);
    return target ? target.name : `链 ID: ${chainId}`;
  }, [chainId]);

  const handleConnect = async () => {
    setError('');
    const injectedConnector = connectors.find((c) => c.id === 'injected') ?? connectors[0];
    if (!injectedConnector) {
      setStatus('未检测到浏览器钱包，请安装或开启 MetaMask');
      return;
    }
    try {
      setStatus('请求连接中...');
      await connect({ connector: injectedConnector });
      setStatus('钱包已连接');
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接钱包失败');
    }
  };

  const readChainData = async () => {
    setError('');
    try {
      await Promise.all([refetchBlock(), refetchBalance()]);
      setStatus('链上数据已刷新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取链上数据失败');
    }
  };

  const handleSwitchNetwork = async () => {
    if (!switchChainAsync) return;
    setError('');
    try {
      await switchChainAsync({ chainId: targetChain });
      setStatus('已请求切换网络');
      setTxInfo(null);
      setTxDecrypted('');
      setTxHash(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换网络失败');
    }
  };

  const handleSendEncrypted = async () => {
    if (!address) {
      setStatus('请先连接钱包');
      return;
    }
    if (!publicClient) {
      setError('缺少可用的公链客户端');
      return;
    }
    setError('');
    setTxHash(null);
    setTxInfo(null);
    setTxDecrypted('');
    setIsSending(true);
    setPendingHash(null);
    try {
      const to = getAddress((targetAddress || zeroAddress).trim());
      const data = encryptTextToHex(transferMessage, cipherKey) as `0x${string}`;
      const value = transferValue.trim() ? parseEther(transferValue as `${number}`) : 0n;

      let gas: bigint | undefined;
      try {
        const estimated = await publicClient.estimateGas({
          account: address,
          to,
          value,
          data,
        });
        gas = (estimated * 12n) / 10n;
        setStatus(`已估算 Gas: ${gas.toString()}`);
      } catch {
        gas = undefined;
        setStatus('Gas 估算失败，将使用钱包默认值');
      }

      const hash = await sendTransactionAsync({
        to,
        value,
        data,
        gas,
        chainId: targetChain,
      });

      setTxHash(hash);
      setPendingHash(hash);
      setStatus('交易已发送，等待确认...');
    } catch (err) {
      const code = (err as { code?: number | string }).code;
      if (code === 4001 || code === 'ACTION_REJECTED') {
        setStatus('用户已取消交易签名');
        setError('');
      } else {
        setError(err instanceof Error ? err.message : '发送交易失败');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleFetchTx = async () => {
    if (!publicClient) {
      setStatus('请先连接钱包');
      return;
    }
    const hashInput = (lookupHash.trim() || txHash) as `0x${string}` | null;
    if (!hashInput) {
      setError('请输入交易哈希');
      return;
    }
    setError('');
    setStatus('');
    setIsFetchingTx(true);
    setTxInfo(null);
    setTxDecrypted('');
    try {
      const tx = await publicClient.getTransaction({ hash: hashInput });
      if (!tx) {
        throw new Error('未找到交易');
      }
      const receiptData = await publicClient.getTransactionReceipt({ hash: hashInput }).catch(() => null);
      const blockNumber = receiptData?.blockNumber ?? tx.blockNumber ?? null;
      const statusCode = receiptData?.status ? (receiptData.status === 'success' ? 1 : 0) : null;
      const data = (tx.input ?? tx.data ?? '0x') as string;
      const valueEth = formatEther(tx.value);
      setTxInfo({
        hash: tx.hash,
        from: tx.from,
        to: tx.to ?? null,
        valueEth,
        data,
        blockNumber,
        status: statusCode,
      });
      if (data && data !== '0x') {
        try {
          const decrypted = decryptHexToText(data, cipherKey);
          setTxDecrypted(decrypted);
        } catch {
          setTxDecrypted('无法用当前密钥解密');
        }
      }
      setStatus('交易数据已获取');
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询交易失败');
    } finally {
      setIsFetchingTx(false);
    }
  };

  const handleEncrypt = () => {
    setError('');
    try {
      const cipher = encryptTextToHex(textToEncrypt, cipherKey);
      setEncryptedHex(cipher);
      setHexToDecrypt(cipher);
      setStatus('文本已加密');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加密失败');
    }
  };

  const handleDecrypt = () => {
    setError('');
    try {
      const plain = decryptHexToText(hexToDecrypt, cipherKey);
      setDecryptedText(plain);
      setStatus('文本已解密');
    } catch (err) {
      setError(err instanceof Error ? err.message : '解密失败');
    }
  };

  const latestStatus = error || status || '准备就绪';
  const isSendingOrWaiting = isSending || isSendingTx;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Sepolia · wagmi · MetaMask</p>
          <h1>On-chain Playground</h1>
          <p className="lede">
            使用 wagmi 连接钱包、读取余额与区块高度，并试试自定义的 16 进制加解密。
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={handleConnect} disabled={isConnecting || isConnected}>
              {isConnecting ? '连接中...' : isConnected ? '已连接' : '连接 MetaMask (wagmi)'}
            </button>
            <button className="ghost" onClick={() => readChainData()} disabled={!isConnected || isReading}>
              {isReading ? '读取中...' : '刷新链上数据'}
            </button>
            {isConnected && (
              <button className="secondary" onClick={() => disconnect()}>
                断开
              </button>
            )}
          </div>
          <p className="status">{latestStatus}</p>
        </div>
        <div className="pill">
          <span className="label">当前网络</span>
          <strong>{chainLabel}</strong>
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">钱包</p>
              <h2>wagmi 连接</h2>
            </div>
            <span className="badge">{isConnected ? '已连接' : '未连接'}</span>
          </div>
          <div className="wallet">
            {isConnected && address ? (
              <>
                <p className="label">地址</p>
                <div className="address">{formatAddress(address)}</div>
                <div className="balance-row">
                  <div>
                    <p className="label">余额 (ETH)</p>
                    <h3>{isBalanceFetching ? '...' : balance ?? '—'}</h3>
                  </div>
                  <button className="secondary" onClick={() => refetchBalance()}>
                    刷新余额
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">点击“连接 MetaMask”获取钱包信息。</p>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">链上读取</p>
              <h2>Sepolia 数据</h2>
            </div>
          </div>
          <div className="chain">
            <div className="stat">
              <p className="label">当前链</p>
              <strong>{chainLabel}</strong>
            </div>
            <div className="stat">
              <p className="label">最新区块</p>
              <strong>{latestBlock ?? '未读取'}</strong>
            </div>
            <button
              className="secondary wide"
              onClick={() => refetchBlock()}
              disabled={!isConnected || isReading}
            >
              {isReading ? '读取中...' : '读取区块号'}
            </button>
            <p className="muted small">通过 wagmi 的 useBlockNumber 与 useBalance 读取链上数据。</p>
            <div className="field">
              <label htmlFor="network">切换网络</label>
              <select
                id="network"
                value={targetChain}
                onChange={(e) => setTargetChain(Number(e.target.value))}
              >
                {CHAINS.map((net) => (
                  <option key={net.id} value={net.id}>
                    {net.name} ({net.id})
                  </option>
                ))}
              </select>
            </div>
            <button
              className="primary wide"
              onClick={handleSwitchNetwork}
              disabled={!isConnected || isSwitching}
            >
              {isSwitching ? '切换中...' : '切换网络'}
            </button>
            <p className="muted small">wagmi 会调用钱包完成链切换/添加。</p>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">转账</p>
              <h2>发送到指定地址</h2>
            </div>
            <span className="badge">消耗 Gas</span>
          </div>
          <div className="cipher-grid">
            <div className="field">
              <label htmlFor="transferTo">收款地址</label>
              <input
                id="transferTo"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                placeholder="输入 0x 开头地址"
              />
            </div>
            <div className="field">
              <label htmlFor="transferMessage">加密文本</label>
              <textarea
                id="transferMessage"
                value={transferMessage}
                onChange={(e) => setTransferMessage(e.target.value)}
                placeholder="写点什么，链上通过 data 发送"
              />
            </div>
            <div className="field">
              <label htmlFor="transferKey">密钥（同上）</label>
              <input
                id="transferKey"
                value={cipherKey}
                onChange={(e) => setCipherKey(e.target.value)}
                placeholder="输入密钥"
              />
            </div>
            <div className="field">
              <label htmlFor="transferValue">发送 ETH 数量（可为 0）</label>
              <input
                id="transferValue"
                type="number"
                min="0"
                step="0.0001"
                value={transferValue}
                onChange={(e) => setTransferValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <button
              className="primary wide"
              onClick={handleSendEncrypted}
              disabled={!isConnected || isSendingOrWaiting}
            >
              {isSendingOrWaiting ? '发送中...' : '加密并发送交易 (wagmi)'}
            </button>
            <p className="muted small">
              交易会把加密文本放入 data 字段，收款地址由上方输入框决定，需消耗 Gas。
            </p>
            <div className="result">
              <p className="label">最新交易哈希</p>
              <code>{txHash || '—'}</code>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">链上数据</p>
              <h2>根据哈希查询交易</h2>
            </div>
            <span className="badge">读取链上</span>
          </div>
          <div className="cipher-grid">
            <div className="field">
              <label htmlFor="lookupHash">交易哈希</label>
              <input
                id="lookupHash"
                value={lookupHash}
                onChange={(e) => setLookupHash(e.target.value)}
                placeholder="0x 开头的交易哈希，默认用上方最新交易"
              />
            </div>
            <button
              className="primary wide"
              onClick={handleFetchTx}
              disabled={!isConnected || isFetchingTx}
            >
              {isFetchingTx ? '读取中...' : '查询交易'}
            </button>
            <p className="muted small">使用当前密钥尝试解密 data 字段。</p>
            <div className="result">
              <p className="label">查询结果</p>
              <code>
                {txInfo
                  ? JSON.stringify(
                      {
                        hash: txInfo.hash,
                        from: txInfo.from,
                        to: txInfo.to,
                        valueEth: `${txInfo.valueEth} ETH`,
                        blockNumber: txInfo.blockNumber,
                        status: txInfo.status,
                        data: txInfo.data,
                      },
                      null,
                      2
                    )
                  : '—'}
              </code>
            </div>
            <div className="result">
              <p className="label">data 解密尝试</p>
              <code>{txDecrypted || '—'}</code>
            </div>
          </div>
        </section>

        <section className="card span-2">
          <div className="card-header">
            <div>
              <p className="eyebrow">16 进制</p>
              <h2>自定义加密 / 解密</h2>
            </div>
            <span className="badge">对称异或</span>
          </div>

          <div className="cipher-grid">
            <div className="field">
              <label htmlFor="key">密钥</label>
              <input
                id="key"
                value={cipherKey}
                onChange={(e) => setCipherKey(e.target.value)}
                placeholder="输入任意密钥"
              />
            </div>

            <div className="field">
              <label htmlFor="textToEncrypt">待加密文本</label>
              <textarea
                id="textToEncrypt"
                value={textToEncrypt}
                onChange={(e) => setTextToEncrypt(e.target.value)}
                placeholder="输入要加密的原始文本"
              />
            </div>
            <div className="actions">
              <button className="primary" onClick={handleEncrypt}>
                加密
              </button>
              <div className="result">
                <p className="label">加密结果 (0x Hex)</p>
                <code>{encryptedHex || '—'}</code>
              </div>
            </div>

            <div className="field">
              <label htmlFor="hexToDecrypt">待解密 16 进制</label>
              <textarea
                id="hexToDecrypt"
                value={hexToDecrypt}
                onChange={(e) => setHexToDecrypt(e.target.value)}
                placeholder="粘贴加密后的 0x 开头或纯 16 进制密文"
              />
            </div>
            <div className="actions">
              <button className="primary" onClick={handleDecrypt}>
                解密
              </button>
              <div className="result">
                <p className="label">解密结果（文本）</p>
                <code>{decryptedText || '—'}</code>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
