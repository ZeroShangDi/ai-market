"""Public DTO validation and host-owned metadata persistence."""
import asyncio
import json
from functools import wraps
from typing import Protocol


class AIError(Exception):
    """Sanitized operation error; references permit reconciliation of partial commits."""
    def __init__(self, code, *, operation=None, outcome='rejected', refs=None):
        super().__init__(code)
        self.code, self.operation, self.outcome = code, operation, outcome
        self.refs = clone(refs or {})

    def as_dict(self):
        """Return an independent, credential-free error DTO."""
        return dict(code=self.code, operation=self.operation, outcome=self.outcome, refs=clone(self.refs))


def clone(value):
    """Accept only finite JSON DTOs and detach ownership."""
    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (ValueError, TypeError):
        raise AIError('VALIDATION_ERROR') from None


class MetadataStore(Protocol):
    """One live writer per authenticated scope; each write is atomic on return."""
    async def load_all(self) -> dict:
        """Return {conversations: {id: config}, links: {work_id: conversation_id}}."""
        ...

    async def save_conversation_config(self, conversation_id: str, config: dict):
        """Upsert one conversation's effective config, returning after commit."""
        ...

    async def delete_conversation_config(self, conversation_id: str):
        """Idempotently delete config. Associated links are cleared separately."""
        ...

    async def set_work_conversation(self, work_id: str, conversation_id):
        """Upsert association, or remove it when conversation_id is None."""
        ...


class MemoryMetadata:
    """Explicit development storage; no hidden durable-to-memory fallback."""
    def __init__(self):
        self.data = dict(conversations={}, links={})

    async def load_all(self):
        return clone(self.data)

    async def save_conversation_config(self, cid, config):
        self.data['conversations'][cid] = clone(config)

    async def delete_conversation_config(self, cid):
        self.data['conversations'].pop(cid, None)

    async def set_work_conversation(self, wid, cid):
        if cid is None:
            self.data['links'].pop(wid, None)
        else:
            self.data['links'][wid] = cid


def operation(fn):
    """Track public calls for shutdown and translate package exceptions at the boundary."""
    @wraps(fn)
    async def wrapped(self, *args, **kwargs):
        self._ready()
        task = asyncio.current_task()
        self._calls[task] = self._calls.get(task, 0) + 1
        try:
            return await fn(self, *args, **kwargs)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            error = exc if isinstance(exc, AIError) else AIError(
                getattr(exc, 'code', 'OPERATION_FAILED'), outcome='failed')
            error.operation = error.operation or fn.__name__
            if error.code == 'STORAGE_FAILED':
                self._fault = True
                error.outcome = 'unknown'
            self._error(error)
            raise error from None
        finally:
            self._calls[task] -= 1
            if not self._calls[task]:
                del self._calls[task]
    return wrapped
