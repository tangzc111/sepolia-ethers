import { useEffect, useMemo, useState } from 'react';
import { JsonRpcProvider, ZeroAddress, formatEther, getAddress } from 'ethers';
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
  const infuraProvider = useMemo(() => new JsonRpcProvider(INFURA_RPC_URL), []);
  const [chainId, setChainId] = useState<Nullable<number>>(null);
  const [infuraBlock, setInfuraBlock] = useState<Nullable<number>>(null);
  const [infuraTarget, setInfuraTarget] = useState(ZeroAddress);
  const [infuraBalance, setInfuraBalance] = useState<Nullable<string>>(null);
  const [isInfuraReading, setIsInfuraReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isFetchingTx, setIsFetchingTx] = useState(false);

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

  useEffect(() => {
    const readNetwork = async () => {
      try {
        const network = await infuraProvider.getNetwork();
        setChainId(Number(network.chainId));
        setStatus('已连接到 Infura RPC');
      } catch (err) {
        setError(err instanceof Error ? err.message : '读取网络信息失败');
      }
    };
    void readNetwork();
  }, [infuraProvider]);

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

  const handleFetchTx = async () => {
    const hash = lookupHash.trim();
    if (!hash) {
      setError('请输入交易哈希');
      return;
    }
    setError('');
    setStatus('');
    setIsFetchingTx(true);
    setTxInfo(null);
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
      setStatus('已通过 Infura 读取交易数据');
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询交易失败');
    } finally {
      setIsFetchingTx(false);
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
          <p className="eyebrow">Sepolia · Infura · RPC</p>
          <h1>Infura 读取面板</h1>
          <p className="lede">无需 MetaMask，直接通过 Infura RPC 查询区块、余额与交易。</p>
          <div className="hero-actions">
            <span className="badge">Infura RPC</span>
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
            <button className="primary wide" onClick={handleFetchTx} disabled={isFetchingTx}>
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
          </div>
        </section>

      </main>
    </div>
  );
}

export default App;
