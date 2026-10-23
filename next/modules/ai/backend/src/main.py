"""Public composition entry. All package access uses their documented main exports."""
import asyncio
import math
from uuid import uuid4
from ._contracts import AIError, MetadataStore, MemoryMetadata, clone, operation
from ._chat import ChatResources
from ._work import WorkResources
from ._voice import VoiceResources


class AI(ChatResources, WorkResources, VoiceResources):
    """One authenticated scope on one event loop; construct with create_ai."""

    def _ready(self):
        if self._disposed:
            raise AIError('DISPOSED')

    def _need(self, name):
        if getattr(self, '_' + name) is None:
            raise AIError('CAPABILITY_UNSUPPORTED')

    def _writeable(self):
        if self._fault:
            raise AIError('OUTCOME_UNKNOWN', outcome='unknown')

    async def _authorize(self, operation, refs):
        try:
            allowed = await asyncio.wait_for(self._authorize_fn(operation, clone(refs)), self._timeout)
        except asyncio.CancelledError:
            raise
        except Exception:
            allowed = False
        if allowed is not True:
            raise AIError('PERMISSION_DENIED')
        self._ready()

    def _conversation_lock(self, cid):
        return self._locks.setdefault(cid, asyncio.Lock())

    def _configuration(self, role_id=None):
        role = self._default_role if role_id is None else role_id
        if role not in self._roles:
            raise AIError('INVALID_ROLE')
        return dict(role_id=role, network_enabled=self._network_default,
                    voice_id=self._roles[role].get('voice_id', self._voice_default),
                    rate=1.0, volume=1.0, muted=False)

    def _effective(self, cid):
        return clone(self._configs.get(cid, self._configuration()))

    async def _metadata_write(self, method, *args):
        try:
            async with self._metadata_lock:
                self._writeable()
                await getattr(self._storage, method)(*args)
        except BaseException as exc:
            self._fault = True
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise AIError('OUTCOME_UNKNOWN', outcome='unknown') from None

    def _spawn(self, awaitable):
        task = asyncio.create_task(awaitable)
        self._tasks.add(task)
        def done(completed):
            self._tasks.discard(completed)
            if not completed.cancelled() and completed.exception():
                exc = completed.exception()
                self._error(exc if isinstance(exc, AIError) else AIError(
                    getattr(exc, 'code', 'OPERATION_FAILED'), outcome='failed'))
        task.add_done_callback(done)
        return task

    def _snapshot(self):
        return clone(dict(instance_id=self._id, revision=self._revision,
            capabilities={name: getattr(self, '_' + name) is not None for name in ('chat', 'work', 'voice')},
            voice=self._voice_state,
            active_replies=[dict(conversation_id=cid, generation_id=e['generation_id']) for cid, e in self._replies.items()],
            pending_count=sum(self._pending_counts.values()), error=self._last_error))

    def _deliver(self, key, event):
        listener = self._listeners.get(key)
        if listener is not None and not self._disposed:
            try:
                listener(clone(event))
            except Exception:
                pass  # Observation cannot roll back commands or block other subscribers.

    def _emit(self, kind, data):
        self._revision += 1
        event = dict(type=kind, instance_id=self._id, revision=self._revision, data=clone(data))
        for key in tuple(self._listeners):
            asyncio.get_running_loop().call_soon(self._deliver, key, event)

    def _error(self, error):
        if error.code in ('STORAGE_FAILED', 'OUTCOME_UNKNOWN'):
            self._fault = True
        self._last_error = error.as_dict()
        self._emit('error', self._last_error)

    @operation
    async def get_state(self):
        """Read a detached compact state; historical content uses detail queries."""
        await self._authorize('get_state', {})
        return self._snapshot()

    def subscribe(self, listener):
        """Synchronously publish a snapshot; return an idempotent subscription disposer.

        The host must authorize access to this already scoped instance. Callbacks
        are synchronous observations, never awaited business hooks.
        """
        self._ready()
        if not callable(listener) or asyncio.iscoroutinefunction(listener):
            raise AIError('VALIDATION_ERROR')
        key = uuid4().hex
        self._listeners[key] = listener
        self._deliver(key, dict(type='snapshot', instance_id=self._id,
                               revision=self._revision, data=self._snapshot()))
        return lambda: self._listeners.pop(key, None)

    @operation
    async def configure(self, conversation_id, **change):
        """Persist one declared setting; active audio updates have no cross-store transaction."""
        self._need('chat'); self._writeable()
        if len(change) != 1 or not set(change) <= {'role_id','network_enabled','voice_id','rate','volume','muted'}:
            raise AIError('VALIDATION_ERROR')
        field, value = next(iter(change.items()))
        await self._authorize('configure', {'conversation_id': conversation_id, 'field': field})
        async with self._conversation_lock(conversation_id):
            await self._chat.get_conversation(conversation_id)
            cfg = self._effective(conversation_id)
            active = self._voice_sid is not None and self._voice_cid == conversation_id
            if field in ('role_id', 'voice_id') and (active or conversation_id in self._replies):
                raise AIError('CHAT_BUSY')
            if field == 'role_id':
                if value not in self._roles:
                    raise AIError('INVALID_ROLE')
                cfg['voice_id'] = self._roles[value].get('voice_id', self._voice_default)
            elif field == 'network_enabled':
                if type(value) is not bool:
                    raise AIError('VALIDATION_ERROR')
                if value and not self._network_supported:
                    raise AIError('CAPABILITY_UNSUPPORTED')
            else:
                self._need('voice')
                if field == 'muted':
                    if type(value) is not bool:
                        raise AIError('VALIDATION_ERROR')
                elif field == 'voice_id':
                    if value not in self._voice_ids:
                        raise AIError('INVALID_VOICE')
                else:
                    low, high = (.25, 4) if field == 'rate' else (0, 1)
                    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                        raise AIError('VALIDATION_ERROR')
                if active:
                    if field == 'muted':
                        await self._voice.set_muted(value)
                    else:
                        self._voice.configure(**change)
            cfg[field] = value
            await self._metadata_write('save_conversation_config', conversation_id, cfg)
            self._configs[conversation_id] = cfg
            return clone(cfg)

    async def dispose(self):
        """Join owned cleanup once; report IDs whose remote stop could not be confirmed."""
        if self._dispose_task is None:
            self._disposed = True
            self._dispose_task = asyncio.create_task(self._dispose())
        return clone(await asyncio.shield(self._dispose_task))

    async def _dispose(self):
        unknown = []
        for signal in self._preparing.values():
            signal.set()
        calls = list(self._calls)
        for task in calls:
            task.cancel()
        await asyncio.gather(*calls, return_exceptions=True)
        try:
            await self._stop_voice()
        except Exception:
            unknown.append({'resource': 'voice', 'conversation_id': self._voice_cid})
        # Enumerate public snapshots, including admissions interrupted before a receipt.
        if self._chat:
            for row in await self._chat.list_conversations():
                view = await self._chat.get_conversation(row['id'])
                gen = view.get('generation')
                if gen and gen['status'] == 'running':
                    try:
                        result = await self._chat.cancel_generation(row['id'], gen['id'])
                        if result.get('error_code') in ('PROVIDER_CLEANUP_FAILED', 'STORAGE_FAILED'):
                            unknown.append({'conversation_id': row['id'], 'generation_id': gen['id']})
                    except Exception:
                        unknown.append({'conversation_id': row['id'], 'generation_id': gen['id']})
        if self._work:
            for row in await self._work.list_sessions():
                view = await self._work.get_session(row['id'])
                for run in view['runs']:
                    if run['status'] == 'interrupted':
                        unknown.append({'work_id': row['id'], 'run_id': run['id']})
                    if run['status'] in ('running', 'waiting', 'cancelling'):
                        try:
                            result = await self._work.cancel_run(row['id'], run['id'])
                            if result.get('status') not in ('cancelled', 'succeeded', 'failed'):
                                unknown.append({'work_id': row['id'], 'run_id': run['id']})
                        except Exception:
                            unknown.append({'work_id': row['id'], 'run_id': run['id']})
        if self._voice_unsubscribe:
            self._voice_unsubscribe()
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._listeners.clear()
        return {'disposed': True, 'unconfirmed': unknown}


async def create_ai(*, scope, services, authorize, config=None, plugins=None, prepare_turn=None):
    """Assemble scoped resources without model calls or microphone capture.

    services contains package factory keyword dictionaries; memory=True explicitly
    opts into volatile storage. chat.capabilities declares context/roles/network.
    voice.acquire/release are an optional paired host terminal permission bridge.
    """
    if not isinstance(scope, str) or not scope.strip() or not callable(authorize):
        raise AIError('VALIDATION_ERROR')
    if not isinstance(services, dict) or not set(services) <= {'chat','work','voice','storage','memory'}:
        raise AIError('VALIDATION_ERROR')
    if not any(k in services for k in ('chat','work')) or ('voice' in services and 'chat' not in services):
        raise AIError('CAPABILITY_UNSUPPORTED')
    cfg = clone(config or {})
    if not set(cfg) <= {'roles','default_role','network_enabled','extension_timeout'}:
        raise AIError('VALIDATION_ERROR')
    roles = cfg.get('roles', {'default': {}})
    default = cfg.get('default_role', 'default')
    if not isinstance(roles, dict) or default not in roles or any(
            not isinstance(k, str) or not k or not isinstance(v, dict) or not set(v) <= {'chat_config','voice_id'}
            or not isinstance(v.get('chat_config', {}), dict) for k,v in roles.items()):
        raise AIError('INVALID_ROLE')
    timeout = cfg.get('extension_timeout', 10)
    if type(timeout) not in (int,float) or not math.isfinite(timeout) or timeout <= 0:
        raise AIError('VALIDATION_ERROR')
    if prepare_turn is not None and not callable(prepare_turn):
        raise AIError('VALIDATION_ERROR')
    memory = services.get('memory', False)
    if type(memory) is not bool:
        raise AIError('VALIDATION_ERROR')
    storage = services.get('storage')
    if storage is None and memory:
        storage = MemoryMetadata()
    if storage is None or any(not callable(getattr(storage,n,None)) for n in (
            'load_all','save_conversation_config','delete_conversation_config','set_work_conversation')):
        raise AIError('STORAGE_REQUIRED')
    plugins = plugins or {}
    if not isinstance(plugins, dict) or not set(plugins) <= {'chat','work'} or any(k not in services for k in plugins):
        raise AIError('INVALID_PLUGIN')
    ai = AI()
    ai._id, ai._scope = uuid4().hex, scope
    ai._disposed, ai._fault, ai._dispose_task = False, False, None
    ai._chat = ai._work = ai._voice = None
    ai._calls, ai._tasks, ai._listeners, ai._locks = {}, set(), {}, {}
    ai._configs, ai._links, ai._pending_counts = {}, {}, {}
    ai._replies, ai._preparing = {}, {}
    ai._revision, ai._last_error = 0, None
    ai._roles, ai._default_role = roles, default
    ai._network_default = cfg.get('network_enabled', False)
    ai._network_supported = False
    ai._voice_default, ai._voice_ids = None, set()
    ai._timeout, ai._authorize_fn, ai._prepare = timeout, authorize, prepare_turn
    ai._storage, ai._metadata_lock = storage, asyncio.Lock()
    ai._voice_lock, ai._voice_epoch, ai._voice_generation = asyncio.Lock(), 0, 0
    ai._voice_sid = ai._voice_cid = ai._voice_turn = ai._voice_unsubscribe = None
    ai._acquire_audio = ai._release_audio = None
    ai._audio_acquired, ai._utterances = False, set()
    ai._voice_state = dict(conversation_id=None,capture='off',playback='idle',muted=False)
    try:
        for name in ('chat','work','voice'):
            if name not in services:
                continue
            options = dict(services[name])
            if name in ('chat','work'):
                if not memory and options.get('store') is None:
                    raise AIError('STORAGE_REQUIRED')
                provided = dict(options.pop('plugins', {}) or {})
                additions = plugins.get(name, {})
                if not isinstance(additions, dict) or provided.keys() & additions.keys():
                    raise AIError('INVALID_PLUGIN')
                options['plugins'] = dict(provided, **additions)
            if name == 'chat':
                from chat.main import create_chat
                caps = options.pop('capabilities', {})
                if not isinstance(caps, dict) or not set(caps) <= {'network','context','roles'} or any(type(v) is not bool for v in caps.values()):
                    raise AIError('VALIDATION_ERROR')
                ai._network_supported = caps.get('network', False)
                if (prepare_turn and not caps.get('context')) or (any(v.get('chat_config') for v in roles.values()) and not caps.get('roles')):
                    raise AIError('CAPABILITY_UNSUPPORTED')
                ai._chat = create_chat(**options)
                await ai._chat.list_conversations()
            elif name == 'work':
                from work.main import create_work
                ai._work = create_work(**options)
                for row in await ai._work.list_sessions():
                    view = await ai._work.get_session(row['id'])
                    ai._pending_counts[row['id']] = sum(i['status']=='pending' for i in view['interactions'])
            else:
                from voice.main import create_voice
                ai._acquire_audio, ai._release_audio = options.pop('acquire', None), options.pop('release', None)
                if (ai._acquire_audio is None) != (ai._release_audio is None) or any(
                        f is not None and not callable(f) for f in (ai._acquire_audio,ai._release_audio)):
                    raise AIError('VALIDATION_ERROR')
                ai._voice = create_voice(**options)
                voices = ai._voice.list_voices()
                ai._voice_ids = {v['id'] for v in voices}
                ai._voice_default = voices[0]['id'] if voices else 'default'
                if any(v.get('voice_id',ai._voice_default) not in ai._voice_ids for v in roles.values()):
                    raise AIError('INVALID_VOICE')
        if type(ai._network_default) is not bool or (ai._network_default and not ai._network_supported):
            raise AIError('CAPABILITY_UNSUPPORTED')
        data = clone(await storage.load_all())
        if not isinstance(data,dict) or set(data) != {'conversations','links'} or any(not isinstance(v,dict) for v in data.values()):
            raise AIError('INVALID_STORAGE')
        for cid, value in data['conversations'].items():
            if not isinstance(value,dict) or set(value) != set(ai._configuration()) or value['role_id'] not in roles:
                raise AIError('INVALID_STORAGE')
            if (type(value['network_enabled']) is not bool or type(value['muted']) is not bool
                    or value['network_enabled'] and not ai._network_supported
                    or ai._voice and value['voice_id'] not in ai._voice_ids):
                raise AIError('INVALID_STORAGE')
            for key, low, high in (('rate', .25, 4), ('volume', 0, 1)):
                if type(value[key]) not in (int, float) or not math.isfinite(value[key]) or not low <= value[key] <= high:
                    raise AIError('INVALID_STORAGE')
        if any(not isinstance(cid,str) or not cid for cid in data['links'].values()):
            raise AIError('INVALID_STORAGE')
        ai._configs, ai._links = data['conversations'], data['links']
        return ai
    except BaseException as exc:
        if ai._voice:
            await ai._voice.stop()
        if isinstance(exc, (AIError, asyncio.CancelledError)):
            raise
        raise AIError(getattr(exc,'code','INITIALIZATION_FAILED'), outcome='failed') from None


__all__ = ['create_ai','AI','AIError','MetadataStore','MemoryMetadata']
