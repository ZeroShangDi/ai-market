"""Measure alpha bounds over every original frame, without re-encoding the MP4s."""
import concurrent.futures
import json
import pathlib
import re
import subprocess
import imageio_ffmpeg
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'resources/mobile-pet/dsh-source'

def measure(clip):
    id_, label, _, _ = clip
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-c:v', 'libvpx-vp9', '-i', str(SOURCE / (id_+'.webm')), '-vf', 'alphaextract,bbox=min_val=8', '-an', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    boxes = [tuple(map(int,m)) for m in re.findall(r'x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+) w:(\d+) h:(\d+)',result.stderr)]
    boxes = [b for b in boxes if b[4] > 0 and b[5] > 0]
    assert boxes, label
    left=max(0,min(b[0] for b in boxes)-8);right=min(640,max(b[1] for b in boxes)+9)
    top=max(0,min(b[2] for b in boxes)-8)+140;bottom=min(360,max(b[3] for b in boxes)+9)+140
    return id_,[left,top,right-left,bottom-top]

def main():
    clips=json.loads((SOURCE/'clips.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: bounds=dict(pool.map(measure,clips))
    (SOURCE/'bounds.json').write_text(json.dumps(bounds,indent=2)+'\n')
    catalog=ROOT/'resources/mobile-pet/packages/whale/catalog.json'
    data=json.loads(catalog.read_text())
    for action in data['actions']:action['bounds']=bounds[action['id']]
    catalog.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    appearance=ROOT/'apps/call-phone-uni/src/modules/mobile-pet/appearance.ts'
    appearance.write_text('// Generated from complete upstream DS actions; see scripts/convert-dsh-video.py.\nexport type PetVideoAction = { id: string; label: string; group: string; video: string; repeats: number; randomWeight: number; bounds: number[] };\nexport const petActions: PetVideoAction[] = '+json.dumps(data['actions'],ensure_ascii=False,indent=2)+';\n')
    print('Measured',len(bounds),'complete animations; idle bounds',bounds['idle'])
if __name__=='__main__':main()
