# server.py
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import subprocess
import shlex
import os

# === CONFIGURATION ===
MODEL_PATH = "/opt/models/qwen-burmese.Q4_K_M.gguf"
LLAMA_CLI = "/opt/llama.cpp/build/bin/llama-cli"
DEFAULT_MAX_TOKENS = 256

app = FastAPI(title="Burmese LLM Streaming API")

class ChatRequest(BaseModel):
    message: str
    max_tokens: int = DEFAULT_MAX_TOKENS

def generate_stream(user_message: str, max_tokens: int = DEFAULT_MAX_TOKENS):
    prompt = f"""<|im_start|>system
You are an open-minded roleplay assistant. You can speak Burmese and English naturally.
<|im_end|>
<|im_start|>user
{user_message}
<|im_end|>
<|im_start|>assistant
"""

    # Command: unbuffered, stream one token at a time
    cmd = [
        LLAMA_CLI,
        "-m", MODEL_PATH,
        "-p", prompt,
        "-n", str(max_tokens),
        "--no-display-prompt",
        "-r", "1",          # stream one token at a time
        "--ignore-eos"      # don't stop at EOS
    ]

    # Force unbuffered stdout
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=1,                  # line-buffered
        universal_newlines=True,    # text mode
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )

    try:
        while True:
            chunk = process.stdout.read(1)  # read per character for streaming
            if not chunk:
                break
            yield chunk
        process.wait()
    except Exception as e:
        yield f"[Error streaming reply] {str(e)}"

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    return StreamingResponse(generate_stream(req.message, req.max_tokens), media_type="text/plain")

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_PATH, "default_max_tokens": DEFAULT_MAX_TOKENS}
