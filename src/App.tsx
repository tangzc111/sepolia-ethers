import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useEnsName,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import './App.css';
import { redEnvelopeAbi } from './abis/redEnvelope';

const GRAPH_URL = 'https://api.studio.thegraph.com/query/1716551/laotang-the-graph-redenvelope/version/latest';
const CONTRACT_ADDRESS = '0x2D4Bb1e8A16b7454748B2Ba5c74ff489fAb4dfE8';
const TARGET_CHAIN_ID = 11155111;

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const formatAmount = (value?: string | null) => {
  if (!value) return '0';
  try {
    return `${formatEther(BigInt(value))} ETH`;
  } catch {
    return value;
  }
};
const formatDate = (ts?: string | number | null) => {
  if (!ts) return '--';
  const num = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(num)) return '--';
  return new Date(num * 1000).toLocaleString();
};

const formatTxError = (err: unknown) => {
  const code = (err as { code?: number | string })?.code;
  const msg =
    (err as { shortMessage?: string })?.shortMessage ||
    (err as Error)?.message ||
    '交易失败';
  if (code === 4001 || code === 'ACTION_REJECTED') return '用户已取消交易';
  if (/user rejected|denied transaction/i.test(msg)) return '用户已取消交易';
  if (/insufficient funds/i.test(msg)) return '余额不足，无法支付该交易';
  return msg.length > 18 ? '交易失败，请稍后重试' : msg;
};

type Envelope = {
  id: string;
  creator: string;
  totalAmount: string;
  remainingAmount: string;
  totalSlots: number;
  remainingSlots: number;
  equalShare: boolean;
  createdAt: string;
  reclaimed: boolean;
  claimedCount: number;
  createdTxHash?: string;
  expired?: boolean;
};

type Claim = {
  id: string;
  envelope: string;
  claimer: string;
  amount: string;
  remainingSlots: number;
  remainingAmount: string;
  blockTimestamp: string;
};

type TabKey = 'send' | 'claim';

async function fetchGraph<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'GraphQL 请求失败');
  }
  return json.data as T;
}

function App() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('send');
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [detail, setDetail] = useState<Envelope | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formAmount, setFormAmount] = useState('0.1');
  const [formSlots, setFormSlots] = useState('3');
  const [formEqual, setFormEqual] = useState(true);
  const [claimId, setClaimId] = useState('');
  const [toasts, setToasts] = useState<
    { id: number; message: string; tone: 'info' | 'error' }[]
  >([]);
  const { data: ensName, isLoading: isEnsLoading } = useEnsName({
    address,
    chainId: 1,
    query: { enabled: Boolean(address) },
  });
  const { data: txHash, writeContractAsync, isPending: isWriting } = useWriteContract();
  const { data: receipt, isLoading: isWaitingReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });

  const chainLabel = useMemo(() => {
    if (!chainId) return '未连接';
    return `链 ID: ${chainId}`;
  }, [chainId]);

  const walletLabel = useMemo(() => {
    if (!isConnected || !address) return '未连接';
    if (isEnsLoading) return '查询 ENS...';
    return ensName || formatAddress(address);
  }, [address, ensName, isConnected, isEnsLoading]);

  useEffect(() => {
    if (!isConnected) {
      setStatus('');
    } else {
      setStatus('钱包已连接');
    }
  }, [isConnected]);

  const loadEnvelopes = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchGraph<{ envelopes: Envelope[] }>(
        `query RecentEnvelopes {
          envelopes(first: 15, orderBy: createdAt, orderDirection: desc) {
            id
            creator
            totalAmount
            remainingAmount
            totalSlots
            remainingSlots
            equalShare
            createdAt
            reclaimed
            claimedCount
            createdTxHash
          }
        }`
      );
      setEnvelopes(data.envelopes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取红包列表失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEnvelopes();
  }, [loadEnvelopes]);

  const pushToast = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    if (!message) return;
    const id = Date.now() + Math.random();
    // 只保留最新一条，避免同时出现多个 toast
    setToasts([{ id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    if (status) pushToast(status, 'info');
  }, [pushToast, status]);

  useEffect(() => {
    if (error) pushToast(error, 'error');
  }, [error, pushToast]);

  const loadEnvelopeDetail = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchGraph<{ envelope: Envelope | null; claims: Claim[] }>(
        `query EnvelopeDetail($id: ID!) {
          envelope(id: $id) {
            id
            creator
            totalAmount
            remainingAmount
            totalSlots
            remainingSlots
            equalShare
            createdAt
            reclaimed
            claimedCount
            createdTxHash
          }
          claims(where: { envelope: $id }, orderBy: blockTimestamp, orderDirection: desc) {
            id
            envelope
            claimer
            amount
            remainingSlots
            remainingAmount
            blockTimestamp
          }
        }`,
        { id }
      );
      setDetail(data.envelope ?? null);
      setClaims(data.claims || []);
      if (!data.envelope) {
        setStatus('未找到该红包');
      }
      if (data.envelope && publicClient) {
        try {
      const info = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'getEnvelope',
        args: [BigInt(id)],
      });
          const [, , remainingAmount, , remainingSlots, , , reclaimed, expired] = info;
          setDetail({
            ...data.envelope,
            remainingAmount: remainingAmount.toString(),
            remainingSlots: Number(remainingSlots),
            reclaimed: Boolean(reclaimed),
            expired: Boolean(expired),
          });
        } catch {
          // ignore on-chain read errors, keep subgraph data
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取红包详情失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!receipt) return;
    const success = receipt.status === 'success';
    setStatus(success ? '交易已上链' : '交易失败');
    void loadEnvelopes();
    if (detail?.id) {
      void loadEnvelopeDetail(detail.id);
    }
  }, [detail?.id, loadEnvelopeDetail, loadEnvelopes, receipt]);

  const handleConnect = async () => {
    setStatus('钱包连接中');
    const injectedConnector = connectors.find((c) => c.id === 'injected') ?? connectors[0];
    if (!injectedConnector) {
      setStatus('未检测到浏览器钱包，请安装或开启 MetaMask');
      return;
    }
    try {
      await connect({ connector: injectedConnector });
    } catch (err) {
      setError(formatTxError(err));
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setStatus('已断开钱包');
  };

  const handleCreate = async () => {
    if (!isConnected) {
      setStatus('请先连接钱包');
      return;
    }
    if (chainId && chainId !== TARGET_CHAIN_ID) {
      setStatus('请切换到 Sepolia 再试');
      return;
    }
    setError('');
    try {
      const slots = Number(formSlots);
      if (!Number.isFinite(slots) || slots < 3 || slots > 10) {
        setStatus('份数需在 3 ~ 10 之间');
        return;
      }
      const value = parseEther(formAmount || '0');
      setStatus('提交发红包交易中...');
      const hash = await (writeContractAsync as any)({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'createEnvelope',
        args: [slots, formEqual],
        value,
        chainId: TARGET_CHAIN_ID,
      });
      setStatus(`交易已发送：${hash}`);
      // 发送后主动刷新列表，等待 Subgraph 同步时可多次点击刷新
      void loadEnvelopes();
    } catch (err) {
      setError(formatTxError(err));
    }
  };

  const handleClaim = async () => {
    if (!isConnected) {
      setStatus('请先连接钱包');
      return;
    }
    if (chainId && chainId !== TARGET_CHAIN_ID) {
      setStatus('请切换到 Sepolia 再试');
      return;
    }
    if (!address) {
      setStatus('请先连接钱包');
      return;
    }
    const envId = claimId || detail?.id;
    if (!envId) {
      setStatus('请输入红包 ID');
      return;
    }
    setError('');
    try {
      const idNum = BigInt(envId);
      if (!publicClient) {
        setStatus('缺少可用的链上客户端');
        return;
      }
      const info = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'getEnvelope',
        args: [idNum],
      });
      const [, , remainingAmount, , remainingSlots, , , reclaimed, expired] = info;
      if (expired) {
        setStatus('红包已过期');
        return;
      }
      if (reclaimed) {
        setStatus('红包已被回收');
        return;
      }
      if (BigInt(remainingSlots) === 0n || BigInt(remainingAmount) === 0n) {
        setStatus('红包已被领完');
        return;
      }
      const alreadyClaimed = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'claimed',
        args: [idNum, address],
      });
      if (alreadyClaimed) {
        setStatus('你已领取过该红包');
        return;
      }
      setStatus('提交抢红包交易中...');
      const hash = await (writeContractAsync as any)({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'claim',
        args: [idNum],
        chainId: TARGET_CHAIN_ID,
      });
      setStatus(`交易已发送：${hash}`);
    } catch (err) {
      setError(formatTxError(err));
    }
  };

  const handleReclaim = async (id: string) => {
    if (!isConnected) {
      setStatus('请先连接钱包');
      return;
    }
    if (chainId && chainId !== TARGET_CHAIN_ID) {
      setStatus('请切换到 Sepolia 再试');
      return;
    }
    if (!address) {
      setStatus('请先连接钱包');
      return;
    }
    if (!id) {
      setStatus('缺少红包 ID');
      return;
    }
    setError('');
    try {
      const envId = BigInt(id);
      if (!publicClient) {
        setStatus('缺少可用的链上客户端');
        return;
      }
      const info = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'getEnvelope',
        args: [envId],
      });
      const [, , remainingAmount, , remainingSlots, , , reclaimed, expired] = info;
      if (reclaimed) {
        setStatus('红包已回收');
        return;
      }
      if (!expired) {
        setStatus('红包未过期，暂不可回收');
        return;
      }
      if (BigInt(remainingAmount) === 0n || BigInt(remainingSlots) === 0n) {
        setStatus('无可回收余额');
        return;
      }
      setStatus('提交回收交易中...');
      const hash = await (writeContractAsync as any)({
        address: CONTRACT_ADDRESS,
        abi: redEnvelopeAbi,
        functionName: 'reclaimExpired',
        args: [envId],
        chainId: TARGET_CHAIN_ID,
      });
      setStatus(`交易已发送：${hash}`);
    } catch (err) {
      setError(formatTxError(err));
    }
  };

  const myEnvelopes = useMemo(() => {
    if (!address) return [] as Envelope[];
    return envelopes.filter((env) => env.creator.toLowerCase() === address.toLowerCase());
  }, [address, envelopes]);

  return (
    <div className="page">
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.tone === 'error' ? 'error' : ''}`}>
            <span className="toast-icon" aria-hidden>
              {t.tone === 'error' ? '⚠️' : '🎉'}
            </span>
            <span className="toast-text">{t.message}</span>
          </div>
        ))}
      </div>

      <div className="banner">
        <div className="banner-info">
          <span className="dot" aria-hidden />
          <div>
            <p className="eyebrow">链上红包</p>
            <p className="subtitle">React + wagmi + The Graph</p>
            <p className="subtitle muted">{chainLabel}</p>
          </div>
        </div>

        <div className="action-group">
          <div className="status-chip">
            <span className="chip-label">当前钱包</span>
            <strong>{walletLabel}</strong>
          </div>
          <button
            className={isConnected ? 'btn secondary' : 'btn primary'}
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? '连接中...' : isConnected ? '断开钱包' : '连接钱包'}
          </button>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            { key: 'send', label: '发红包' },
            { key: 'claim', label: '抢红包' },
          ] as { key: TabKey; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel">
        {activeTab === 'send' ? (
          <>
            <div className="section">
              <h3>发红包</h3>
              <p className="muted">连接钱包后，填写金额与份数并调用合约完成发放。</p>
              <div className="form-grid">
                <label className="field">
                  <span>总金额 (ETH)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    disabled={!isConnected}
                  />
                </label>
                <label className="field">
                  <span>红包份数</span>
                  <input
                    type="number"
                    min="3"
                    max="10"
                    step="1"
                    value={formSlots}
                    onChange={(e) => setFormSlots(e.target.value)}
                    disabled={!isConnected}
                  />
                </label>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    checked={formEqual}
                    onChange={(e) => setFormEqual(e.target.checked)}
                    disabled={!isConnected}
                  />
                  <span>平均分配</span>
                </label>
              </div>
              <button
                className="btn primary"
                onClick={handleCreate}
                disabled={!isConnected || isWriting || isWaitingReceipt}
              >
                发红包（需链上交易）
              </button>
            </div>

            <div className="section">
              <div className="section-header">
                <h3>我最近的红包</h3>
                <button className="ghost" onClick={() => loadEnvelopes()} disabled={isLoading}>
                  {isLoading ? '刷新中...' : '刷新'}
                </button>
              </div>
              {!isConnected && <p className="muted">连接钱包后查看自己发过的红包。</p>}
              {isConnected && myEnvelopes.length === 0 && <p className="muted">暂无记录。</p>}
              {isConnected && myEnvelopes.length > 0 && (
                <div className="list">
                  {myEnvelopes.map((env) => (
                    <div key={env.id} className="list-item">
                      <div onClick={() => setClaimId(env.id)}>
                        <p className="strong">红包 ID：{env.id}</p>
                        <p className="muted small">创建时间：{formatDate(env.createdAt)}</p>
                      </div>
                      <div className="pill-chip">
                        {formatAmount(env.remainingAmount)} / {formatAmount(env.totalAmount)} · 剩余 {env.remainingSlots}/{env.totalSlots}
                      </div>
                      {env.remainingAmount !== '0' && !env.reclaimed && (
                        <button
                          className="ghost"
                          onClick={() => handleReclaim(env.id)}
                          disabled={!isConnected || isWriting || isWaitingReceipt}
                        >
                          取回余额
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="section">
              <h3>抢红包</h3>
              <p className="muted">输入红包 ID 或点击下方列表，连接钱包后调用合约完成抢红包。</p>
              <div className="form-grid">
                <label className="field">
                  <span>红包 ID</span>
                  <input
                    type="text"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    placeholder="粘贴红包 ID"
                  />
                </label>
              </div>
              <div className="actions">
                <button className="btn secondary" onClick={() => loadEnvelopeDetail(claimId)} disabled={!claimId}>
                  加载红包信息
                </button>
                <button
                  className="btn primary"
                  onClick={handleClaim}
                  disabled={!isConnected || !detail || isWriting || isWaitingReceipt}
                >
                  抢红包（需链上交易）
                </button>
              </div>

              {detail && (
                <div className="card-box">
                  <div className="card-line">
                    <span>红包 ID</span>
                    <strong>{detail.id}</strong>
                  </div>
                  <div className="card-line">
                    <span>创建者</span>
                    <strong>{formatAddress(detail.creator)}</strong>
                  </div>
                  <div className="card-line">
                    <span>金额</span>
                    <strong>
                      {formatAmount(detail.remainingAmount)} / {formatAmount(detail.totalAmount)}
                    </strong>
                  </div>
                  <div className="card-line">
                    <span>份数</span>
                    <strong>
                      {detail.remainingSlots}/{detail.totalSlots} {detail.equalShare ? '平均' : '拼手气'}
                    </strong>
                  </div>
                  <div className="card-line">
                    <span>状态</span>
                    <strong>{detail.reclaimed ? '已回收' : detail.expired ? '已过期' : '可领取'}</strong>
                  </div>
                  <div className="card-line">
                    <span>创建时间</span>
                    <strong>{formatDate(detail.createdAt)}</strong>
                  </div>
                </div>
              )}

              {claims.length > 0 && (
                <div className="section">
                  <div className="section-header">
                    <h4>领取记录</h4>
                  </div>
                  <div className="list">
                    {claims.map((c) => (
                      <div key={c.id} className="list-item">
                        <div>
                          <p className="strong">{formatAddress(c.claimer)}</p>
                          <p className="muted small">{formatDate(c.blockTimestamp)}</p>
                        </div>
                        <div className="pill-chip">{formatAmount(c.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="section">
              <div className="section-header">
                <h3>最新红包</h3>
                <button className="ghost" onClick={() => loadEnvelopes()} disabled={isLoading}>
                  {isLoading ? '刷新中...' : '刷新'}
                </button>
              </div>
              {envelopes.length === 0 && <p className="muted">暂无数据，稍后重试。</p>}
              {envelopes.length > 0 && (
                <div className="list">
                  {envelopes.map((env) => (
                    <div
                      key={env.id}
                      className="list-item"
                      onClick={() => {
                        setClaimId(env.id);
                        void loadEnvelopeDetail(env.id);
                        setActiveTab('claim');
                      }}
                    >
                      <div>
                        <p className="strong">红包 ID：{env.id}</p>
                        <p className="muted small">创建者：{formatAddress(env.creator)}</p>
                      </div>
                      <div className="pill-chip">
                        {formatAmount(env.remainingAmount)} / {formatAmount(env.totalAmount)} · 剩余 {env.remainingSlots}/{env.totalSlots}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
