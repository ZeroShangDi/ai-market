"""Managed plugin loading and bounded host RPC; no domain tools live here."""
import asyncio
import httpx
import importlib
import json
import os
import re
import uuid
from pathlib import Path
from functools import lru_cache

from pipecat.adapters.schemas.function_schema import FunctionSchema


@lru_cache(maxsize=20)
def load_package(name):
    if not isinstance(name, str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,39}', name):
        raise ValueError('Invalid managed voice plugin')
    module = importlib.import_module(f'.plugins.{name}', __package__)
    root = Path(module.__file__).parent
    manifest = json.loads((root / 'plugin.json').read_text())
    if manifest['id'] != name or manifest['schemaVersion'] != 1:
        raise ValueError('Invalid voice plugin manifest')
    return module, manifest, (root / 'SKILL.md').read_text()


def load_packages():
    names = json.loads(os.environ.get('VOICE_PLUGINS', '["work_control"]'))
    if not isinstance(names, list) or len(names) > 20 or any(not isinstance(n, str) for n in names) or len(set(names)) != len(names):
        raise ValueError('Invalid managed voice plugins')
    return [load_package(name) for name in names]


class HostBridge:
    def __init__(self, connection):
        self.connection = connection
        self.pending = {}
        self.closed = False

    def emit(self, event):
        # Only existing, explicitly supported host UI events are allowed.
        # Delivery is not confirmation and must never authorize server writes.
        if self.closed:
            raise RuntimeError('语音宿主已关闭')
        if not isinstance(event, dict) or event.get('type') not in {'task_proposal'} or len(json.dumps(event, ensure_ascii=False)) > 16000:
            raise ValueError('Unsupported host event')
        self.connection.send_app_message(event)

    async def request(self, method, path, body, request_id):
        if self.closed:
            raise RuntimeError('语音宿主已关闭')
        key = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        self.pending[key] = future
        try:
            self.connection.send_app_message(dict(type='plugin_host_request', id=key,
                method=method, path=path, body=body, request_id=request_id))
            return await asyncio.wait_for(future, 20)
        finally:
            self.pending.pop(key, None)

    def receive(self, value):
        if not isinstance(value, dict) or value.get('type') != 'plugin_host_result':
            return
        if not isinstance(value.get('id'), str):
            return
        future = self.pending.get(value.get('id'))
        if future is not None and not future.done():
            if value.get('error'):
                future.set_exception(RuntimeError('宿主请求未确认，请使用相同请求重试'))
            else:
                future.set_result(value.get('data'))

    def close(self):
        self.closed = True
        for future in self.pending.values():
            if not future.done():
                future.set_exception(RuntimeError('语音宿主已关闭'))
        self.pending.clear()


class PluginHost:
    def __init__(self, connection, identity, context):
        self.bridge = HostBridge(connection)
        self.plugins = []
        self.specs = []
        self.timeouts = {}
        self.instructions = []
        # Code, tool schema and instructions are one process-lifetime snapshot.
        # Reading only JSON afresh would pair a new schema with cached old Python code.
        for module, manifest, instructions in load_packages():
            plugin = module.activate(identity=identity, context=context, host=self.bridge)
            if not plugin.enabled:
                continue
            self.plugins.append(plugin)
            self.instructions.append(instructions)
            for spec in manifest['tools']:
                if spec.get('requiresHost') and not identity.get('host_plugin_bridge'):
                    continue
                if any(s.name == spec['name'] for s, _ in self.specs):
                    raise ValueError('Duplicate voice plugin tool')
                timeout = spec.get('timeoutSeconds', 60)
                if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= 180:
                    raise ValueError('Invalid plugin tool timeout')
                self.timeouts[spec['name']] = timeout
                self.specs.append((FunctionSchema(name=spec['name'], description=spec['description'],
                    properties=spec['properties'], required=spec['required']), plugin))

    def register(self, llm):
        for spec, plugin in self.specs:
            async def invoke(params, plugin=plugin, name=spec.name):
                try:
                    result = await plugin.execute(name, params.arguments)
                except (ValueError, RuntimeError, TimeoutError, httpx.HTTPError):
                    result = {'error': '操作尚未确认，请核对状态后重试；不能声称已完成。'}
                await params.result_callback(result)
            # Interrupting speech must not cancel an admitted write or approval.
            llm.register_function(spec.name, invoke, cancel_on_interruption=False, timeout_secs=self.timeouts[spec.name])

    async def prepare_notice(self, notice):
        for plugin in self.plugins:
            result = await plugin.prepare_notice(notice)
            if result is not None:
                return result
        return notice['text']

    def close(self):
        self.bridge.close()

    def notice_delivered(self, notice_id):
        for plugin in self.plugins:
            callback = getattr(plugin, 'notice_delivered', None)
            if callback:
                callback(notice_id)
