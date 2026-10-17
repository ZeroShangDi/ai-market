"""Actual WebRTC two-turn/barge-in probe. Uses synthesized audio, never a microphone."""
import asyncio
from fractions import Fraction
import io
import json
from pathlib import Path
import time
import uuid
import base64
import hashlib
import hmac

from aiortc import RTCPeerConnection,RTCConfiguration,RTCSessionDescription,AudioStreamTrack
from av import AudioFrame
from dotenv import dotenv_values
import httpx
import numpy as np
import soundfile as sf

root=Path(__file__).resolve().parents[1]
config=dotenv_values(root/'.env.local')


class SyntheticMicrophone(AudioStreamTrack):
    def __init__(self):
        super().__init__();self.samples=np.zeros(0,dtype=np.int16);self.position=0;self.started=time.monotonic()
    def feed(self,audio):
        self.samples=np.asarray(audio,dtype=np.int16);self.position=0
    async def recv(self):
        elapsed=time.monotonic()-self.started
        await asyncio.sleep(max(0,self._timestamp/24000-elapsed) if hasattr(self,'_timestamp') else 0)
        timestamp=getattr(self,'_timestamp',0);self._timestamp=timestamp+480
        block=np.zeros(480,dtype=np.int16)
        size=min(480,len(self.samples)-self.position)
        if size>0:block[:size]=self.samples[self.position:self.position+size];self.position+=size
        frame=AudioFrame.from_ndarray(block.reshape(1,-1),format='s16',layout='mono')
        frame.sample_rate=24000;frame.pts=timestamp;frame.time_base=Fraction(1,24000)
        return frame


def credential():
    claims={'aud':'voice','tenant':'0','user':'1','device':'1','exp':int(time.time())+60,'nonce':str(uuid.uuid4())}
    payload=base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    signature=base64.urlsafe_b64encode(hmac.new(config['VOICE_TICKET_SECRET'].encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
    return payload+'.'+signature


async def main():
    async with httpx.AsyncClient(timeout=120) as client:
        # Pre-generate both user utterances before occupying the TTS worker with the bot.
        inputs=[]
        for text in ('你好，请详细介绍一下你自己。','停一下，用三个字回答我。'):
            response=await client.post(config['VOICE_TTS_URL']+'/audio/speech',headers={'Authorization':'Bearer '+config['VOICE_TTS_API_KEY']},
                                       json={'input':text,'response_format':'pcm','stream':True})
            response.raise_for_status();inputs.append(np.frombuffer(response.content,dtype='<i2').copy())
        pc=RTCPeerConnection(RTCConfiguration(iceServers=[]))
        mic=SyntheticMicrophone();pc.addTrack(mic)
        channel=pc.createDataChannel('chat')
        connected=asyncio.Event();first_reply=asyncio.Event();second_reply=asyncio.Event();interrupted=asyncio.Event()
        events=[];readers=[];audible=0;bot_turns=0;transcript_roles=set()
        started=time.monotonic()
        @pc.on('connectionstatechange')
        async def state():
            if pc.connectionState=='connected':connected.set()
        @channel.on('message')
        def message(raw):
            nonlocal bot_turns
            try:value=json.loads(raw)
            except (ValueError,TypeError):return
            if value.get('type')=='transcript':
                transcript_roles.add(value.get('role'));return
            if value.get('type')!='voice':return
            events.append({'seconds':round(time.monotonic()-started,3),**value})
            if value.get('state')=='error':raise RuntimeError('Voice pipeline failed')
            if value.get('event')=='bot_started':
                bot_turns+=1
                if not first_reply.is_set():first_reply.set()
                elif interrupted.is_set():second_reply.set()
            if first_reply.is_set() and value.get('event')=='user_started':interrupted.set()
        @pc.on('track')
        def track(remote):
            async def read():
                nonlocal audible
                try:
                    while True:
                        frame=await remote.recv()
                        if np.abs(frame.to_ndarray().astype(np.int32)).max()>500:audible+=1
                except Exception:pass
            readers.append(asyncio.create_task(read()))
        async def ping():
            while True:
                if channel.readyState=='open':channel.send('ping')
                await asyncio.sleep(1)
        heartbeat=asyncio.create_task(ping())
        try:
            await pc.setLocalDescription(await pc.createOffer())
            response=await client.post('http://127.0.0.1:48083/offer',json={'type':'offer','sdp':pc.localDescription.sdp},headers={'Authorization':'Bearer '+credential()})
            response.raise_for_status();answer=response.json()
            await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'],type=answer['type']))
            await asyncio.wait_for(connected.wait(),10)
            mic.feed(inputs[0])
            await asyncio.wait_for(first_reply.wait(),90)
            await asyncio.sleep(0.5)
            mic.feed(inputs[1])
            await asyncio.wait_for(interrupted.wait(),10)
            await asyncio.wait_for(second_reply.wait(),90)
            await asyncio.sleep(1)
            if audible==0:raise RuntimeError('No audible output')
            if transcript_roles!={'user','assistant'}:raise RuntimeError('Missing speaker transcript events')
            result={'passed':True,'bot_turns':bot_turns,'audible_frames':audible,'transcript_roles':sorted(transcript_roles),'events':events}
            (root/'.local/webrtc-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
            print(json.dumps(result,ensure_ascii=False,indent=2))
        finally:
            heartbeat.cancel();await pc.close()
            await asyncio.gather(heartbeat,*readers,return_exceptions=True)


asyncio.run(main())
