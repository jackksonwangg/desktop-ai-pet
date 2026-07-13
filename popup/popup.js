// popup.js — 设置页逻辑

document.addEventListener('DOMContentLoaded', () => {
  const apiEndpoint = document.getElementById('apiEndpoint');
  const model = document.getElementById('model');
  const demoToggle = document.getElementById('demoToggle');
  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('statusMsg');

  let demoMode = true;

  // 加载当前配置
  chrome.runtime.sendMessage({ type: 'get-config' }, (config) => {
    apiEndpoint.value = config.apiEndpoint || 'http://localhost:8900/api/chat/stream';
    model.value = config.model || 'demo-model';
    demoMode = config.demoMode !== false;
    updateToggle();
  });

  // Demo toggle
  demoToggle.addEventListener('click', () => {
    demoMode = !demoMode;
    updateToggle();
  });

  function updateToggle() {
    demoToggle.classList.toggle('active', demoMode);
  }

  // 保存
  saveBtn.addEventListener('click', () => {
    const config = {
      apiEndpoint: apiEndpoint.value.trim(),
      model: model.value.trim(),
      demoMode: demoMode
    };

    chrome.runtime.sendMessage({ type: 'save-config', config }, (resp) => {
      if (resp && resp.success) {
        statusMsg.textContent = '✓ 已保存';
        statusMsg.style.color = '#4CAF50';
        setTimeout(() => { statusMsg.textContent = ''; }, 2000);
      } else {
        statusMsg.textContent = '保存失败';
        statusMsg.style.color = '#F44336';
      }
    });
  });
});
