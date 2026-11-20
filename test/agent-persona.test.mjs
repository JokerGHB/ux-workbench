/**
 * 会话身份与会话归属的单元测试。
 *
 * 这一层最关键的两条行为，都必须在这里钉住：
 *   1. 只有属于本工作台的会话才拿到身份段落 —— 否则装了工作台会污染
 *      用户的原生会话。
 *   2. 身份段落是同步返回值 —— 宿主不 await，返回 Promise 等于提示词里
 *      出现一段 `[object Promise]`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 造一个假的 DSH_HOME，里面放一份 desktop-workbenches/state.json。 */
async function fakeHome(bindings) {
  const home = await mkdtemp(join(tmpdir(), 'uxw-persona-'))
  await mkdir(join(home, 'desktop-workbenches'), { recursive: true })
  await writeFile(
    join(home, 'desktop-workbenches', 'state.json'),
    JSON.stringify({ revision: 1, state: { sessionBindings: bindings } })
  )
  return home
}

/** 造一个工作台数据目录，带 instances.json。 */
async function fakeRoot(instances) {
  const root = await mkdtemp(join(tmpdir(), 'uxw-root-'))
  await writeFile(join(root, 'instances.json'), JSON.stringify({ version: 1, instances }))
  return root
}

/** 用临时 DSH_HOME 跑一段断言，结束后还原环境变量。 */
async function withHome(home, fn) {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
}

const assemblyFor = (sessionId) => ({ agent: { session: { id: sessionId } } })

test('属于本工作台的会话拿到身份段落', async () => {
  const home = await fakeHome({ 'session-a': 'jokerghb/ux-workbench' })
  const root = await fakeRoot([
    { id: 'inst-1', name: '演示场', url: 'builtin:demo' },
    { id: 'inst-2', name: '我的项目', projectPath: 'D:/work/demo' }
  ])
  await withHome(home, async () => {
    const { identitySection } = await import('../dsh/agent-persona.mjs')
    // 必须同步：宿主直接取返回值，不 await
    const text = identitySection(root).text(assemblyFor('session-a'))
    assert.equal(typeof text, 'string')
    assert.ok(text.length > 200, '身份段落不能是空的')
    assert.match(text, /找茬工作台/)
    assert.match(text, /ux_run_check/)
    assert.match(text, /ux_save_report/)
    // 项目列表要列出来，否则 AI 还得先问用户有什么
    assert.match(text, /演示场/)
    assert.match(text, /我的项目/)
  })
})

test('旧工作台 id 的会话同样认作本工作台', async () => {
  // 改名换仓库之后，老会话的绑定仍指向旧 id；不认它就会让升级用户丢身份。
  const home = await fakeHome({ 'session-old': 'dsh-workbench/dshuxworkbench' })
  const root = await fakeRoot([])
  await withHome(home, async () => {
    const { identitySection } = await import('../dsh/agent-persona.mjs')
    const text = identitySection(root).text(assemblyFor('session-old'))
    assert.ok(text.includes('找茬工作台'))
  })
})

test('别的会话一个字都不多', async () => {
  const home = await fakeHome({ 'session-other': 'jokerghb/quality-test-workbench' })
  const root = await fakeRoot([{ id: 'inst-1', name: '演示场', url: 'builtin:demo' }])
  await withHome(home, async () => {
    const { identitySection } = await import('../dsh/agent-persona.mjs')
    assert.equal(identitySection(root).text(assemblyFor('session-other')), '')
    // 完全不认识的会话也一样
    assert.equal(identitySection(root).text(assemblyFor('session-nobody')), '')
    // 取不到会话 id 时宁可少渲染，也不能错按
    assert.equal(identitySection(root).text({}), '')
  })
})

test('状态文件读不到时不渲染身份，也不抛错', async () => {
  const missing = await mkdtemp(join(tmpdir(), 'uxw-empty-'))
  const root = await fakeRoot([])
  await withHome(missing, async () => {
    const { identitySection, readBindings } = await import('../dsh/agent-persona.mjs')
    assert.deepEqual(readBindings(), {})
    assert.equal(identitySection(root).text(assemblyFor('session-a')), '')
  })
})

test('instances.json 缺失时身份段落照常成立，只说没有项目', async () => {
  const home = await fakeHome({ 'session-a': 'jokerghb/ux-workbench' })
  const emptyRoot = await mkdtemp(join(tmpdir(), 'uxw-noroot-'))
  await withHome(home, async () => {
    const { identitySection, readInstancesSync } = await import('../dsh/agent-persona.mjs')
    assert.deepEqual(readInstancesSync(emptyRoot), [])
    const text = identitySection(emptyRoot).text(assemblyFor('session-a'))
    assert.match(text, /还没有登记任何项目/)
  })
})

test('半截 JSON 不会让归属判断崩掉', async () => {
  const halfJson = '{"state":{"sessionBind'
  const home = await mkdtemp(join(tmpdir(), 'uxw-broken-'))
  await mkdir(join(home, 'desktop-workbenches'), { recursive: true })
  // 故意写半截：宿主在写状态文件时被读到，就可能出现这种输入
  await writeFile(join(home, 'desktop-workbenches', 'state.json'), halfJson)
  const root = await fakeRoot([])
  await withHome(home, async () => {
    const { identitySection } = await import('../dsh/agent-persona.mjs')
    assert.equal(identitySection(root).text(assemblyFor('session-a')), '')
  })
})