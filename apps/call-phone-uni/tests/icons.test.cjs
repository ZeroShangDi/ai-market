const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');

const moduleRoot = path.resolve(__dirname, '../src/modules/icons');
const iconRoot = path.resolve(__dirname, '../../../resources/icons');
const build = import(pathToFileURL(path.join(iconRoot, 'build.mjs')).href);
function load(name) {
  const file = path.join(moduleRoot, `${name}.ts`);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => load(name.replace('./', '')), encodeURIComponent, Number, Object });
  return exports;
}
const icons = load('index');
const decode = source => decodeURIComponent(source.slice(source.indexOf(',') + 1));

test('theme color is baked into offline SVG without a remote dependency', () => {
  const icon = icons.resolveIcon('phone', '#2878FF');
  assert.equal(icon.known, true);
  assert.match(icon.src, /^data:image\/svg\+xml/);
  assert.match(decode(icon.src), /fill="#2878FF"/);
  assert.doesNotMatch(decode(icon.src), /currentColor/);
});

test('brand icon retains its green even if the page supplies a theme color', () => {
  const icon = icons.resolveIcon('wechat', '#000000');
  assert.match(decode(icon.src), /fill="#07C160"/);
  assert.doesNotMatch(decode(icon.src), /#000000/);
});

test('unknown and prototype-looking names resolve to the registered fallback', () => {
  for (const name of ['not-registered', '__proto__', 'constructor']) {
    assert.equal(icons.resolveIcon(name).src, icons.resolveIcon('unknown').src);
    assert.equal(icons.resolveIcon(name).known, false);
  }
});

test('standalone SVG rejects inherited or malformed colors and invalid sizes fall back', () => {
  for (const color of ['currentColor', 'var(--brand)', '#12345', 'red" onload="bad']) {
    assert.equal(icons.normalizeIconColor(color, '#111111'), '#111111');
  }
  assert.equal(icons.normalizeIconColor('#123456', '#111111'), '#123456');
  for (const value of [undefined, 'abc', 0, -1, Infinity]) assert.equal(icons.normalizeIconSize(value), 24);
  assert.equal(icons.normalizeIconSize('32'), 32);
});

test('literal collection includes Iconify names but leaves dynamic names for the registry', async () => {
  const { collectLiteralNames } = await build;
  const names = collectLiteralNames(`<AppIcon name="phone" /><AppIcon :name="'ri:star-line'" /><AppIcon :name="tab.icon" /><image name="noise" />`);
  assert.deepEqual([...names], ['phone', 'ri:star-line']);
});

test('builder selects only registered/scanned icons and catches misspelled literal references', async t => {
  const { buildIcons } = await build;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-market-icons-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const sourceRoot = path.join(temp, 'src');
  fs.mkdirSync(sourceRoot);
  const vue = path.join(sourceRoot, 'screen.vue');
  fs.writeFileSync(vue, '<AppIcon name="ri:star-line" />');
  const result = buildIcons({ root: iconRoot, sourceRoot, output: path.join(temp, 'generated.ts'), imageOutput: path.join(temp, 'images') });
  assert.ok(result['ri:star-line']);
  const registered = JSON.parse(fs.readFileSync(path.join(iconRoot, 'registry.json'), 'utf8')).icons;
  assert.equal(Object.keys(result).length, Object.keys(registered).length + 1);
  fs.writeFileSync(vue, '<AppIcon name="misspelled" />');
  assert.throws(() => buildIcons({ root: iconRoot, sourceRoot, output: path.join(temp, 'generated.ts') }), /未注册/);
  fs.writeFileSync(vue, '<AppIcon name="ri:not-a-real-icon" />');
  assert.throws(() => buildIcons({ root: iconRoot, sourceRoot, output: path.join(temp, 'generated.ts') }), /不存在/);
});

test('custom multicolor SVG and PNG share the registry without changing page imports', async t => {
  const { buildIcons } = await build;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-market-custom-icons-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'custom'));
  fs.writeFileSync(path.join(root, 'custom', 'colors.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#FF0000" d="M0 0h12v24H0z"/><path fill="#0000FF" d="M12 0h12v24H12z"/></svg>');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(root, 'custom', 'logo.png'), png);
  fs.writeFileSync(path.join(root, 'registry.json'), JSON.stringify({ fallback: 'colors', icons: { colors: { file: 'custom/colors.svg' }, logo: { file: 'custom/logo.png' } } }));
  const imageOutput = path.join(root, 'out');
  const result = buildIcons({ root, sourceRoot: path.join(root, 'none'), output: path.join(root, 'generated.ts'), imageOutput });
  assert.equal(result.colors.colorMode, 'original');
  assert.match(result.colors.svg, /#FF0000/);
  assert.match(result.colors.svg, /#0000FF/);
  assert.equal(result.logo.src, '/static/app-icons/generated/logo.png');
  assert.deepEqual(fs.readFileSync(path.join(imageOutput, 'logo.png')), png);
});

test('custom SVG cannot accidentally pull remote resources or scripts into the offline bundle', async () => {
  const { safeSvg } = await build;
  for (const svg of [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="bad"></svg>',
    '<svg><image href="https://example.com/logo.svg"/></svg>',
    '<svg><path style="fill:url(https://example.com)"/></svg>',
  ]) assert.throws(() => safeSvg(svg), /独立的静态图形/);
});

test('custom gradient palettes allow only local paint references', async () => {
  const { safeSvg } = await build;
  const local = '<svg><defs><linearGradient id="paint"/></defs><path fill="url(#paint)"/></svg>';
  assert.equal(safeSvg(local), local);
  for (const paint of ['url(https://example.com/paint)', 'url("https://example.com/paint")', 'url(data:fake)', 'url(//example.com/paint)']) {
    assert.throws(() => safeSvg('<svg><path fill=\'' + paint + '\'/></svg>'), /独立的静态图形/);
  }
});
