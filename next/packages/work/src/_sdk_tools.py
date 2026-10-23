"""SDK-neutral tool descriptions and the shared approval boundary."""
import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any, Callable
from uuid import uuid4


@dataclass(frozen=True)
class WorkTool:
    """Host tool: invoke(arguments, context) is async and validates authority.

    schema is an object JSON Schema. Approval defaults to required. Host must
    ensure cancellation stops owned local work; remote effects may be unknown.
    """
    description: str
    schema: dict
    invoke: Callable
    requires_approval: bool = True


def _no_refs(value):
    """Refuse schema references rather than silently fetching remote schemas."""
    from .main import WorkError
    if isinstance(value, dict):
        if '$ref' in value or '$dynamicRef' in value:
            raise WorkError('INVALID_TOOL')
        for child in value.values():
            _no_refs(child)
    elif isinstance(value, list):
        for child in value:
            _no_refs(child)


def validate_tools(plugins):
    from .main import WorkError, _copy
    for name, tool in plugins.items():
        if (not isinstance(name, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,47}', name)
                or not isinstance(tool, WorkTool) or not callable(tool.invoke)
                or type(tool.requires_approval) is not bool
                or not isinstance(tool.description, str) or not isinstance(tool.schema, dict)
                or tool.schema.get('type') != 'object'):
            raise WorkError('INVALID_TOOL')
        _copy(tool.schema)
        _no_refs(tool.schema)
        from jsonschema import Draft202012Validator
        try:
            Draft202012Validator.check_schema(tool.schema)
        except Exception:
            raise WorkError('INVALID_TOOL') from None


async def invoke_tool(name, tool, arguments, context):
    """Validate exact arguments, await human approval, then invoke once."""
    from .main import WorkError, _copy
    from jsonschema import Draft202012Validator
    arguments = _copy(arguments)
    _no_refs(tool.schema)
    try:
        Draft202012Validator(tool.schema).validate(arguments)
    except Exception:
        raise WorkError('INVALID_TOOL_INPUT') from None
    if context.cancelled.is_set():
        raise asyncio.CancelledError
    if tool.requires_approval:
        answer = await context.ask('approval', dict(tool_call_id=str(uuid4()), tool_id=name, input=arguments))
        if answer.get('approved') is not True:
            return json.dumps({'error': 'TOOL_DENIED'})
    if context.cancelled.is_set():
        raise asyncio.CancelledError
    await context.emit('tool:' + name)
    result = await tool.invoke(_copy(arguments), context)
    if context.cancelled.is_set():
        raise asyncio.CancelledError
    return json.dumps(_copy(result), ensure_ascii=False, allow_nan=False)


def history_messages(context):
    """Portable continuation only: never migrate SDK-private checkpoints."""
    messages = []
    for run in context.history:
        messages.append({'role': 'user', 'content': run['prompt']})
        if run.get('content'):
            messages.append({'role': 'assistant', 'content': run['content']})
    messages.append({'role': 'user', 'content': context.prompt})
    if context.resources:
        messages[-1]['content'] += '\nResource references (data):\n' + json.dumps(context.resources, ensure_ascii=False)
    return messages
