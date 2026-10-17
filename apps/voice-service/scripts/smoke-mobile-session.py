"""Synthetic paired-device ticket + HTTPS + actual WebRTC probe; cleans up its test device."""
import asyncio
import importlib.util
import os
from pathlib import Path
import sys
import httpx
from aiortc import RTCPeerConnection,RTCConfiguration,RTCSessionDescription,AudioStreamTrack
from dotenv import dotenv_values
from voice_service.tickets import verify_ticket

root=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('chat_smoke',root.parents[1]/'scripts/ai-feature-live-smoke.py')
chat=importlib.util.module_from_spec(spec);spec.loader.exec_module(chat)
config=dotenv_values(root/'.env.local')


async def main():
    admin,mobile=chat.Client('http://127.0.0.1:48080'),chat.Client('http://127.0.0.1:48080')
    auth=admin.request('POST','/admin-api/system/auth/login',{'username':os.getenv('AI_SMOKE_ADMIN_USER','admin'),'password':os.getenv('AI_SMOKE_ADMIN_PASSWORD','admin123')})
    admin.headers['Authorization']='Bearer '+auth['accessToken']
    pairing=device=None
    pc=RTCPeerConnection(RTCConfiguration(iceServers=[]))
    try:
        pairing=admin.request('POST','/admin-api/callphone/device/pairing-code/create')
        scanned=mobile.request('POST','/api/v1/mobile/session/scan',{'pairingId':pairing['id'],'pairingCode':pairing['pairingCode'],'loginSecret':pairing['loginSecret'],'displayName':'语音HTTPS合成验证设备（不会拨号）'})
        device=scanned['deviceId']
        mobile.headers.update({'Authorization':'Bearer '+scanned['accessToken'],'X-Callphone-Device-Id':str(device),'X-Callphone-Device-Key':scanned['deviceKey']})
        mobile.request('POST','/api/v1/mobile/devices/heartbeat')
        session=mobile.request('POST','/api/v1/mobile/ai/voice/session',{})
        claims=verify_ticket(session['ticket'],config['VOICE_TICKET_SECRET'],{})
        assert claims['device']==str(device)
        connected=asyncio.Event()
        @pc.on('connectionstatechange')
        async def changed():
            if pc.connectionState=='connected':connected.set()
        pc.addTrack(AudioStreamTrack());pc.createDataChannel('chat')
        await pc.setLocalDescription(await pc.createOffer())
        async with httpx.AsyncClient(timeout=20,trust_env=False) as client:
            (await client.get(session['url']+'health')).raise_for_status()
            payload={'type':'offer','sdp':pc.localDescription.sdp}
            headers={'Authorization':'Bearer '+session['ticket']}
            response=await client.post(session['url']+'offer',json=payload,headers=headers);response.raise_for_status()
            answer=response.json()
            await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'],type=answer['type']))
            await asyncio.wait_for(connected.wait(),10)
            replay=await client.post(session['url']+'offer',json=payload,headers=headers)
            assert replay.status_code==401
        print('PASS paired-device gateway ticket, HTTPS certificate, real WebRTC and replay rejection')
    finally:
        await pc.close()
        if device:admin.request('POST','/admin-api/callphone/device/revoke',{'id':device})
        if pairing:admin.request('POST','/admin-api/callphone/device/pairing-code/cancel',{'id':pairing['id']})
        print('Synthetic voice device cleaned up')


asyncio.run(main())
