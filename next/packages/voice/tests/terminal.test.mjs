import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openMicrophone } from '../src/terminal/main.mjs';

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'navigator', original);
  else delete globalThis.navigator;
});
function install({ supported = true, enabled = true, acquire } = {}) {
  let stopped = 0;
  let constraints;
  const track = { stop: () => stopped++, getSettings: () => ({ echoCancellation: enabled }) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getSupportedConstraints: () => ({ echoCancellation: supported }),
    getUserMedia: async value => { constraints = value; if (acquire) await acquire(); return stream; },
  } } });
  return { get stopped() { return stopped; }, get constraints() { return constraints; } };
}
test('requests verified AEC and releases microphone on abort', async () => {
  const f = install(); const controller = new AbortController();
  const mic = await openMicrophone({ signal: controller.signal });
  assert.deepEqual(f.constraints.audio.echoCancellation, { exact: true });
  assert.equal(mic.echoCancellation, true);
  controller.abort(); mic.close(); assert.equal(f.stopped, 1);
});
test('does not claim success when terminal ignores AEC', async () => {
  const f = install({ enabled: false });
  await assert.rejects(openMicrophone(), /ECHO_CANCELLATION_UNAVAILABLE/);
  assert.equal(f.stopped, 1);
});
test('unsupported AEC does not open microphone', async () => {
  const f = install({ supported: false });
  await assert.rejects(openMicrophone(), /ECHO_CANCELLATION_UNAVAILABLE/);
  assert.equal(f.constraints, undefined);
});
test('aborting permission wait releases the late stream', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = install({ acquire: () => pending }); const controller = new AbortController();
  const result = openMicrophone({ signal: controller.signal });
  controller.abort(); release();
  await assert.rejects(result, /CANCELLED/); assert.equal(f.stopped, 1);
});
