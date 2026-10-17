"""Mac Qwen3-ASR worker. Whole utterances in memory; no streaming claim."""
import asyncio
from contextlib import asynccontextmanager
import hmac
import io
import os
from pathlib import Path
import threading

from fastapi import FastAPI, HTTPException, Request
import soundfile as sf

from .providers import required


def create_asr_app(load_model=None):
    token=required('QWEN_ASR_TOKEN')
    path=Path(required('QWEN_ASR_MODEL_PATH')).expanduser()
    if len(token)<32 or not path.is_dir():
        raise RuntimeError('Configure a local ASR model and >=32-character token')
    model=None
    busy=threading.Lock()
    clear_cache=lambda: None

    @asynccontextmanager
    async def lifespan(_app):
        nonlocal model,clear_cache
        if load_model is None:
            from mlx_audio.stt.utils import load_model as loader
            import mlx.core as mx
            mx.set_cache_limit(int(os.environ.get('QWEN_MLX_CACHE_MB','128'))*1024*1024)
            clear_cache=mx.clear_cache
        else:
            loader=load_model
        model=await asyncio.to_thread(loader,str(path))
        yield

    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

    @app.get("/health")
    async def health():
        return {"ready": model is not None}

    @app.post('/v1/audio/transcribe')
    async def transcribe(request:Request):
        if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):
            raise HTTPException(401,'Unauthorized')
        raw=bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw)>2_000_000:
                raise HTTPException(413,'Audio too long')
        try:
            audio,rate=sf.read(io.BytesIO(raw),dtype='float32')
            if rate!=16000 or audio.ndim!=1 or not 0<len(audio)<=16000*60:
                raise ValueError()
        except Exception:
            raise HTTPException(400,'Expected mono 16kHz WAV, at most 60 seconds') from None
        if model is None or not busy.acquire(blocking=False):
            raise HTTPException(429,'ASR busy')

        def infer():
            try:
                return model.generate(audio=audio,language='Chinese',max_tokens=512,verbose=False).text
            finally:
                clear_cache()
                busy.release()
        try:
            # Thread retains the lock until inference actually finishes, even if request is cancelled.
            text=await asyncio.to_thread(infer)
        except Exception:
            raise HTTPException(503,'ASR failed') from None
        return {'text':text}

    return app


def main():
    import uvicorn
    uvicorn.run(create_asr_app(),host='127.0.0.1',port=int(os.environ.get('QWEN_ASR_PORT','48085')),access_log=False)


if __name__ == "__main__":
    main()
