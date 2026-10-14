const fs = require('node:fs');
const path = require('node:path');
// Reuse the optional image dependency from the asset tool or an installed sharp.
const modulePath = process.env.SHARP_MODULE || require.resolve('sharp', { paths: [path.resolve(__dirname, '../../tools/assets'), process.cwd()] });
const sharp = require(modulePath);
const projectRoot = path.resolve(__dirname, '../..');
const directories = ['apps/call-phone-uni/src/static/app-icons', 'apps/call-phone-uni/static/app-icons'].map(dir => path.join(projectRoot, dir));

async function build() {
  const svg = fs.readFileSync(path.join(__dirname, 'tongzige.svg'));
  fs.writeFileSync(path.join(projectRoot, 'resources/icons/custom/brand-assistant.svg'), svg);
  const original = await sharp(svg).png().toBuffer();
  await sharp(original).toFile(path.join(__dirname, 'tongzige.png'));
  const names = fs.readdirSync(directories[0]).filter(name => /^\d+x\d+\.png$/.test(name));
  for (const directory of directories) {
    fs.writeFileSync(path.join(directory, 'source.png'), original);
    for (const name of names) {
      const size = Number(name.split('x')[0]);
      await sharp(original).resize(size, size).png().toFile(path.join(directory, name));
    }
  }
  await sharp(path.join(projectRoot, 'resources/icons/custom/app-ai.svg')).resize(256, 256).png().toFile(path.join(__dirname, 'ai-chat.png'));
  console.log(`统子哥图标已生成，两处发布目录同步 ${names.length} 个尺寸。`);
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
