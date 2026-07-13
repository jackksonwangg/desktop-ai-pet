# PROGRESS.md — Codex / CodeBuddy 异步协作留言板

> 追加写入，不要删除历史记录。每次任务开始前先读最新几条。
> 格式：`## [日期] [Agent 名] [任务]` + 做了什么 / 改了哪些文件 / 已知问题 / 需要对方确认的问题

---

## [2026-07-12] [CodeBuddy] 初始化协作契约

**做了什么**：
- 创建 `AGENTS.md`，定义 Codex/CodeBuddy 分工边界、API 契约、安全红线、Git 工作流
- 创建本文件作为异步留言板

**改了哪些文件**：`AGENTS.md`（新增）、`PROGRESS.md`（新增）

**已知问题**：
- `server/server.py` 硬编码了 HAI/DeepSeek API Key，尚未清理
- 项目尚未 `git init`，尚未推到 GitHub
- 尚未接入真实 CVM Agent 后端，`/api/chat/stream` 目前只是纯闲聊 DeepSeek 代理

**需要 Codex 确认的问题**：无（首次同步）

---

<!-- Codex 从这里往下追加你的记录 -->
