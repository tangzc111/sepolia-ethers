import { useEffect, useMemo, useState } from 'react';
import {
  BrowserProvider,
  JsonRpcProvider,
  ZeroAddress,
  formatEther,
  getAddress,
  parseEther,
} from 'ethers';
import { decryptHexToText, encryptTextToHex } from './lib/hexCipher';
import './App.css';

type Nullable<T> = T | null;

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const INFURA_RPC_URL = 'https://sepolia.infura.io/v3/986a1a52c6b74ece8e5205273d3275ec';
const SUPPORTED_NETWORKS = [
  {
    chainId: 11155111,
    hex: '0xaa36a7',
    name: 'Sepolia',
    rpcUrls: ['https://rpc.sepolia.org', INFURA_RPC_URL],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 1,
    hex: '0x1',
    name: 'Ethereum Mainnet',
    rpcUrls: ['https://cloudflare-eth.com'],
    blockExplorerUrls: ['https://etherscan.io'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
];

function App() {
  const [provider, setProvider] = useState<Nullable<BrowserProvider>>(null);
  const infuraProvider = useMemo(() => new JsonRpcProvider(INFURA_RPC_URL), []);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState<Nullable<string>>(null);
  const [chainId, setChainId] = useState<Nullable<number>>(null);
  const [latestBlock, setLatestBlock] = useState<Nullable<number>>(null);
  const [infuraBlock, setInfuraBlock] = useState<Nullable<number>>(null);
  const [infuraTarget, setInfuraTarget] = useState(ZeroAddress);
  const [infuraBalance, setInfuraBalance] = useState<Nullable<string>>(null);
  const [isInfuraReading, setIsInfuraReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFetchingTx, setIsFetchingTx] = useState(false);

  const [textToEncrypt, setTextToEncrypt] = useState('Hello, Sepolia!');
  const [cipherKey, setCipherKey] = useState('sepolia-demo-key');
  const [encryptedHex, setEncryptedHex] = useState('');
  const [hexToDecrypt, setHexToDecrypt] = useState('');
  const [decryptedText, setDecryptedText] = useState('');
  const [targetChain, setTargetChain] = useState(11155111);
  const [targetAddress, setTargetAddress] = useState(ZeroAddress);
  const [transferMessage, setTransferMessage] = useState('Encrypted hello on-chain');
  const [transferValue, setTransferValue] = useState('0');
  const [txHash, setTxHash] = useState('');
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

  useEffect(() => {
    if (!window.ethereum) {
      setStatus('未检测到 MetaMask，请先安装或启用浏览器钱包。');
      return;
    }
    const freshProvider = new BrowserProvider(window.ethereum, 'any');
    setProvider(freshProvider);
    setStatus('钱包已就绪，点击连接开始。');
  }, []);

  useEffect(() => {
    if (!provider) return;
    const syncConnection = async () => {
      try {
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const account = accounts[0];
          const accountAddress = typeof account === 'string' ? account : account.address;
          setAddress(accountAddress);
          setStatus('检测到已连接的钱包');
          await Promise.all([refreshBalance(accountAddress, provider), readChainData(provider)]);
        } else {
          setStatus('钱包已就绪，点击连接开始。');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '检测钱包状态失败');
      }
    };
    void syncConnection();
  }, [provider]);

  useEffect(() => {
    if (!window.ethereum?.on) {
      return;
    }
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAddress('');
        setBalance(null);
        return;
      }
      setAddress(accounts[0]);
      refreshBalance(accounts[0]);
    };

    const handleChainChanged = (hexChainId: string) => {
      const nextId = parseInt(hexChainId, 16);
      setChainId(nextId);
      setTargetChain(nextId);
      setLatestBlock(null);
      setTxInfo(null);
      setTxDecrypted('');
      setTxHash('');
      const freshProvider = new BrowserProvider(window.ethereum, 'any');
      setProvider(freshProvider);
      void refreshBalance(address, freshProvider);
      void readChainData(freshProvider);
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [provider]);

  const connectWallet = async () => {
    setError('');
    if (!provider) {
      setStatus('需要 MetaMask 或兼容钱包。');
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts || accounts.length === 0) {
        throw new Error('未能获取钱包地址');
      }
      const account = accounts[0];
      setAddress(account);
      setStatus('钱包已连接');
      await Promise.all([refreshBalance(account), readChainData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接钱包失败');
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshBalance = async (
    targetAddress = address,
    customProvider: Nullable<BrowserProvider> = provider,
  ) => {
    if (!customProvider || !targetAddress) {
      return;
    }
    setError('');
    try {
      const rawBalance = await customProvider.getBalance(targetAddress);
      setBalance(formatEther(rawBalance));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取余额失败');
    }
  };

  const readChainData = async (customProvider: Nullable<BrowserProvider> = provider) => {
    if (!customProvider) {
      return;
    }
    setIsReading(true);
    setError('');
    try {
      const [blockNumber, network] = await Promise.all([
        customProvider.getBlockNumber(),
        customProvider.getNetwork(),
      ]);
      setLatestBlock(Number(blockNumber));
      setChainId(Number(network.chainId));
      setTargetChain(Number(network.chainId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取链上数据失败');
    } finally {
      setIsReading(false);
    }
  };

  const readInfuraData = async () => {
    setError('');
    setIsInfuraReading(true);
    try {
      const checksumAddress = getAddress(infuraTarget.trim());
      const [blockNumber, balanceWei] = await Promise.all([
        infuraProvider.getBlockNumber(),
        infuraProvider.getBalance(checksumAddress),
      ]);
      setInfuraBlock(Number(blockNumber));
      setInfuraBalance(formatEther(balanceWei));
      setStatus('已通过 Infura RPC 读取数据');
    } catch (err) {
      setError(err instanceof Error ? err.message : '通过 Infura 读取失败');
    } finally {
      setIsInfuraReading(false);
    }
  };

  const handleSwitchNetwork = async () => {
    if (!provider) {
      setStatus('请先连接钱包');
      return;
    }
    setError('');
    setIsSwitching(true);
    try {
      const target = SUPPORTED_NETWORKS.find((n) => n.chainId === targetChain);
      if (!target) {
        throw new Error('不支持的网络');
      }
      await provider.send('wallet_switchEthereumChain', [{ chainId: target.hex }]);
      setStatus(`已切换到 ${target.name}`);
      setTxInfo(null);
      setTxDecrypted('');
      setTxHash('');
      const freshProvider = new BrowserProvider(window.ethereum, 'any');
      setProvider(freshProvider);
      await Promise.all([readChainData(freshProvider), refreshBalance(address, freshProvider)]);
    } catch (err: unknown) {
      const errorCode = (err as { code?: number }).code;
      if (errorCode === 4902) {
        try {
          const target = SUPPORTED_NETWORKS.find((n) => n.chainId === targetChain);
          if (!target) throw new Error('不支持的网络');
          await provider.send('wallet_addEthereumChain', [target]);
          setStatus(`已添加并切换到 ${target.name}`);
          await readChainData();
        } catch (innerErr) {
          setError(innerErr instanceof Error ? innerErr.message : '添加网络失败');
        }
      } else {
        setError(err instanceof Error ? err.message : '切换网络失败');
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSendEncrypted = async () => {
    if (!provider) {
      setStatus('请先连接钱包');
      return;
    }
    setError('');
    setTxHash('');
    setIsSending(true);
    try {
      const to = getAddress(targetAddress.trim());
      const signer = await provider.getSigner();
      const data = encryptTextToHex(transferMessage, cipherKey);
      const value = transferValue.trim() ? parseEther(transferValue) : 0n;
      const txRequest = {
        to,
        value,
        data,
      };

      let gasLimit: bigint | undefined;
      try {
        const estimated = await provider.estimateGas(txRequest);
        gasLimit = (estimated * 12n) / 10n; // add 20% buffer
        setStatus(`已估算 Gas: ${gasLimit.toString()}`);
      } catch {
        gasLimit = 80000n;
        setStatus('Gas 估算失败，使用默认 80000');
      }

      const tx = await signer.sendTransaction({ ...txRequest, gasLimit });

      setStatus('交易已发送，等待确认...');
      const receipt = await tx.wait();
      setTxHash(receipt.hash);
      setStatus(`已上链，区块 ${receipt.blockNumber}`);
      await refreshBalance();
    } catch (err) {
      const errorCode = (err as { code?: number | string }).code;
      if (errorCode === 4001 || errorCode === 'ACTION_REJECTED') {
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
    const hash = lookupHash.trim() || txHash;
    if (!hash) {
      setError('请输入交易哈希');
      return;
    }
    setError('');
    setStatus('');
    setIsFetchingTx(true);
    setTxInfo(null);
    setTxDecrypted('');
    try {
      const tx = await infuraProvider.getTransaction(hash);
      if (!tx) {
        throw new Error('未找到交易');
      }
      const receipt = await infuraProvider.getTransactionReceipt(hash);
      const blockNumber = receipt?.blockNumber ?? tx.blockNumber ?? null;
      const statusCode = receipt?.status ?? null;
      const valueEth = formatEther(tx.value);
      const data = tx.data || '0x';
      setTxInfo({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
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
      setStatus('已通过 Infura 读取交易数据');
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

  const chainLabel = useMemo(() => {
    if (!chainId) return '未连接';
    const target = SUPPORTED_NETWORKS.find((n) => n.chainId === chainId);
    return target ? target.name : `链 ID: ${chainId}`;
  }, [chainId]);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Sepolia · ethers · MetaMask</p>
          <h1>On-chain Playground</h1>
          <p className="lede">
            连接钱包、读取余额与区块高度，并试试自定义的 16 进制加解密。
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? '连接中...' : address ? '重新连接' : '连接 MetaMask'}
            </button>
            <button className="ghost" onClick={() => readChainData()} disabled={!provider || isReading}>
              {isReading ? '读取中...' : '刷新链上数据'}
            </button>
          </div>
          <p className="status">
            {error || status || '准备就绪'}
          </p>
        </div>
        <div className="pill">
          <span className="label">当前网络</span>
          <strong>{chainLabel}</strong>
        </div>
      </header>

      <main className="grid">
        {/* <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">钱包</p>
              <h2>MetaMask 连接</h2>
            </div>
            <span className="badge">{address ? '已连接' : '未连接'}</span>
          </div>
          <div className="wallet">
            {address ? (
              <>
                <p className="label">地址</p>
                <div className="address">{formatAddress(address)}</div>
            <div className="balance-row">
              <div>
                <p className="label">余额 (ETH)</p>
                <h3>{balance ?? '...'}</h3>
              </div>
              <button className="secondary" onClick={() => refreshBalance()}>
                刷新余额
              </button>
            </div>
              </>
            ) : (
              <p className="muted">点击“连接 MetaMask”获取钱包信息。</p>
            )}
          </div>
        </section> */}

        {/* <section className="card">
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
              onClick={() => readChainData()}
              disabled={!provider || isReading}
            >
              {isReading ? '读取中...' : '读取区块号'}
            </button>
            <p className="muted small">
              使用 ethers 的 BrowserProvider 直接从 MetaMask 读取链上数据。
            </p>
            <div className="field">
              <label htmlFor="network">切换网络</label>
              <select
                id="network"
                value={targetChain}
                onChange={(e) => setTargetChain(Number(e.target.value))}
              >
                {SUPPORTED_NETWORKS.map((net) => (
                  <option key={net.chainId} value={net.chainId}>
                    {net.name} ({net.chainId})
                  </option>
                ))}
              </select>
            </div>
            <button
              className="primary wide"
              onClick={handleSwitchNetwork}
              disabled={!provider || isSwitching}
            >
              {isSwitching ? '切换中...' : '切换/添加网络'}
            </button>
            <p className="muted small">MetaMask 会弹出确认，支持主网和 Sepolia。</p>
          </div>
        </section> */}

        <section className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Infura</p>
              <h2>无需钱包直接读取</h2>
            </div>
            <span className="badge">RPC</span>
          </div>
          <div className="cipher-grid">
            <div className="stat">
              <p className="label">最新区块（Infura）</p>
              <strong>{infuraBlock ?? '未读取'}</strong>
            </div>
            <div className="field">
              <label htmlFor="infuraAddress">任意地址（Sepolia）</label>
              <input
                id="infuraAddress"
                value={infuraTarget}
                onChange={(e) => setInfuraTarget(e.target.value)}
                placeholder="输入要查询余额的地址"
              />
            </div>
            <div className="stat">
              <p className="label">余额 (ETH)</p>
              <strong>{infuraBalance ?? '—'}</strong>
            </div>
            <button className="secondary wide" onClick={readInfuraData} disabled={isInfuraReading}>
              {isInfuraReading ? '读取中...' : '使用 Infura 读取'}
            </button>
            <p className="muted small">
              通过 {INFURA_RPC_URL} 发起 JsonRpc 请求，直接读取区块高度与余额。
            </p>
          </div>
        </section>

        {/* <section className="card">
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
              disabled={!provider || isSending}
            >
              {isSending ? '发送中...' : '加密并发送交易'}
            </button>
            <p className="muted small">
              交易会把加密文本放入 data 字段，收款地址由上方输入框决定，需消耗 Gas。
            </p>
            <div className="result">
              <p className="label">最新交易哈希</p>
              <code>{txHash || '—'}</code>
            </div>
          </div>
        </section> */}

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
              disabled={!provider || isFetchingTx}
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

        {/* <section className="card span-2">
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
        </section> */}
      </main>
    </div>
  );
}

export default App;
