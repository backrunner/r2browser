import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const session = (id, bucket = id) => ({ id, name: id, config: { type: 's3', bucket_name: bucket, secret_access_key: 'TEST-SECRET' }, created_at: '', last_accessed: '', access_count: 0, is_favorite: false, tags: [] })

function bus() {
  const listeners = new Set()
  const sent = []
  return {
    listeners, sent,
    async listen(label, event, callback) {
      const entry = { label, event, callback }
      listeners.add(entry)
      return () => listeners.delete(entry)
    },
    async emitTo(label, event, payload) {
      sent.push({ label, event, payload: structuredClone(payload) })
      for (const entry of [...listeners]) if (entry.label === label && entry.event === event) entry.callback({ payload: structuredClone(payload) })
    },
  }
}

// Separate module caches model separate webview JS realms while sharing only Rust IPC/events.
function realm(label, eventBus = bus(), invoke = async () => undefined, storage = new Map()) {
  const cache = new Map()
  const effects = []
  const timers = new Set()
  const windowEvents = new Map()
  const context = vm.createContext({
    console, URLSearchParams, TextDecoder, TextEncoder, Blob, File, crypto, structuredClone,
    navigator: { platform: 'MacIntel' },
    setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); timers.add(timer); return timer }, clearTimeout,
    setInterval: (fn, delay) => { const timer = setInterval(fn, delay); timers.add(timer); return timer }, clearInterval,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) },
  })
  const currentWindow = {
    label, listen: (name, callback) => eventBus.listen(label, name, callback),
    onCloseRequested: callback => eventBus.listen(label, 'close-requested', callback),
  }
  const logger = new Proxy({}, { get: () => async () => undefined })
  const stubs = {
    '@tauri-apps/api/event': { emitTo: eventBus.emitTo.bind(eventBus), listen: (name, callback) => eventBus.listen(label, name, callback) },
    '@tauri-apps/api/webviewWindow': { getCurrentWebviewWindow: () => currentWindow, WebviewWindow: class {} },
    '@tauri-apps/api/dpi': { LogicalPosition: class { constructor(x, y) { this.x = x; this.y = y } } },
    '@tauri-apps/api/core': { invoke },
    '@tauri-apps/plugin-fs': { stat: async () => ({ size: 0 }) },
    react: { ...require('react'), useEffect: fn => effects.push(fn), useCallback: fn => fn, useRef: value => ({ current: value }) },
    'react-router-dom': { useNavigate: () => () => undefined },
    'react-i18next': { useTranslation: () => ({ t: value => value }) },
    '@/hooks/use-toast': { toast: () => undefined },
    './use-toast': { toast: () => undefined },
    '@/i18n': { default: { language: 'en', changeLanguage: async () => undefined } },
  }
  function load(name, parent = root) {
    if (name in stubs) return stubs[name]
    if (/[/]logger$/.test(name)) return { logger, logError: logger.logError }
    if (!name.startsWith('.') && !name.startsWith('@/') && !name.startsWith('/')) return require(name)
    let filename = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(parent, name)
    if (!/\.[cm]?[jt]sx?$/.test(filename)) filename += '.ts'
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const fn = vm.runInContext(`(function(require,module,exports){${output}\n})`, context, { filename })
    fn(child => load(child, dirname(filename)), module, module.exports)
    return module.exports
  }
  return { load, effects, currentWindow, windowEvents, dispose: () => { timers.forEach(clearTimeout); timers.forEach(clearInterval) } }
}

test('tab transfer retries a mounting destination and sends no credentials', async t => {
  const events = bus()
  const source = realm('main', events)
  const target = realm('manager-test', events)
  t.after(() => { source.dispose(); target.dispose() })
  const sourceSync = source.load('@/lib/tab-sync')
  const targetSync = target.load('@/lib/tab-sync')
  const accepted = deferred()
  let deliveries = 0
  const sending = sourceSync.transferTabToWindow('manager-test', { tabId: 'tab', session: session('s'), path: 'a b/#目录', isActive: true }, 12, 1, 5000)
  await tick()
  const cleanup = targetSync.initTabSync({ isReady: () => true, onTabDropRequest() {}, onTabTransfer: async tab => { deliveries++; assert.equal(tab.path, 'a b/#目录'); await accepted.promise } })
  t.after(cleanup)
  await new Promise(resolve => setTimeout(resolve, 550))
  assert.equal(deliveries, 1, 'duplicate requests must not insert/navigate again')
  accepted.resolve()
  await sending
  assert.ok(events.sent.some(event => event.payload.type === 'TAB_TRANSFER_ACK'))
  assert.ok(!JSON.stringify(events.sent).includes('TEST-SECRET'))
  assert.equal([...events.listeners].filter(item => item.label === 'main').length, 0)
})

test('missing target rejects without removing the original tab or leaking an ACK listener', async t => {
  const events = bus()
  const source = realm('main', events)
  t.after(source.dispose)
  const tabs = source.load('@/stores/tab-store').useTabStore
  const id = tabs.getState().openSession(session('s'))
  const transfer = source.load('@/lib/tab-sync').transferTabToWindow
  await assert.rejects(transfer('missing', tabs.getState().getActiveTab(), undefined, undefined, 25), /source tab has been kept/)
  assert.equal(tabs.getState().getActiveTab().tabId, id)
  assert.equal(events.listeners.size, 0)
})

test('StrictMode cleanup removes listeners whose registration resolves after unmount', async t => {
  const events = bus()
  const late = deferred()
  const originalListen = events.listen.bind(events)
  events.listen = async (...args) => { const cleanup = await originalListen(...args); await late.promise; return cleanup }
  const target = realm('manager-test', events)
  t.after(target.dispose)
  const cleanup = target.load('@/lib/tab-sync').initTabSync({ isReady: () => true, onTabDropRequest() {}, onTabTransfer: async () => assert.fail('unmounted handler ran') })
  cleanup()
  late.resolve()
  await tick()
  assert.equal(events.listeners.size, 0)
})

test('inserting a duplicate connection preserves its tab identity and adopts its incoming path', t => {
  const window = realm('main'); t.after(window.dispose)
  const tabs = window.load('@/stores/tab-store').useTabStore
  const id = tabs.getState().openSession(session('s'))
  tabs.getState().insertTab({ tabId: 'other', session: session('s', 'edited'), path: 'incoming/', isActive: true }, 0)
  assert.equal(tabs.getState().tabs.length, 1)
  assert.equal(tabs.getState().activeTabId, id)
  assert.equal(tabs.getState().getActiveTab().path, 'incoming')
  assert.equal(tabs.getState().getActiveTab().session.config.bucket_name, 'edited')
})

test('session reconciliation removes deleted tabs while preserving other window-local paths', t => {
  const window = realm('main'); t.after(window.dispose)
  const tabs = window.load('@/stores/tab-store').useTabStore
  const id = tabs.getState().openSession(session('one'))
  tabs.getState().updateTabPath(id, 'keep/path')
  tabs.getState().openSession(session('two'))
  tabs.getState().reconcileSessions([session('one', 'updated')])
  assert.equal(tabs.getState().activeTabId, id)
  assert.equal(tabs.getState().getActiveTab().path, 'keep/path')
})

test('late listing from A cannot populate A after switching A → B → A', async t => {
  const listing = deferred()
  const window = realm('main', bus(), command => command === 'list_objects' ? listing.promise : Promise.resolve())
  t.after(window.dispose)
  const app = window.load('@/stores/app-store').useAppStore
  app.getState().setCurrentSession(session('a'))
  const firstLoad = app.getState().navigateToPath('')
  app.getState().setCurrentSession(session('b'))
  app.getState().setCurrentSession(session('a'))
  listing.resolve({ objects: [{ key: 'stale.txt', size: 3, last_modified: '' }], common_prefixes: [], is_truncated: false })
  await firstLoad
  assert.equal(app.getState().files.length, 0)
  assert.equal(app.getState().isLoading, false)
})

test('later session refresh wins when IPC responses return out of order', async t => {
  const first = deferred(); const second = deferred(); let calls = 0
  const window = realm('main', bus(), async command => command === 'get_all_session_data' ? (++calls === 1 ? first.promise : second.promise) : undefined)
  t.after(window.dispose)
  const app = window.load('@/stores/app-store').useAppStore
  const a = app.getState().loadSessions(); const b = app.getState().loadSessions()
  second.resolve([session('new')]); await b
  first.resolve([session('old')]); await a
  assert.equal(app.getState().sessions[0].id, 'new')
})

test('a native drop event only reaches the destination webview', async t => {
  const events = bus(); const source = realm('main', events); const target = realm('manager-test', events)
  t.after(() => { source.dispose(); target.dispose() })
  let first = 0; let second = 0
  await source.currentWindow.listen('tauri://file-drop', () => first++)
  await target.currentWindow.listen('tauri://file-drop', () => second++)
  await events.emitTo('manager-test', 'tauri://file-drop', { paths: ['/synthetic/file.txt'] })
  assert.equal(first, 0); assert.equal(second, 1)
})

test('dynamic windows have the capabilities required to create windows and set their titles', () => {
  const capability = JSON.parse(readFileSync(resolve(root, 'src-tauri/capabilities/default.json'), 'utf8'))
  assert.ok(capability.windows.includes('main'))
  assert.ok(capability.windows.includes('manager-*'))
  assert.ok(!capability.windows.includes('*'))
  assert.ok(capability.permissions.includes('core:webview:allow-create-webview-window'))
  assert.ok(capability.permissions.includes('core:window:allow-set-title'))
})

test('closing always goes through the backend and waits for task creation', async t => {
  const events = bus(); const calls = []
  const window = realm('manager-test', events, async command => { calls.push(command) })
  t.after(window.dispose)
  const app = window.load('@/stores/app-store').useAppStore
  window.load('@/hooks/use-app-sync').useAppSync()
  const cleanup = window.effects[0](); t.after(cleanup)
  await tick()
  const close = [...events.listeners].find(item => item.event === 'close-requested').callback
  let prevented = 0
  app.setState({ pendingTaskCreations: 1 })
  close({ preventDefault: () => prevented++ })
  await tick()
  assert.equal(prevented, 1)
  assert.ok(!calls.includes('finish_window_close'))
  app.setState({ pendingTaskCreations: 0 })
  close({ preventDefault: () => prevented++ })
  await tick()
  assert.equal(prevented, 2)
  assert.equal(calls.filter(command => command === 'finish_window_close').length, 1)
})

for (const action of ['pauseUpload', 'cancelUpload']) {
  test(`${action} during creation cannot start a delayed upload`, async t => {
    const creation = deferred(); const calls = []
    const window = realm('main', bus(), async (command, args) => {
      calls.push({ command, args })
      if (command === 'create_task') return creation.promise
    })
    t.after(window.dispose)
    const app = window.load('@/stores/app-store').useAppStore
    const r2 = session('r2'); r2.config.type = 'r2'
    app.getState().setCurrentSession(r2)
    const uploading = app.getState().enqueueUploadsFromPaths(['/synthetic/file.txt'], '')
    await tick()
    const id = app.getState().uploads[0].id
    assert.equal(app.getState().pendingTaskCreations, 1)
    await app.getState()[action](id)
    creation.resolve({ id: 'persistent-task' })
    await uploading
    assert.ok(!calls.some(call => call.command === 'upload_object_with_progress'))
    assert.ok(calls.some(call => call.command === (action === 'pauseUpload' ? 'pause_task' : 'cancel_task') && call.args.taskId === 'persistent-task'))
    assert.equal(app.getState().pendingTaskCreations, 0)
    if (action === 'pauseUpload') assert.equal(app.getState().uploads[0].status, 'paused')
    else assert.equal(app.getState().uploads.length, 0)
  })
}

test('double-clicking resume reserves a task only once', async t => {
  const reservation = deferred(); const calls = []
  const window = realm('main', bus(), async command => {
    calls.push(command)
    if (command === 'prepare_task_resume') return reservation.promise
  })
  t.after(window.dispose)
  const app = window.load('@/stores/app-store').useAppStore
  const first = app.getState().resumeUpload('task')
  const second = app.getState().resumeUpload('task')
  await tick()
  assert.equal(calls.filter(command => command === 'prepare_task_resume').length, 1)
  reservation.resolve({ id: 'task', task_type: { Download: { local_path: '/synthetic/result', remote_key: 'key' } }, session_id: 'session', transferred_size: 0 })
  await Promise.all([first, second])
  assert.equal(calls.filter(command => command === 'download_object_with_progress').length, 1)
})

test('background task state does not overwrite another window’s saved view preference', t => {
  const storage = new Map([['r2browser-storage', JSON.stringify({ state: { viewMode: 'list', sortBy: 'name', sortOrder: 'asc' }, version: 0 })]])
  const first = realm('main', bus(), undefined, storage); const second = realm('manager-test', bus(), undefined, storage)
  t.after(() => { first.dispose(); second.dispose() })
  const a = first.load('@/stores/app-store').useAppStore
  const b = second.load('@/stores/app-store').useAppStore
  a.getState().setViewMode('grid')
  b.setState({ isLoading: true })
  b.getState().setSortOrder('desc')
  const saved = JSON.parse(storage.get('r2browser-storage')).state
  assert.equal(saved.viewMode, 'grid')
  assert.equal(saved.sortOrder, 'desc')
})
