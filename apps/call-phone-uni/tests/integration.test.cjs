const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../src')
// Exercise actual TypeScript modules using uni/native adapters supplied by each test.
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  mocks = { '@/modules/mobile-pet': { canRunInBackground: () => false, onPetChange: () => {}, reportPetConnection: () => {} }, vue: { reactive: value => value, ref: value => ({ value }) }, './vault': { readQueue: () => undefined, writeQueue: () => true }, '@/services/vault': { saveDevice: () => {}, verifyDeviceStorage: () => {} }, '@/native/secure-store': { secureStore: { available: () => false } }, ...mocks }
  const exports = {}
  vm.runInNewContext(code, { exports, require(id) { if (id in mocks) return mocks[id]; throw new Error('Unmocked dependency: ' + id) }, console, setTimeout, clearTimeout, Date, Math, Error, AbortController, ...globals }, { filename: file })
  return exports
}
function httpHarness(handler) {
  const requests = []
  const uni = { request(opts) { requests.push(opts); Promise.resolve(handler(opts)).then(value => opts.success(value), () => opts.fail()) } }
  const http = load('api/http.ts', { '@/config': { connectionSettings: () => ({ serviceUrl: 'https://data.example.test', tenantId: '7' }) } }, { uni })
  return { http, requests }
}
test('HTTP 200 business errors cannot be accepted as successful writes', async () => {
  const { http } = httpHarness(() => ({ statusCode: 200, data: { code: 403, msg: '无权操作', data: null } }))
  http.setAccessToken('test-access')
  await assert.rejects(http.request('POST', '/api/v1/mobile/calls'), { code: 'FORBIDDEN', message: '无权操作' })
  assert.equal(http.unwrapResponse({ code: 0, data: false }, 200), false)
  assert.throws(() => http.unwrapResponse({ code: 500, data: null }, 200))
  assert.throws(() => http.unwrapResponse({ error: { code: 'CONFLICT', message: '冲突' } }, 200), { code: 'CONFLICT' })
})
test('every business request includes matching tenant and paired device credentials', async () => {
  const { http, requests } = httpHarness(() => ({ statusCode: 200, data: { code: 0, data: true } }))
  http.setAccessToken('test-access'); http.setCallphoneDeviceCredential('9007199254740993123', 'test-device')
  await http.request('POST', '/api/v1/mobile/calls', {}, 'same-intent')
  assert.equal(requests[0].header['tenant-id'], '7')
  assert.equal(requests[0].header['X-Callphone-Device-Id'], '9007199254740993123')
  assert.equal(requests[0].header['Idempotency-Key'], 'same-intent')
})
test('simultaneous token expiry refreshes once and replays writes with identical idempotency keys', async () => {
  let refreshes = 0
  const { http, requests } = httpHarness(opts => {
    if (opts.url.includes('refresh-token')) { refreshes++; return { statusCode: 200, data: { code: 0, data: { accessToken: 'new-access', refreshToken: 'new-refresh' } } } }
    return opts.header.Authorization === 'Bearer new-access' ? { statusCode: 200, data: { code: 0, data: true } } : { statusCode: 200, data: { code: 401, data: null } }
  })
  http.setAccessToken('expired-access', 'test-refresh')
  await Promise.all([http.request('POST', '/api/v1/mobile/calls/a/complete', {}, 'intent-a'), http.request('POST', '/api/v1/mobile/calls/b/complete', {}, 'intent-b')])
  assert.equal(refreshes, 1)
  assert.equal(requests.filter(r => r.header['Idempotency-Key'] === 'intent-a').length, 2)
  assert.equal(requests.filter(r => r.header['Idempotency-Key'] === 'intent-b').length, 2)
})
test('revoked device errors clear device credentials and never report success', async () => {
  const { http } = httpHarness(() => ({ statusCode: 200, data: { code: 1031000001, msg: '已解绑' } }))
  http.setAccessToken('test-access'); http.setCallphoneDeviceCredential('10', 'test-device')
  await assert.rejects(http.request('POST', '/api/v1/mobile/devices/heartbeat'), { code: 'DEVICE_REVOKED' })
  assert.equal(http.hasCallphoneDeviceCredential(), false)
  assert.equal(http.hasAccessToken(), true)
})
test('old-account response is discarded after session changes', async () => {
  let resolve
  const { http } = httpHarness(() => new Promise(r => { resolve = r }))
  http.setAccessToken('first-account')
  const pending = http.request('GET', '/api/v1/mobile/customers')
  http.clearAccessToken(); http.setAccessToken('second-account')
  resolve({ statusCode: 200, data: { code: 0, data: { secret: 'old account' } } })
  await assert.rejects(pending, { code: 'AUTH_REQUIRED' })
})
test('pairing scanner rejects unrelated QR and invalid versions, preserves string IDs', () => {
  const { parsePairingPayload } = load('services/pairing.ts')
  assert.equal(parsePairingPayload('123456').code, '123456')
  assert.equal(parsePairingPayload('{"type":"callphone-pairing","version":1,"code":"123456","tenantId":"9007199254740993"}').tenantId, '9007199254740993')
  for (const value of ['https://example.test', '{"type":"callphone-pairing","version":2,"code":"123456"}', '{"type":"callphone-pairing","version":1,"code":"12345"}']) assert.throws(() => parsePairingPayload(value))
})
test('expired pairing code (successful envelope with null data) yields actionable error', async () => {
  let stored = false
  const mobile = load('api/mobile.ts', { './http': { request: async () => null, error: (code, message) => Object.assign(new Error(message), { code }), setCallphoneDeviceCredential: () => { stored = true } } })
  await assert.rejects(mobile.mobileApi.claimPairing('123456', '手机', 'android'), { code: 'PAIRING_INVALID' })
  assert.equal(stored, false)
})
test('unavailable native plugin does not create phantom server calls', async () => {
  let requests = 0
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { beginCall: async () => { requests++ } } }, './mock': {}, '@/native/phone': { phoneCapability: { available: () => false } } })
  await assert.rejects(calls.beginCall('customer_list', '1'), /拨号插件/)
  assert.equal(requests, 0)
})
test('native callbacks can see the active call before dial starts; simultaneous calls are blocked', async () => {
  let ready = false, release
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { beginCall: async () => ({ call_id: '11', phone_number: '10086' }), callStarted: async () => true, completeCall: async () => true } }, './mock': {}, '@/native/phone': { phoneCapability: { available: () => true, observe: () => () => {} }, dial: async () => { assert.equal(ready, true); await new Promise(resolve => { release = resolve }) } } })
  const first = calls.beginCall('customer_list', '1', () => { ready = true })
  assert.equal(calls.hasUnfinishedCall(), true)
  await Promise.resolve(); await Promise.resolve()
  await assert.rejects(calls.beginCall('customer_detail', '2'), /当前通话/)
  release(); const result = await first
  assert.equal(result.dialStarted, true)
  await assert.rejects(calls.beginCall('customer_list', '3'), /当前通话/)
  await assert.rejects(calls.completeCall('11', 'no_answer', result.startedAt), /通话尚未结束/)
  assert.equal(calls.hasUnfinishedCall(), true)
  calls.confirmCallEnded('11')
  await calls.completeCall('11', 'no_answer', result.startedAt)
  assert.equal(calls.hasUnfinishedCall(), false)
})
test('overlapping retry triggers drain each queued result only once', async () => {
  let attempts = 0, release
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { beginCall: async () => ({ call_id: '11', phone_number: '10086' }), callStarted: async () => true, completeCall: async () => { attempts++; if (attempts === 1) throw new Error('offline'); await new Promise(resolve => { release = resolve }); return true } } }, './mock': {}, '@/native/phone': { phoneCapability: { available: () => true, observe: () => () => {} }, dial: async () => {} } })
  await calls.beginCall('customer_list', '1')
  calls.confirmCallEnded('11')
  assert.equal(await calls.completeCall('11', 'no_answer', new Date().toISOString()), 'pending')
  const one = calls.retryPendingCompletions(true), two = calls.retryPendingCompletions(true)
  assert.equal(one, two); release(); await one
  assert.equal(attempts, 2); assert.equal(calls.pendingCompletionCount(), 0)
})

test('native timeout preserves a result record and allows actual outcome confirmation', async () => {
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { beginCall: async () => ({ call_id: '12', phone_number: '10086' }) } }, './mock': {}, '@/native/phone': { phoneCapability: { available: () => true, observe: () => () => {} }, dial: async () => { throw Object.assign(new Error('timeout'), { code: 'DIAL_TIMEOUT' }) } } })
  const call = await calls.beginCall('customer_list', '1')
  assert.equal(call.callId, '12')
  assert.equal(call.dialStarted, false)
  assert.equal(call.dialUncertain, true)
})

test('native listener ignores incoming and unrelated phone events', async () => {
  let callback
  const plugin = { callPhone(args, done) { done({ code: 0 }) }, registerListener(listener) { callback = listener }, unRegisterListener(done) { done() } }
  const phone = load('native/phone.ts', { '@/api/http': { error: (code, message) => Object.assign(new Error(message), { code }) } }, { uni: { getSystemInfoSync: () => ({ platform: 'android' }), requireNativePlugin: () => plugin } })
  const events = []
  const stop = phone.observePhone(event => events.push(event))
  await phone.dial('10086')
  callback({ code: 0, data: { status: 1, phoneNumber: '12345' } })
  callback({ code: 0, data: { status: 3, phoneNumber: '12345', audioPath: 'unrelated' } })
  callback({ code: 0, data: { status: 3, phoneNumber: '98765', audioPath: 'wrong' } })
  assert.equal(events.length, 0)
  callback({ code: 0, data: { status: 3, phoneNumber: '10086', duration: 18000, audioPath: 'own' } })
  assert.equal(events.length, 1)
  assert.equal(events[0].durationSeconds, 18)
  assert.equal(events[0].recordingPath, 'own')
  assert.ok(events[0].endedAt)
  stop()
})

function callsHarness(api = {}, dependencies = {}) {
  let observer
  const calls = load('services/calls.ts', {
    '@/config': { mockEnabled: false }, './mock': {},
    '@/api/mobile': { mobileApi: { beginCall: async (_, key) => ({ call_id: key, phone_number: '10086' }), callStarted: async () => true, completeCall: async () => true, ...api } },
    '@/native/phone': { phoneCapability: { available: () => true, observe: fn => { observer = fn; return () => {} } }, dial: async () => {} }, ...dependencies,
  })
  return { calls, ended: event => observer({ kind: 'ended', endedAt: new Date().toISOString(), ...event }) }
}
test('old completion failure cannot unlock a new call or repopulate its queue', async () => {
  let reject
  const { calls } = callsHarness({ completeCall: () => new Promise((_, no) => { reject = no }) })
  const old = await calls.beginCall('customer_list', '1'); calls.confirmCallEnded(old.callId)
  const completing = calls.completeCall(old.callId, 'no_answer', old.startedAt)
  calls.clearCallState()
  const current = await calls.beginCall('customer_list', '2')
  reject(new Error('old offline'))
  await assert.rejects(completing, /会话已变更/)
  assert.equal(calls.pendingCompletionCount(), 0)
  assert.equal(calls.hasUnfinishedCall(), true)
  assert.ok(calls.confirmCallEnded(current.callId))
})
test('old create response never dials or clears a new creation lock', async () => {
  let finishOld, finishNew, count = 0, dials = 0
  const { calls } = callsHarness({ beginCall: () => new Promise(resolve => { if (++count === 1) finishOld = resolve; else finishNew = resolve }) }, {
    '@/native/phone': { phoneCapability: { available: () => true, observe: () => () => {} }, dial: async () => { dials++ } },
  })
  const first = calls.beginCall('customer_list', '1'); calls.clearCallState()
  const second = calls.beginCall('customer_list', '1')
  finishOld({ call_id: 'old', phone_number: '10086' }); await assert.rejects(first, /会话已变更/)
  assert.equal(calls.hasUnfinishedCall(), true); assert.equal(dials, 0)
  finishNew({ call_id: 'new', phone_number: '10086' }); await second
  assert.equal(dials, 1)
})
test('native end supplies actual duration and duplicate empty event preserves recording', async () => {
  let sent, uploaded
  const { calls, ended } = callsHarness({ completeCall: async (_, body) => { sent = body; return true }, uploadRecording: async (_, path) => { uploaded = path } })
  const call = await calls.beginCall('customer_list', '1')
  await assert.rejects(calls.completeCall(call.callId, 'connected', call.startedAt, 0, '', undefined, new Date().toISOString()), /通话尚未结束/)
  ended({ durationSeconds: 38, recordingPath: '/private/recording.wav' }); ended({})
  assert.equal(await calls.completeCall(call.callId, 'connected', call.startedAt), 'recording_synced')
  assert.equal(sent.duration_seconds, 38); assert.equal(uploaded, '/private/recording.wav')
})
test('secure queue restoration keeps original completion and upload idempotency keys', async () => {
  let stored, originalBody, originalKey, uploadId
  const persistence = { readQueue: () => stored, writeQueue: rows => { stored = JSON.parse(JSON.stringify(rows)); return true } }
  const first = callsHarness({ completeCall: async (_, body, key) => { originalBody = body; originalKey = key; throw new Error('offline') } }, { './vault': persistence })
  const call = await first.calls.beginCall('customer_list', '1'); first.ended({ recordingPath: '/private/kept.wav', durationSeconds: 5 })
  await first.calls.completeCall(call.callId, 'connected', call.startedAt)
  uploadId = stored[0].uploadId
  const second = callsHarness({ completeCall: async (_, body, key) => { assert.equal(key, originalKey); assert.equal(body.device_event_id, originalBody.device_event_id); return true }, uploadRecording: async (_, path, id) => { assert.equal(id, uploadId); assert.equal(path, '/private/kept.wav') } }, { './vault': persistence })
  second.calls.restoreCallQueue(); await second.calls.retryPendingCompletions(true)
  assert.equal(second.calls.pendingCompletionCount(), 0); assert.deepEqual(stored, [])
})
test('permanent task does not block later recoverable tasks', async () => {
  const { calls } = callsHarness({ completeCall: async (id) => { if (id === 'denied') throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' }); return true } }, {
    './vault': { readQueue: () => ['denied', 'allowed'].map(id => ({ id, key: id, body: { device_event_id: id } })), writeQueue: () => true },
  })
  calls.restoreCallQueue(); await calls.retryPendingCompletions(true)
  assert.equal(calls.pendingCompletionCount(), 1); assert.equal(calls.pending[0].failure, 'permanent')
})
test('unavailable durable storage never reports an offline result as safely saved', async () => {
  const { calls } = callsHarness({ completeCall: async () => { throw new Error('offline') } }, { './vault': { writeQueue: () => false } })
  const call = await calls.beginCall('customer_list', '1'); calls.confirmCallEnded(call.callId)
  await assert.rejects(calls.completeCall(call.callId, 'no_answer', call.startedAt), /尚未安全保存/)
  assert.equal(calls.hasUnfinishedCall(), true); assert.equal(calls.hasUnsafeResults(), true)
})
test('upload and JSON expiry share one refresh and keep original upload_id', async () => {
  let refreshes = 0
  const uploads = []
  const uni = {
    request(opts) { Promise.resolve().then(() => {
      if (opts.url.includes('refresh-token')) { refreshes++; opts.success({ statusCode: 200, data: { code: 0, data: { accessToken: 'fresh', refreshToken: 'refresh2' } } }) }
      else opts.success({ statusCode: opts.header.Authorization === 'Bearer fresh' ? 200 : 401, data: { code: 0, data: true } })
    }) },
    uploadFile(opts) { uploads.push(opts); Promise.resolve().then(() => opts.success({ statusCode: opts.header.Authorization === 'Bearer fresh' ? 200 : 401, data: JSON.stringify({ code: 0, data: true }) })) },
  }
  const http = load('api/http.ts', { '@/config': { connectionSettings: () => ({ serviceUrl: 'https://data.example.test', tenantId: '7' }) } }, { uni })
  http.setAccessToken('expired', 'refresh'); http.setCallphoneDeviceCredential('1', 'key')
  await Promise.all([http.uploadRecording('1', '/private/a.wav', 'original'), http.request('GET', '/test')])
  assert.equal(refreshes, 1); assert.equal(uploads.length, 2)
  assert.deepEqual(uploads.map(item => item.formData.upload_id), ['original', 'original'])
})
test('old upload and download callbacks reject after account or device changes', async () => {
  let upload, download
  const http = load('api/http.ts', { '@/config': { connectionSettings: () => ({ serviceUrl: 'https://data.example.test', tenantId: '7' }) } }, { uni: { uploadFile: opts => { upload = opts }, downloadFile: opts => { download = opts } } })
  http.setAccessToken('a', 'b'); http.setCallphoneDeviceCredential('1', 'key')
  const one = http.uploadRecording('1', '/private/a.wav', 'id'), two = http.downloadRecording('/api/v1/mobile/calls/1/recording')
  http.setCallphoneDeviceCredential('2', 'new')
  upload.success({ statusCode: 200, data: '{"data":true}' }); download.success({ statusCode: 200, tempFilePath: '/private/old.wav' })
  await assert.rejects(one, { code: 'AUTH_REQUIRED' }); await assert.rejects(two, { code: 'AUTH_REQUIRED' })
  assert.equal(http.hasAccessToken(), true)
})
test('foreground lifecycle deduplicates timers and drops responses after hiding', async () => {
  const timers = new Set(); let dispatchRequests = 0, complete
  const foreground = load('services/foreground.ts', {
    '@/config': { mockEnabled: false, dispatchPollMs: 15000 },
    '@/api/http': { getSessionVersion: () => 1, hasAccessToken: () => true, hasCallphoneDeviceCredential: () => true, onSessionChange: () => {} },
    './mobile': { mobileService: { heartbeat: async () => true, dispatches: () => { dispatchRequests++; return new Promise(resolve => { complete = resolve }) } } },
    './calls': { retryPendingCompletions: async () => {} },
    './automatic-call': { acceptNextDispatch: async () => {} },
  }, { setInterval: fn => { timers.add(fn); return fn }, clearInterval: fn => timers.delete(fn) })
  foreground.startForeground(); foreground.startForeground(); await new Promise(setImmediate)
  assert.equal(timers.size, 1); assert.equal(dispatchRequests, 1)
  const inFlight = foreground.refreshDispatches(); foreground.stopForeground()
  complete({ items: [{ id: '1', status: 'pending', expires_at: '2099-01-01' }] }); await inFlight
  assert.equal(timers.size, 0); assert.equal(foreground.foregroundDispatches.value.length, 0)
})

const appIdentity = { appId: 'app', platform: 'android', architecture: 'arm64-v8a', channel: 'stable', versionCode: 101, versionName: '1.0.3', baseVersionCode: 101, packageName: 'test.app' }
const release = { id: '102', ...appIdentity, versionCode: 102, versionName: '1.0.4', publishedAt: '2026-10-10T00:00:00Z', notes: 'test', mandatory: false, minBaseVersionCode: 100, artifact: { type: 'apk', url: 'https://updates.example.test/app.apk', bytes: 100, sha256: 'a'.repeat(64), packageName: 'test.app' } }
function updateHarness(overrides = {}, source = { latest: async () => release }, allowed = () => true) {
  const { createUpdateService } = load('modules/app-update/core.ts')
  const removed = []
  const service = createUpdateService(source, { identity: async () => appIdentity, download: async () => '/update.apk', verify: async () => true, install: async () => 'requested', cleanup: async path => { removed.push(path) }, ...overrides }, allowed)
  return { service, removed }
}
test('startup and manual update checks share one request, and failures can retry', async () => {
  let requests = 0, done
  const { service } = updateHarness({}, { latest: () => { requests++; return new Promise(resolve => { done = resolve }) } })
  const one = service.check(), two = service.check(); assert.equal(one, two)
  await new Promise(setImmediate); done(null); await one
  assert.equal(requests, 1); assert.equal(service.getState().status, 'upToDate')
  let attempts = 0
  const failed = updateHarness({}, { latest: async () => { if (++attempts === 1) throw new Error('offline'); return null } }).service
  await failed.check(); assert.equal(failed.getState().status, 'failed')
  await failed.check(); assert.equal(failed.getState().status, 'upToDate')
})
test('release validation rejects cross-channel, architecture, package and base incompatibility', async () => {
  for (const change of [{ channel: 'beta' }, { appId: 'other' }, { architecture: 'x86' }, { minBaseVersionCode: 999 }, { artifact: { ...release.artifact, packageName: 'other' } }]) {
    const { service } = updateHarness({}, { latest: async () => ({ ...release, ...change }) })
    await service.check(); assert.equal(service.getState().status, 'failed')
  }
})
test('digest failure cleans artifact and cannot install; download retries are bounded', async () => {
  let installed = 0, downloads = 0
  const { service, removed } = updateHarness({ verify: async () => false, install: async () => { installed++; return 'requested' } })
  await service.check(); await service.download(); await service.install()
  assert.equal(service.getState().stage, 'verify'); assert.equal(installed, 0); assert.deepEqual(removed, ['/update.apk'])
  const failed = updateHarness({ download: async () => { downloads++; throw new Error('offline') } }).service
  await failed.check(); await failed.download(); assert.equal(downloads, 3); assert.equal(failed.getState().stage, 'download')
})
test('install defers during unsafe business state, deduplicates and never claims request means completion', async () => {
  let safe = false, installed = 0, done
  const { service } = updateHarness({ install: () => { installed++; return new Promise(resolve => { done = resolve }) } }, undefined, () => safe)
  await service.check(); await service.download(); await service.install(); assert.equal(service.getState().status, 'deferred')
  safe = true; const one = service.install(), two = service.install(); assert.equal(one, two)
  await new Promise(setImmediate); done('requested'); await one; await service.install()
  assert.equal(installed, 1); assert.equal(service.getState().status, 'installationRequested')
  await service.reconcileInstallation(); assert.equal(service.getState().status, 'readyToInstall')
})
test('cancel and dispose discard stale callbacks and remove late download files', async () => {
  let done
  const { service, removed } = updateHarness({ download: () => new Promise(resolve => { done = resolve }) })
  await service.check(); const download = service.download(); await service.cancel(); done('/late.apk'); await download
  assert.equal(service.getState().status, 'cancelled'); assert.deepEqual(removed, ['/late.apk'])
  const second = updateHarness({}, { latest: () => new Promise(resolve => { done = resolve }) }).service
  const check = second.check(); await new Promise(setImmediate); await second.dispose(); done(release); await check
  assert.notEqual(second.getState().status, 'available')
})

test('late native end after manual save reconciles duration and recording once', async () => {
  let observations = 0, uploads = 0, completions = 0
  const { calls, ended } = callsHarness({
    completeCall: async () => { completions++; return true },
    observedEnd: async (_, body) => { observations++; assert.equal(body.duration_seconds, 45); return true },
    uploadRecording: async () => { uploads++ },
  })
  const call = await calls.beginCall('customer_list', '1'); calls.confirmCallEnded(call.callId)
  await calls.completeCall(call.callId, 'connected', call.startedAt)
  ended({ durationSeconds: 45, recordingPath: '/private/late.wav' }); await calls.retryPendingCompletions(true)
  ended({ durationSeconds: 45, recordingPath: '/private/late.wav' }); await calls.retryPendingCompletions(true)
  assert.equal(completions, 1); assert.equal(observations, 1); assert.equal(uploads, 1)
})

test('vault partitions device and queue by service, workspace, account and device', () => {
  const stored = new Map(); let settings = { serviceUrl: 'https://one.test', tenantId: '1' }
  const vault = load('services/vault.ts', {
    '@/config': { connectionSettings: () => settings },
    '@/native/secure-store': { secureStore: { available: () => true, read: key => stored.get(key), write: (key, value) => stored.set(key, value), remove: key => stored.delete(key) } },
  })
  vault.openVault('a'); vault.saveDevice('phone-1', 'secret'); vault.writeQueue(['account-a'])
  vault.closeVault(); vault.openVault('b'); assert.equal(vault.readDevice(), undefined)
  vault.saveDevice('phone-1', 'other'); assert.equal(vault.readQueue(), undefined)
  vault.openVault('a'); assert.equal(vault.readDevice().key, 'secret'); vault.setVaultDevice('phone-1'); assert.deepEqual(vault.readQueue(), ['account-a'])
  vault.setVaultDevice('phone-2'); assert.equal(vault.readQueue(), undefined)
  settings = { serviceUrl: 'https://one.test', tenantId: '2' }; vault.openVault('a'); assert.equal(vault.readDevice(), undefined)
  settings = { serviceUrl: 'https://two.test', tenantId: '1' }; vault.openVault('a'); assert.equal(vault.readDevice(), undefined)
})
test('permission check times out and unsupported settings report an actionable error', async () => {
  const timers = []
  const phone = load('native/phone.ts', { '@/api/http': { error: (code, message) => Object.assign(new Error(message), { code }) } }, {
    setTimeout: fn => { timers.push(fn); return 1 }, clearTimeout: () => {},
    uni: { getSystemInfoSync: () => ({ platform: 'android' }), requireNativePlugin: () => ({ checkCallAutoRecorder() {} }) },
  })
  const check = phone.phoneCapability.recordingConfigured(); timers[0]()
  await assert.rejects(check, { code: 'PERMISSION_TIMEOUT' })
  assert.throws(() => phone.phoneCapability.openRecordingSettings(), { code: 'NATIVE_PLUGIN_UNAVAILABLE' })
})
test('signed release source rejects unsigned metadata and unapproved download origins', async () => {
  let envelope = { payload: JSON.stringify({ release }), signature: 'test' }
  const { createSignedReleaseSource } = load('modules/app-update/source.ts', {}, { uni: { request: opts => {
    queueMicrotask(() => { opts.success({ statusCode: 200, data: envelope }); opts.complete() }); return { abort() {} }
  } } })
  const controller = new AbortController()
  await assert.rejects(createSignedReleaseSource('https://updates.example.test/manifest', ['https://updates.example.test'], () => false).latest(appIdentity, controller.signal), /签名/)
  await assert.rejects(createSignedReleaseSource('https://updates.example.test/manifest', ['https://other.test'], () => true).latest(appIdentity, controller.signal), /域名/)
  envelope = { payload: JSON.stringify({ release: null }), signature: 'test' }
  assert.equal(await createSignedReleaseSource('https://updates.example.test/manifest', [], () => true).latest(appIdentity, controller.signal), null)
})

test('install revalidates package and rechecks call permission after verification', async () => {
  let verifies = 0, installs = 0, safe = true
  const { service } = updateHarness({
    verify: async () => { if (++verifies === 2) safe = false; return true },
    install: async () => { installs++; return 'requested' },
  }, undefined, () => safe)
  await service.check(); await service.download(); await service.install()
  assert.equal(verifies, 2); assert.equal(installs, 0); assert.equal(service.getState().status, 'deferred')
})
test('download refreshes once and preserves distinct forbidden/not-found/server errors', async () => {
  for (const [status, code] of [[403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [503, 'SERVICE_UNAVAILABLE']]) {
    let downloads = 0, refreshes = 0
    const http = load('api/http.ts', { '@/config': { connectionSettings: () => ({ serviceUrl: 'https://data.example.test', tenantId: '7' }) } }, { uni: {
      request(opts) { refreshes++; queueMicrotask(() => opts.success({ statusCode: 200, data: { data: { accessToken: 'fresh', refreshToken: 'fresh-r' } } })) },
      downloadFile(opts) { downloads++; queueMicrotask(() => opts.success({ statusCode: downloads === 1 ? 401 : status })) },
    } })
    http.setAccessToken('old', 'refresh'); http.setCallphoneDeviceCredential('1', 'key')
    await assert.rejects(http.downloadRecording('/api/v1/mobile/calls/1/recording'), { code })
    assert.equal(refreshes, 1); assert.equal(downloads, 2)
  }
})
test('real Vue reactive queue updates pending count after retry', async () => {
  const vue = require('../node_modules/vue')
  let online = false, seen = []
  const { calls } = callsHarness({ completeCall: async () => { if (!online) throw new Error('offline'); return true } }, { vue })
  const stop = vue.watchEffect(() => seen.push(calls.pendingCompletionCount()), { flush: 'sync' })
  const call = await calls.beginCall('customer_list', '1'); calls.confirmCallEnded(call.callId)
  await calls.completeCall(call.callId, 'no_answer', call.startedAt)
  online = true; await calls.retryPendingCompletions(true)
  assert.ok(seen.includes(1)); assert.equal(seen.at(-1), 0); stop()
})

test('result sheet can acknowledge success after background retry without a duplicate completion', async () => {
  let online = false, sends = 0
  const { calls } = callsHarness({ completeCall: async () => { sends++; if (!online) throw new Error('offline'); return true } }, { './vault': { writeQueue: () => false } })
  const call = await calls.beginCall('customer_list', '1'); calls.confirmCallEnded(call.callId)
  await assert.rejects(calls.completeCall(call.callId, 'no_answer', call.startedAt), /尚未安全保存/)
  online = true; await calls.retryPendingCompletions(true)
  assert.equal(await calls.completeCall(call.callId, 'no_answer', call.startedAt), 'synced')
  assert.equal(sends, 2)
})

function automaticHarness(begin) {
  let session = 1, busy = false, reset, observer
  const automatic = load('services/automatic-call.ts', {
    './calls': { beginCall: begin, hasUnfinishedCall: () => busy },
    '@/api/http': { getSessionVersion: () => session, onSessionChange: fn => { reset = fn } },
    '@/native/phone': { phoneCapability: { observe: fn => { observer = fn; return () => {} } } },
  }, { uni: { showToast() {} } })
  return { automatic, setBusy: v => { busy = v }, switchSession: () => { session++; reset() }, event: e => observer(e) }
}
const queuedDispatch = { id: 'automatic-1', status: 'queued', expires_at: '2099-01-01' }
test('PC dispatch automatically dials once and waits for the previous result', async () => {
  let begins = 0, release
  const h = automaticHarness(async (source, id, onCreated) => {
    begins++; assert.equal(source, 'pc_dispatch')
    const call = { callId: 'call-1', startedAt: '2026-01-01', dialStarted: false }
    onCreated(call); await new Promise(r => { release = r }); return { ...call, dialStarted: true }
  })
  const task = h.automatic.acceptNextDispatch([queuedDispatch])
  await h.automatic.acceptNextDispatch([queuedDispatch]); assert.equal(begins, 1)
  release(); await task
  h.event({ kind: 'ended', endedAt: '2026-01-02', durationSeconds: 12 })
  assert.equal(h.automatic.automaticObservation.value.durationSeconds, 12)
  await h.automatic.acceptNextDispatch([{ ...queuedDispatch, id: 'second' }]); assert.equal(begins, 1)
  h.automatic.finishAutomaticCall()
  await h.automatic.acceptNextDispatch([queuedDispatch]); assert.equal(begins, 1)
})
test('automatic dispatch skips expired and busy calls and drops old-session completion', async () => {
  let begins = 0, release
  const h = automaticHarness(async () => { begins++; return new Promise(r => { release = r }) })
  await h.automatic.acceptNextDispatch([{ ...queuedDispatch, expires_at: '2000-01-01' }])
  h.setBusy(true); await h.automatic.acceptNextDispatch([queuedDispatch]); assert.equal(begins, 0)
  h.setBusy(false); const task = h.automatic.acceptNextDispatch([queuedDispatch]); h.switchSession()
  release({ callId: 'old', dialStarted: true }); await task
  assert.equal(h.automatic.automaticCall.value, null)
})

test('PC direct call sends once without confirmation for one online phone and reuses ambiguous intent', async () => {
  const keys = []; let fail = true, choices = 0, messages = []
  const direct = load('../../ruoyi-vue-pro/yudao-ui-admin-vue3/src/utils/callphone/direct-call.ts', {
    vue: { h: () => ({}) },
    '@/utils/auth': { getAccessToken: () => 'test-session' },
    'element-plus': { ElMessage: { info: m => messages.push(m), success: m => messages.push(m), error: m => messages.push(m) }, ElMessageBox: async () => { choices++ } },
    '@/api/callphone/outbound': {
      getPairedDevices: async () => [{ id: 'phone', platform: 'android', status: 'online' }],
      createCallDispatch: async body => { keys.push(body.idempotencyKey); if (fail) { fail = false; throw Error('timeout') }; return { id: 'dispatch', status: 'queued' } },
      getCallDispatch: async () => ({ id: 'dispatch', status: 'queued', callStage: 'waiting' }),
    },
  }, { crypto: { randomUUID: () => 'intent-key' } })
  const target = { customerId: 'c', source: 'customer_detail' }
  await direct.startDirectCall(target)
  await direct.startDirectCall(target)
  await direct.startDirectCall(target)
  assert.deepEqual(keys, ['intent-key', 'intent-key'])
  assert.equal(choices, 0)
  assert.match(messages.at(-1), /正在处理中/)
})

test('failed automatic dispatch is not repeatedly dialed on each foreground refresh', async () => {
  let attempts = 0
  const h = automaticHarness(async () => { attempts++; throw Error('device rejected') })
  await h.automatic.acceptNextDispatch([queuedDispatch])
  await h.automatic.acceptNextDispatch([queuedDispatch])
  assert.equal(attempts, 1)
  assert.equal(h.automatic.automaticCall.value, null)
  await h.automatic.acceptNextDispatch([{ ...queuedDispatch, id: 'new-intent' }])
  assert.equal(attempts, 2)
})

test('result suggestion uses completed duration, leaves unknown hangups unclassified', () => {
  const { suggestCallResult } = load('services/call-result.ts')
  assert.equal(suggestCallResult({ endedAt: '2026-01-01', durationSeconds: 12 }), 'connected')
  assert.equal(suggestCallResult({ suggested: 'no_answer', endedAt: '2026-01-01', durationSeconds: 12 }), 'connected')
  assert.equal(suggestCallResult({ suggested: 'no_answer' }), 'no_answer')
  assert.equal(suggestCallResult({ endedAt: '2026-01-01', durationSeconds: 0 }), undefined)
  assert.equal(suggestCallResult({ durationSeconds: 12 }), undefined)
})
test('single Save can record user-confirmed end without another confirmation action', async () => {
  let body
  const { calls } = callsHarness({ completeCall: async (_id, request) => { body = request; return true } })
  const call = await calls.beginCall('customer_list', 'customer')
  assert.equal(await calls.completeCall(call.callId, 'no_answer', call.startedAt, 0, '备注', undefined, undefined, true), 'synced')
  assert.equal(body.result_code, 'no_answer')
  assert.equal(body.note, '备注')
  assert.ok(body.ended_at)
  assert.equal(calls.hasUnfinishedCall(), false)
})

test('v2 login QR preserves version and login capability', () => {
  const { parsePairingPayload } = load('services/pairing.ts')
  const qr = { type: 'callphone-pairing', version: 2, pairingId: '9007199254740993123', code: '123456', loginSecret: 'a'.repeat(43), tenantId: '7', serviceUrl: 'https://data.example.test' }
  assert.equal(parsePairingPayload(JSON.stringify(qr)).version, 2)
  assert.equal(parsePairingPayload(JSON.stringify(qr)).pairingId, qr.pairingId)
  assert.throws(() => parsePairingPayload(JSON.stringify({ ...qr, loginSecret: '' })))
})
test('expired refresh token resumes paired device once and retries concurrent requests', async () => {
  let resumes = 0
  const { http } = httpHarness(opts => {
    if (opts.url.includes('refresh-token')) return { statusCode: 200, data: { code: 400 } }
    if (opts.url.endsWith('/session/resume')) { resumes++; assert.equal(opts.data.deviceId, '10'); return { statusCode: 200, data: { code: 0, data: { deviceId: '10', accessToken: 'renewed', refreshToken: 'fresh' } } } }
    return { statusCode: 200, data: opts.header.Authorization === 'Bearer renewed' ? { code: 0, data: true } : { code: 401 } }
  })
  http.setAccessToken('expired', 'expired-refresh'); http.setCallphoneDeviceCredential('10', 'device-key')
  assert.deepEqual(await Promise.all([http.request('GET', '/api/v1/mobile/bootstrap'), http.request('GET', '/api/v1/mobile/devices/current')]), [true, true])
  assert.equal(resumes, 1)
})
test('remembered device uses secure storage, validates contents and can be forgotten', () => {
  const values = new Map()
  const api = load('services/remembered-device.ts', { '@/native/secure-store': { secureStore: { available: () => true, read: key => values.get(key), write: (key, value) => values.set(key, value), remove: key => values.delete(key) } } })
  const device = { serviceUrl: 'https://data.example.test', tenantId: '7', userId: '8', deviceId: '10', deviceKey: 'a'.repeat(43) }
  api.rememberDevice(device); assert.equal(api.readRememberedDevice().deviceId, '10')
  api.forgetRememberedDevice(); assert.equal(api.readRememberedDevice(), undefined)
  values.set('remembered-mobile-device:v1', {}); assert.equal(api.readRememberedDevice(), undefined)
})

function deviceSessionHarness(responder) {
  let remembered = { serviceUrl: 'https://data.example.test', tenantId: '7', userId: '8', deviceId: '10', deviceKey: 'a'.repeat(43) }, token = '', forgotten = 0
  const api = load('services/session.ts', {
    '@/api/http': { publicRequest: responder, request: async () => ({}), setAccessToken: value => { token = value }, clearAccessToken: () => { token = '' }, hasAccessToken: () => !!token, setCallphoneDeviceCredential: () => {}, clearCallphoneDeviceCredential: () => {}, getSessionVersion: () => 1 },
    './remembered-device': { readRememberedDevice: () => remembered, rememberDevice: value => { remembered = value }, forgetRememberedDevice: () => { forgotten++; remembered = undefined }, verifyRememberedDeviceStorage: () => {} },
    '@/config': { connectionSettings: () => ({ serviceUrl: remembered.serviceUrl, tenantId: remembered.tenantId }), saveConnectionSettings: () => {}, mockEnabled: false },
    './vault': { saveDevice: () => {}, openVault: () => {}, closeVault: () => {} },
    './calls': { clearCallState: () => {}, restoreCallQueue: () => {}, hasUnfinishedCall: () => false, hasUnsafeResults: () => false },
  })
  return { api, state: () => ({ remembered, forgotten, token }) }
}
test('cold start restores login with stored device and coalesces simultaneous attempts', async () => {
  let requests = 0
  const h = deviceSessionHarness(async () => { requests++; return { userId: '8', deviceId: '10', accessToken: 'access', refreshToken: 'refresh' } })
  assert.deepEqual(await Promise.all([h.api.resumeDeviceSession(), h.api.resumeDeviceSession()]), [true, true])
  assert.equal(requests, 1); assert.equal(h.state().token, 'access')
})
test('temporary startup network failure retains device while revocation removes it', async () => {
  const offline = deviceSessionHarness(async () => { throw Object.assign(new Error('offline'), { code: 'SERVICE_UNAVAILABLE' }) })
  await assert.rejects(offline.api.resumeDeviceSession()); assert.ok(offline.state().remembered)
  const revoked = deviceSessionHarness(async () => { throw Object.assign(new Error('revoked'), { code: 'DEVICE_REVOKED' }) })
  await assert.rejects(revoked.api.resumeDeviceSession()); assert.equal(revoked.state().remembered, undefined)
})
test('logout during startup discards late resumed credentials', async () => {
  let resolve
  const h = deviceSessionHarness(() => new Promise(r => { resolve = r }))
  const restoring = h.api.resumeDeviceSession()
  await h.api.logout()
  resolve({ userId: '8', deviceId: '10', accessToken: 'late', refreshToken: 'late' })
  await assert.rejects(restoring); assert.equal(h.state().token, ''); assert.equal(h.state().remembered, undefined)
})

test('startup requests missing runtime permissions only once and checks again on return', async () => {
  let requested = 0, granted = false
  const permission = load('modules/device-readiness/index.ts', {
    '@/native/phone': { phoneCapability: { available: () => true, recordingConfigured: async () => null } },
    './android': { bridge: () => ({}), sdkVersion: () => 33, permissionGranted: () => granted, allFilesGranted: () => false, batteryUnrestricted: () => null,
      requestRuntimePermissions: async names => { requested++; assert.ok(names.includes('android.permission.CALL_PHONE')); assert.ok(!names.includes('android.permission.READ_EXTERNAL_STORAGE')); granted = true }, openSystemSettings: () => {} },
  })
  await Promise.all([permission.onApplicationShow(), permission.onApplicationShow()])
  await permission.onApplicationShow()
  assert.equal(requested, 1); assert.equal(permission.readiness.phone, 'ready')
  assert.equal(permission.readiness.files, 'action'); assert.equal(permission.readiness.recording, 'unknown')
})
test('permission probe distinguishes missing native result from a real denial', () => {
  let result
  const android = load('modules/device-readiness/android.ts', {}, { uni: { getSystemInfoSync: () => ({ platform: 'android' }) }, plus: { android: { getAttribute: () => 33, runtimeMainActivity: () => ({}), invoke: () => result } } })
  assert.equal(android.allFilesGranted(), null)
  result = false; assert.equal(android.allFilesGranted(), false)
  result = true; assert.equal(android.allFilesGranted(), true)
  result = undefined; assert.equal(android.permissionGranted('android.permission.CALL_PHONE'), null)
})
test('phone plugin never treats missing or string false recording status as enabled', async () => {
  let data = {}
  const plugin = load('native/phone.ts', { '@/api/http': { error: (code, message) => Object.assign(new Error(message), { code }) } }, {
    uni: { getSystemInfoSync: () => ({ platform: 'android' }), requireNativePlugin: () => ({ checkCallAutoRecorder: callback => callback({ code: 0, data }) }) },
  })
  assert.equal(await plugin.phoneCapability.recordingConfigured(), null)
  data = { isOpen: 'false' }; assert.equal(await plugin.phoneCapability.recordingConfigured(), false)
  data = { isOpen: true }; assert.equal(await plugin.phoneCapability.recordingConfigured(), true)
})
test('mobile pet gates background eligibility on real overlay and handles revoke/disable', async () => {
  let permission = false, shown = 0, hidden = 0, opened = 0, listener
  const timers = new Set(), saved = new Map()
  const pet = load('modules/mobile-pet/index.ts', { './android': {
    overlayPermission: () => permission, openOverlaySettings: () => { opened++ }, showOverlay: async (_tap, close) => { shown++; listener = close }, hideOverlay: async () => { hidden++ }, setOverlayText: async () => {}, bringToFront: () => {},
  } }, { uni: { getStorageSync: key => saved.get(key), setStorageSync: (key, value) => saved.set(key, value) }, setInterval: fn => { timers.add(fn); return fn }, clearInterval: fn => timers.delete(fn) })
  await pet.setMobilePetEnabled(true); assert.equal(opened, 1); assert.equal(pet.canRunInBackground(), false)
  permission = true; await pet.refreshMobilePet(); assert.equal(shown, 1); assert.equal(pet.canRunInBackground(), true)
  permission = false; await pet.refreshMobilePet(); assert.equal(pet.canRunInBackground(), false); assert.equal(timers.size, 0)
  permission = true; await pet.refreshMobilePet(); listener(); await pet.setMobilePetEnabled(false)
  assert.equal(pet.mobilePet.enabled, false); assert.equal(pet.mobilePet.visible, false); assert.equal(timers.size, 0); assert.ok(hidden >= 2)
})
test('background dispatch polling stays active only while the visible pet is authorized', async () => {
  const timers = new Set(); let allowed = true, listener, dials = 0, pending
  const foreground = load('services/foreground.ts', {
    '@/modules/mobile-pet': { canRunInBackground: () => allowed, onPetChange: fn => { listener = fn }, reportPetConnection: () => {} },
    '@/config': { mockEnabled: false, dispatchPollMs: 3000 },
    '@/api/http': { getSessionVersion: () => 1, hasAccessToken: () => true, hasCallphoneDeviceCredential: () => true, onSessionChange: () => {} },
    './mobile': { mobileService: { heartbeat: async () => true, dispatches: () => new Promise(resolve => { pending = resolve }) } },
    './calls': { retryPendingCompletions: async () => {}, hasUnfinishedCall: () => false },
    './automatic-call': { acceptNextDispatch: async () => { dials++ } },
  }, { setInterval: fn => { timers.add(fn); return fn }, clearInterval: fn => timers.delete(fn) })
  foreground.startForeground(); await new Promise(setImmediate); foreground.stopForeground()
  assert.equal(timers.size, 1)
  const request = foreground.refreshDispatches(); pending({ items: [] }); await request; assert.equal(dials, 1)
  const late = foreground.refreshDispatches(); await new Promise(setImmediate)
  allowed = false; listener(); pending({ items: [{ id: 'late', status: 'pending', expires_at: '2099-01-01' }] }); await late
  assert.equal(timers.size, 0); assert.equal(dials, 1)
})

test('runtime permission denial is not reported as successful authorization', async () => {
  let result = { deniedAlways: ['android.permission.CAMERA'] }
  const android = load('modules/device-readiness/android.ts', {}, {
    uni: { getSystemInfoSync: () => ({ platform: 'android' }) },
    plus: { android: { requestPermissions: (_permissions, done) => done(result) } },
  })
  await assert.rejects(android.requestRuntimePermissions(['android.permission.CAMERA']), /永久拒绝/)
  result = { deniedPresent: ['android.permission.CAMERA'] }
  await assert.rejects(android.requestRuntimePermissions(['android.permission.CAMERA']), /尚未允许/)
  result = { granted: ['android.permission.CAMERA'] }
  await android.requestRuntimePermissions(['android.permission.CAMERA'])
})

test('unknown Android version cannot imply legacy file access', () => {
  const android = load('modules/device-readiness/android.ts', {}, {
    uni: { getSystemInfoSync: () => ({ platform: 'android' }) },
    plus: { android: { getAttribute: () => undefined } },
  })
  assert.equal(android.allFilesGranted(), null)
})

test('unsupported special settings falls back to the app settings before launching', () => {
  const launched = []
  const android = load('modules/device-readiness/android.ts', {}, {
    uni: { getSystemInfoSync: () => ({ platform: 'android' }) },
    plus: { android: {
      getAttribute: () => 33, runtimeMainActivity: () => 'activity',
      newObject: (_type, action) => ({ action }),
      invoke: (obj, method, arg) => {
        if (method === 'resolveActivity') return obj.action === 'android.settings.APPLICATION_DETAILS_SETTINGS' ? {} : null
        if (method === 'startActivity') launched.push(arg.action)
        if (method === 'getPackageName') return 'uni.UNID608100'
      },
    } },
  })
  android.openSystemSettings('files')
  assert.deepEqual(launched, ['android.settings.APPLICATION_DETAILS_SETTINGS'])
})

test('elf animation loads APK assets when no regular bitmap file exists', () => {
  const frames = [], opened = [], closed = []
  const appearance = load('modules/mobile-pet/appearance.ts', { './assets/elf-sheet-v2.png': { default: '/assets/elf.png' } }, {
    plus: { io: { convertLocalFileSystemURL: p => p }, runtime: { appid: '__UNI__D608100' } },
  })
  const a = {
    runtimeMainActivity: () => 'activity', newObject: type => ({ type }),
    invoke: (obj, method, ...args) => {
      if (method === 'decodeFile') return null
      if (method === 'getAssets') return 'assets'
      if (method === 'open') { opened.push(args[0]); return 'stream' }
      if (method === 'close') closed.push(obj)
      if (method === 'decodeStream') return 'bitmap'
      if (method === 'getWidth') return 2172
      if (method === 'getHeight') return 724
      if (method === 'createBitmap') return 'crop'
      if (method === 'createScaledBitmap') return 'small'
      if (method === 'addFrame') frames.push(args[1])
    },
  }
  appearance.createElfAnimation(a, 'resources')
  assert.deepEqual(opened, ['apps/__UNI__D608100/www/assets/elf.png'])
  assert.deepEqual(closed, ['stream'])
  assert.deepEqual(frames, [2800,160,2200,650,300,650])
})
