/**
 * /live 代理的地址还原自检。
 *
 * 这里钉住的是两条曾经出过问题的行为：
 *
 *   1. 代理后的 iframe 文档地址是 /api/dsh-ux-workbench/live?u=...，
 *      纯 pathname 路由（按 location.pathname 分支）的应用会拿它当未知路径，
 *      直接渲染自己的 404 页。所以必须把地址还原成目标路径。
 *   2. 注入的脚本必须用绝对地址调 replaceState。相对地址会按 <base> 解析，
 *      而 base 指向项目端口 = 另一个源，浏览器直接抛 SecurityError，
 *      被 catch 吞掉后表现为「脚本注入了但什么都没发生」。这个坑很难从截图看出，
 *      只能靠断言脚本内容钉住。
 *
 * 为什么不用 import 拿到 injectBase：dsh/index.js 在模块顶层引用了
 * @deepseek-ai/dsh-tools / schemastery 等 peer 依赖，仓库里没有装（这些由宿主提供），
 * 直接 import 会 ERR_MODULE_NOT_FOUND。所以这里只把函数所在的代码段取出来求值。
 * 这样测到的仍然是仓库里的真实源码，不是复制品。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'dsh', 'index.js')

/** 从真实源码里取出 injectBase / restoreLocationScript 两段，在隔离上下文里求值。 */
async function loadInjectBase() {
  const text = await readFile(sourcePath, 'utf8')
  const start = text.indexOf('export function injectBase')
  const end = text.indexOf('function normalizeInstance')
  assert.ok(start > 0 && end > start, '源码里应当能找到 injectBase 到 normalizeInstance 这一段')

  const slice = text.slice(start, end).replace('export function injectBase', 'function injectBase')
  const sandbox = { injectBase: null }
  vm.createContext(sandbox)
  vm.runInContext(`${slice}\nthis.injectBase = injectBase`, sandbox)
  return sandbox.injectBase
}

const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'

test('注入 base 指向真实服务，避免相对资源打到代理路由', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase(HTML, 'http://localhost:5174/')
  assert.ok(out.includes('<base href="http://localhost:5174/">'))
})

test('没有 head 标签时 base 仍然注入到最前面', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase('<div>bare</div>', 'http://localhost:5174/')
  assert.ok(out.startsWith('<base href="http://localhost:5174/">'))
})

test('给了还原路径就注入还原脚本，且排在应用入口之前', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase(HTML, 'http://localhost:5174/', '/docs/intro?tab=1')
  assert.ok(out.includes('history.replaceState'))
  // 路径必须原样写进脚本，search 也要带上
  assert.ok(out.includes('"/docs/intro?tab=1"'))
  // 脚本出现在应用挂载点之前，才可能在路由读取前生效
  assert.ok(out.indexOf('history.replaceState') < out.indexOf('<div id="root">'))
})

test('没给还原路径时不注入脚本（静态页与 hash 路由不需要）', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase(HTML, 'http://localhost:5174/')
  assert.ok(!out.includes('history.replaceState'))
})

test('还原脚本用绝对地址，不能是裸相对路径', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase(HTML, 'http://localhost:5174/', '/agents')
  const script = out.match(/<script>\(function\(\)\{[^<]*<\/script>/)
  assert.ok(script, '应当注入一段内联脚本')
  // 必须是 location.origin + "/agents"，否则会被 <base> 解析成跨源地址而抛 SecurityError
  assert.ok(
    script[0].includes('location.origin+"/agents"'),
    `脚本应当拼成绝对地址，实际是：${script[0]}`
  )
})

test('在跨源 base 下还原脚本确实能把地址改对（真实浏览器语义模拟）', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase(HTML, 'http://localhost:5174/', '/docs/intro?tab=1')
  const match = out.match(/<script>(\(function[\s\S]*?\}\)\(\);)<\/script>/)
  assert.ok(match, '应当取到内联脚本')
  const scriptBody = match[1]

  // 模拟：文档在 127.0.0.1:43131，base 指向 localhost:5174（跨源）。
  // 相对路径会按 base 解析成跨源地址 → SecurityError；绝对路径才成功。
  let pathname = '/api/dsh-ux-workbench/live'
  const origin = 'http://127.0.0.1:43131'
  const history = {
    state: null,
    replaceState(_state, _title, url) {
      const resolved = new URL(url, 'http://localhost:5174/') // 故意按 base 解析，还原真实行为
      if (resolved.origin !== origin) {
        const error = new Error('cannot be created in a document with a different origin')
        error.name = 'SecurityError'
        throw error
      }
      pathname = resolved.pathname + resolved.search
    }
  }
  const sandbox = { history, location: { origin }, window: {} }
  vm.createContext(sandbox)
  vm.runInContext(scriptBody, sandbox)

  assert.equal(pathname, '/docs/intro?tab=1')
})

test('路径里的尖括号被转义，不会提前闭合 script 标签', async () => {
  const injectBase = await loadInjectBase()
  const out = injectBase(HTML, 'http://localhost:5174/', '/a</script><img onerror=1>')
  const scriptTags = out.match(/<script>/g) || []
  assert.equal(scriptTags.length, 1, '仍然只有一段注入的脚本')
  assert.ok(out.includes('\\u003c'), '尖括号应转义为 \\u003c')
  // 转义后不应出现真正的闭合标签把内容截断
  const injected = out.slice(out.indexOf('<script>'), out.indexOf('</script>') + 9)
  assert.ok(injected.includes('/a\\u003c/script>'))
})