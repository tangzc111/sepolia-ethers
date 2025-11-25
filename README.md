# Sepolia Ethers

React + TypeScript + Vite 示例，演示：

- 连接 MetaMask（EIP-1193）
- 读取钱包余额
- 自定义 16 进制数据加密 / 解密
- 使用 ethers 读取链上数据（区块高度、网络）

## 快速开始

```bash
pnpm install    # 或 npm install / yarn
pnpm dev        # 或 npm run dev
```

默认使用浏览器钱包（MetaMask）提供的 Provider 直连当前网络。推荐切换到 Sepolia 测试网体验。

## 功能说明

- **连接钱包**：点击“连接 MetaMask”请求账户授权，并展示地址与余额。
- **余额刷新**：使用 `provider.getBalance` 读取并格式化 ETH 余额。
- **链上读取**：通过 `provider.getBlockNumber` 与 `provider.getNetwork` 获取最新区块与链 ID。
- **自定义加解密**：基于 16 进制字符串的对称异或算法。`encryptHex` / `decryptHex` 会验证输入并保持 `0x` 前缀。

## 构建与预览

```bash
pnpm build
pnpm preview
```

## 目录

- `src/App.tsx`：页面逻辑与 UI。
- `src/lib/hexCipher.ts`：自定义加解密工具函数。
- `vite.config.ts` / `tsconfig*.json`：构建与类型配置。
