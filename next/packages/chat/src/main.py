"""Lightweight chat with injectable storage; model and business capabilities belong to the host."""
import asyncio
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable, Mapping, Optional, Protocol
from functools import wraps
from uuid import uuid4


class ChatError(Exception):
    """Stable error code; provider exception details are not exposed."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class GenerationInput:
    """Isolated history/config snapshots and host-owned capability handles."""
    conversation_id: str
    generation_id: str
    messages: tuple
    plugins: Mapping[str, Any]
    config: Mapping[str, Any]
    cancelled: asyncio.Event


class ConversationStore(Protocol):
    """Host-scoped storage; one live Chat writer per scope.

    Reads return detached JSON-compatible snapshots. save atomically replaces
    one conversation; delete is idempotent. The host owns isolation, durability,
    database connections and lifecycle. Exceptions must not include secrets.
    """

    async def load_all(self) -> list:
        """Load all conversations in this identity's scope, in creation order."""
        ...

    async def save(self, conversation: dict) -> None:
        """Atomically upsert a complete snapshot; return after durable commit."""
        ...

    async def delete(self, conversation_id: str) -> None:
        """Durably delete this scoped conversation; missing IDs are allowed."""
        ...


def _serialized(method):
    @wraps(method)
    async def call(self, *args, **kwargs):
        async with self._commands:
            await self._load()
            return await method(self, *args, **kwargs)
    return call


class _Events:
    def __init__(self, queue, task, close):
        self.queue, self.task, self.close = queue, task, close

    def __aiter__(self):
        return self

    async def __anext__(self):
        # Wait on task completion as well as data: cancellation must never need
        # space in a full queue just to deliver a terminal sentinel.
        while True:
            if not self.queue.empty():
                return self.queue.get_nowait()
            if self.task.done():
                raise StopAsyncIteration
            waiter = asyncio.create_task(self.queue.get())
            try:
                await asyncio.wait((waiter, self.task), return_when=asyncio.FIRST_COMPLETED)
                if waiter.done():
                    return waiter.result()
            finally:
                if not waiter.done():
                    waiter.cancel()
                    await asyncio.gather(waiter, return_exceptions=True)

    async def aclose(self):
        """Stop generation and release the provider when abandoning this stream."""
        await self.close()


class Chat:
    """One trusted identity per instance, used on one asyncio event loop."""

    def __init__(self, generator, plugins, config, max_chars, queue_size, timeout, store):
        self._generator = generator
        self._plugins = dict(plugins)
        self._config = deepcopy(config)
        self._max_chars, self._queue_size, self._timeout = max_chars, queue_size, timeout
        self._sessions = {}
        self._runs = {}
        self._store = store
        self._loaded = store is None
        self._commands = asyncio.Lock()
        self._storage = asyncio.Lock()
        self._storage_fault = False
        self._finishing = set()

    async def _load(self):
        if self._loaded:
            return
        try:
            sessions = deepcopy(await self._store.load_all())
            restored = {}
            for session in sessions:
                if session.get('generation') and session['generation']['status'] == 'running':
                    # A persisted running flag is not proof of a live provider.
                    # Never replay model/tool calls after process restart.
                    session['generation'].update(status='interrupted', error_code='PROCESS_INTERRUPTED')
                    await self._store.save(deepcopy(session))
                restored[session['id']] = session
            self._sessions = restored
            self._loaded = True
        except Exception:
            raise ChatError('STORAGE_FAILED') from None

    def _writeable(self):
        """Freeze writes after an uncertain commit until the host reconciles storage."""
        if self._storage_fault:
            raise ChatError('STORAGE_FAILED')

    async def _save(self, session):
        if self._store is None:
            return
        try:
            async with self._storage:
                self._writeable()
                snapshot = deepcopy(session)
                snapshot.pop('_deleting', None)
                await self._store.save(snapshot)
        except asyncio.CancelledError:
            self._storage_fault = True
            raise
        except Exception:
            self._storage_fault = True
            raise ChatError('STORAGE_FAILED') from None

    def _get(self, conversation_id):
        if conversation_id not in self._sessions:
            raise ChatError('NOT_FOUND')
        return self._sessions[conversation_id]

    def _view(self, session):
        value = deepcopy(session)
        value['storage_error'] = 'STORAGE_FAILED' if self._storage_fault else None
        return value

    @_serialized
    async def create_conversation(self, title: str = '新会话') -> dict:
        """Create and save a conversation; reject empty/non-text titles."""
        if not isinstance(title, str) or not title.strip():
            raise ChatError('VALIDATION_ERROR')
        self._writeable()
        session = dict(id=str(uuid4()), title=title, messages=[], generation=None)
        await self._save(session)
        self._sessions[session['id']] = session
        return self._view(session)

    @_serialized
    async def list_conversations(self) -> list:
        """Return detached summaries in creation order for this instance only."""
        return [dict(id=s['id'], title=s['title']) for s in self._sessions.values()]

    @_serialized
    async def get_conversation(self, conversation_id: str) -> dict:
        """Read history and latest generation status, including partial output."""
        return self._view(self._get(conversation_id))

    @_serialized
    async def send_message(self, conversation_id: str, content: Optional[str] = None,
                           *, retry: bool = False, options: Optional[dict] = None) -> AsyncIterator[dict]:
        """Start one generation and return its bounded event stream.

        retry=True replaces the last assistant reply without duplicating its
        user message. Options override host configuration for this call only.
        Raises CHAT_BUSY, VALIDATION_ERROR or NOTHING_TO_RETRY before mutation.
        """
        self._writeable()
        session = self._get(conversation_id)
        if session.get('_deleting'):
            raise ChatError('NOT_FOUND')
        current = self._runs.get(conversation_id)
        if current and not current[0].done():
            raise ChatError('CHAT_BUSY')
        if not isinstance(retry, bool) or (options is not None and not isinstance(options, dict)):
            raise ChatError('VALIDATION_ERROR')
        if retry:
            if content is not None or not session['messages']:
                raise ChatError('NOTHING_TO_RETRY')
            history = deepcopy(session['messages'][:-1])
        else:
            if not isinstance(content, str) or not content.strip() or len(content) > self._max_chars:
                raise ChatError('VALIDATION_ERROR')
            history = deepcopy(session['messages'])
            history.append(dict(role='user', content=content))
        config = deepcopy(self._config)
        config.update(deepcopy(options or {}))
        generation_id = str(uuid4())
        cancelled = asyncio.Event()
        request = GenerationInput(conversation_id, generation_id, tuple(deepcopy(history)),
                                  dict(self._plugins), config, cancelled)
        previous = deepcopy(session)
        session['messages'] = history + [dict(role='assistant', content='')]
        session['generation'] = dict(id=generation_id, status='running', error_code=None)
        try:
            await self._save(session)
        except BaseException:
            session.clear()
            session.update(previous)
            raise
        queue = asyncio.Queue(self._queue_size)
        task = asyncio.create_task(self._run(session, request, queue))
        self._runs[conversation_id] = (task, cancelled)
        return _Events(queue, task, lambda: self.cancel_generation(conversation_id, generation_id))

    async def _run(self, session, request, queue):
        source = None
        generation = session['generation']
        message = session['messages'][-1]
        sequence = 0

        async def emit(kind, **data):
            nonlocal sequence
            sequence += 1
            await queue.put(dict(type=kind, generation_id=request.generation_id,
                                 conversation_id=request.conversation_id, sequence=sequence, **data))

        async def consume():
            nonlocal source
            await emit('started')
            source = self._generator(request)
            async for text in source:
                if request.cancelled.is_set():
                    raise asyncio.CancelledError
                if not isinstance(text, str):
                    raise ChatError('INVALID_PROVIDER_OUTPUT')
                if len(message['content']) + len(text) > self._max_chars:
                    raise ChatError('LIMIT_EXCEEDED')
                offset = len(message['content'])
                message['content'] += text
                await self._save(session)
                await emit('delta', text=text, offset=offset)

        try:
            await asyncio.wait_for(consume(), self._timeout)
            generation['status'] = 'completed'
        except asyncio.CancelledError:
            request.cancelled.set()
            generation['status'] = 'cancelled'
        except Exception as error:
            generation['status'] = 'failed'
            generation['error_code'] = ('DEADLINE_EXCEEDED' if isinstance(error, asyncio.TimeoutError)
                                        else error.code if isinstance(error, ChatError) else 'PROVIDER_FAILED')
        finally:
            # Once cleanup starts, cancellation must wait for the terminal commit.
            self._finishing.add(request.generation_id)
            if source is not None and hasattr(source, 'aclose'):
                try:
                    await source.aclose()
                except Exception:
                    generation['status'] = 'failed'
                    generation['error_code'] = 'PROVIDER_CLEANUP_FAILED'
            try:
                await self._save(session)
            except ChatError:
                generation.update(status='failed', error_code='STORAGE_FAILED')
            # A terminal snapshot supersedes queued deltas; never block cleanup
            # on an abandoned consumer or discard the final authoritative text.
            while queue.full():
                queue.get_nowait()
            sequence += 1
            queue.put_nowait(dict(type=generation['status'], sequence=sequence,
                                 conversation_id=request.conversation_id,
                                 generation_id=request.generation_id, content=message['content'],
                                 error_code=generation['error_code']))
            self._finishing.discard(request.generation_id)

    @_serialized
    async def cancel_generation(self, conversation_id: str, generation_id: str) -> dict:
        """Cancel only the matching generation; return its final local status.

        Provider adapters must cooperate with cancellation and close resources.
        This does not promise that remote billing or tool effects are undone.
        """
        session = self._get(conversation_id)
        if not session['generation'] or session['generation']['id'] != generation_id:
            raise ChatError('STALE_GENERATION')
        return await self._cancel(session)

    async def _cancel(self, session):
        run = self._runs.get(session['id'])
        if run is None:
            return deepcopy(session['generation'])
        task, signal = run
        if not task.done():
            if not signal.is_set() and session['generation']['id'] not in self._finishing:
                signal.set()
                task.cancel()
            await asyncio.gather(asyncio.shield(task), return_exceptions=True)
            # A task cancelled before its first scheduling never enters finally.
            if session['generation']['status'] == 'running':
                session['generation']['status'] = 'cancelled'
                await self._save(session)
        return deepcopy(session['generation'])

    @_serialized
    async def delete_conversation(self, conversation_id: str) -> dict:
        """Idempotently delete history after cancelling its current generation."""
        self._writeable()
        session = self._sessions.get(conversation_id)
        if session is not None:
            session['_deleting'] = True
            try:
                if session['generation']:
                    await self._cancel(session)
                if self._store is not None:
                    try:
                        async with self._storage:
                            self._writeable()
                            await self._store.delete(conversation_id)
                    except asyncio.CancelledError:
                        self._storage_fault = True
                        raise
                    except Exception:
                        self._storage_fault = True
                        raise ChatError('STORAGE_FAILED') from None
                self._sessions.pop(conversation_id, None)
                self._runs.pop(conversation_id, None)
            finally:
                session.pop('_deleting', None)
        return {'deleted': True}


def create_chat(*, generator: Callable[[GenerationInput], AsyncIterator[str]],
                store: Optional[ConversationStore] = None,
                plugins: Optional[Mapping[str, Any]] = None, config: Optional[dict] = None,
                max_chars: int = 32000, queue_size: int = 32, timeout: float = 120) -> Chat:
    """Inject a streaming generator, host capabilities and default options.

    No SDK, database driver or skill discovery is installed. Optional store
    supplies persistence; omitted store keeps the original in-memory behavior.
    Generator must return an async iterator and honor task cancellation.
    """
    if not callable(generator) or not isinstance(max_chars, int) or max_chars < 1:
        raise ChatError('VALIDATION_ERROR')
    if not isinstance(queue_size, int) or queue_size < 1 or not isinstance(timeout, (int, float)) or timeout <= 0:
        raise ChatError('VALIDATION_ERROR')
    if store is not None and any(not callable(getattr(store, name, None)) for name in ('load_all', 'save', 'delete')):
        raise ChatError('VALIDATION_ERROR')
    return Chat(generator, plugins or {}, config or {}, max_chars, queue_size, timeout, store)


__all__ = ['create_chat', 'Chat', 'ChatError', 'GenerationInput', 'ConversationStore']
