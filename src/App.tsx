import { useState } from "react";
import "./App.css";

type SubgraphEntry = {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
};

const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1716551/laotang-the-graph/version/latest";

const formatAddress = (addr: string) => {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const formatTimestamp = (ts: string) => {
  const seconds = Number(ts);
  if (Number.isNaN(seconds)) return ts;
  return new Date(seconds * 1000).toLocaleString();
};

function App() {
  const [status, setStatus] = useState("");
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logs, setLogs] = useState<SubgraphEntry[]>([]);

  const fetchSubgraphLogs = async () => {
    setIsFetchingLogs(true);
    setLogsError("");
    setStatus("");
    try {
      const query = `
        query FetchLogs($first: Int!) {
          dataStoreds(orderBy: blockTimestamp, orderDirection: desc, first: $first) {
            id
            sender
            message
            timestamp
            blockNumber
            blockTimestamp
            transactionHash
          }
        }
      `;
      const resp = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { first: 15 } }),
      });
      if (!resp.ok) {
        throw new Error(`Subgraph 请求失败: ${resp.status}`);
      }
      const payload = (await resp.json()) as {
        data?: { dataStoreds?: SubgraphEntry[] };
        errors?: { message?: string }[];
      };
      if (payload.errors?.length) {
        throw new Error(payload.errors[0].message || "GraphQL 查询出错");
      }
      const entries = payload.data?.dataStoreds ?? [];
      setLogs(entries);
      setStatus(`已获取 ${entries.length} 条 Subgraph 日志`);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "读取 Subgraph 失败");
    } finally {
      setIsFetchingLogs(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">The Graph</p>
          <h1>Subgraph 日志查询</h1>
          <p className="lede">查询部署在 Subgraph Studio 的合约日志。</p>
          <p className="status">{logsError || status || "准备就绪"}</p>
        </div>
      </header>

      <main className="grid">
        <section className="card span-2">
          <div className="card-header">
            <div>
              <p className="eyebrow">Subgraph</p>
              <h2>查询合约日志</h2>
            </div>
            <span className="badge">GraphQL</span>
          </div>
          <div className="subgraph">
            <p className="muted small">
              向 Subgraph Studio 地址{" "}
              <code className="inline-code">{SUBGRAPH_URL}</code> 发起 GraphQL
              请求，读取 <code>dataStoreds</code> 表中的日志。
            </p>
            <button
              className="primary"
              onClick={fetchSubgraphLogs}
              disabled={isFetchingLogs}
            >
              {isFetchingLogs ? "查询中..." : "获取最新日志"}
            </button>
            {logs.length === 0 ? (
              <p className="muted">暂无数据，点击上方按钮拉取。</p>
            ) : (
              <div className="table-wrap">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>消息</th>
                      <th>Sender</th>
                      <th>Tx Hash</th>
                      <th>Block</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((item) => (
                      <tr key={item.id}>
                        <td className="message-cell">{item.message}</td>
                        <td>{formatAddress(item.sender)}</td>
                        <td>{formatAddress(item.transactionHash)}</td>
                        <td>{item.blockNumber}</td>
                        <td>{formatTimestamp(item.blockTimestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
