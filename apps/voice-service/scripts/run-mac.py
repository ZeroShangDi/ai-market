"""Run isolated Mac inference workers and the optional voice service together."""
import os
import json
from pathlib import Path
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

from dotenv import dotenv_values

root=Path(__file__).resolve().parents[1]
env={**os.environ,**{key:value for key,value in dotenv_values(root/'.env.local').items() if value is not None}}
logs=root/'.local';logs.mkdir(exist_ok=True)
processes=[]
stopping=False

def diagnostic(event):
    print(datetime.now(timezone.utc).isoformat()+' '+event, flush=True)


def stop(signum, *_args):
    global stopping
    diagnostic('supervisor_stop signal='+str(signum))
    stopping=True


signal.signal(signal.SIGINT,stop)
signal.signal(signal.SIGTERM,stop)
try:
    entries=[(name,[sys.executable,'-m','voice_service.'+name],env) for name in ('qwen_asr','qwen_tts','server')]
    if env.get('VOICE_LOCAL_AGENT','false')=='true':
        # A separate read-only instance avoids exposing/restarting the production container or opening its Work volume.
        agent_env={**env,**{key:value for key,value in dotenv_values(root.parent/'agent-service/.env.local').items() if value is not None}}
        entries.append(('agent',[env.get('VOICE_NODE_BIN','node'),str(root/'scripts/agent-local.mjs')],agent_env))
    for name,command,process_env in entries:
        path=logs/(name+'.log')
        handle=open(path,'a')
        os.chmod(path,0o600)
        process=subprocess.Popen(command,cwd=root,env=process_env,stdout=handle,stderr=handle)
        handle.close()
        processes.append((name,process))
    (logs/'processes.json').write_text(json.dumps({'supervisor':os.getpid(),'children':{name:p.pid for name,p in processes}}))
    diagnostic('supervisor_started pid='+str(os.getpid()))
    while not stopping:
        for name,process in processes:
            if process.poll() is not None:
                diagnostic('worker_exit worker='+name+' code='+str(process.returncode))
                stopping=True
        time.sleep(0.5)
finally:
    for _,process in processes:
        if process.poll() is None:process.terminate()
    for _,process in processes:
        try:process.wait(timeout=8)
        except subprocess.TimeoutExpired:process.kill();process.wait()
