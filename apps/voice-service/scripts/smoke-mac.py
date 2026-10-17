"""Explicit real-model probe using only synthetic text/audio, never microphone capture."""
import io
import json
from pathlib import Path
import time
import httpx
import numpy as np
import soundfile as sf
from dotenv import dotenv_values

root=Path(__file__).resolve().parents[1]
config=dotenv_values(root/'.env.local')
results={}


def synthesize(client,text,label):
    started=time.monotonic();first=None;pcm=bytearray()
    with client.stream('POST',config['VOICE_TTS_URL']+'/audio/speech',headers={'Authorization':'Bearer '+config['VOICE_TTS_API_KEY']},
                       json={'input':text,'response_format':'pcm','model':config['VOICE_TTS_MODEL'],'stream':True}) as response:
        response.raise_for_status()
        for chunk in response.iter_bytes():
            if chunk and first is None:first=time.monotonic()-started
            pcm.extend(chunk)
    if len(pcm)<2 or len(pcm)%2:raise RuntimeError('No valid PCM')
    results[label]={'first_audio_seconds':round(first,3),'total_seconds':round(time.monotonic()-started,3),'audio_seconds':round(len(pcm)/48000,3)}
    audio=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768
    return audio


with httpx.Client(timeout=httpx.Timeout(240,connect=5),follow_redirects=False) as client:
    for port in ('48083','48084','48085'):
        for attempt in range(90):
            try:
                response=client.get('http://127.0.0.1:'+port+'/health')
                response.raise_for_status();break
            except httpx.HTTPError:
                if attempt==89:raise
                time.sleep(1)
    audio=synthesize(client,'你好，请简单介绍一下你自己。','input_tts')
    sf.write(root/'.local/input.wav',audio,24000,subtype='PCM_16')
    import soxr
    wav=io.BytesIO();sf.write(wav,soxr.resample(audio,24000,16000),16000,format='WAV',subtype='PCM_16')
    started=time.monotonic()
    response=client.post(config['VOICE_STT_URL']+'/audio/transcribe',content=wav.getvalue(),headers={'Authorization':'Bearer '+config['VOICE_STT_API_KEY'],'Content-Type':'audio/wav'})
    response.raise_for_status();transcript=response.json()['text']
    if not transcript.strip():raise RuntimeError('Empty ASR')
    results['asr']={'seconds':round(time.monotonic()-started,3),'synthetic_text':transcript}
    started=time.monotonic()
    response=client.post(config['VOICE_LLM_URL']+'/chat/completions',headers={'Authorization':'Bearer '+config['VOICE_LLM_API_KEY']},
                         json={'model':config['VOICE_LLM_MODEL'],'messages':[{'role':'system','content':'你是统子哥，简短用中文回答，一句话即可。'},{'role':'user','content':transcript}],'max_tokens':100})
    response.raise_for_status();answer=response.json()['choices'][0]['message']['content']
    if not answer.strip():raise RuntimeError('Empty model response')
    results['fast_model']={'seconds':round(time.monotonic()-started,3),'synthetic_answer':answer}
    reply=synthesize(client,answer,'reply_tts')
    sf.write(root/'.local/reply.wav',reply,24000,subtype='PCM_16')
    (root/'.local/evidence.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))
