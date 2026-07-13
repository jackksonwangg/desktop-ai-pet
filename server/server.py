#!/usr/bin/env python3
"""AI Pet Server — FastAPI + SSE 流式 + DeepSeek V4 Pro

环境变量（可选）：
  DEEPSEEK_API_KEY    — API Key
  DEEPSEEK_BASE_URL   — API Base URL（默认 https://api.deepseek.com）
  DEEPSEEK_MODEL      — 模型名（默认 deepseek-chat）
  USE_MOCK            — 设为 1 强制用 mock 数据

启动: python3 server.py
端口: http://localhost:8900
"""

import json
import os
import time
import asyncio
import httpx

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Pet Server", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 配置（全部从环境变量读取，参见 .env.example） =====
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.model.haihub.cn")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "DeepSeek-V4-Pro")
USE_MOCK = os.getenv("USE_MOCK", "0") == "1" or not DEEPSEEK_API_KEY

# ===== 系统提示 =====
SYSTEM_PROMPT = """你是一只可爱的 AI 桌宠助手 🐱 名叫「小橘」。
你的特点：
- 回答简洁友好，偶尔用 emoji
- 可以聊技术问题、闲聊、或者回答 CVM 相关问题
- 你运行在浏览器扩展里，陪伴用户工作
- 用中文回答为主
"""

# ===== Mock 兜底数据 =====
MOCK_RESPONSES = {
    "default": [
        "你好！我是 AI 桌宠助手 🐱\n有什么想问的随时说~",
        "我在呢！今天想聊什么？",
    ],
}


async def call_deepseek_stream(messages: list):
    """调用 DeepSeek API，返回 SSE 异步生成器"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEEPSEEK_MODEL,
                "messages": messages,
                "stream": True,
                "temperature": 0.8,
                "max_tokens": 1024,
            },
        )
        resp.raise_for_status()

        # 逐行转发 SSE
        async for line in resp.aiter_lines():
            if line.startswith("data: ") and line != "data: [DONE]":
                try:
                    chunk = json.loads(line[6:])
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield {"content": content}
                except (json.JSONDecodeError, IndexError, KeyError):
                    pass


# ===== SSE 流式聊天 =====

@app.post("/api/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    message = body.get("message", "")
    history = body.get("history", [])
    use_mock = USE_MOCK or body.get("useMock", False)

    # 构建消息列表
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    async def generate():
        yield f"data: {json.dumps({'status': 'thinking'})}\n\n"

        if use_mock:
            # Mock 模式：逐字输出固定回复
            text = MOCK_RESPONSES["default"][hash(message) % len(MOCK_RESPONSES["default"])]
            await asyncio.sleep(0.5)
            for ch in text:
                await asyncio.sleep(0.03)
                yield f"data: {json.dumps({'content': ch})}\n\n"
        else:
            # 真实 DeepSeek API
            try:
                async for chunk in call_deepseek_stream(messages):
                    yield f"data: {json.dumps(chunk)}\n\n"
            except Exception as e:
                error_msg = f"[API 错误] {str(e)}"
                yield f"data: {json.dumps({'error': error_msg})}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ===== 非流式聊天（备用） =====

@app.post("/api/chat")
async def chat_simple(request: Request):
    body = await request.json()
    message = body.get("message", "")
    use_mock = USE_MOCK or body.get("useMock", False)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ]

    if not use_mock:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={"model": DEEPSEEK_MODEL, "messages": messages, "stream": False},
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return JSONResponse({"content": content, "model": data.get("model", DEEPSEEK_MODEL)})
        except Exception as e:
            return JSONResponse({"content": f"[API 错误] {str(e)}"}, status_code=502)

    return JSONResponse({
        "content": MOCK_RESPONSES["default"][hash(message) % len(MOCK_RESPONSES["default"])],
        "model": "mock",
    })


# ===== 健康检查 =====

@app.get("/api/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "mode": "mock" if USE_MOCK else "deepseek",
        "model": DEEPSEEK_MODEL,
        "version": "0.2.0",
        "timestamp": time.time(),
    })


# ===== 测试页面 =====

@app.get("/", response_class=HTMLResponse)
async def test_page():
    return """<!DOCTYPE html>
<html><head><title>🐱 AI Pet Server</title>
<style>
body{font-family:sans-serif;max-width:640px;margin:40px auto;padding:20px}
h1{color:#FF8C00}.box{background:#f5f5f5;padding:12px;border-radius:8px;margin:10px 0}
code{background:#eee;padding:2px 6px;border-radius:3px}
#out{background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;min-height:120px;font-size:13px;white-space:pre-wrap;margin-top:10px}
input{padding:8px;border:1px solid #ddd;border-radius:6px;width:65%}
button{padding:8px 16px;background:#FFB347;color:#fff;border:none;border-radius:6px;cursor:pointer}
button:hover{background:#FF8C00}
.status{font-size:12px;color:#666;margin-bottom:10px}
</style></head><body>
<h1>🐱 AI Pet Server</h1>
<div class="status" id="status"></div>
<input id="msg" placeholder="输入消息..." value="你好，你是谁？">
<button onclick="send()">发送(SSE)</button> <label><input type="checkbox" id="mock"> Mock模式</label>
<div class="box"><div id="out"></div></div>

<script>
async function send() {
  const msg = document.getElementById('msg').value;
  const mock = document.getElementById('mock').checked;
  const out = document.getElementById('out');
  const status = document.getElementById('status');
  out.textContent = ''; status.textContent = '连接中...';

  const t0 = performance.now();
  const resp = await fetch('/api/chat/stream', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:msg, useMock:mock})
  });
  status.textContent = `HTTP ${resp.status} | 接收中...`;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = '', chunks = 0;

  while (true) {
    const {done,value}=await reader.read(); if(done) break;
    const text=decoder.decode(value,{stream:true});
    for(const line of text.split('\\n')) {
      if(!line.startsWith('data:')) continue;
      try{
        const d=JSON.parse(line.slice(5));
        if(d.content){full+=d.content; chunks++;}
        else if(d.error){full+='\\n[ERR] '+d.error;}
        if(d.status==='thinking') status.textContent='思考中...';
      }catch(e){}
    }
    out.textContent = full;
  }

  const ms=(performance.now()-t0).toFixed(0);
  status.textContent=`完成 ${ms}ms | ${chunks} chunks | ${full.length}字`;
}

// 健康检查
fetch('/api/health').then(r=>r.json()).then(d=>{
  document.querySelector('.status').textContent=
    `Server OK | mode:${d.mode} | model:${d.model}`;
}).catch(()=>{});
</script></body></html>"""


if __name__ == "__main__":
    import uvicorn
    print(f"🐱 AI Pet Server starting on :8900  mode={'MOCK' if USE_MOCK else 'DeepSeek('+DEEPSEEK_MODEL+')'}")
    uvicorn.run(app, host="0.0.0.0", port=8900, log_level="info")
