# 🐱 AI Pet — 浏览器桌宠助手

> Chrome Extension Manifest V3 + FastAPI SSE 后端

## 快速开始

### 1. 启动后端

```bash
cd /data/workspace/cvm-ai-pet/server
pip3 install fastapi uvicorn
python3 server.py
# → http://localhost:8900
```

后端提供：
- `POST /api/chat/stream` — SSE 流式聊天
- `POST /api/chat` — 非流式聊天
- `GET /api/health` — 健康检查
- `GET /` — 在线测试页面

### 2. 加载 Chrome 扩展

1. Chrome 地址栏输入 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `/data/workspace/cvm-ai-pet` 文件夹
5. 完成 ✅

### 3. 使用

- **桌宠**：所有网页右下角出现小猫咪
- **拖拽**：按住拖动到任意位置，位置自动保存
- **聊天**：点击桌宠打开聊天面板
- **设置**：点击扩展图标 → 设置 API 端点 / Demo 模式

## 项目结构

```
cvm-ai-pet/
├── manifest.json            # Manifest V3 配置
├── background.js            # Service Worker（SSE 流式 + 消息路由 + Demo Mode）
├── content/
│   ├── pet.js               # 桌宠注入 + 拖拽 + 状态动画
│   ├── pet.css              # 桌宠样式（4种状态动画）
│   ├── chat-panel.js        # 聊天面板 + SSE 流式渲染
│   └── chat-panel.css       # 聊天面板样式
├── assets/
│   ├── pet-idle.svg         # 待机状态（微笑猫咪）
│   ├── pet-thinking.svg     # 思考状态（看上方+问号泡泡）
│   ├── pet-answering.svg    # 回答状态（闪亮眼睛+绿色气泡）
│   └── pet-error.svg        # 错误状态（X眼+耷拉耳朵）
├── popup/
│   ├── popup.html           # 设置页
│   └── popup.js             # 设置逻辑
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── server/
    ├── server.py            # FastAPI 后端（SSE + Mock 数据）
    └── requirements.txt
```

## 桌宠状态

| 状态 | 动画 | 触发时机 |
|------|------|---------|
| idle | 呼吸（上下浮动） | 默认/回答完毕 |
| thinking | 左右摇晃 | 发送消息后等待回复 |
| answering | 弹跳 | 正在接收流式内容 |
| error | 抖动 | API 请求失败 |

## Demo Mode

默认开启（`background.js` 中 `DEMO_MODE = true`）：
- 不需要真实 AI API，使用 mock 数据
- 逐字流式输出模拟真实体验
- 关键词匹配：问候/CVM/闲置 → 不同 mock 回复
- 关闭 Demo Mode 后需要配置真实 API 端点

## 你需要提供的

当前使用的是**占位 SVG 猫咪**，如果你有更好的宠物模型，可以替换：

1. **SVG 动画模型**（推荐）— 替换 `assets/pet-*.svg`，保持 120x120 viewBox
2. **PNG/GIF 序列帧** — 修改 `content/pet.js` 中的 `SVG_MAP`，改用 `.png`/`.gif`
3. **Lottie/Spine 动画** — 需要引入对应运行时，后续可扩展

### SVG 替换指南

每个状态文件需要体现：
- `pet-idle.svg` — 安静/友好/微笑
- `pet-thinking.svg` — 好奇/看上方/问号
- `pet-answering.svg` — 开心/兴奋/说话
- `pet-error.svg` — 沮丧/困惑/歉意

## 后续扩展方向

- [ ] 接入真实 LLM API（混元/OpenAI/Claude）
- [ ] MCP 协议客户端（调用 CVM 数据工具）
- [ ] 插件系统（闹钟/天气/待办/CVM 查询）
- [ ] 语音输入
- [ ] 多桌宠皮肤
- [ ] Chrome Web Store 发布
