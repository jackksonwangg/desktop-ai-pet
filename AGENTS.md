# AGENTS.md — cvm-ai-pet 协作契约（Codex 前端 / CodeBuddy 后端）

> 本文件是 Codex 和 CodeBuddy 两个 AI Agent 之间的“合同”。
> 双方都以此为唯一事实源，不擅自越界修改对方负责的部分。
> 如果你是 Codex，请先完整读完本文件再开始动手。

---

## 0. 项目一句话定位

把 CVM 中台（CVMOps）现有的 AI Agent 能力，用**浏览器桌宠**的形态重新包装成随时可见、可交互的入口。
**桌宠是"脸"，中台 Agent 是"脑"** —— 桌宠本身不重新实现任何 CVM 业务逻辑，只是一个更好的客户端。

```
浏览器桌宠 (本仓库, Codex 负责)
      │  HTTP/SSE 调用（契约见第 2 节）
      ▼
后端网关 (server/, CodeBuddy 负责)
      │  内网转发（真实 CVM Agent，不在本仓库）
      ▼
CVMOps 中台 Agent（Galaxy MCP / 云霄 / 企微，绝密，不可见）
```

---

## 1. 分工边界（硬规则，不可越界）

### 1.1 Codex 负责（本仓库 `cvm-ai-pet/` 除 `server/` 外的全部前端代码）

| 目录 | 内容 |
|---|---|
| `manifest.json` | Chrome Extension Manifest V3 配置 |
| `content/pet.js` `content/pet.css` | 桌宠 widget：渲染、拖拽、位置持久化、4 态动画（idle/thinking/answering/error） |
| `content/chat-panel.js` `content/chat-panel.css` | 聊天面板：SSE 消费、Markdown 渲染、打字指示器、消息历史 UI |
| `background.js` | Service Worker：content ↔ 后端的消息路由、`chrome.storage` 配置管理 |
| `popup/` | 设置弹窗（API 地址/模型/Demo 模式开关等纯前端展示） |
| `assets/` `icons/` | 视觉资源 |
| 单元测试/E2E（如需要） | 针对上述前端逻辑 |

### 1.2 CodeBuddy 负责（不可由 Codex touch）

| 内容 | 原因 |
|---|---|
| `server/`（本仓库的后端网关代码） | 涉及把请求转发到 CVM 中台，未来会接入内部鉴权 |
| `/data/workspace/CVMOps/` 整个仓库 | 内部代码，含凭证逻辑，绝不外传给外部 LLM |
| 真实 API Key / Token / 内网域名 | 安全边界（见第 3 节） |
| 与 cvmops.woa.com 的鉴权对接（cookie/JWE） | 涉及内部太湖鉴权体系 |
| 最终 PR 审查与合并 | 保证没有密钥泄露、没有越界改动 |

### 1.3 判断原则

> **拿不准该谁做？问自己：这行代码需不需要知道任何内网域名、Token 或内部业务规则？**
> 需要 → CodeBuddy 做。
> 不需要（纯 UI/交互/浏览器 API） → Codex 做。

---

## 2. API 契约（Codex 只能"消费"，不能"实现"这些接口）

后端网关地址在开发环境是 `http://localhost:8900`，生产环境地址由 CodeBuddy 后续在 `background.js` 的 `DEFAULT_CONFIG.apiEndpoint` 里配置，Codex 不需要关心它具体指向哪个内网服务。

### 2.1 `POST /api/chat/stream` — 核心对话接口（SSE 流式）

**请求体**：
```json
{
  "message": "用户当前输入",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "sessionId": "可选，字符串，用于关联多轮对话",
  "context": {
    "pageUrl": "可选，用户当前所在网页 URL，用于将来做上下文感知",
    "pageTitle": "可选"
  }
}
```

**响应**：`Content-Type: text/event-stream`，逐行 `data: {...}\n\n`，事件类型如下（**Codex 前端必须能处理全部类型**）：

| 事件字段 | 示例 | 前端应做的事 |
|---|---|---|
| `{"status":"thinking"}` | 开始处理 | 桌宠切到 `thinking` 状态动画 |
| `{"phase":"tool_calling","tool":"query_galaxy"}` | 正在查内部数据（可选出现） | 显示"正在查询 xxx..."提示条，桌宠保持 `thinking` |
| `{"content":"文本片段"}` | 逐字/逐 token 输出 | 追加到聊天气泡，桌宠切到 `answering` |
| `{"error":"错误信息"}` | 请求失败 | 显示错误提示，桌宠切到 `error` 状态 |
| `{"done":true}` | 结束 | 桌宠回到 `idle`，允许下一次输入 |

> 注意：`phase/tool` 字段是**可选扩展**——如果以后接了真实 CVM Agent 的工具调用过程，会新增这个事件类型。**Codex 现在写解析逻辑时就要用"未知字段忽略、已知字段处理"的方式，不要假设事件类型是封闭集合，避免后端加字段后前端崩溃。**

### 2.2 `POST /api/chat`（非流式，备用/降级用）

请求同上，响应：
```json
{ "content": "完整回复文本", "model": "模型名" }
```

### 2.3 `GET /api/health`

```json
{ "status": "ok", "mode": "mock|deepseek|cvm-agent", "model": "...", "version": "...", "timestamp": 0 }
```
前端在 popup 设置页/桌宠状态里可以展示这个，用于诊断连接问题。

### 2.4 （预留，暂不实现）`GET /api/quick/:action` — 数据快捷通道

未来会加一批"不经过大模型、直接查缓存数据"的快捷动作（例如"今日闲置率简报"），格式参考：
```json
{ "title": "今日简报", "summary": "...", "details": ["...", "..."] }
```
**Codex 现在不需要实现这个功能的 UI**，但如果要设计 popup/桌宠的"快捷按钮"区域，请把这个可能性纳入布局设计（留一个可扩展的按钮列表位置），具体接入等 CodeBuddy 通知。

### 2.5 （预留，暂不实现）MCP 工具代理接口

> **为什么插件不能直接调 MCP？**
> MCP 协议需要持久连接（stdio/HTTP long-poll），而 Chrome 插件的 Service Worker 有生命周期限制（浏览器随时挂起），不适合做 MCP Client。
> 所以 MCP 调用全部由 `server/` 代理——插件只发普通 HTTP 请求。

**规划接口**（CodeBuddy 未来实现，Codex 前端只需预留 UI 位置）：

#### `POST /api/mcp/call` — 代理调用 MCP 工具

请求：
```json
{
  "tool": "工具名（如 query_galaxy、check_reservation）",
  "params": { "gid": "xxx", "date": "2026-07-13" }
}
```
响应（SSE 流式，格式同 2.1）：
```json
{"status":"thinking"}
{"phase":"tool_calling","tool":"query_galaxy"}
{"content":"查询结果文本..."}
{"done":true}
```

#### `GET /api/mcp/tools` — 列出当前可用的 MCP 工具

响应：
```json
{
  "tools": [
    { "name": "query_galaxy", "description": "查询 Galaxy MCP 数据", "category": "data" },
    { "name": "check_reservation", "description": "检查预扣状态", "category": "reservation" }
  ]
}
```

**Codex 前端需要做的事**：
- 在 popup 设置页或桌宠快捷按钮区域，**预留一个"工具列表"的 UI 位置**（可折叠/可扩展的按钮组）
- 不需要现在实现具体工具的 UI，等 CodeBuddy 通知哪些工具可用后再接入
- `/api/mcp/call` 的 SSE 格式和 `/api/chat/stream` 完全一致，前端解析逻辑可以复用

---

## 3. 安全红线（违反任何一条都必须重做）

1. **禁止硬编码任何 API Key / Token / 密码**到代码里。所有敏感配置必须走：
   - 开发环境：`.env` 文件（必须加进 `.gitignore`，仓库里只能有 `.env.example` 占位）
   - 或 `chrome.storage.local` 由用户在 popup 里自己填（BYOK 模式）
2. **禁止在 `manifest.json` 的 `host_permissions` 里写任何 `*.woa.com` / 内网域名 / 内网 IP（如 21.x/10.x/9.x/30.x 段）**。本仓库定位是开源壳子，只能面向 `localhost` 或用户自填的公开地址。
3. **禁止读取或修改 `/data/workspace/CVMOps/` 目录下的任何文件**。
4. **禁止 push 到 git.woa.com（工蜂）**。本仓库只 push 到 GitHub。
5. 涉及用户输入的地方（聊天框、popup 配置）**必须做基本转义**，聊天面板渲染 Markdown 时禁止 `innerHTML` 直接插入未转义的用户输入（XSS 风险）。
6. `content_scripts` 的 `matches` 目前是 `<all_urls>`，这是有意为之（桌宠要在所有网页可见），但**不要新增任何读取页面内容/DOM 的逻辑**，除非任务明确要求"上下文感知"功能——桌宠的定位是独立浮层，不窥探页面内容。

---

## 4. Git 工作流

- **仓库**：GitHub（新建，例如 `github.com/<your-account>/cvm-ai-pet`），**不是**工蜂 git.woa.com
- **分支**：
  - `main`：CodeBuddy 审查后合并的稳定分支
  - `codex/*`：Codex 的工作分支（例如 `codex/pet-animations`、`codex/chat-panel-refactor`），每个任务一个分支
- **提交粒度**：一次提交对应一个完整的小功能，commit message 用 `feat(pet): ...` / `fix(chat-panel): ...` 这种格式
- **流程**：
  1. Codex 在 `codex/*` 分支上开发
  2. 完成后在 `PROGRESS.md`（见第 5 节）追加一条记录，说明做了什么、改了哪些文件、有什么已知问题
  3. CodeBuddy 拉取分支、`git diff` 审查（重点检查第 3 节安全红线）、决定合并或打回修改
  4. 合并到 `main` 后，Codex 下一个任务从最新 `main` 拉新分支

---

## 5. 异步协作机制（因为你俩不是实时对话）

Codex 和 CodeBuddy 是两个独立运行的 Agent 会话，**不会实时看到对方在做什么**。为了不各干各的、不冲突，用同目录下的 `PROGRESS.md` 作为异步留言板：

- 开始一个任务前：先读 `PROGRESS.md` 最新几条，确认没人在改同一批文件
- 完成一个任务后：在 `PROGRESS.md` **追加**一条（不要覆盖历史），格式见该文件模板
- 如果发现 API 契约（第 2 节）需要变更：**不要自己改契约**，在 `PROGRESS.md` 里写明"需要 CodeBuddy 确认的问题"，等待下一轮同步

---

## 6. 当前状态快照（首次接手时请读)

- Manifest V3 骨架已搭好，`content/pet.js` 用占位 SVG 猫咪，4 态动画已实现
- `background.js` 已实现完整 SSE 消费逻辑，指向 `http://localhost:8900`（本地 mock/DeepSeek 后端，非最终 CVM Agent 后端）
- `server/server.py` 硬编码 API Key **已修复**（改为纯环境变量读取，未配置时自动降级 Mock 模式）
- Agent-to-agent 闭环已验证通过：Codex 在 `codex/frontend-work` 分支做了联动测试，CodeBuddy 审查并合并到 `main`
- 尚未接入真实 CVM Agent；`context.pageUrl` 等字段是为将来扩展预留的，目前后端不会用到
- MCP 工具代理接口已规划（2.5 节），`server/` 未来会加 `mcp_proxy.py` 适配层，插件只需预留 UI 位置

---

## 7. 给 Codex 的第一批具体任务建议（可直接执行）

1. 把 `server/server.py` 里硬编码的 Key 替换为环境变量读取（**这一步例外允许 Codex 做**，纯粹是把 `os.getenv(...)` 的 fallback 硬编码值删掉，不涉及新增内部逻辑）——⚠️ 如果 Codex 无法安全确认这一步，跳过，留给 CodeBuddy
2. `content/pet.js`：把占位 SVG 换成更精细的动画（用户会另外提供素材）
3. `content/chat-panel.js`：补充 Markdown 代码块高亮、消息历史滚动、SSE 断线重连
4. `popup/`：加一个"连接状态"指示灯（调 `/api/health`）
5. 补充前端单元测试（如果引入测试框架，选轻量的，不要引入重型工具链）

有疑问就写进 `PROGRESS.md`，不要自行假设后端行为。
