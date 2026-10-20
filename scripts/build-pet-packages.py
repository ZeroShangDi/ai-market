"""Build data-only downloadable character packages; never copy videos into the APK."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
from PIL import Image
from dotenv import dotenv_values
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local/app-update/release/public/pet-resources'
FFMPEG=os.environ.get('FFMPEG','ffmpeg')

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):
 temporary=path.with_name('.'+path.name+'.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temporary.replace(path)

def build(version):
 OUT.mkdir(parents=True,exist_ok=True);catalog=[]
 for key in ('elf','whale'):
  if (OUT/f'{key}-{version}').exists(): raise SystemExit('Package version already exists; choose a new --version.')
 for key,name in [('elf','森林精灵'),('whale','鲸鱼娘')]:
  destination=OUT/f'{key}-{version}'
  target=Path(tempfile.mkdtemp(prefix=f'.{key}-staging-',dir=OUT))
  if key=='whale':
   src=ROOT/'resources/mobile-pet/packages/whale/video'
   config=json.loads((ROOT/'resources/mobile-pet/packages/whale/catalog.json').read_text())
   actions=[]
   for a in config['actions']:
    file=Path(a.pop('video')).name;shutil.copyfile(src/file,target/file);actions.append({**a,'file':file})
  else:
   sheets=['elf-emotions-a-v3','elf-emotions-b-v3','elf-actions-v3']
   labels=[('idle','待机'),('happy','开心'),('shy','害羞'),('sad','难过'),('angry','生气'),('surprised','惊讶'),('sleepy','困倦'),('thinking','思考'),('wave','挥手'),('nod','点头'),('celebrate','庆祝'),('stretch','伸懒腰')]
   actions=[]
   for i,(aid,label) in enumerate(labels):
    image=Image.open(ROOT/'resources/mobile-pet/archive/elf-v3/assets'/f'{sheets[i//4]}.png')
    frames=[]
    for col in range(6):
     cell=image.crop((col*256,(i%4)*256,(col+1)*256,(i%4+1)*256)).resize((640,640),Image.Resampling.LANCZOS)
     packed=Image.new('RGB',(1280,640));packed.paste(cell.convert('RGB'),(0,0));packed.paste(cell.getchannel('A').convert('RGB'),(640,0))
     repeats=[62,2,3,2,3,24][col] if aid=='idle' else 5
     frames.extend([packed.tobytes()]*repeats)
    subprocess.run([FFMPEG,'-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1280x640','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(target/(aid+'.mp4'))],input=b''.join(frames),check=True)
    actions.append(dict(id=aid,label=label,group='基础',file=aid+'.mp4',bounds=[0,0,640,640],repeats=0 if aid=='idle' else 1,randomWeight=1 if aid=='idle' else 0))
  for document in ('persona.md','skills.md'):
   shutil.copyfile(ROOT/'resources/mobile-pet/packages'/key/document,target/document)
  # Use the server's selected reference; both existing skins share it for now.
  env=dotenv_values(ROOT/'apps/voice-service/.env.local')
  reference=Path(env['QWEN_TTS_REFERENCE_AUDIO'])
  shutil.copyfile(reference,target/'reference.wav')
  (target/'reference.txt').write_text(env['QWEN_TTS_REFERENCE_TEXT'])
  write(target/'voice.json',dict(mode='clone',audio='reference.wav',text='reference.txt',status='使用当前选定的克隆参考音色'))
  (target/'LICENSE.txt').write_text((ROOT/'resources/mobile-pet/dsh-source/README.md').read_text() if key=='whale' else '项目内生成的精灵图集转换，保留现有形象；不是新生成视频。')
  names=[a['file'] for a in actions]+['persona.md','skills.md','voice.json','reference.wav','reference.txt','LICENSE.txt']
  files=[dict(name=n,bytes=(target/n).stat().st_size,sha256=digest(target/n)) for n in names]
  manifest=dict(id=key,version=version,name=name,format='rgb-alpha-sbs-v1',persona='persona.md',skills='skills.md',voiceProfile=f'{key}-{version}',voice='voice.json',actions=actions,files=files,scenes=json.loads((ROOT/'resources/mobile-pet/packages'/key/'scenes.json').read_text()))
  write(target/'manifest.json',manifest)
  # Published data must be readable by the unprivileged AI/Agent containers.
  target.chmod(0o755)
  target.rename(destination)
  target=destination
  catalog.append(dict(id=key,version=version,name=name,bytes=sum(f['bytes'] for f in files),sha256=digest(target/'manifest.json'),actionCount=len(actions)))
 write(OUT/'catalog.json',dict(schemaVersion=1,packages=catalog));print(json.dumps(catalog,ensure_ascii=False))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--version',type=int,default=1);args=parser.parse_args()
 if not 1 <= args.version <= 999999999: parser.error('version must be between 1 and 999999999')
 build(args.version)
