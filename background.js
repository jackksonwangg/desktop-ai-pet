// background.js — Service Worker: SSE 流式 API、消息路由、Demo Mode
// v0.3 — 增加调试日志 + 错误上报

const DEMO_MODE = false;
console.log('[AI-Pet SW] Service Worker 启动, DEMO_MODE=', DEMO_MODE);

// 默认 API 配置
const DEFAULT_CONFIG = {
  apiEndpoint: 'http://localhost:8900/api/chat/stream',
  model: 'demo-model',
  demoMode: DEMO_MODE
};

// Demo Mode mock 响应
const DEMO_RESPONSES = [
  '你好！我是 AI 桌宠助手 🐱\n我可以帮你查询 CVM 数据、闲聊、或者回答技术问题。\n试试问我："今天天气怎么样？" 或 "CVM 闲置率是多少？"',
  '这是一个 **demo 模式** 的回复。\n正式版会连接真实的 AI 模型，支持流式输出。\n\n目前你可以体验：\n- 桌宠拖拽移动\n- 聊天面板交互\n- 状态动画切换',
  '好的，让我查一下...\n\n```\n闲置率数据（demo）：\n- 区域 A: 12.5%\n- 区域 B: 8.3%\n- 区域 C: 15.7%\n```\n\n这是 mock 数据，正式版会调用真实 API。',
  '我是一只小猫咪 🐱，最喜欢帮主人解决问题！\n\n你可以把我拖到屏幕任意位置，点击我就能打开聊天面板。\n有什么需要随时问我~',
  '关于 CVM 的常见问题：\n\n1. **闲置预扣** — 如何查看集团闲置率？\n2. **客户规模** — 如何分析客户变动趋势？\n3. **资源明细** — 如何查看子公司资源分布？\n\n正式版会接入真实数据源回答这些问题。'
];

// ===== 安装/启动事件 =====
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AI-Pet SW] 扩展已安装/更新');
});

// ===== 消息监听 =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[AI-Pet SW] 收到消息:', msg.type, 'from tab:', sender.tab?.id);

  if (msg.type === 'chat') {
    // 异步处理，保持通道开放
    handleChat(msg, sender).then(() => {
      sendResponse({ status: 'ok' });
    }).catch((err) => {
      console.error('[AI-Pet SW] handleChat 出错:', err);
      sendResponse({ status: 'error', message: err.message });
    });
    return true; // async sendResponse
  }

  if (msg.type === 'get-config') {
    chrome.storage.local.get(['aiPetConfig'], (result) => {
      console.log('[AI-Pet SW] get-config →', result.aiPetConfig || DEFAULT_CONFIG);
      sendResponse(result.aiPetConfig || DEFAULT_CONFIG);
    });
    return true;
  }

  if (msg.type === 'save-config') {
    chrome.storage.local.set({ aiPetConfig: msg.config }, () => {
      console.log('[AI-Pet SW] save-config OK', msg.config);
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.type === 'ping') {
    console.log('[AI-Pet SW] ping → pong');
    sendResponse({ pong: true, timestamp: Date.now() });
    return true;
  }
});

// ===== 处理聊天请求 =====
async function handleChat(msg, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    console.error('[AI-Pet SW] 无 tabId, 无法发送消息');
    return;
  }
  const config = await getConfig();
  console.log('[AI-Pet SW] 处理聊天, config.demoMode=', config.demoMode);

  if (config.demoMode) {
    await demoStreamResponse(tabId, msg.message);
    return;
  }

  try {
    await streamAPIResponse(tabId, msg.message, msg.history, config);
  } catch (e) {
    console.error('[AI-Pet SW] API 调用失败:', e);
    const errMsg = e.message || 'API 请求失败';
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'stream-error', data: errMsg });
      await chrome.tabs.sendMessage(tabId, { type: 'pet-state', state: 'error' });
    } catch (e2) {
      console.error('[AI-Pet SW] 发送错误消息到 content 失败:', e2);
    }
  }
}

// ===== 获取配置 =====
async function getConfig() {
  const result = await chrome.storage.local.get(['aiPetConfig']);
  return result.aiPetConfig || DEFAULT_CONFIG;
}

// ===== Demo Mode 流式模拟 =====
async function demoStreamResponse(tabId, userMessage) {
  console.log('[AI-Pet SW] Demo Mode 流式输出');
  await safeSend(tabId, { type: 'stream-start' });

  let response = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
  if (userMessage.includes('闲置') || userMessage.includes('CVM')) response = DEMO_RESPONSES[2];
  else if (userMessage.includes('你好') || userMessage.includes('hi')) response = DEMO_RESPONSES[0];
  else if (userMessage.includes('demo') || userMessage.includes('测试')) response = DEMO_RESPONSES[1];

  const chars = response.split('');
  for (let i = 0; i < chars.length; i++) {
    await sleep(30 + Math.random() * 40);
    await safeSend(tabId, { type: 'stream-chunk', data: chars[i] });
  }
  await safeSend(tabId, { type: 'stream-end', data: response });
}

// ===== 真实 SSE API 调用 =====
async function streamAPIResponse(tabId, message, history, config) {
  console.log('[AI-Pet SW] 调用真实 API:', config.apiEndpoint);
  await safeSend(tabId, { type: 'stream-start' });

  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message,
      history: history || [],
      model: config.model
    })
  });

  console.log('[AI-Pet SW] API 响应状态:', response.status);
  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`API ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // 按 SSE 双换行分割完整事件
    const events = buffer.split('\n\n');
    buffer = events.pop(); // 最后一个可能不完整

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              await safeSend(tabId, { type: 'stream-chunk', data: parsed.content });
            }
            if (parsed.done) {
              await safeSend(tabId, { type: 'stream-end', data: fullContent });
              return;
            }
          } catch {
            fullContent += data;
            await safeSend(tabId, { type: 'stream-chunk', data: data });
          }
        }
      }
    }
  }

  await safeSend(tabId, { type: 'stream-end', data: fullContent });
  console.log('[AI-Pet SW] 流式输出完成, 总长度:', fullContent.length);
}

// 安全发送消息（捕获 content script 断开异常）
async function safeSend(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // content script 可能已销毁（页面关闭/刷新），忽略
    console.warn('[AI-Pet SW] sendMessage 失败 (tab 可能已关闭):', e.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
