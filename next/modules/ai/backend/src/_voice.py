"""Complete continuous speech controller, driven by the voice package's public events."""
import asyncio
from ._contracts import AIError, clone, operation


class VoiceResources:
    def _valid_voice_token(self, token):
        return token == (self._voice_epoch, self._voice_sid, self._voice_generation) and self._voice_sid is not None

    def _check_voice_token(self, token):
        if token is not None and not self._valid_voice_token(token):
            raise AIError('STALE_GENERATION')

    def _speak(self, token, speech_id, seq, text, final):
        if not self._valid_voice_token(token):
            return False
        try:
            self._voice.speak(session_id=token[1], generation=token[2], speech_id=speech_id,
                              seq=seq, text=text, final=final)
            return True
        except Exception as exc:
            self._error(AIError(getattr(exc, 'code', 'PLAYBACK_FAILED'), operation='speak', outcome='failed'))
            return False

    def _on_voice(self, event):
        """Never await inside package callbacks; reject old sessions before scheduling work."""
        if self._disposed:
            return
        sid = event.get('session_id')
        if event['type'] == 'state':
            if sid != self._voice_sid:
                # The package emits idle after a terminal capture failure.
                if sid is None and self._voice_sid and event['session'] == 'idle':
                    self._spawn(self._stop_voice(expected_epoch=self._voice_epoch))
                return
            self._voice_generation = event['generation']
            self._voice_state = dict(event, conversation_id=self._voice_cid)
            self._emit('voice_changed', self._voice_state)
        elif sid != self._voice_sid or sid is None:
            return
        elif event['type'] == 'generation_cancelled':
            self._voice_generation = event['next_generation']
            if event['reason'] == 'speech':
                if self._voice_turn and not self._voice_turn.done():
                    self._voice_turn.cancel()
                entry = self._replies.get(self._voice_cid)
                if entry and entry['voice_token']:
                    self._spawn(self.cancel_reply(self._voice_cid, entry['generation_id']))
        elif event['type'] == 'transcript':
            if not event.get('final', True):
                return
            key = event['utterance_id']
            if key in self._utterances or event['generation'] != self._voice_generation:
                return
            self._utterances.add(key)
            if len(self._utterances) > 1024:
                self._utterances = {key}
            token = (self._voice_epoch, sid, event['generation'])
            self._voice_turn = self._spawn(self._voice_input(self._voice_cid, event['text'], token))
        elif event['type'] == 'error':
            self._error(AIError(event['code'], operation='voice', outcome='failed'))

    async def _voice_input(self, cid, text, token):
        """A new speech turn joins old reply cancellation before calling the shared path."""
        entry = self._replies.get(cid)
        if entry:
            await self.cancel_reply(cid, entry['generation_id'])
        self._check_voice_token(token)
        await self._send(cid, text, voice_token=token)

    @operation
    async def start_voice(self, conversation_id=None):
        """Acquire the supplied permission/terminal bridge and start a continuous dialogue."""
        self._need('voice'); self._writeable()
        async with self._voice_lock:
            cid = conversation_id or self._voice_cid
            if self._voice_sid:
                if cid != self._voice_cid:
                    raise AIError('VOICE_BUSY')
                return clone(self._voice_state)
            await self._authorize('start_voice', {'conversation_id': cid})
            if cid is None:
                cid = (await self.create_conversation())['id']
            await self._chat.get_conversation(cid)
            cfg = self._effective(cid)
            opened = False
            try:
                if self._acquire_audio:
                    await asyncio.wait_for(self._acquire_audio(), self._timeout)
                    opened = True
                self._ready()
                self._voice.configure(**{k: cfg[k] for k in ('voice_id', 'rate', 'volume') if cfg.get(k) is not None})
                self._voice_cid = cid
                self._voice_epoch += 1
                self._utterances.clear()
                self._voice_sid = await self._voice.start()
                self._audio_acquired = opened
                if cfg['muted']:
                    await self._voice.set_muted(True)
                # subscribe sends a synchronous state snapshot, unlike deferred events.
                if self._voice_unsubscribe:
                    self._voice_unsubscribe()
                epoch = self._voice_epoch
                self._voice_unsubscribe = self._voice.subscribe(
                    lambda event: self._on_voice(event) if epoch == self._voice_epoch else None)
                return clone(self._voice_state)
            except BaseException:
                self._voice_sid = None
                await self._voice.stop()
                if opened:
                    await asyncio.wait_for(self._release_audio(), self._timeout)
                self._audio_acquired = False
                raise

    @operation
    async def stop_voice(self):
        """Idempotently release audio and its owned reply; independent work is untouched."""
        return await self._stop_voice()

    async def _stop_voice(self, expected_epoch=None):
        async with self._voice_lock:
            if expected_epoch is not None and expected_epoch != self._voice_epoch:
                return clone(self._voice_state)
            if self._voice_unsubscribe:
                self._voice_unsubscribe()
                self._voice_unsubscribe = None
            self._voice_epoch += 1
            self._voice_sid = None
            if self._voice_turn and not self._voice_turn.done() and self._voice_turn is not asyncio.current_task():
                self._voice_turn.cancel()
                await asyncio.gather(self._voice_turn, return_exceptions=True)
            entry = self._replies.get(self._voice_cid)
            try:
                if self._voice:
                    await self._voice.stop()
                if entry and entry['voice_token']:
                    await self._chat.cancel_generation(self._voice_cid, entry['generation_id'])
                    await asyncio.shield(entry['task'])
            finally:
                if self._audio_acquired:
                    self._audio_acquired = False
                    await asyncio.wait_for(self._release_audio(), self._timeout)
                self._voice_state = dict(conversation_id=self._voice_cid, capture='off', playback='idle', muted=False)
                self._emit('voice_changed', self._voice_state)
            return clone(self._voice_state)
