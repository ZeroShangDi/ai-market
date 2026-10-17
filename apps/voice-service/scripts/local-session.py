"""Create a short-lived localhost-only developer session; no production endpoint."""
import base64
import hashlib
import hmac
import json
from pathlib import Path
import time
import uuid
from dotenv import dotenv_values

root=Path(__file__).resolve().parents[1]
config=dotenv_values(root/'.env.local')
claims={'aud':'voice','tenant':'0','user':'1','device':'1','exp':int(time.time())+60,'nonce':str(uuid.uuid4())}
payload=base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
signature=base64.urlsafe_b64encode(hmac.new(config['VOICE_TICKET_SECRET'].encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
# Only the local developer invokes this tool; the regular mobile flow uses gateway authentication.
print('http://localhost:'+config.get('VOICE_PORT','48083')+'/#'+payload+'.'+signature)
