/**
 * 导览的渲染自检：只验「该不该出现」，以及出现时长什么样。
 *
 * 不启动浏览器，用最小 React 运行时把面板渲成树，再在树上找导览层。
 * 断言的全是用户能看见的东西：有没有那层、第一句说的是什么、
 * 进度写的是几。查 localStorage 的实现细节不在断言范围内 ——
 * 那是手段，不是目的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(root, 'lib', 'client.js')

/* ------------------------------------------------------ 最小 React 运行时 -- */

function createRuntime() {
  let instance = null
  const makeHooks = () => {
    let index = 0
    const store = instance.cells
    return {
      useState(initial) {
        const i = index++
        if (store.length <= i) store.push({ value: typeof initial === 'function' ? initial() : initial })
        const cell = store[i]
        return [cell.value, (next) => {
          const value = typeof next === 'function' ? next(cell.value) : next
          if (Object.is(value, cell.value)) return
          cell.value = value
          instance.dirty = true
        }]
      },
      useRef(initial) { const i = index++; if (store.length <= i) store.push({ current: initial }); return store[i] },
      useCallback(fn, deps) {
        const i = index++
        const cell = store[i]
        if (!cell) { store[i] = { fn, deps }; return fn }
        const same = Array.isArray(deps) && cell.deps && deps.length === cell.deps.length && deps.every((d, k) => Object.is(d, cell.deps[k]))
        if (!same) { cell.fn = fn; cell.deps = deps }
        return cell.fn
      },
      useEffect(fn, deps) {
        const i = index++
        const cell = store[i]
        const same = cell && Array.isArray(deps) && cell.deps && deps.length === cell.deps.length && deps.every((d, k) => Object.is(d, cell.deps[k]))
        if (same) return
        store[i] = { deps }
        instance.effects.push(fn)
      }
    }
  }
  const React = {
    createElement: (type, props, ...children) => ({
      $$el: true,
      type,
      props: props || {},
      children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    }),
    useState: (...a) => instance.hooks.useState(...a),
    useRef: (...a) => instance.hooks.useRef(...a),
    useCallback: (...a) => instance.hooks.useCallback(...a),
    useEffect: (...a) => instance.hooks.useEffect(...a),
    Fragment: 'fragment'
  }
  const render = (Component, props) => {
    if (!instance) instance = { cells: [], effects: [], dirty: false }
    for (let pass = 0; pass < 60; pass++) {
      instance.dirty = false
      instance.hooks = makeHooks()
      instance.tree = Component(props)
      const queued = instance.effects.slice()
      instance.effects = []
      for (const effect of queued) {
        try { effect() } catch { /* effect 里的异步拉取在测试环境会失败，忽略 */ }
      }
      if (!instance.dirty) break
    }
    return instance.tree
  }
  /**
   * 等一个宏任务再重渲。
   *
   * 面板的挂载 effect 里是 async fetch，state 在微/宏任务之后才落下 ——
   * 同步渲一遍看到的永远是「还没有 home」，测不出自动开始导览那条路径。
   * 所以外部要能「等一会儿，再渲一次」。
   */
  const settle = async (Component, props, rounds = 6) => {
    for (let i = 0; i < rounds; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      render(Component, props)
    }
    return instance.tree
  }
  return { React, render, settle }
}

/** 在渲染树上按 className 找节点。 */
function findAll(node, className) {
  const hits = []
  const walk = (el) => {
    if (!el || typeof el !== 'object') return
    if (Array.isArray(el)) { el.forEach(walk); return }
    if (el.props && typeof el.props.className === 'string' &&
        el.props.className.split(/\s+/).includes(className)) hits.push(el)
    ;(el.children || []).forEach(walk)
  }
  walk(node)
  return hits
}

function texts(node) {
  const out = []
  const walk = (el) => {
    if (el == null || el === false) return
    if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return }
    if (Array.isArray(el)) { el.forEach(walk); return }
    ;(el.children || []).forEach(walk)
  }
  walk(node)
  return out
}

/* ---------------------------------------------------------------- 装载 -- */

async function loadPanel({ tourSeen, adopted, homeDismissed }) {
  const src = await readFile(CLIENT, 'utf8')
  // 把整份模块放进一个函数里求值：它只是 window.__ModuleLoader__.load({factory})
  const store = new Map()
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }
  if (tourSeen) localStorage.setItem('uxw.tour.v1', JSON.stringify({ done: true }))

  const window = {
    __ModuleLoader__: { load: ({ factory }) => { exportsObject = factory(require) } },
    localStorage
  }
  const require = (id) => {
    if (id === 'react') return runtime.React
    throw new Error(`unexpected require ${id}`)
  }
  const runtime = createRuntime()
  let exportsObject = null

  // 宿主注入的全局：这里只提供面板初始化必需的几个
  // 模块内部用的是 globalThis.localStorage / globalThis.addEventListener。
  // 直接把 Node 的真 globalThis 传进去，那些调用会绕过下面的假实现，
  // 「已看过就不再弹」这类断言就测不到了。
  const fakeGlobal = {
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail } },
    console
  }

  const sandbox = {
    window,
    document: {
      querySelector: () => null,
      createElement: () => ({ style: {}, dataset: {}, set textContent(v) {}, remove() {} }),
      head: { appendChild() {} }
    },
    globalThis: fakeGlobal,
    localStorage,
    // 按路径回假的接口数据。面板一挂载就会读 home / instances / health，
    // 导览的自动开始条件正建立在 home.adopted 上 —— 不回这个，测的就不是真实路径。
    fetch: async (url) => {
      const path = String(url)
      if (path.endsWith('/home')) {
        return { ok: true, json: async () => ({ path: '/tmp/uxw', available: true, adopted: adopted === true }) }
      }
      if (path.endsWith('/instances')) return { ok: true, json: async () => ({ instances: [] }) }
      if (path.endsWith('/health')) return { ok: true, json: async () => ({ browser: 'chromium' }) }
      return { ok: true, json: async () => ({}) }
    },
    // 用真定时器但 0 延迟：面板里那些 setTimeout(…, 320) 的等待要真的跑起来，
    // 否则导览永远不会被打开，测出来的自然是「没有导览」。
    // 全部 unref：面板里有 2500ms 自我续命的轮询，不 unref 的话
    // 测试跑完进程也不退出（跑到 --test-force-exit 才能收尾）。
    setTimeout: (fn) => { const id = setTimeout(fn, 0); id.unref?.(); return id },
    clearTimeout: (id) => clearTimeout(id),
    requestAnimationFrame: (fn) => { const id = setTimeout(fn, 0); id.unref?.(); return id },
    cancelAnimationFrame: (id) => clearTimeout(id),
    console
  }

  // 用 with 让模块内部的裸 globalThis / window 访问落到 sandbox
  const fn = new Function('window', 'document', 'globalThis', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'require', 'console', src)
  let Panel = null
  const ctx = {
    locale: {
      register: () => {},
      // 测试里不做翻译：直接回 key。断言就看 key ——
      // 「第一步是不是 tourIntro」比「第一步是不是那句中文」更能说明逻辑对不对，
      // 而且文案改写不会让测试变红。
      bind: () => (key) => key
    },
    desktopWorkbenches: { register: (_meta, component) => { Panel = component } },
    effect: (fn) => fn()
  }
  fn(sandbox.window, sandbox.document, sandbox.globalThis, sandbox.localStorage, sandbox.fetch,
    sandbox.setTimeout, sandbox.clearTimeout, sandbox.requestAnimationFrame, sandbox.cancelAnimationFrame,
    require, sandbox.console)
  assert.ok(exportsObject && typeof exportsObject.apply === 'function', '模块应当导出 apply')
  exportsObject.apply(ctx)
  assert.ok(Panel, '应当拿到面板组件')

  // 面板挂载后会 fetch /home 与 /instances；先同步渲一遍让 effect 排队，
  // 再等若干个宏任务把异步 state 落下来 —— 导览是在那之后才打开的。
  runtime.render(Panel, {})
  const tree = await runtime.settle(Panel, {})
  return { tree, Panel, runtime, state: { adopted, homeDismissed } }
}

/* ------------------------------------------------------------------ 断言 -- */

test('第一次打开、文件夹已就绪：导览自动出现', async () => {
  const { tree } = await loadPanel({ tourSeen: false, adopted: true })
  const layers = findAll(tree, 'uxwTour')
  assert.equal(layers.length, 1, '应当出现一层导览')
  const body = texts(layers[0]).join(' ')
  // 第一句是开场白，说明它确实从第 1 步开始，而不是接着上次的停点
  assert.match(body, /tourIntroTitle/, '应当从开场那一步开始')
  assert.match(body, /1 \/ 7/, '进度应当写 1 / 7')
  // 进度点必须画满 7 个。只断言「有一层导览」是不够的 ——
  // 之前正是漏了这条，七步退化成四步也没被发现。
  assert.equal(findAll(layers[0], 'uxwTourDot').length, 7, '进度点应当有 7 个')
})

test('已经看过：不再自动出现', async () => {
  const { tree } = await loadPanel({ tourSeen: true, adopted: true })
  assert.equal(findAll(tree, 'uxwTour').length, 0, '看过之后不该再弹')
})

test('文件夹还没建好：先让位给确认卡', async () => {
  const { tree } = await loadPanel({ tourSeen: false, adopted: false })
  assert.equal(findAll(tree, 'uxwTour').length, 0, 'homeCard 期间不该叠上导览')
})

test('顶栏有重播入口', async () => {
  const { tree } = await loadPanel({ tourSeen: true, adopted: true })
  const replay = findAll(tree, 'uxwToggle')
    .filter((el) => el.props['data-tour'] === 'tour-replay')
  assert.equal(replay.length, 1, '顶栏应当有一枚重播按钮')
  assert.ok(replay[0].props.title, '重播按钮要有 title（图标按钮没有可见文字）')
})

test('导览期间挡住点击（只演示）', async () => {
  const { tree } = await loadPanel({ tourSeen: false, adopted: true })
  const layer = findAll(tree, 'uxwTour')[0]
  assert.equal(findAll(layer, 'uxwTourBlock').length, 1, '必须有拦截层，否则用户可以改状态')
})