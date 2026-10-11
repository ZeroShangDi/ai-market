const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../src')
// Exercise actual TypeScript modules using uni/native adapters supplied by each test.
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  mocks = { vue: { reactive: value => value, ref: value => ({ value }) }, './vault': { readQueue: () => undefined, writeQueue: () => true }, '@/services/vault': { saveDevice: () => {}, verifyDeviceStorage: () => {} }, '@/native/secure-store': { secureStore: { available: () => false } }, ...mocks }
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
