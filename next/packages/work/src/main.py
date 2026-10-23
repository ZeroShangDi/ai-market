"""Streaming work API; SDKs, persistence and business tools belong to hosts."""
import asyncio
import hashlib
import json
import math
from copy import deepcopy
from dataclasses import dataclass, replace
from time import time
from typing import Protocol, Mapping, Any, Optional
from uuid import uuid4
from ._sdk_tools import WorkTool


class WorkError(Exception):
    """Stable public error without provider or storage exception details."""
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _copy(value):
    """Validate persisted DTOs and detach them from adapter-owned objects."""
    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError):
        raise WorkError('VALIDATION_ERROR') from None


class WorkStore(Protocol):
    """Identity-scoped snapshots; host guarantees one live writer per scope."""
    async def load_all(self) -> list:
        """Return detached sessions, including runs, interactions and activity."""
        ...

    async def save(self, session: dict) -> None:
        """Atomically upsert the complete snapshot, returning after commit."""
        ...


class Executor(Protocol):
    """Each SDK adapter implements the same execution and stop contract."""
    async def run(self, context: 'ExecutionContext') -> dict:
        """Return {content: str}; use context callbacks for progress and approval.

        Do not return until tools have finished. Raise on failed execution;
        propagate cancellation and never execute a rejected or expired action.
        """
        ...

    async def cancel(self, session_id: str, run_id: str) -> bool:
        """Idempotently stop remote work; True confirms stopped, False means unknown."""
        ...


@dataclass(frozen=True)
class ExecutionContext:
    """Scoped callbacks and private checkpoint; credentials stay in the adapter."""
    session_id: str
    run_id: str
    prompt: str
    history: tuple
    resources: tuple
    plugins: Mapping[str, Any]
    config: Mapping[str, Any]
    cancelled: asyncio.Event
    emit: Any
    ask: Any
    publish: Any
    recovery: Any = None
    checkpoint: Any = None
    delta: Any = None
    resume: bool = True


class Work:
    """One identity and asyncio loop; all public operations return detached DTOs."""
    def __init__(self, executor, store, plugins, config, verify_response,
                 publish_artifact, timeout, interaction_timeout, cancel_timeout, max_items, max_chars, mode):
        self._mode = mode
        self._executor, self._store = executor, store
        self._plugins, self._config = dict(plugins), _copy(config)
        self._verify, self._publisher = verify_response, publish_artifact
        self._timeout, self._interaction_timeout, self._cancel_timeout = timeout, interaction_timeout, cancel_timeout
        self._max_items, self._max_chars = max_items, max_chars
        self._lock = asyncio.Lock()
        self._loaded = store is None
        self._sessions, self._tasks, self._signals, self._pending = {}, {}, {}, {}
        self._storage_fault = False
        self._finishing = set()
        self._changed = {}

    def _event(self, session, rid, kind, data):
        """Append a bounded, durable cursor log; slow readers never block work."""
        sequence = session.get('event_sequence', 0) + 1
        session['event_sequence'] = sequence
        events = session.setdefault('events', [])
        events.append(dict(sequence=sequence, run_id=rid, type=kind, data=_copy(data)))
        del events[:-self._max_items]

    async def _save(self, session):
        # State changes and their events commit in the same host transaction.
        previous = self._sessions.get(session['id'], {})
        old_runs = {r['id']: r for r in previous.get('runs', [])}
        for run in session['runs']:
            old = old_runs.get(run['id'], {})
            if old.get('status') != run['status']:
                self._event(session, run['id'], 'status', {'status': run['status'],
                            'content': run['content'], 'error_code': run['error_code']})
        for field, kind in (('interactions', 'interaction'), ('artifacts', 'artifact')):
            old_items = {x['id']: x for x in previous.get(field, [])}
            for item in session[field]:
                if item != old_items.get(item['id']):
                    self._event(session, item['run_id'], kind, item)
        if self._store:
            try:
                await self._store.save(_copy(session))
            except asyncio.CancelledError:
                self._storage_fault = True
                for notification in self._changed.values():
                    notification.set()
                raise
            except Exception:
                # A timeout may happen after commit. Freeze writes until the host
                # reconciles storage and creates a new owner; never blindly replay.
                self._storage_fault = True
                for notification in self._changed.values():
                    notification.set()
                raise WorkError('STORAGE_FAILED') from None
        self._sessions[session['id']] = session
        self._changed.setdefault(session['id'], asyncio.Event()).set()
        # Rotate instead of clearing: an observer paused at yield must retain
        # its already-signalled notification even if another reader catches up.
        self._changed[session['id']] = asyncio.Event()

    async def _load(self):
        if self._loaded:
            return
        try:
            rows = _copy(await self._store.load_all())
            for row in rows:
                if row.get('mode', 'custom') != self._mode:
                    raise WorkError('EXECUTOR_MODE_MISMATCH')
                row.setdefault('events', [])
                row.setdefault('event_sequence', 0)
                self._sessions[row['id']] = _copy(row)
                changed = False
                for run in row['runs']:
                    if run['status'] in ('running', 'waiting', 'cancelling'):
                        run.update(status='interrupted', error_code='PROCESS_INTERRUPTED')
                        changed = True
                for item in row['interactions']:
                    if item['status'] == 'pending':
                        item['status'] = 'expired'
                        changed = True
                if changed:
                    await self._save(row)
                else:
                    self._sessions[row['id']] = row
            self._loaded = True
        except WorkError:
            raise
        except Exception:
            raise WorkError('STORAGE_FAILED') from None

    def _get(self, sid):
        if sid not in self._sessions:
            raise WorkError('NOT_FOUND')
        return _copy(self._sessions[sid])

    def _writeable(self):
        if self._storage_fault:
            raise WorkError('STORAGE_FAILED')

    def _run_row(self, session, rid):
        for run in session['runs']:
            if run['id'] == rid:
                return run
        raise WorkError('STALE_RUN')

    def _active(self, sid, rid):
        signal = self._signals.get((sid, rid))
        if signal is None or signal.is_set():
            raise WorkError('STALE_RUN')
        self._writeable()
        session = self._get(sid)
        run = self._run_row(session, rid)
        if session['status'] != 'open' or run['status'] not in ('running', 'waiting'):
            raise WorkError('STALE_RUN')
        return session, run

    async def create_session(self, title='新工作') -> dict:
        """Create a session and persist it before returning; no execution starts."""
        if not isinstance(title, str) or not title.strip() or len(title) > self._max_chars:
            raise WorkError('VALIDATION_ERROR')
        async with self._lock:
            await self._load()
            self._writeable()
            session = dict(id=str(uuid4()), title=title, mode=self._mode, status='open', runs=[], interactions=[], activity=[], artifacts=[], events=[], event_sequence=0)
            await self._save(session)
            return _copy(session)

    async def list_sessions(self) -> list:
        """Return scoped summaries in creation order, including closed sessions."""
        async with self._lock:
            await self._load()
            return [dict(id=s['id'], title=s['title'], status=s['status'],
                         run_status=s['runs'][-1]['status'] if s['runs'] else None)
                    for s in self._sessions.values()]

    async def get_session(self, session_id: str) -> dict:
        """Read all runs, results, activity, artifacts and human interactions."""
        async with self._lock:
            await self._load()
            value = self._get(session_id)
            value.pop('_recovery', None)
            value['storage_error'] = 'STORAGE_FAILED' if self._storage_fault else None
            return value

    async def submit(self, session_id: str, prompt: str, *, resources=None, options=None, resume=True) -> dict:
        """Start/continue a session in background and immediately return a run.

        A busy session rejects WORK_BUSY rather than silently queuing. Completed
        runs remain in history. Resources are host-authorized opaque references.
        resume=False discards the private checkpoint and starts with this input;
        restart alone never re-executes an interrupted run.
        """
        if type(resume) is not bool:
            raise WorkError('VALIDATION_ERROR')
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > self._max_chars:
            raise WorkError('VALIDATION_ERROR')
        resources, options = _copy(resources if resources is not None else []), _copy(options if options is not None else {})
        if not isinstance(resources, list) or not isinstance(options, dict):
            raise WorkError('VALIDATION_ERROR')
        async with self._lock:
            await self._load()
            self._writeable()
            session = self._get(session_id)
            if session['status'] != 'open':
                raise WorkError('SESSION_CLOSED')
            task = self._tasks.get(session_id)
            if task and not task.done():
                raise WorkError('WORK_BUSY')
            if len(session['runs']) >= self._max_items:
                raise WorkError('LIMIT_EXCEEDED')
            history = tuple(_copy(session['runs'])) if resume else ()
            recovery = _copy(session.get('_recovery')) if resume else None
            if not resume:
                session.pop('_recovery', None)
            run = dict(id=str(uuid4()), prompt=prompt, resources=resources, status='running', content='', error_code=None)
            session['runs'].append(run)
            await self._save(session)
            signal = asyncio.Event()
            self._signals[(session_id, run['id'])] = signal
            config = _copy(self._config)
            config.update(options)
            context = ExecutionContext(session_id, run['id'], prompt, history, tuple(resources),
                                       dict(self._plugins), config, signal,
                                       lambda text: self._emit(session_id, run['id'], text),
                                       lambda kind, detail: self._ask(session_id, run['id'], kind, detail),
                                       lambda artifact: self._publish(session_id, run['id'], artifact),
                                       recovery,
                                       lambda state: self._checkpoint(session_id, run['id'], state),
                                       lambda text: self._delta(session_id, run['id'], text), resume)
            self._tasks[session_id] = asyncio.create_task(self._execute(context))
            return _copy(run)

    async def _emit(self, sid, rid, text):
        """Persist bounded activity; never block execution on a UI subscriber."""
        if not isinstance(text, str) or len(text) > self._max_chars:
            raise WorkError('VALIDATION_ERROR')
        async with self._lock:
            session, _ = self._active(sid, rid)
            if len(session['activity']) >= self._max_items:
                raise WorkError('LIMIT_EXCEEDED')
            session['activity'].append(dict(sequence=len(session['activity']) + 1, run_id=rid, text=text))
            self._event(session, rid, 'activity', {'text': text})
            await self._save(session)

    async def stream_events(self, session_id, run_id, *, after=0):
        """Replay committed events after a session cursor, then follow one run.

        Closing/cancelling this iterator only detaches the observer. A cursor
        outside the retained window fails explicitly instead of losing events.
        """
        if type(after) is not int or after < 0:
            raise WorkError('VALIDATION_ERROR')
        while True:
            async with self._lock:
                await self._load()
                self._writeable()
                session = self._get(session_id)
                run = self._run_row(session, run_id)
                latest = session.get('event_sequence', 0)
                events = session.get('events', [])
                if after > latest:
                    raise WorkError('INVALID_CURSOR')
                if events and after < events[0]['sequence'] - 1:
                    raise WorkError('CURSOR_EXPIRED')
                batch = [e for e in events if e['sequence'] > after and e['run_id'] == run_id]
                after = latest
                finished = run['status'] not in ('running', 'waiting', 'cancelling')
                changed = self._changed.setdefault(session_id, asyncio.Event())
            for event in batch:
                yield event
            if finished:
                return
            await changed.wait()

    async def _checkpoint(self, sid, rid, state):
        """Commit adapter-owned JSON recovery state without publishing it to UI."""
        state = _copy(state)
        if not isinstance(state, dict):
            raise WorkError('VALIDATION_ERROR')
        if len(json.dumps(state)) > self._max_chars * self._max_items:
            raise WorkError('LIMIT_EXCEEDED')
        async with self._lock:
            session, _ = self._active(sid, rid)
            session['_recovery'] = state
            await self._save(session)

    async def _delta(self, sid, rid, text):
        """Persist partial text and its event atomically before observation."""
        if not isinstance(text, str):
            raise WorkError('VALIDATION_ERROR')
        if not text:
            return
        async with self._lock:
            session, run = self._active(sid, rid)
            if len(run['content']) + len(text) > self._max_chars:
                raise WorkError('LIMIT_EXCEEDED')
            run['content'] += text
            self._event(session, rid, 'text_delta', {'text': text})
            await self._save(session)

    async def _publish(self, sid, rid, artifact):
        """Delegate publication to host, then persist only validated metadata."""
        if self._publisher is None:
            raise WorkError('CAPABILITY_UNSUPPORTED')
        async with self._lock:
            self._active(sid, rid)
        metadata = _copy(await self._publisher(sid, rid, _copy(artifact)))
        if not isinstance(metadata, dict) or not isinstance(metadata.get('id'), str):
            raise WorkError('INVALID_EXECUTOR_OUTPUT')
        async with self._lock:
            session, _ = self._active(sid, rid)
            if len(session['artifacts']) >= self._max_items:
                raise WorkError('LIMIT_EXCEEDED')
            metadata['run_id'] = rid
            session['artifacts'].append(metadata)
            await self._save(session)
        return _copy(metadata)

    async def _ask(self, sid, rid, kind, detail):
        """Suspend one tool/question until a verified, bound human response."""
        detail = _copy(detail)
        if kind not in ('approval', 'question') or not isinstance(detail, dict) or not detail:
            raise WorkError('VALIDATION_ERROR')
        if self._verify is None:
            raise WorkError('CAPABILITY_UNSUPPORTED')
        iid = str(uuid4())
        future = asyncio.get_running_loop().create_future()
        async with self._lock:
            session, run = self._active(sid, rid)
            if any(i['status'] == 'pending' for i in session['interactions']):
                raise WorkError('INTERACTION_BUSY')
            if len(session['interactions']) >= self._max_items:
                raise WorkError('LIMIT_EXCEEDED')
            item = dict(id=iid, run_id=rid, kind=kind, detail=detail,
                        input_digest=hashlib.sha256(json.dumps(detail, sort_keys=True).encode()).hexdigest(),
                        expires_at=time() + self._interaction_timeout, status='pending', answer=None)
            session['interactions'].append(item)
            run['status'] = 'waiting'
            await self._save(session)
            self._pending[iid] = future
        try:
            return await asyncio.wait_for(future, self._interaction_timeout)
        except asyncio.TimeoutError:
            raise WorkError('INTERACTION_EXPIRED') from None
        finally:
            self._pending.pop(iid, None)
            async with self._lock:
                session = self._get(sid)
                item = next(i for i in session['interactions'] if i['id'] == iid)
                if item['status'] == 'pending':
                    item['status'] = 'expired'
                    await self._save(session)

    async def respond_interaction(self, session_id, run_id, interaction_id, answer, *, response_ref) -> dict:
        """Verify a host-authenticated response before releasing the waiting tool.

        Same answer can be replayed for an answered interaction; a different
        answer conflicts. Verify callback binds identity, run, input and proof.
        """
        answer = _copy(answer)
        if not isinstance(answer, dict) or not isinstance(response_ref, str) or not response_ref:
            raise WorkError('VALIDATION_ERROR')
        async with self._lock:
            await self._load()
            self._writeable()
            session = self._get(session_id)
            item = next((i for i in session['interactions'] if i['id'] == interaction_id and i['run_id'] == run_id), None)
            if item is None:
                raise WorkError('NOT_FOUND')
            if self._verify is None:
                raise WorkError('CAPABILITY_UNSUPPORTED')
            if item['kind'] == 'approval':
                valid = set(answer) == {'approved'} and type(answer['approved']) is bool
            else:
                valid = set(answer) == {'text'} and isinstance(answer['text'], str) and bool(answer['text'].strip()) and len(answer['text']) <= self._max_chars
            if not valid:
                raise WorkError('VALIDATION_ERROR')
            verification = dict(session_id=session_id, run_id=run_id, interaction=_copy(item), answer=answer, response_ref=response_ref)
        # Do not hold the state lock while calling an external verifier; after
        # it returns recheck pending state, expiry and cancellation atomically.
        try:
            allowed = await self._verify(_copy(verification))
        except Exception:
            raise WorkError('RESPONSE_REJECTED') from None
        if allowed is not True:
            raise WorkError('RESPONSE_REJECTED')
        async with self._lock:
            self._writeable()
            session = self._get(session_id)
            item = next(i for i in session['interactions'] if i['id'] == interaction_id)
            if item['status'] == 'answered':
                if item['answer'] == answer:
                    return _copy(item)
                raise WorkError('ANSWER_CONFLICT')
            self._active(session_id, run_id)
            future = self._pending.get(interaction_id)
            if item['status'] != 'pending' or item['expires_at'] <= time() or future is None or future.done():
                raise WorkError('INTERACTION_EXPIRED')
            item.update(status='answered', answer=answer)
            self._run_row(session, run_id)['status'] = 'running'
            await self._save(session)
            future.set_result(_copy(answer))
            return _copy(item)

    async def _stop_adapter(self, sid, rid):
        try:
            return await asyncio.wait_for(self._executor.cancel(sid, rid), self._cancel_timeout) is True
        except Exception:
            return False

    async def _execute(self, ctx):
        status, content, error = 'interrupted', '', 'STOP_UNCONFIRMED'
        try:
            result = await asyncio.wait_for(self._executor.run(ctx), self._timeout)
            if not isinstance(result, dict) or not isinstance(result.get('content'), str):
                raise WorkError('INVALID_EXECUTOR_OUTPUT')
            if len(result['content']) > self._max_chars:
                raise WorkError('LIMIT_EXCEEDED')
            content = result['content']
            status, error = 'succeeded', None
        except asyncio.CancelledError:
            self._finishing.add((ctx.session_id, ctx.run_id))
            ctx.cancelled.set()
            status = 'cancelled' if await self._stop_adapter(ctx.session_id, ctx.run_id) else 'interrupted'
            error = None if status == 'cancelled' else 'STOP_UNCONFIRMED'
        except Exception as exc:
            # Stop requests arriving during failure cleanup must join it.
            self._finishing.add((ctx.session_id, ctx.run_id))
            ctx.cancelled.set()
            stopped = await self._stop_adapter(ctx.session_id, ctx.run_id)
            status = 'failed' if stopped else 'interrupted'
            error = ('DEADLINE_EXCEEDED' if isinstance(exc, asyncio.TimeoutError)
                     else exc.code if isinstance(exc, WorkError) else 'EXECUTOR_FAILED')
        finally:
            self._finishing.add((ctx.session_id, ctx.run_id))
            ctx.cancelled.set()
            async with self._lock:
                session = self._get(ctx.session_id)
                run = self._run_row(session, ctx.run_id)
                run.update(status=status, content=content if status == 'succeeded' else run['content'], error_code=error)
                for item in session['interactions']:
                    if item['run_id'] == ctx.run_id and item['status'] == 'pending':
                        item['status'] = 'expired'
                try:
                    await self._save(session)
                except WorkError:
                    # Expose failure locally even when final persistence failed.
                    run.update(status='interrupted', error_code='STORAGE_FAILED')
                    self._sessions[ctx.session_id] = session
                    self._changed.setdefault(ctx.session_id, asyncio.Event()).set()

    async def cancel_run(self, session_id: str, run_id: str) -> dict:
        """Stop the exact run; confirmation differs from unknown remote effects."""
        async with self._lock:
            await self._load()
            self._writeable()
            session = self._get(session_id)
            run = self._run_row(session, run_id)
            if run['status'] not in ('running', 'waiting', 'cancelling'):
                return _copy(run)
            task = self._tasks.get(session_id)
            if run != session['runs'][-1] or task is None:
                raise WorkError('STALE_RUN')
            already_cancelling = run['status'] == 'cancelling'
            run['status'] = 'cancelling'
            await self._save(session)
            self._signals[(session_id, run_id)].set()
            if not already_cancelling and (session_id, run_id) not in self._finishing:
                task.cancel()
        # Runner finalization needs the state lock; never await it inside lock.
        await asyncio.gather(asyncio.shield(task), return_exceptions=True)
        async with self._lock:
            session = self._get(session_id)
            run = self._run_row(session, run_id)
            if run['status'] == 'cancelling':
                # Cancelled before the first scheduling: no executor was started.
                run['status'] = 'cancelled'
                await self._save(session)
            return _copy(run)

    async def close_session(self, session_id: str) -> dict:
        """Permanently close submissions, stop current run and retain all history."""
        async with self._lock:
            await self._load()
            self._writeable()
            session = self._get(session_id)
            session['status'] = 'closed'
            await self._save(session)
            run = session['runs'][-1] if session['runs'] else None
        if run and run['status'] in ('running', 'waiting', 'cancelling'):
            await self.cancel_run(session_id, run['id'])
        return await self.get_session(session_id)


def create_work(*, mode: Optional[str] = None, executor: Optional[Executor] = None, sdk_options=None, store: Optional[WorkStore] = None,
                plugins=None, config=None, verify_response=None, publish_artifact=None,
                timeout=600, interaction_timeout=300, cancel_timeout=10,
                max_items=1000, max_chars=32000) -> Work:
    """Inject SDK adapter, scoped persistence, plugins and trusted host callbacks.

    mode selects an optional SDK adapter; custom executor injection remains supported.
    Database, business tools and authentication remain host-owned.
    All adapters must propagate task cancellation and release resources promptly.
    """
    if mode not in (None, 'custom', 'openai', 'claude'):
        raise WorkError('INVALID_MODE')
    if mode in ('openai', 'claude'):
        if executor is not None:
            raise WorkError('INVALID_MODE')
        if sdk_options is not None and not isinstance(sdk_options, dict):
            raise WorkError('INVALID_SDK_OPTIONS')
        options = dict(sdk_options or {})
        if 'max_turns' in options and (type(options['max_turns']) is not int or options['max_turns'] < 1):
            raise WorkError('INVALID_SDK_OPTIONS')
        if 'instructions' in options and not isinstance(options['instructions'], str):
            raise WorkError('INVALID_SDK_OPTIONS')
        if mode == 'openai':
            from ._openai import OpenAIExecutor
            executor = OpenAIExecutor(options)
        else:
            from ._claude import ClaudeExecutor
            executor = ClaudeExecutor(options)
        from ._sdk_tools import validate_tools
        if plugins is not None and not isinstance(plugins, Mapping):
            raise WorkError('INVALID_TOOL')
        validate_tools(plugins or {})
        plugins = {name: replace(tool, schema=_copy(tool.schema)) for name, tool in (plugins or {}).items()}
    elif sdk_options is not None:
        raise WorkError('INVALID_SDK_OPTIONS')
    if any(not callable(getattr(executor, n, None)) for n in ('run', 'cancel')):
        raise WorkError('VALIDATION_ERROR')
    if store is not None and any(not callable(getattr(store, n, None)) for n in ('load_all', 'save')):
        raise WorkError('VALIDATION_ERROR')
    if any(type(v) not in (int, float) or not math.isfinite(v) or v <= 0 for v in (timeout, interaction_timeout, cancel_timeout)):
        raise WorkError('VALIDATION_ERROR')
    if any(type(v) is not int or v < 1 for v in (max_items, max_chars)):
        raise WorkError('VALIDATION_ERROR')
    if any(v is not None and not callable(v) for v in (verify_response, publish_artifact)):
        raise WorkError('VALIDATION_ERROR')
    if plugins is not None and not isinstance(plugins, Mapping) or config is not None and not isinstance(config, dict):
        raise WorkError('VALIDATION_ERROR')
    return Work(executor, store, plugins or {}, config or {}, verify_response, publish_artifact,
                timeout, interaction_timeout, cancel_timeout, max_items, max_chars, mode or 'custom')


__all__ = ['create_work', 'Work', 'WorkError', 'WorkStore', 'Executor', 'ExecutionContext', 'WorkTool']
