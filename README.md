# Sepolia Ethers

React + TypeScript + Vite 示例，使用 wagmi 连接钱包，并通过 The Graph Subgraph 查询红包数据：

- 连接 MetaMask（EIP-1193）
- 查看 ENS 名称 / 地址
- 读取红包列表、红包详情、领取记录（Subgraph 只读）

## 快速开始

```bash
pnpm install    # 或 npm install / yarn
pnpm dev        # 或 npm run dev
```

默认使用浏览器钱包（MetaMask）提供的 Provider 直连当前网络。

## 功能说明

- **连接钱包**：点击“连接钱包”请求账户授权。
- **查看 ENS / 地址**：显示 ENS 名称或短地址。
- **红包查询**：通过 Subgraph 查看最新红包、红包详情与领取记录。
- **发红包 / 抢红包占位**：UI 已就绪，实际链上交易需集成对应合约。

## 构建与预览

```bash
pnpm build
pnpm preview
```

## Cloudflare Pages 部署

- 构建命令：`pnpm build`
- 输出目录：`dist`
- SPA 路由：已在 `public/_redirects` 添加 `/* /index.html 200`
- 可选本地预览：`pnpm preview`
- `wrangler.toml` 已设置 `pages_build_output_dir = "dist"`

## 目录

- `src/App.tsx`：页面逻辑与 UI。
- `vite.config.ts` / `tsconfig*.json`：构建与类型配置。
