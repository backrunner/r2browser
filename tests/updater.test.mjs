import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const update = (channel = 'stable') => ({ channel, currentVersion: '1.0.0', version: channel === 'stable' ? '1.1.0' : '1.2.0-beta.1' })

// Exercise the real hook with retained hook slots and controlled IPC completion.
function harness(invoke) {
  let channel = 'stable', index = 0, effects = [], result
  const slots = [], cleanups = []
  const preferences = Object.assign(() => ({ updateChannel: channel }), { getState: () => ({ updateChannel: channel }) })
  const react = {
    useState(initial) {
      const slot = index++
      if (!(slot in slots)) slots[slot] = initial
      return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next }]
    },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial } },
    useCallback: callback => callback,
    useEffect(callback, deps) {
      const slot = index++
      if (!slots[slot] || deps.some((dep, i) => dep !== slots[slot][i])) {
        slots[slot] = deps
        effects.push(() => { cleanups[slot]?.(); cleanups[slot] = callback() })
      }
    },
  }
  const logger = new Proxy({}, { get: () => () => {} })
  const modules = {
    react,
    '@tauri-apps/api/core': { invoke },
    '@tauri-apps/api/webviewWindow': { getCurrentWebviewWindow: () => ({ label: 'main', listen: async () => () => {} }) },
    '../lib/logger': { logger },
    '../stores/app-store': { useAppStore: () => ({ appInfo: { version: '1.0.0' } }) },
    '../stores/preferences-store': { usePreferencesStore: preferences },
  }
  const source = readFileSync(new URL('../src/hooks/use-updater.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'true')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => modules[name], setTimeout, clearTimeout })
  const render = () => { index = 0; result = exports.useUpdater(); const pending = effects; effects = []; pending.forEach(effect => effect()); return result }
  render()
  return { render, setChannel: next => { channel = next; render() }, dispose: () => cleanups.forEach(cleanup => cleanup?.()) }
}

test('late check cannot expose an update after switching channels, even away and back', async t => {
  const pending = deferred()
  const hook = harness(() => pending.promise); t.after(hook.dispose)
  const checking = hook.render().checkForUpdates()
  hook.setChannel('beta'); hook.setChannel('stable')
  pending.resolve(update())
  await checking
  assert.equal(hook.render().status.available, false)
  assert.equal(hook.render().status.checking, false)
})

test('duplicate checks and installs are serialized and ready state survives channel changes', async t => {
  const download = deferred(); let checks = 0, installs = 0
  const hook = harness(async command => {
    if (command === 'check_for_app_update') { checks++; return update() }
    if (command === 'download_and_install_app_update') { installs++; return download.promise }
  }); t.after(hook.dispose)
  const initial = hook.render()
  await Promise.all([initial.checkForUpdates(), initial.checkForUpdates()])
  assert.equal(checks, 1)
  const available = hook.render()
  const installing = available.downloadAndInstall()
  assert.equal(await available.downloadAndInstall(), false)
  assert.equal(installs, 1)
  hook.setChannel('beta')
  assert.equal(hook.render().status.downloading, true)
  download.resolve()
  assert.equal(await installing, true)
  hook.setChannel('stable')
  assert.equal(hook.render().status.readyToInstall, true)
  assert.equal(hook.render().status.latestVersion, '1.1.0')
  await hook.render().checkForUpdates()
  assert.equal(checks, 1, 'an installed update must restart before another check')
})

test('Rust string errors reach the UI and a failed check can be retried', async t => {
  let fail = true
  const hook = harness(async () => { if (fail) throw 'Pause transfers in all windows.'; return update() }); t.after(hook.dispose)
  await hook.render().checkForUpdates()
  assert.equal(hook.render().status.error, 'Pause transfers in all windows.')
  fail = false
  await hook.render().checkForUpdates()
  assert.equal(hook.render().status.available, true)
})
