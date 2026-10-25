"""Ordered transcript persistence in the existing encrypted chat store; no audio files."""
import asyncio
import os
import uuid

import httpx


class VoiceHistory:
    def __init__(self, connection, identity, bridge):
        self.connection, self.identity, self.bridge = connection, identity, bridge
        self.key = str(uuid.uuid4())
        self.conversation = None
        self.queue = asyncio.Queue(maxsize=256)
        self.task = None
        self.enabled = identity.get('host_plugin_bridge') is True and len(os.environ.get('AI_INTERNAL_TOKEN', '')) >= 32

    def append(self, role, text):
        if not self.enabled:
            return
        try:
            self.queue.put_nowait({'request_id': str(uuid.uuid4()), 'role': role, 'content': text[:6000]})
        except asyncio.QueueFull:
            self.warn()
            return
        if self.task is None:
            self.task = asyncio.create_task(self.run())

    def warn(self):
        self.connection.send_app_message({'type': 'voice', 'state': 'warning',
            'message': '部分语音记录未能保存，语音聊天可以继续'})

    async def run(self):
        while True:
            item = await self.queue.get()
            try:
                for attempt in range(3):
                    try:
                        if self.conversation is None:
                            result = await self.bridge.request('POST', '/api/v1/mobile/ai/conversations', {}, self.key)
                            value = result['id']
                            if not isinstance(value, str) or not value.isascii() or not value.isdecimal():
                                raise ValueError('Invalid conversation')
                            self.conversation = value
                        headers = {'Authorization': 'Bearer ' + os.environ['AI_INTERNAL_TOKEN'],
                            'Idempotency-Key': item['request_id'],
                            **{f'X-AI-{key.title()}': self.identity[key] for key in ('tenant', 'user', 'device')}}
                        url = os.environ.get('AI_SERVICE_URL', 'http://127.0.0.1:48081').rstrip('/')
                        async with httpx.AsyncClient(timeout=8, trust_env=False, follow_redirects=False) as client:
                            response = await client.post(url + '/internal/v1/ai/conversations/' + self.conversation + '/transcripts',
                                headers=headers, json=item)
                            response.raise_for_status()
                        break
                    except (httpx.HTTPError, RuntimeError, TimeoutError, ValueError, KeyError, TypeError):
                        if attempt == 2:
                            self.warn()
                        else:
                            await asyncio.sleep(0.5 * (attempt + 1))
            finally:
                self.queue.task_done()

    async def close(self):
        if self.task:
            try:
                await asyncio.wait_for(self.queue.join(), 10)
            except TimeoutError:
                self.warn()
            finally:
                self.task.cancel()
                await asyncio.gather(self.task, return_exceptions=True)
