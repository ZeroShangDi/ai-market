// Reproducible contact-sheet/GIF packaging. Does not repaint or change generated artwork.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const sharp = require(process.env.PET_PREVIEW_SHARP || 'sharp');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/modules/mobile-pet');
const out = path.join(root, 'previews/mobile-pet');
fs.mkdirSync(out, { recursive: true });
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(source, 'appearance.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject, require: name => ({ default: name }) });
const { elfSheets, elfActions } = exportsObject;

async function main() {
  const cells = [];
  for (const sheet of elfSheets) {
    const file = path.resolve(source, sheet.image);
    const meta = await sharp(file).metadata();
    if (meta.width % sheet.columns || meta.height % sheet.rows || !meta.hasAlpha) throw new Error('Invalid transparent atlas: ' + file);
    const size = meta.width / sheet.columns, height = meta.height / sheet.rows;
    if (size !== height) throw new Error('Expected square cells');
    const frames = [];
    for (let cell = 0; cell < sheet.columns * sheet.rows; cell++) {
      frames.push(await sharp(file).extract({ left: cell % sheet.columns * size, top: Math.floor(cell / sheet.columns) * height, width: size, height })
        .resize(160, 160).ensureAlpha().raw().toBuffer());
    }
    cells.push(frames);
  }
  const frameSize = 160 * 160 * 4;
  for (const action of elfActions) {
    const data = Buffer.concat(action.frames.map(frame => cells[action.sheet][frame.cell]));
    await sharp(data, { raw: { width: 160, height: 160 * action.frames.length, channels: 4, pageHeight: 160 } })
      .gif({ loop: 0, delay: action.frames.map(frame => frame.duration), effort: 7 }).toFile(path.join(out, action.id + '.gif'));
  }
  // Four-second collage of the original frames; continuous native transforms are omitted on purpose.
  const width = 640, height = 480, pages = 80;
  const canvas = Buffer.alloc(width * height * 4 * pages);
  for (let page = 0; page < pages; page++) {
    elfActions.forEach((action, index) => {
      const total = action.frames.reduce((sum, frame) => sum + frame.duration, 0);
      let elapsed = page * 50 % total, selected = action.frames[0];
      for (const frame of action.frames) {
        selected = frame;
        if (elapsed < frame.duration) break;
        elapsed -= frame.duration;
      }
      const pixels = cells[action.sheet][selected.cell];
      for (let y = 0; y < 160; y++) pixels.copy(canvas,
        ((page * height + Math.floor(index / 4) * 160 + y) * width + index % 4 * 160) * 4, y * 160 * 4, (y + 1) * 160 * 4);
    });
  }
  await sharp(canvas, { raw: { width, height: height * pages, channels: 4, pageHeight: height } })
    .gif({ loop: 0, delay: 50, effort: 7 }).toFile(path.join(out, 'all-actions.gif'));
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify({ sheets: elfSheets, actions: elfActions }, null, 2));
  console.log('Generated 12 GIF clips, all-actions.gif and catalog.json in previews/mobile-pet');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
