const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../src')
// Exercise actual TypeScript modules using uni/native adapters supplied by each test.
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require(id) { if (id in mocks) return mocks[id]; throw new Error('Unmocked dependency: ' + id) }, console, setTimeout, clearTimeout, Date, Math, Error, ...globals }, { filename: file })
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
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { beginCall: async () => ({ call_id: '11', phone_number: '10086' }), callStarted: async () => true, completeCall: async () => true } }, './mock': {}, '@/native/phone': { phoneCapability: { available: () => true }, dial: async () => { assert.equal(ready, true); await new Promise(resolve => { release = resolve }) } } })
  const first = calls.beginCall('customer_list', '1', () => { ready = true })
  assert.equal(calls.hasUnfinishedCall(), true)
  await Promise.resolve(); await Promise.resolve()
  await assert.rejects(calls.beginCall('customer_detail', '2'), /当前通话/)
  release(); const result = await first
  assert.equal(result.dialStarted, true)
  await assert.rejects(calls.beginCall('customer_list', '3'), /当前通话/)
  await calls.completeCall('11', 'no_answer', result.startedAt)
  assert.equal(calls.hasUnfinishedCall(), false)
})
test('overlapping retry triggers drain each queued result only once', async () => {
  let attempts = 0, release
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { completeCall: async () => { attempts++; if (attempts === 1) throw new Error('offline'); await new Promise(resolve => { release = resolve }); return true } } }, './mock': {}, '@/native/phone': {} })
  assert.equal(await calls.completeCall('11', 'no_answer', new Date().toISOString()), 'pending')
  const one = calls.retryPendingCompletions(), two = calls.retryPendingCompletions()
  assert.equal(one, two); release(); await one
  assert.equal(attempts, 2); assert.equal(calls.pendingCompletionCount(), 0)
})

test('native timeout preserves a result record and allows actual outcome confirmation', async () => {
  const calls = load('services/calls.ts', { '@/config': { mockEnabled: false }, '@/api/mobile': { mobileApi: { beginCall: async () => ({ call_id: '12', phone_number: '10086' }) } }, './mock': {}, '@/native/phone': { phoneCapability: { available: () => true }, dial: async () => { throw Object.assign(new Error('timeout'), { code: 'DIAL_TIMEOUT' }) } } })
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
