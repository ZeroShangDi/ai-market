"""Keep public modules independent of business implementations as applications are added."""
from pathlib import Path
import re,xml.etree.ElementTree as ET,json
ROOT=Path(__file__).resolve().parents[1]

def main():
 namespace={'m':'http://maven.apache.org/POM/4.0.0'};violations=[];dependencies={};java_count=0
 for base in [ROOT/'backend/yudao-framework',ROOT/'backend/yudao-module-system',ROOT/'backend/yudao-module-infra']:
  for pom in base.rglob('pom.xml'):
   tree=ET.parse(pom);items=[n.text for n in tree.findall('./m:dependencies/m:dependency/m:artifactId',namespace) if (n.text or '').startswith('yudao-module-')];dependencies[str(pom.relative_to(ROOT))]=items
   for item in items:
    allowed=['yudao-module-infra'] if base.name=='yudao-module-system' else []
    if item not in allowed:violations.append(str(pom.relative_to(ROOT))+': '+item)
  for file in base.rglob('*.java'):
   if '/target/' in str(file):continue
   java_count+=1
   for module in re.findall(r'^import\s+(?:static\s+)?cn\.iocoder\.yudao\.module\.(\w+)\.',file.read_text(),re.M):
    if module not in ['system','infra']:violations.append(str(file.relative_to(ROOT))+': '+module)
 # Optional payment remains downstream; all persistent payment records are tenant-bound.
 pay=ROOT/'backend/yudao-module-pay'
 if pay.exists():
  direct=[n.text for n in ET.parse(pay/'pom.xml').findall('./m:dependencies/m:dependency/m:artifactId',namespace) if (n.text or '').startswith('yudao-module-')]
  if direct!=['yudao-module-system']:violations.append('pay 只允许依赖公共 system 模块')
  for file in (pay/'src/main/java').rglob('*DO.java'):
   if 'extends TenantBaseDO' not in file.read_text():violations.append(str(file)+': payment storage must be tenant-bound')
  modules=[n.text for n in ET.parse(ROOT/'backend/pom.xml').findall('./m:modules/m:module',namespace)]
  if 'yudao-module-pay' in modules:violations.append('默认公共后端不应强制装配支付模块')
 if violations:raise AssertionError('\n'.join(violations))
 local=ROOT/'.local';local.mkdir(exist_ok=True);(local/'boundary-result.json').write_text(json.dumps({'passed':['公共框架不依赖业务 Maven 模块','system 只向公共 infra 依赖，infra 不反向依赖 system','公共源码没有引入业务实现包','支付为下游可选模块，支付存储按租户隔离'],'checkedJavaFiles':java_count,'dependencies':dependencies},ensure_ascii=False,indent=2));print('公共模块依赖边界通过；检查 Java 文件：'+str(java_count))
if __name__=='__main__':main()
