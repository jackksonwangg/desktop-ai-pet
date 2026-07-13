// content/pet.js — 桌宠注入、拖拽、状态动画、位置持久化
// v0.3 — 增加调试日志 + 错误可见化

(function () {
  'use strict';
  console.log('[AI-Pet] pet.js 开始执行');

  // 防止重复注入
  if (document.getElementById('ai-pet-widget')) {
    console.log('[AI-Pet] 已存在，跳过');
    return;
  }

  var STATES = ['idle', 'thinking', 'answering', 'error'];
  var SVG_MAP = {
    idle: 'pet-idle.svg',
    thinking: 'pet-thinking.svg',
    answering: 'pet-answering.svg',
    error: 'pet-error.svg'
  };

  function getAssetUrl(filename) {
    return chrome.runtime.getURL('assets/' + filename);
  }

  // 创建桌宠 DOM
  var pet = document.createElement('div');
  pet.id = 'ai-pet-widget';
  pet.className = 'state-idle';

  var petImg = document.createElement('img');
  petImg.className = 'pet-img';
  petImg.src = getAssetUrl(SVG_MAP.idle);
  petImg.alt = 'AI Pet';

  // 图片加载错误处理
  petImg.onerror = function () {
    console.error('[AI-Pet] SVG 加载失败:', SVG_MAP.idle);
    // fallback：用 emoji 显示
    petImg.style.display = 'none';
    var fallback = document.createElement('div');
    fallback.textContent = '🐱';
    fallback.style.cssText = 'font-size:50px;text-align:center;line-height:80px;';
    pet.insertBefore(fallback, petImg.nextSibling);
  };

  pet.appendChild(petImg);

  var statusDot = document.createElement('div');
  statusDot.className = 'status-dot idle';
  pet.appendChild(statusDot);

  var tooltip = document.createElement('div');
  tooltip.className = 'pet-tooltip';
  tooltip.textContent = '点击聊天 · 拖拽移动';
  pet.appendChild(tooltip);

  document.body.appendChild(pet);
  console.log('[AI-Pet] 桌宠 DOM 已注入');

  // 状态管理
  var currentState = 'idle';

  window.AIPetSetState = function (state) {
    if (!STATES.includes(state)) return;
    currentState = state;
    pet.className = 'state-' + state;
    petImg.src = getAssetUrl(SVG_MAP[state]);
    statusDot.className = 'status-dot ' + state;
    console.log('[AI-Pet] 状态切换 →', state);
  };

  window.AIPetGetState = function () {
    return currentState;
  };

  // 位置持久化
  chrome.storage.local.get(['petPosition'], function (result) {
    if (result.petPosition) {
      pet.style.left = result.petPosition.x + 'px';
      pet.style.top = result.petPosition.y + 'px';
      pet.style.bottom = 'auto';
      pet.style.right = 'auto';
      console.log('[AI-Pet] 位置恢复:', result.petPosition);
    }
  });

  // ===== 拖拽逻辑 =====
  var isDragging = false;
  var dragStartX, dragStartY, petStartX, petStartY;
  var hasMoved = false;

  pet.addEventListener('mousedown', function (e) {
    isDragging = true;
    hasMoved = false;
    pet.classList.add('dragging');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    var rect = pet.getBoundingClientRect();
    petStartX = rect.left;
    petStartY = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!isDragging) return;
    hasMoved = true;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    var newX = petStartX + dx;
    var newY = petStartY + dy;
    newX = Math.max(0, Math.min(window.innerWidth - 80, newX));
    newY = Math.max(0, Math.min(window.innerHeight - 80, newY));
    pet.style.left = newX + 'px';
    pet.style.top = newY + 'px';
    pet.style.bottom = 'auto';
    pet.style.right = 'auto';
  });

  document.addEventListener('mouseup', function () {
    if (!isDragging) return;
    isDragging = false;
    pet.classList.remove('dragging');

    var rect = pet.getBoundingClientRect();
    chrome.storage.local.set({ petPosition: { x: rect.left, y: rect.top } });

    // 如果没移动 = 点击 → 打开聊天面板
    if (!hasMoved) {
      console.log('[AI-Pet] 检测到点击, 切换面板');
      if (window.AIPetToggleChat) {
        window.AIPetToggleChat();
      } else {
        console.warn('[AI-Pet] AIPetToggleChat 尚未定义（chat-panel.js 未加载?）');
      }
    }
  });

  // hover 提示
  pet.addEventListener('mouseenter', function () {
    var tips = {
      idle: '点击聊天 · 拖拽移动',
      thinking: '正在思考中...',
      answering: '正在回答...',
      error: '出了点问题，点击重试'
    };
    tooltip.textContent = tips[currentState] || tips.idle;
  });

  // 监听 background 的状态更新
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type === 'pet-state') {
      window.AIPetSetState(msg.state);
    }
  });

  // 暴露给 chat-panel.js
  window.AIPetWidget = pet;
  console.log('[AI-Pet] pet.js 执行完成 ✅');
})();
