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
    agent, backend = read_env(agent_path), read_env(backend_path)
    provider = provider or agent.get('AGENT_PROVIDER', 'anthropic')
    if provider not in ('anthropic', 'deepseek'):
        raise ValueError('AGENT_PROVIDER must be anthropic or deepseek.')
    left, right = agent.get('AGENT_INTERNAL_TOKEN'), backend.get('AGENT_INTERNAL_TOKEN')
    if left and right and left != right:
        raise ValueError('AGENT_INTERNAL_TOKEN differs; align existing configuration before retrying.')
    token = left or right or secrets.token_urlsafe(32)
    if len(token) < 32:
        raise ValueError('AGENT_INTERNAL_TOKEN must contain at least 32 characters.')
    update_env(agent_path, {
        'AGENT_INTERNAL_TOKEN': token,
        'AGENT_PROVIDER': provider,
        'ANTHROPIC_API_KEY': agent.get('ANTHROPIC_API_KEY', ''),
        'DEEPSEEK_API_KEY': agent.get('DEEPSEEK_API_KEY', ''),
        'AGENT_BIND_HOST': agent.get('AGENT_BIND_HOST', '127.0.0.1'),
        'AGENT_PORT': agent.get('AGENT_PORT', '48082'),
        'AGENT_DATA_DIR': agent.get('AGENT_DATA_DIR', '.data'),
    })
    update_env(backend_path, {
        'AGENT_INTERNAL_TOKEN': token,
        'AGENT_SERVICE_URL': backend.get('AGENT_SERVICE_URL', 'http://127.0.0.1:48082'),
    })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['anthropic', 'deepseek'])
    args = parser.parse_args()
    try:
        configure(Path(__file__).resolve().parents[1], args.provider)
    except ValueError as reason:
        raise SystemExit(str(reason))
    print('Prepared ignored Agent/backend configuration. Set the selected provider API key in apps/agent-service/.env.local to enable live execution.')
