import { useEffect, useMemo, useState } from 'react';
import { BrowserProvider, formatEther } from 'ethers';
import { decryptHex, encryptHex } from './lib/hexCipher';
import './App.css';

type Nullable<T> = T | null;

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function App() {
  const [provider, setProvider] = useState<Nullable<BrowserProvider>>(null);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState<Nullable<string>>(null);
  const [chainId, setChainId] = useState<Nullable<number>>(null);
  const [latestBlock, setLatestBlock] = useState<Nullable<number>>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReading, setIsReading] = useState(false);

  const [hexToEncrypt, setHexToEncrypt] = useState('0x48656c6c6f2c205365706f6c696121');
  const [cipherKey, setCipherKey] = useState('sepolia-demo-key');
  const [encryptedHex, setEncryptedHex] = useState('');
  const [hexToDecrypt, setHexToDecrypt] = useState('');
  const [decryptedHex, setDecryptedHex] = useState('');

  useEffect(() => {
    if (!window.ethereum) {
      setStatus('未检测到 MetaMask，请先安装或启用浏览器钱包。');
      return;
    }
    setProvider(new BrowserProvider(window.ethereum));
    setStatus('钱包已就绪，点击连接开始。');
  }, []);

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
      setChainId(parseInt(hexChainId, 16));
      setLatestBlock(null);
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

  const refreshBalance = async (targetAddress = address) => {
    if (!provider || !targetAddress) {
      return;
    }
    setError('');
    try {
      const rawBalance = await provider.getBalance(targetAddress);
      setBalance(formatEther(rawBalance));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取余额失败');
    }
  };

  const readChainData = async () => {
    if (!provider) {
      return;
    }
    setIsReading(true);
    setError('');
    try {
      const [blockNumber, network] = await Promise.all([
        provider.getBlockNumber(),
        provider.getNetwork(),
      ]);
      setLatestBlock(Number(blockNumber));
      setChainId(Number(network.chainId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取链上数据失败');
    } finally {
      setIsReading(false);
    }
  };

  const handleEncrypt = () => {
    setError('');
    try {
      const cipher = encryptHex(hexToEncrypt, cipherKey);
      setEncryptedHex(cipher);
      setHexToDecrypt(cipher);
      setStatus('数据已加密');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加密失败');
    }
  };

  const handleDecrypt = () => {
    setError('');
    try {
      const plain = decryptHex(hexToDecrypt, cipherKey);
      setDecryptedHex(plain);
      setStatus('数据已解密');
    } catch (err) {
      setError(err instanceof Error ? err.message : '解密失败');
    }
  };

  const chainLabel = useMemo(() => {
    if (!chainId) return '未连接';
    if (chainId === 11155111) return 'Sepolia';
    return `链 ID: ${chainId}`;
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
            <button className="ghost" onClick={readChainData} disabled={!provider || isReading}>
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
        <section className="card">
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
            <button className="secondary wide" onClick={readChainData} disabled={!provider || isReading}>
              {isReading ? '读取中...' : '读取区块号'}
            </button>
            <p className="muted small">
              使用 ethers 的 BrowserProvider 直接从 MetaMask 读取链上数据。
            </p>
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
              <label htmlFor="hexToEncrypt">待加密 Hex</label>
              <textarea
                id="hexToEncrypt"
                value={hexToEncrypt}
                onChange={(e) => setHexToEncrypt(e.target.value)}
                placeholder="0x 开头或纯 16 进制"
              />
            </div>
            <div className="actions">
              <button className="primary" onClick={handleEncrypt}>
                加密
              </button>
              <div className="result">
                <p className="label">加密结果</p>
                <code>{encryptedHex || '—'}</code>
              </div>
            </div>

            <div className="field">
              <label htmlFor="hexToDecrypt">待解密 Hex</label>
              <textarea
                id="hexToDecrypt"
                value={hexToDecrypt}
                onChange={(e) => setHexToDecrypt(e.target.value)}
                placeholder="粘贴加密后的 16 进制"
              />
            </div>
            <div className="actions">
              <button className="primary" onClick={handleDecrypt}>
                解密
              </button>
              <div className="result">
                <p className="label">解密结果</p>
                <code>{decryptedHex || '—'}</code>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
