"""Independent Apple Silicon Qwen3-TTS worker, not the ai-assistant demo server."""
import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
import queue
import threading

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from .providers import required
from .character import character_voice


def create_tts_app(load_model=None):
    token = required("QWEN_TTS_TOKEN")
    if len(token) < 32:
        raise RuntimeError("QWEN_TTS_TOKEN must be at least 32 characters")
    model_path = Path(required("QWEN_TTS_MODEL_PATH")).expanduser()
    mode = os.environ.get("QWEN_TTS_MODE", "preset")
    if mode not in {"preset", "clone"}:
        raise RuntimeError("QWEN_TTS_MODE must be preset or clone")
    speaker = os.environ.get("QWEN_TTS_SPEAKER", "Vivian")
    reference = Path(required("QWEN_TTS_REFERENCE_AUDIO")).expanduser() if mode == "clone" else None
    transcript = required("QWEN_TTS_REFERENCE_TEXT") if mode == "clone" else None
    if not model_path.is_dir() or reference is not None and not reference.is_file():
        raise RuntimeError("Qwen model or reference audio is unavailable")
    model = None
    busy = threading.Lock()
    clear_cache = lambda: None

    @asynccontextmanager
    async def lifespan(_app):
        nonlocal model, clear_cache
        if load_model is None:
            from mlx_audio.tts.utils import load_model as loader
            import mlx.core as mx
            mx.set_cache_limit(int(os.environ.get("QWEN_MLX_CACHE_MB", "128")) * 1024 * 1024)
            clear_cache = mx.clear_cache
        else:
            loader = load_model
        model = await asyncio.to_thread(loader, str(model_path))
        if mode == "preset":
            if getattr(model.config, "tts_model_type", None) != "custom_voice" or speaker.lower() not in [s.lower() for s in model.get_supported_speakers()]:
                raise RuntimeError("Configure a CustomVoice model with a supported preset speaker")
        if model.sample_rate != 24000:
            raise RuntimeError("Expected a 24000Hz Qwen model")
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    async def health():
        return {"ready": model is not None}

    @app.post("/v1/audio/speech")
    async def speech(request: Request):
        import hmac
        if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + token):
            raise HTTPException(401, "Unauthorized")
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 32000:
                raise HTTPException(413, "Request too large")
        try:
            import json
            data = json.loads(raw)
            text = data["input"]
            if not isinstance(text, str) or not 0 < len(text.strip()) <= 3000 or data.get("response_format") != "pcm":
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise HTTPException(400, "Invalid speech request") from None
        if model is None:
            raise HTTPException(503, "Model not ready")
        if not busy.acquire(blocking=False):
            raise HTTPException(429, "TTS busy")
        options = {"voice": speaker} if mode == "preset" else {"ref_audio": str(reference), "ref_text": transcript}
        profile = data.get("voice", "default")
        if profile not in ("default", "current", os.environ.get("VOICE_TTS_VOICE", "default")):
            try:
                if mode != "clone":
                    raise ValueError('Package cloning requires a Base model')
                options = character_voice(profile)
            except (ValueError, TypeError, KeyError, OSError):
                busy.release()
                raise HTTPException(400, "Voice profile unavailable") from None
        cancelled = threading.Event()
        chunks = queue.Queue(maxsize=8)
        done = threading.Event()
        failed = threading.Event()

        def generate():
            try:
                results = model.generate(text=text, **options, lang_code="chinese", stream=True, verbose=False,
                                         temperature=0.7, top_p=0.9, repetition_penalty=1.1, max_tokens=768,
                                         streaming_interval=float(os.environ.get("QWEN_TTS_INTERVAL", "0.3")))
                try:
                    for result in results:
                        if cancelled.is_set():
                            break
                        samples = np.asarray(result.audio).reshape(-1)
                        if not np.isfinite(samples).all():
                            raise ValueError("Invalid model audio")
                        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
                        while not cancelled.is_set():
                            try:
                                chunks.put(pcm, timeout=0.1)
                                break
                            except queue.Full:
                                continue
                finally:
                    results.close()
            except Exception:
                failed.set()
            finally:
                clear_cache()
                done.set()
                busy.release()

        thread = threading.Thread(target=generate, daemon=True)
        thread.start()

        async def audio():
            try:
                while not done.is_set() or not chunks.empty():
                    try:
                        chunk = await asyncio.to_thread(chunks.get, True, 0.1)
                    except queue.Empty:
                        continue
                    if chunk:
                        yield chunk
                if failed.is_set():
                    raise RuntimeError("Speech generation failed")
            finally:
                # GPU work cooperatively stops at the next chunk; no concurrent generator is started.
                cancelled.set()

        return StreamingResponse(audio(), media_type="audio/pcm", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    return app


def main():
    import uvicorn
    uvicorn.run(create_tts_app(), host="127.0.0.1", port=int(os.environ.get("QWEN_TTS_PORT", "48084")), access_log=False)


if __name__ == "__main__":
    main()
