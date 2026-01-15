# server.py
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import uvicorn
import logging
import subprocess
import time
import os
import json

# Set up logging
logging.basicConfig(level=logging.INFO, filename='/root/api.log', filemode='a',
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# === CONFIGURATION ===
MODEL_PATH = "/opt/models/sex_rp.gguf"
LLAMA_SERVER = "/opt/llama.cpp/build/bin/llama-server"
LLAMA_PORT = 8080

app = FastAPI(title="AI Chat Proxy")

def start_llama_server():
    logger.info("Starting llama-server...")
    # Using shell redirect to ensure logs are captured reliably in the background
    cmd = f"nohup {LLAMA_SERVER} -m {MODEL_PATH} --port {LLAMA_PORT} --host 127.0.0.1 --n-predict 512 --ctx-size 2048 > /root/llama.log 2>&1 &"
    os.system(cmd)
    
    for i in range(120):
        time.sleep(1)
        try:
            with httpx.Client() as client:
                if client.get(f"http://localhost:{LLAMA_PORT}/health").status_code == 200:
                    logger.info("llama-server is up!")
                    return True
        except:
            continue
    return False

def ensure_llama_server():
    try:
        with httpx.Client() as client:
            if client.get(f"http://localhost:{LLAMA_PORT}/health").status_code == 200:
                return True
    except:
        pass
    return start_llama_server()

async def generate_chat(user_message: str):
    url = f"http://localhost:{LLAMA_PORT}/completion"
    prompt = f"<|im_start|>system\nYou are a helpful AI assistant.\n<|im_end|>\n<|im_start|>user\n{user_message}\n<|im_end|>\n<|im_start|>assistant\n"
    
    logger.info(f"Request: {user_message[:50]}...")
    
    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream("POST", url, json={"prompt": prompt, "stream": True, "stop": ["<|im_end|>"]}, timeout=None) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            content = data.get("content", "")
                            if content:
                                yield content
                        except:
                            continue
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            yield f"[Error] {e}"

@app.get("/rp")
async def rp(user_input: str):
    ensure_llama_server()
    return StreamingResponse(generate_chat(user_input), media_type="text/plain")

@app.get("/health")
def health():
    return {"status": "ok", "llama": "active" if ensure_llama_server() else "down"}

if __name__ == "__main__":
    ensure_llama_server()
    uvicorn.run(app, host="0.0.0.0", port=8000)
