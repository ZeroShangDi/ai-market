"""Conversation resources composed exclusively through chat.main's public API."""
import asyncio
from uuid import uuid4
from ._contracts import AIError, clone, operation


class ChatResources:
    @operation
    async def create_conversation(self, title='新会话', *, role_id=None):
        """Create package history then metadata; partial commit returns its existing ID."""
        self._need('chat'); self._writeable()
        cfg = self._configuration(role_id)
        await self._authorize('create_conversation', {})
        row = await self._chat.create_conversation(title)
        cid = row['id']
        try:
            await self._metadata_write('save_conversation_config', cid, cfg)
        except AIError:
            raise AIError('OUTCOME_UNKNOWN', outcome='unknown', refs={'conversation_id': cid}) from None
        self._configs[cid] = cfg
        return dict(row, config=clone(cfg))

    @operation
    async def list_conversations(self):
        """List authorized summaries within this instance's bound scope."""
        self._need('chat')
        await self._authorize('list_conversations', {})
        return await self._chat.list_conversations()

    @operation
    async def get_conversation(self, conversation_id):
        """Return package history with module configuration and linked work summaries."""
        self._need('chat')
        await self._authorize('get_conversation', {'conversation_id': conversation_id})
        row = await self._chat.get_conversation(conversation_id)
        row['config'] = self._effective(conversation_id)
        row['work_summaries'] = await self.list_work(conversation_id=conversation_id) if self._work else []
        return row

    @operation
    async def delete_conversation(self, conversation_id):
        """Stop owned dialogue and delete history; work sessions remain independent."""
        self._need('chat'); self._writeable()
        await self._authorize('delete_conversation', {'conversation_id': conversation_id})
        if self._voice_cid == conversation_id:
            await self.stop_voice()
        async with self._conversation_lock(conversation_id):
            entry = self._replies.get(conversation_id)
            if entry:
                await self.cancel_reply(conversation_id, entry['generation_id'])
            await self._chat.delete_conversation(conversation_id)
            if self._voice_cid == conversation_id:
                self._voice_cid = None
                self._voice_state['conversation_id'] = None
            try:
                await self._metadata_write('delete_conversation_config', conversation_id)
                self._configs.pop(conversation_id, None)
                for wid, cid in list(self._links.items()):
                    if cid == conversation_id:
                        await self._metadata_write('set_work_conversation', wid, None)
                        self._links.pop(wid, None)
            except AIError:
                raise AIError('OUTCOME_UNKNOWN', outcome='unknown', refs={'conversation_id': conversation_id}) from None
        return {'deleted': True}

    @operation
    async def send_message(self, conversation_id, text=None, *, retry=False):
        """Start a text turn; progress is consumed even without a UI subscriber."""
        return await self._send(conversation_id, text, retry=retry)

    async def _send(self, cid, text, *, retry=False, voice_token=None):
        self._need('chat'); self._writeable()
        if type(retry) is not bool or (not retry and (not isinstance(text, str) or not text.strip())) or (retry and text is not None):
            raise AIError('VALIDATION_ERROR')
        async with self._conversation_lock(cid):
            if cid in self._replies:
                raise AIError('CHAT_BUSY')
            view = await self._chat.get_conversation(cid)
            if retry:
                users = [m['content'] for m in view['messages'] if m['role'] == 'user']
                if not users:
                    raise AIError('NOTHING_TO_RETRY')
                input_text = users[-1]
            else:
                input_text = text
            await self._authorize('send_message', {'conversation_id': cid})
            cfg = self._effective(cid)
            signal = asyncio.Event()
            self._preparing[cid] = signal
            try:
                contribution = {'summary': ''}
                if self._prepare:
                    try:
                        contribution = clone(await asyncio.wait_for(self._prepare(
                            cid, input_text, cfg['role_id'], signal), self._timeout))
                    except asyncio.CancelledError:
                        signal.set()
                        raise
                    except Exception:
                        signal.set()
                        raise AIError('EXTENSION_FAILED', outcome='failed') from None
                    if (not isinstance(contribution, dict) or set(contribution) != {'summary'}
                            or not isinstance(contribution['summary'], str) or len(contribution['summary']) > 32000):
                        raise AIError('INVALID_EXTENSION_OUTPUT')
                self._ready(); self._check_voice_token(voice_token)
                options = dict(self._roles[cfg['role_id']].get('chat_config', {}),
                               summary=contribution['summary'], network_enabled=cfg['network_enabled'])
                stream = await self._chat.send_message(cid, text, retry=retry, options=options)
                # Reading the generation receipt requires no private package task/state access.
                try:
                    view = await self._chat.get_conversation(cid)
                except BaseException:
                    await stream.aclose()
                    raise
                gid = view['generation']['id']
                entry = dict(generation_id=gid, voice_token=voice_token, stream=stream)
                self._replies[cid] = entry
                entry['task'] = self._spawn(self._consume(cid, entry))
                return dict(conversation_id=cid, generation_id=gid, status='running')
            finally:
                self._preparing.pop(cid, None)

    async def _consume(self, cid, entry):
        """Forward reply events and sentence-sized chunks; TTS failure does not lose text."""
        buffer, spoken, seq, speech_id = '', '', 0, uuid4().hex
        token = entry['voice_token']
        try:
            async for event in entry['stream']:
                if event['type'] == 'delta':
                    self._emit('reply_delta', event)
                    if token is not None:
                        buffer += event['text']
                        while buffer:
                            boundary = next((i + 1 for i, c in enumerate(buffer) if c in '。！？!?\n；;'), None)
                            if boundary is None and len(buffer) >= 100:
                                boundary = 100
                            if boundary is None:
                                break
                            chunk, buffer = buffer[:boundary], buffer[boundary:]
                            if self._speak(token, speech_id, seq, chunk, False):
                                spoken += chunk; seq += 1
                            else:
                                token = None; break
                elif event['type'] in ('completed', 'cancelled', 'failed'):
                    if token is not None and event['type'] == 'completed':
                        # A package terminal may supersede dropped queued deltas.
                        remaining = event['content'][len(spoken):] if event['content'].startswith(spoken) else buffer
                        self._speak(token, speech_id, seq, remaining, True)
                    elif token is not None and self._valid_voice_token(token):
                        await self._voice.interrupt()
                    if event.get('error_code'):
                        self._error(AIError(event['error_code'], operation='send_message',
                            outcome='unknown' if event['error_code'] == 'STORAGE_FAILED' else 'failed',
                            refs={'conversation_id': cid, 'generation_id': entry['generation_id']}))
                    self._emit('reply_finished', event)
        finally:
            try:
                await entry['stream'].aclose()
            finally:
                if self._replies.get(cid) is entry:
                    self._replies.pop(cid, None)

    @operation
    async def cancel_reply(self, conversation_id, generation_id):
        """Cancel this exact generation; completed or later generations are not overwritten."""
        self._need('chat')
        entry = self._replies.get(conversation_id)
        result = await self._chat.cancel_generation(conversation_id, generation_id)
        if entry and entry['generation_id'] == generation_id:
            if entry['voice_token'] and self._valid_voice_token(entry['voice_token']):
                await self._voice.interrupt()
            await asyncio.shield(entry['task'])
        return result
