// Headless Chromium validation of real MP4 decoding + alpha compositing, without network.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../apps/call-phone-uni/src/static/mobile-pet');
async function main() {
  const catalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../resources/mobile-pet/packages/whale/catalog.json')));
  const browser = await chromium.launch({ headless: true, ...(process.env.PET_TEST_BROWSER ? { executablePath: process.env.PET_TEST_BROWSER } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
    await page.route('https://pet.invalid/**', route => {
      const url = new URL(route.request().url());
      const action = catalog.actions.find(action => url.pathname === '/clip/' + action.id);
      const file = url.pathname === '/player' ? path.join(root, 'player.html') : action ? path.resolve(__dirname, '../resources/mobile-pet/packages/whale/video', action.id + '.mp4') : null;
      return route.fulfill(file ? { status: 200, contentType: action ? 'video/mp4' : 'text/html', body: fs.readFileSync(file) } : { status: 404, body: '' });
    });
    await page.addInitScript(() => {
      window.events = [];
      window.PetHost = { signal: (type, id, token, code) => window.events.push({type, id, token, code}) };
    });
    await page.goto('https://pet.invalid/player');
    await page.evaluate(actions => window.petPlayer.configure(actions), catalog.actions);
    await page.waitForFunction(() => window.events.some(e => e.type === 'boot'));
    const lion = catalog.actions.find(action => action.label === '舞狮头');
    assert.ok(lion && lion.group === '时节');
    for (const [action, token] of [[catalog.actions[0], 1], [lion, 2]]) {
      await page.evaluate(({id,token}) => window.petPlayer.play(id, token), {id: action.id, token});
      await page.waitForFunction(token => window.events.some(e => e.type === 'frame' && e.token === token), token);
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl');
        const data = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
        let transparent = 0, opaque = 0, partial = 0;
        for (let i=3;i<data.length;i+=4) { if(data[i] === 0) transparent++; else if(data[i] === 255) opaque++; else partial++; }
        return { transparent, opaque, partial, cornerAlpha: data[3], width: canvas.width, height: canvas.height };
      });
      assert.equal(pixels.cornerAlpha, 0);
      assert.ok(pixels.transparent > 1000 && pixels.opaque > 1000 && pixels.partial > 0, JSON.stringify(pixels));
      assert.equal(pixels.width, action.bounds[2]); assert.equal(pixels.height, action.bounds[3]);
      if (action.id === 'idle') assert.ok(pixels.opaque / (pixels.width * pixels.height) > 0.35, 'idle viewport must fit the character');
      console.log(action.label, pixels);
    }
    await page.waitForFunction(() => window.events.some(e => e.type === 'ended' && e.token === 2), null, {timeout: 20000});
    await page.screenshot({path: '/tmp/dsh-video-lion.png', omitBackground: true});
    assert.deepEqual(await page.evaluate(() => window.events.filter(e => e.type === 'error')), []);
    await page.evaluate(() => { window.petPlayer.play('idle',3); window.petPlayer.play('idle',4); });
    await page.waitForFunction(() => window.events.some(e => e.type === 'frame' && e.token === 4));
    assert.equal(await page.evaluate(() => window.events.some(e => e.type === 'frame' && e.token === 3)), false);
    await page.evaluate(() => window.petPlayer.dispose());
    console.log('Video playback, alpha, completion, rapid switching and disposal passed.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
