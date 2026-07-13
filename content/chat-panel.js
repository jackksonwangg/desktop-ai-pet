// content/chat-panel.js — 聊天面板 UI、SSE 流式渲染
// v0.3 — 增加调试日志

(function () {
  'use strict';
  console.log('[AI-Pet] chat-panel.js 开始执行');

  if (document.getElementById('ai-pet-chat-panel')) {
    console.log('[AI-Pet] 面板已存在，跳过');
    return;
  }

  // 创建聊天面板 DOM
  var panel = document.createElement('div');
  panel.id = 'ai-pet-chat-panel';
  panel.className = 'hidden';

  // 头部
  var header = document.createElement('div');
  header.className = 'chat-header';

  var title = document.createElement('h3');
  title.textContent = '🐱 AI 小助手';
  header.appendChild(title);

  var actions = document.createElement('div');
  actions.className = 'header-actions';

  var clearBtn = document.createElement('button');
  clearBtn.textContent = '🗑';
  clearBtn.title = '清空对话';
  clearBtn.addEventListener('click', function () {
    messagesDiv.innerHTML = '';
    addWelcomeMessage();
  });
  actions.appendChild(clearBtn);

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.title = '关闭';
  closeBtn.addEventListener('click', function () {
    panel.classList.add('hidden');
  });
  actions.appendChild(closeBtn);

  header.appendChild(actions);
  panel.appendChild(header);

  // 消息区
  var messagesDiv = document.createElement('div');
  messagesDiv.className = 'chat-messages';
  panel.appendChild(messagesDiv);

  // 输入区
  var inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area';

  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '问我任何问题...';
  input.maxLength = 500;

  var sendBtn = document.createElement('button');
  sendBtn.textContent = '➤';
  sendBtn.disabled = true;

  input.addEventListener('input', function () {
    sendBtn.disabled = !input.value.trim();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
      e.preventDefault();
      sendMessage(input.value.trim());
    }
  });

  sendBtn.addEventListener('click', function () {
    if (input.value.trim()) {
      sendMessage(input.value.trim());
    }
  });

  inputArea.appendChild(input);
  inputArea.appendChild(sendBtn);
  panel.appendChild(inputArea);

  document.body.appendChild(panel);
  console.log('[AI-Pet] 聊天面板 DOM 已注入');

  // 消息历史
  var chatHistory = [];

  // 欢迎消息
  function addWelcomeMessage() {
    appendMessage('assistant', '你好！我是你的 AI 桌宠助手 🐱\n有什么想聊的，随时问我~');
  }
  addWelcomeMessage();

  // 切换面板显隐
  var isVisible = false;
  window.AIPetToggleChat = function () {
    isVisible = !isVisible;
    if (isVisible) {
      panel.classList.remove('hidden');
      input.focus();
      console.log('[AI-Pet] 面板打开');
    } else {
      panel.classList.add('hidden');
      console.log('[AI-Pet] 面板关闭');
    }
  };
  console.log('[AI-Pet] AIPetToggleChat 已注册');

  // 发送消息
  function sendMessage(text) {
    console.log('[AI-Pet] 发送消息:', text);
    input.value = '';
    sendBtn.disabled = true;

    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    window.AIPetSetState && window.AIPetSetState('thinking');

    // 先 ping 一下 background，确认 SW 活着
    chrome.runtime.sendMessage({ type: 'ping' }, function (pongResp) {
      if (chrome.runtime.lastError) {
        console.error('[AI-Pet] SW 连接失败:', chrome.runtime.lastError.message);
        appendMessage('assistant', '⚠ 无法连接到 Service Worker\n请刷新页面后重试。');
        window.AIPetSetState && window.AIPetSetState('error');
        return;
      }
      console.log('[AI-Pet] SW ping OK:', pongResp);

      // 发送聊天请求
      chrome.runtime.sendMessage({
        type: 'chat',
        message: text,
        history: chatHistory.slice(-10)
      }, function (resp) {
        // 注意: 这是 async sendResponse，可能收到的是 {status:'ok'}
        if (chrome.runtime.lastError) {
          console.error('[AI-Pet] chat 消息发送失败:', chrome.runtime.lastError);
        } else {
          console.log('[AI-Pet] chat 响应:', resp);
        }
      });
    });
  }

  // 添加消息气泡
  function appendMessage(role, content) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'msg ' + role;

    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'assistant' ? '🐱' : '👤';
    msgDiv.appendChild(avatar);

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = renderMarkdown(content);
    msgDiv.appendChild(bubble);

    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return bubble;
  }

  // 流式追加内容（SSE chunk）
  var currentStreamBubble = null;
  var streamContent = '';

  window.AIPetStreamStart = function () {
    console.log('[AI-Pet] stream-start');
    currentStreamBubble = appendMessage('assistant', '');
    streamContent = '';

    var indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    currentStreamBubble.appendChild(indicator);

    window.AIPetSetState && window.AIPetSetState('answering');
  };

  window.AIPetStreamChunk = function (chunk) {
    if (!currentStreamBubble) return;
    streamContent += chunk;
    currentStreamBubble.innerHTML = renderMarkdown(streamContent);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  };

  window.AIPetStreamEnd = function (fullContent) {
    console.log('[AI-Pet] stream-end, 总长度:', (fullContent || streamContent).length);
    if (!currentStreamBubble) return;
    streamContent = fullContent || streamContent;
    currentStreamBubble.innerHTML = renderMarkdown(streamContent);
    chatHistory.push({ role: 'assistant', content: streamContent });
    currentStreamBubble = null;
    streamContent = '';
    window.AIPetSetState && window.AIPetSetState('idle');
  };

  window.AIPetStreamError = function (errorMsg) {
    console.warn('[AI-Pet] stream-error:', errorMsg);
    if (currentStreamBubble) {
      currentStreamBubble.innerHTML = '';
      currentStreamBubble.textContent = '⚠ ' + (errorMsg || '请求失败，请重试');
    }
    currentStreamBullet = null;
    streamContent = '';
    window.AIPetSetState && window.AIPetSetState('error');
  };

  // 监听 background 的流式消息
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'stream-start') {
      window.AIPetStreamStart();
    } else if (msg.type === 'stream-chunk') {
      window.AIPetStreamChunk(msg.data);
    } else if (msg.type === 'stream-end') {
      window.AIPetStreamEnd(msg.data);
    } else if (msg.type === 'stream-error') {
      window.AIPetStreamError(msg.data);
    }
  });

  // 简单 Markdown 渲染
  function renderMarkdown(text) {
    if (!text) return '';
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code>' + escapeHtml(code.trim()) + '</code></pre>';
    });
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  console.log('[AI-Pet] chat-panel.js 执行完成 ✅');
})();
