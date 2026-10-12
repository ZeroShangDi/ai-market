#!/usr/bin/env python3
"""Prepare non-versioned service credentials without ever printing secret values."""
import os
import argparse
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
backend = root.parent / 'ruoyi-vue-pro' / '.env.local'
service = root / '.env.local'

def read(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                result[key.strip()] = value.strip().strip('\"').strip("'")
    return result

def update(path, additions):
    lines = path.read_text().splitlines() if path.exists() else []
    existing = {line.split('=', 1)[0].strip(): index for index, line in enumerate(lines) if '=' in line and not line.lstrip().startswith('#')}
    for key, value in additions.items():
        if key in existing:
            lines[existing[key]] = f'{key}={value}'
        else:
            lines.append(f'{key}={value}')
    path.write_text('\n'.join(lines) + '\n')
    os.chmod(path, 0o600)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--provider', choices=['keep', 'deepseek'], default='keep', help='Select DeepSeek defaults without replacing secrets; keep preserves existing provider preferences.')
args = parser.parse_args()
ai, legacy = read(service), read(backend)
provider_defaults = {
    'AI_MODEL_BASE_URL': 'https://api.deepseek.com',
    'AI_MODEL_NAME': 'deepseek-flash',
    'AI_MODEL_COMPLETIONS_PATH': '/chat/completions',
    'AI_MODEL_STREAM_USAGE': 'true',
    'AI_MODEL_THINKING': 'disabled',
}
provider_config = {key: default if args.provider == 'deepseek' else ai.get(key, default) for key, default in provider_defaults.items()}
left, right = ai.get('AI_INTERNAL_TOKEN', ''), legacy.get('AI_INTERNAL_TOKEN', '')
if left and right and left != right:
    raise SystemExit('AI_INTERNAL_TOKEN differs between the service and backend; align them before running configuration.')
shared = left or right or secrets.token_urlsafe(32)
if len(shared) < 32:
    raise SystemExit('AI_INTERNAL_TOKEN must contain at least 32 characters.')
import base64
storage = ai.get('AI_STORAGE_KEY') or base64.b64encode(secrets.token_bytes(32)).decode()
try:
    if len(base64.b64decode(storage, validate=True)) != 32:
        raise ValueError()
except ValueError:
    raise SystemExit('AI_STORAGE_KEY must be a Base64 encoded 32-byte key; existing data requires its original key.')
update(service, {
    'AI_INTERNAL_TOKEN': shared,
    'AI_STORAGE_KEY': storage,
    'AI_DATABASE_PASSWORD': ai.get('AI_DATABASE_PASSWORD') or secrets.token_urlsafe(32),
    'AI_MODEL_API_KEY': ai.get('AI_MODEL_API_KEY', ''),
    **provider_config,
})
update(backend, {'AI_INTERNAL_TOKEN': shared})
print('Prepared ignored local configuration for the AI service and backend. Fill AI_MODEL_API_KEY in the service configuration to enable model requests.')
