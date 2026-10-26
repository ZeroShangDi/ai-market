import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from mcp import Client, StdioServerParameters
from mcp.types import Tool, ListToolsResult, CallToolResult

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'packages/plugin'))
from src.main import PluginPackage, PluginError, open_tools, load_plugin, connect_tools
spec = importlib.util.spec_from_file_location('work_test', ROOT / 'packages/work/src/__init__.py', submodule_search_locations=[str(ROOT / 'packages/work/src')])
work = importlib.util.module_from_spec(spec)
sys.modules['work_test'] = work
spec.loader.exec_module(work)
from work_test.main import WorkTool
PACKAGE = ROOT / 'plugins/external/mem0/portable'

class Fake:
    def __init__(self, schema=None, error=False):
        self.schema = schema or {'type': 'object'}
        self.error = error
        self.closed = False
        self.calls = 0
    async def __aenter__(self): return self
    async def __aexit__(self, *args): self.closed = True
    async def list_tools(self, **kwargs):
        return ListToolsResult(tools=[Tool(name='read', input_schema=self.schema)])
    async def call_tool(self, *args):
        self.calls += 1
        return CallToolResult(content=[], is_error=self.error)

class Tests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        global PACKAGE
        base = ROOT / 'packages/plugin/.tmp'
        base.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.tmp.cleanup)
        PACKAGE = Path(self.tmp.name)
        (PACKAGE / 'plugin.json').write_text(json.dumps({'$schema': 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', 'name': 'mem0', 'version': '1.0.0'}))
        (PACKAGE / 'mcp.json').write_text(json.dumps({'mcpServers': {'mem0': {'command': 'python3'}}}))
        for name in ('search', 'remember'):
            folder = PACKAGE / 'skills' / name; folder.mkdir(parents=True)
            (folder / 'SKILL.md').write_text('---\nname: '+name+'\n---\nno separate execution')

    def test_real_package(self):
        p = PluginPackage(PACKAGE)
        self.assertEqual(p.name, 'mem0')
        self.assertIn('search', p.describe()['skills'])
        self.assertIn('no separate', p.skill('remember'))
        declaration = p.server('mem0'); declaration['command'] = 'changed'
        self.assertEqual(p.server('mem0')['command'], 'python3')

    def test_path_escape(self):
        p = PluginPackage(PACKAGE)
        with self.assertRaises(PluginError): p._path('../README.md')
        with self.assertRaises(PluginError): p._path('/etc/passwd')

    async def test_binding_and_close(self):
        client = Fake()
        async with open_tools(PluginPackage(PACKAGE), 'mem0', client=client, tool_factory=WorkTool) as tools:
            from work_test._sdk_tools import validate_tools
            validate_tools(tools)
            tool = next(iter(tools.values()))
            self.assertTrue(tool.requires_approval)
            await tool.invoke({}, SimpleNamespace(cancelled=asyncio.Event()))
        self.assertTrue(client.closed)
        with self.assertRaises(PluginError):
            await tool.invoke({}, SimpleNamespace(cancelled=asyncio.Event()))

    async def test_error_is_not_success(self):
        async with open_tools(PluginPackage(PACKAGE), 'mem0', client=Fake(error=True), tool_factory=WorkTool) as tools:
            with self.assertRaisesRegex(PluginError, 'MCP_TOOL_FAILED'):
                await next(iter(tools.values())).invoke({}, SimpleNamespace(cancelled=asyncio.Event()))

    async def test_work_denial_does_not_call_server(self):
        from work_test._sdk_tools import invoke_tool
        client = Fake()
        async def ask(*args): return {'approved': False}
        async def emit(*args): pass
        ctx = SimpleNamespace(cancelled=asyncio.Event(), ask=ask, emit=emit)
        async with open_tools(PluginPackage(PACKAGE), 'mem0', client=client, tool_factory=WorkTool) as tools:
            name, tool = next(iter(tools.items()))
            result = await invoke_tool(name, tool, {}, ctx)
            self.assertEqual(json.loads(result)['error'], 'TOOL_DENIED')
            self.assertEqual(client.calls, 0)

    async def test_cancelled_does_not_call_server(self):
        client = Fake()
        stopped = asyncio.Event(); stopped.set()
        async with open_tools(PluginPackage(PACKAGE), 'mem0', client=client, tool_factory=WorkTool) as tools:
            with self.assertRaises(asyncio.CancelledError):
                await next(iter(tools.values())).invoke({}, SimpleNamespace(cancelled=stopped))
        self.assertEqual(client.calls, 0)

    async def test_schema_reject_closes(self):
        client = Fake({'type':'object','properties':{'x':{'$ref':'https://invalid'}}})
        with self.assertRaises(PluginError):
            async with open_tools(PluginPackage(PACKAGE), 'mem0', client=client, tool_factory=WorkTool): pass
        self.assertTrue(client.closed)

    def test_resources_and_skill(self):
        package = load_plugin(PACKAGE)
        self.assertEqual(package.read_skill('search')['frontmatter'], 'name: search\n')
        self.assertEqual(package.list_servers()[0]['id'], 'mem0')
        (PACKAGE / 'payload.bin').write_bytes(b'\x00\xff')
        self.assertEqual(package.read_resource('payload.bin', binary=True), b'\x00\xff')
        with self.assertRaisesRegex(PluginError, 'RESOURCE_TOO_LARGE'):
            package.read_resource('payload.bin', binary=True, max_bytes=1)
        (PACKAGE / 'escape').symlink_to(PACKAGE.parent)
        with self.assertRaisesRegex(PluginError, 'PATH_ESCAPE'):
            package.read_resource('escape')

    async def test_cancel_during_call(self):
        started, cancelled = asyncio.Event(), asyncio.Event()
        class Slow(Fake):
            async def call_tool(self, *args):
                started.set()
                try: await asyncio.Event().wait()
                finally: cancelled.set()
        context = SimpleNamespace(cancelled=asyncio.Event())
        async with connect_tools(client=Slow()) as connection:
            task = asyncio.create_task(connection.call_tool('read', {}, context))
            await started.wait(); context.cancelled.set()
            with self.assertRaises(asyncio.CancelledError): await task
            self.assertTrue(cancelled.is_set())

    async def test_result_limit_and_closed_handle(self):
        async with connect_tools(client=Fake(), max_result_bytes=1) as connection:
            with self.assertRaisesRegex(PluginError, 'RESULT_TOO_LARGE'):
                await connection.call_tool('read', {}, SimpleNamespace(cancelled=asyncio.Event()))
        with self.assertRaisesRegex(PluginError, 'CONNECTION_CLOSED'):
            connection.list_tools()

if __name__ == '__main__': unittest.main()
