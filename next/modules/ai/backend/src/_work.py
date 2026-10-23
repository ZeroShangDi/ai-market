"""Work resources; business tools and approval proofs stay host-owned."""
import asyncio
from ._contracts import AIError, operation


class WorkResources:
    @operation
    async def create_work(self, title='新工作', *, conversation_id=None):
        """Create a work session; failed association exposes the already-created ID."""
        self._need('work'); self._writeable()
        await self._authorize('create_work', {'conversation_id': conversation_id})
        if conversation_id is not None:
            self._need('chat')
            await self._authorize('get_conversation', {'conversation_id': conversation_id})
            await self._chat.get_conversation(conversation_id)
        row = await self._work.create_session(title)
        if conversation_id is not None:
            try:
                await self._metadata_write('set_work_conversation', row['id'], conversation_id)
            except AIError:
                raise AIError('OUTCOME_UNKNOWN', outcome='unknown', refs={'work_id': row['id']}) from None
            self._links[row['id']] = conversation_id
        return dict(row, work_id=row['id'], conversation_id=conversation_id)

    @operation
    async def list_work(self, *, conversation_id=None):
        """Return scoped work summaries, optionally filtered by conversation association."""
        self._need('work')
        await self._authorize('list_work', {'conversation_id': conversation_id})
        return [dict(row, work_id=row['id'], conversation_id=self._links.get(row['id']))
                for row in await self._work.list_sessions()
                if conversation_id is None or self._links.get(row['id']) == conversation_id]

    @operation
    async def get_work(self, work_id):
        """Read results and interactions without exposing the SDK checkpoint."""
        self._need('work')
        await self._authorize('get_work', {'work_id': work_id})
        row = await self._work.get_session(work_id)
        self._pending_counts[work_id] = sum(i['status'] == 'pending' for i in row['interactions'])
        return dict(row, work_id=work_id, conversation_id=self._links.get(work_id))

    @operation
    async def submit_work(self, work_id, prompt, *, resources=None, resume=True):
        """Submit once; response loss must be reconciled rather than blindly retried."""
        self._need('work'); self._writeable()
        await self._authorize('submit_work', {'work_id': work_id})
        run = await self._work.submit(work_id, prompt, resources=resources, resume=resume)
        self._spawn(self._watch_work(work_id, run['id']))
        return dict(run, work_id=work_id)

    async def _watch_work(self, wid, rid):
        """Follow retained events; explicitly resnapshot if a cursor falls behind."""
        after = 0
        while not self._disposed:
            try:
                async for event in self._work.stream_events(wid, rid, after=after):
                    after = event['sequence']
                    if event['type'] in ('status', 'interaction'):
                        row = await self._work.get_session(wid)
                        self._pending_counts[wid] = sum(i['status'] == 'pending' for i in row['interactions'])
                    self._emit('work_changed', dict(work_id=wid, event=event))
                return
            except Exception as exc:
                if getattr(exc, 'code', None) != 'CURSOR_EXPIRED':
                    raise
                row = await self._work.get_session(wid)
                after = row['event_sequence']
                self._pending_counts[wid] = sum(i['status'] == 'pending' for i in row['interactions'])
                self._emit('work_changed', dict(work_id=wid, snapshot=row))

    @operation
    async def cancel_work(self, work_id, run_id):
        """Stop an owned run; allow cleanup even when optional business admission changes."""
        self._need('work')
        return await self._work.cancel_run(work_id, run_id)

    @operation
    async def close_work(self, work_id):
        """Close new submissions while preserving historical results."""
        self._need('work'); self._writeable()
        await self._authorize('close_work', {'work_id': work_id})
        return await self._work.close_session(work_id)

    @operation
    async def respond_interaction(self, work_id, run_id, interaction_id, answer, *, response_ref):
        """Forward the exact proof-bound answer through the package verifier."""
        self._need('work'); self._writeable()
        await self._authorize('respond_interaction', dict(work_id=work_id, run_id=run_id, interaction_id=interaction_id))
        return await self._work.respond_interaction(work_id, run_id, interaction_id, answer, response_ref=response_ref)
