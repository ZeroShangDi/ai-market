"""Private SDK checkpoints, bound to execution configuration rather than credentials."""
import hashlib
import json


def binding(mode, options, plugins):
    """Reject accidental checkpoint reuse across models, endpoints or tool schemas."""
    model = options.get('model')
    identity = model if isinstance(model, (str, type(None))) else type(model).__module__ + '.' + type(model).__qualname__
    value = dict(mode=mode, model=identity,
                 options={k: v for k, v in options.items() if k not in ('model', 'api_key')},
                 tools={k: dict(schema=v.schema, approval=v.requires_approval, description=v.description)
                        for k, v in plugins.items()})
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def restore(context, mode, signature):
    """Fail closed for incompatible checkpoints; never silently start over."""
    from .main import WorkError
    state = context.recovery
    if state is not None and (state.get('version') != 1 or state.get('mode') != mode
                              or state.get('binding') != signature):
        raise WorkError('RECOVERY_INCOMPATIBLE')
    return state


def checkpoint(mode, signature, **payload):
    """Envelope private provider state with an explicit format version."""
    return dict(version=1, mode=mode, binding=signature, **payload)


def balanced_items(items):
    """Only persist replayable turns: no function call without its tool result.

    An interrupted in-flight call must not become an implicit tool replay on
    resume. Its external effects remain uncertain and need host reconciliation.
    """
    calls = {i['call_id'] for i in items if i.get('type') == 'function_call'}
    outputs = {i['call_id'] for i in items if i.get('type') == 'function_call_output'}
    return calls == outputs
