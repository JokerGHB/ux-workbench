/**
 * workbench-home 的行为自检（体验测试工作台）。
 *
 * 不碰真实文档目录：用假 ctx 和临时目录验证，重点检查
 * 「不静默创建」和「记录复用」这两条硬约束。
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  describeHome, adoptHome, readHomeRecord, homePathUnder, HOME_DIRECTORY, HOME_TITLE
} from '../dsh/workbench-home.mjs'

const cleanups = []
async function tempDir(label) {
  const dir = await mkdtemp(join(tmpdir(), `uxw-home-${label}-`))
  cleanups.push(dir)
  return dir
}

/** 假的工作区登记表，行为对齐宿主 WorkspaceRegistry 的可观测契约。 */
function fakeRegistry() {
  const entities = new Map()
  let counter = 0
  return {
    entities,
    async create(path) {
      for (const entity of entities.values()) if (entity.path === path) return entity
      const entity = { workspaceId: `ws-${++counter}`, path, title: path.split(/[\\/]/).pop(), sessionIds: [] }
      entities.set(entity.workspaceId, entity)
      return entity
    },
    async resolveByPath(path) {
      for (const entity of entities.values()) if (entity.path === path) return entity
      return undefined
    },
    async rename(workspaceId, title) {
      const entity = entities.get(workspaceId)
      if (entity) entity.title = title
      return entity
    }
  }
}

function fakeCtx(registry) {
  return { get: (name) => (name === 'workspaceRegistry' ? registry : undefined) }
}

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

async function main() {
  // 1. 目录名与层级
  assert.equal(HOME_DIRECTORY, 'ux-test')
  assert.equal(
    homePathUnder('/Users/x/Documents').endsWith(join('deepseek-harness', 'ux-test')),
    true,
    '默认路径层级不对'
  )
  // 两个工作台必须落在不同的目录：这是「独立」的最低要求。
  assert.notEqual(HOME_DIRECTORY, 'functional-test', '不能和功能测试工作台共用目录')

  const root = await tempDir('data')
  const target = await tempDir('home')
  const homePath = join(target, 'ux-test')
  const registry = fakeRegistry()
  const ctx = fakeCtx(registry)

  // 2. 没有记录时不建目录、不登记
  const before = await describeHome(ctx, root)
  assert.equal(before.adopted, false)
  assert.equal(await exists(homePath), false, 'describeHome 不该创建目录')
  assert.equal(registry.entities.size, 0, 'describeHome 不该登记工作区')

  // 3. 认领
  const adopted = await adoptHome(ctx, root, homePath)
  assert.equal(adopted.created, true)
  assert.equal((await stat(homePath)).isDirectory(), true)
  assert.equal(adopted.workspaceId, 'ws-1')
  const record = await readHomeRecord(root)
  assert.equal(record.path, homePath)
  assert.equal(record.workspaceId, 'ws-1')

  // 4. 标题被改成中文
  assert.equal(registry.entities.get('ws-1').title, HOME_TITLE)

  // 5. 复用
  const after = await describeHome(ctx, root)
  assert.equal(after.adopted, true)
  assert.equal(after.needsConfirmation, false)
  assert.equal(after.registered, true)

  // 6. 幂等
  const again = await adoptHome(ctx, root, homePath)
  assert.equal(again.created, false)
  assert.equal(registry.entities.size, 1)

  // 7. 目录消失：报 missing，不静默重建
  await rm(homePath, { recursive: true, force: true })
  const gone = await describeHome(ctx, root)
  assert.equal(gone.missing, true)
  assert.equal(gone.adopted, false)
  assert.equal(await exists(homePath), false)

  // 8. 目标是文件：拒绝
  const filePath = join(target, 'a-file')
  await writeFile(filePath, 'x', 'utf8')
  await assert.rejects(() => adoptHome(ctx, root, filePath), /不是文件夹/)

  // 9. 旧宿主：降级不崩
  const degraded = await describeHome(fakeCtx(null), root)
  assert.equal(degraded.available, false)
  assert.match(degraded.reason, /不支持创建工作区/)
  await assert.rejects(() => adoptHome(fakeCtx(null), root, homePath), /不支持创建工作区/)

  // 10. 记录损坏：当作未认领
  await writeFile(join(root, 'home.json'), '{ 坏掉的', 'utf8')
  const corrupted = await describeHome(ctx, root)
  assert.equal(corrupted.adopted, false)

  console.log('ux workbench-home 自检通过')
}

try {
  await main()
} finally {
  for (const dir of cleanups) await rm(dir, { recursive: true, force: true }).catch(() => {})
}