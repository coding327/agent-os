# agent-os

以飞书话题群为操作界面、Claude Code 与 Codex 为执行引擎的个人生产系统。一个话题对应一个 CLI 会话，话题一旦建立就固定使用创建时选中的引擎。

## 运行

```bash
pnpm start       # watch 模式启动，源码变化后自动重启
pnpm dev         # pnpm start 的别名
pnpm start:once  # 单次启动
```

## 约定

- ESM only，Node 22+，pnpm
- 凭证只放 `.env`（已 gitignore），绝不硬编码、绝不提交
- `DEFAULT_CLI` 可设为 `claude` 或 `codex`，只影响新话题
- `/claude <任务>` 与 `/codex <任务>` 可以为新话题显式选择引擎
- Claude Code 与 Codex 的模型服务使用各自的用户级配置，不把模型密钥写进项目 `.env`

## 错题本

> 踩坑后追加一行：现象 → 原因 → 正确做法。给未来的 AI 和人看。

- pnpm v11 默认拒绝依赖的构建脚本（esbuild 装完不可用）→ 在 `pnpm-workspace.yaml` 写 `allowBuilds: { esbuild: true }` 放行
- Windows 下 Codex CLI 执行完成后一直卡住无法 resolve，直到超时报错 → Windows 下通过 cmd/shim 启动的多层子进程退出时触发了 `exit`，但管道句柄可能延迟释放使得 `close` 无法按时触发；且 Codex `turn.completed` 事件会带空 answer 覆盖已有结果 → runner 中同时监听 `exit`/`close` 并做流资源清理，合并 answer/stats 避免冲掉回答
