#!/usr/bin/env python3
"""Configure matching internal Agent credentials; never print credential values."""
import os
import secrets
import argparse
from pathlib import Path


def read_env(path):
    values = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def update_env(path, additions):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text().splitlines() if path.exists() else []
    positions = {line.split('=', 1)[0].strip(): i for i, line in enumerate(lines)
                 if '=' in line and not line.lstrip().startswith('#')}
    for key, value in additions.items():
        line = f'{key}={value}'
        if key in positions:
            lines[positions[key]] = line
        else:
            lines.append(line)
    # Restrict permissions before writing any credentials to a newly created file.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write('\n'.join(lines) + '\n')


def configure(root, provider=None):
    agent_path = root / 'apps/agent-service/.env.local'
    backend_path = root / 'apps/ruoyi-vue-pro/.env.local'
    ai_path = root / 'apps/ai-service/.env.local'
    agent, backend = read_env(agent_path), read_env(backend_path)
    ai = read_env(ai_path)
    default_provider = 'deepseek' if ai.get('AI_MODEL_BASE_URL', '').rstrip('/') == 'https://api.deepseek.com' else 'anthropic'
    provider = provider or agent.get('AGENT_PROVIDER', default_provider)
    if provider not in ('anthropic', 'deepseek'):
        raise ValueError('AGENT_PROVIDER must be anthropic or deepseek.')
    existing = {values.get('AGENT_INTERNAL_TOKEN') for values in (agent, backend, ai) if values.get('AGENT_INTERNAL_TOKEN')}
    if len(existing) > 1:
        raise ValueError('AGENT_INTERNAL_TOKEN differs; align existing configuration before retrying.')
    token = next(iter(existing), None) or secrets.token_urlsafe(32)
    if len(token) < 32:
        raise ValueError('AGENT_INTERNAL_TOKEN must contain at least 32 characters.')
    update_env(agent_path, {
        'AGENT_INTERNAL_TOKEN': token,
        'AGENT_PROVIDER': provider,
        'ANTHROPIC_API_KEY': agent.get('ANTHROPIC_API_KEY', ''),
        'DEEPSEEK_API_KEY': agent.get('DEEPSEEK_API_KEY') or (ai.get('AI_MODEL_API_KEY', '')
                             if provider == 'deepseek' and ai.get('AI_MODEL_BASE_URL', '').rstrip('/') == 'https://api.deepseek.com' else ''),
        'AGENT_BIND_HOST': agent.get('AGENT_BIND_HOST', '127.0.0.1'),
        'AGENT_PORT': agent.get('AGENT_PORT', '48082'),
        'AGENT_DATA_DIR': agent.get('AGENT_DATA_DIR', '.data'),
    })
    update_env(backend_path, {
        'AGENT_INTERNAL_TOKEN': token,
        'AGENT_SERVICE_URL': backend.get('AGENT_SERVICE_URL', 'http://127.0.0.1:48082'),
    })
    if ai_path.exists():
        update_env(ai_path, {'AGENT_INTERNAL_TOKEN': token,
                            'AGENT_SERVICE_URL': ai.get('AGENT_SERVICE_URL', 'http://127.0.0.1:48082')})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['anthropic', 'deepseek'])
    parser.add_argument('--require-model', action='store_true')
    args = parser.parse_args()
    try:
        root = Path(__file__).resolve().parents[1]
        configure(root, args.provider)
        values = read_env(root / 'apps/agent-service/.env.local')
        field = 'DEEPSEEK_API_KEY' if values.get('AGENT_PROVIDER') == 'deepseek' else 'ANTHROPIC_API_KEY'
        if args.require_model and not values.get(field):
            raise ValueError(f'Set {field} in apps/agent-service/.env.local before starting Agent features.')
    except ValueError as reason:
        raise SystemExit(str(reason))
    print('Prepared matching ignored Agent/backend/AI configuration; an existing official DeepSeek key is reused when available.')
