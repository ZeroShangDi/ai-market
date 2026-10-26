"""Portable packages; execution requires explicit host-selected MCP configuration."""
import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path


class PluginError(ValueError):
    pass


class PluginPackage:
    """Only portable v1 initially; native hooks never execute implicitly."""
    def __init__(self, root):
        self.root = Path(root).resolve(strict=True)
        manifest = self._json('plugin.json')
        if manifest.get('$schema') != 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json':
            raise PluginError('UNSUPPORTED_MANIFEST')
        self.name = manifest.get('name')
        self.version = manifest.get('version')
        if not isinstance(self.name, str) or not self.name or not isinstance(self.version, str) or not self.version.strip():
            raise PluginError('INVALID_IDENTITY')
        self._manifest = manifest
        self._skills = {}
        if (self.root / 'skills').exists():
            base = self._path('skills')
            for p in sorted(base.glob('*/SKILL.md')):
                relative = p.relative_to(self.root)
                self._path(relative)
                self._skills[p.parent.name] = str(relative)
        self._servers = self._json('mcp.json').get('mcpServers', {}) if (self.root / 'mcp.json').exists() else {}
        if not isinstance(self._servers, dict):
            raise PluginError('INVALID_SERVERS')
        for name, declaration in self._servers.items():
            if not isinstance(name, str) or not name or not isinstance(declaration, dict):
                raise PluginError('INVALID_SERVER')
            if not isinstance(declaration.get('command', declaration.get('url')), str):
                raise PluginError('INVALID_SERVER')

    def _path(self, name):
        name = Path(name)
        if name.is_absolute() or '..' in name.parts:
            raise PluginError('PATH_ESCAPE')
        p = (self.root / name).resolve(strict=True)
        if not p.is_relative_to(self.root):
            raise PluginError('PATH_ESCAPE')
        return p

    def _json(self, name):
        p = self._path(name)
        if p.stat().st_size > 1_000_000:
            raise PluginError('RESOURCE_TOO_LARGE')
        value = json.loads(p.read_text())
        if not isinstance(value, dict):
            raise PluginError('INVALID_OBJECT')
        return value

    def describe(self):
        return {'name': self.name, 'version': self.version,
                'skills': list(self._skills), 'servers': list(self._servers),
                'requirements': ['host-selected-skills', 'host-configured-mcp-client'],
                'unsupported': sorted(set(self._manifest) - {'$schema', 'name', 'version', 'description', 'author', 'license', 'homepage', 'repository', 'keywords'}),
                'hooksEnabled': False, 'skillActivation': 'explicit-host-selection'}

    def server(self, name):
        """Untrusted declaration only, never executes or expands environment variables."""
        return json.loads(json.dumps(self._servers[name]))

    def skill(self, name):
        """Host must verify semantic dependencies before activating these instructions."""
        p = self._path(self._skills[name])
        if p.stat().st_size > 128_000:
            raise PluginError('RESOURCE_TOO_LARGE')
        return self.read_resource(self._skills[name], max_bytes=128_000)

    def read_resource(self, path, *, binary=False, max_bytes=128_000):
        if type(max_bytes) is not int or max_bytes <= 0:
            raise PluginError('INVALID_LIMIT')
        p = self._path(path)
        if not p.is_file():
            raise PluginError('NOT_A_FILE')
        with p.open('rb') as stream:
            data = stream.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise PluginError('RESOURCE_TOO_LARGE')
        return data if binary else data.decode('utf-8')

    def read_skill(self, name):
        text = self.skill(name)
        # Preserve frontmatter verbatim rather than partially interpreting YAML.
        metadata, body = None, text
        lines = text.splitlines(keepends=True)
        if lines and lines[0].strip() == '---':
            end = next((i for i in range(1, len(lines)) if lines[i].strip() == '---'), None)
            if end is None:
                raise PluginError('INVALID_SKILL_FRONTMATTER')
            metadata, body = ''.join(lines[1:end]), ''.join(lines[end + 1:])
        return {'name': name, 'path': self._skills[name], 'frontmatter': metadata, 'body': body}

    def list_servers(self):
        return [{'id': name, 'declaration': self.server(name)} for name in self._servers]


class ToolConnection:
    """Tools discovered on one host-configured client; no approval policy here."""
    def __init__(self, client, tools, timeout, max_result_bytes):
        self._client, self._tools = client, tools
        self._timeout, self._limit, self._active = timeout, max_result_bytes, True
        self._calls = set()

    def list_tools(self):
        if not self._active:
            raise PluginError('CONNECTION_CLOSED')
        return json.loads(json.dumps(list(self._tools.values())))

    async def call_tool(self, name, arguments, context):
        if not self._active:
            raise PluginError('CONNECTION_CLOSED')
        if name not in self._tools:
            raise PluginError('UNKNOWN_TOOL')
        if context.cancelled.is_set():
            raise asyncio.CancelledError
        if not isinstance(arguments, dict):
            raise PluginError('INVALID_ARGUMENTS')
        arguments = json.loads(json.dumps(arguments, allow_nan=False))
        call = asyncio.create_task(self._client.call_tool(name, arguments))
        stop = asyncio.create_task(context.cancelled.wait())
        self._calls.add(call)
        try:
            done, _ = await asyncio.wait([call, stop], timeout=self._timeout,
                                         return_when=asyncio.FIRST_COMPLETED)
            if stop in done or not self._active:
                raise asyncio.CancelledError
            if call not in done:
                raise PluginError('CALL_TIMEOUT_OUTCOME_UNKNOWN')
            result = await call
            if result.is_error:
                raise PluginError('MCP_TOOL_FAILED')
            value = result.model_dump(mode='json', by_alias=True, exclude_none=True)
            if len(json.dumps(value, ensure_ascii=False).encode()) > self._limit:
                raise PluginError('RESULT_TOO_LARGE')
            return value
        finally:
            stop.cancel(); call.cancel()
            await asyncio.gather(stop, call, return_exceptions=True)
            self._calls.discard(call)

    async def close(self):
        # Transport exits in its owning context/task, as required by MCP clients.
        self._active = False
        calls = tuple(self._calls)
        for task in calls:
            task.cancel()
        await asyncio.gather(*calls, return_exceptions=True)


@asynccontextmanager
async def connect_tools(*, client, timeout=30, max_tools=128, max_result_bytes=1_000_000):
    import math
    if not math.isfinite(timeout) or timeout <= 0 or type(max_tools) is not int or max_tools <= 0 or type(max_result_bytes) is not int or max_result_bytes <= 0:
        raise PluginError('INVALID_LIMIT')
    # Keep SDK context entry/exit on the same task; never wrap entry in wait_for.
    async with client:
        tools, cursors, cursor = {}, set(), None
        while True:
            page = await asyncio.wait_for(client.list_tools(cursor=cursor), timeout)
            for tool in page.tools:
                if not isinstance(tool.name, str) or not tool.name or tool.name in tools or len(tools) >= max_tools:
                    raise PluginError('DUPLICATE_OR_EXCESS_TOOLS')
                tools[tool.name] = {'name': tool.name, 'description': tool.description or tool.name,
                                    'input_schema': tool.input_schema}
            cursor = page.next_cursor
            if not cursor:
                break
            if cursor in cursors:
                raise PluginError('CURSOR_LOOP')
            cursors.add(cursor)
        connection = ToolConnection(client, tools, timeout, max_result_bytes)
        try:
            yield connection
        finally:
            await connection.close()


def adapt_tools(connection, *, namespace, tool_factory):
    """Optional Work-compatible adapter; callers enforce approval before invoke."""
    bound = {}
    for tool in connection.list_tools():
        schema = tool['input_schema']
        def check(value):
            if isinstance(value, dict):
                if '$ref' in value or '$dynamicRef' in value:
                    raise PluginError('UNSUPPORTED_SCHEMA_REFERENCE')
                for item in value.values(): check(item)
            elif isinstance(value, list):
                for item in value: check(item)
        check(schema)
        if not isinstance(schema, dict) or schema.get('type') != 'object':
            raise PluginError('UNSUPPORTED_INPUT_SCHEMA')
        name = 'p_' + hashlib.sha256(json.dumps([namespace, tool['name']]).encode()).hexdigest()[:40]
        if name in bound:
            raise PluginError('TOOL_NAME_COLLISION')
        async def invoke(arguments, context, original=tool['name']):
            return await connection.call_tool(original, arguments, context)
        bound[name] = tool_factory(description=tool['description'], schema=schema,
                                   invoke=invoke, requires_approval=True)
    return bound


@asynccontextmanager
async def open_tools(package, server_id, *, client, tool_factory, timeout=30, max_tools=128):
    """Compatibility wrapper; new callers can select connection and adaptation separately."""
    package.server(server_id)
    async with connect_tools(client=client, timeout=timeout, max_tools=max_tools) as connection:
        yield adapt_tools(connection, namespace=[package.name, server_id], tool_factory=tool_factory)


def load_plugin(path):
    return PluginPackage(path)
