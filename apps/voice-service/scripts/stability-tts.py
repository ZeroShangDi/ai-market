"""Synthetic multi-utterance preset voice probe. ASR round-trip detects severe generation drift."""
import io,json,re,time
from pathlib import Path
import httpx,numpy as np,soundfile as sf,soxr
from dotenv import dotenv_values
root=Path(__file__).resolve().parents[1];c=dotenv_values(root/'.env.local')
texts=['我们先用预设音色，测试连续对话是否清晰。','如果你在我说话时开口，我会停下来听你说。','这段测试会连续播放几句话，观察声音是否自然，有没有重复或者明显的杂音。','今天先把手机上的语音体验调顺，再考虑更复杂的能力。','当你结束聊天时，麦克风和播放都会一起关闭。','现在回到普通聊天，你想先聊工作，还是聊聊今天的生活？']

def normalize(s):return re.sub(r'[^\w]','',s).lower()
def distance(a,b):
 row=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  current=[i]
  for j,y in enumerate(b,1):current.append(min(current[-1]+1,row[j]+1,row[j-1]+(x!=y)))
  row=current
 return row[-1]
results=[]
with httpx.Client(timeout=120,trust_env=False) as client:
 for text in texts:
  started=time.monotonic()
  response=client.post(c['VOICE_TTS_URL']+'/audio/speech',headers={'Authorization':'Bearer '+c['VOICE_TTS_API_KEY']},json={'input':text,'response_format':'pcm','stream':True});response.raise_for_status()
  audio=np.frombuffer(response.content,dtype='<i2').astype(np.float32)/32768
  assert len(audio)>2400
  wav=io.BytesIO();sf.write(wav,soxr.resample(audio,24000,16000),16000,format='WAV',subtype='PCM_16')
  response=client.post(c['VOICE_STT_URL']+'/audio/transcribe',headers={'Authorization':'Bearer '+c['VOICE_STT_API_KEY']},content=wav.getvalue());response.raise_for_status()
  recognized=response.json()['text'];cer=distance(normalize(text),normalize(recognized))/len(normalize(text))
  results.append({'seconds':round(time.monotonic()-started,3),'audio_seconds':round(len(audio)/24000,3),'cer':round(cer,3)})
  if cer>.2:raise RuntimeError('Synthetic TTS round-trip drift exceeds threshold')
(root/'.local/preset-stability.json').write_text(json.dumps({'speaker':'Vivian','rounds':results},indent=2))
print(json.dumps({'speaker':'Vivian','rounds':results},indent=2))
