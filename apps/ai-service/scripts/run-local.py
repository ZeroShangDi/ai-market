#!/usr/bin/env python3
import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
configuration = root / '.env.local'
if not configuration.exists():
    raise SystemExit('Run scripts/configure-local.py first.')
environment = os.environ.copy()
for line in configuration.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        environment[key.strip()] = value.strip().strip('\"').strip("'")
java = Path('/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')
if 'JAVA_HOME' not in environment and java.exists():
    environment['JAVA_HOME'] = str(java)
command = sys.argv[1:] or ['mvn', 'spring-boot:run']
raise SystemExit(subprocess.call(command, cwd=root, env=environment))
