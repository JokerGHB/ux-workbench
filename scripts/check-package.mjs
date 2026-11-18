/**
 * Package self-check for the UX test workbench.
 *
 * Verifies the manifest fields the workbench spec marks as mandatory, that every
 * declared entry point exists and parses, and that cordis.patch.yml names this
 * package. Run with `node scripts/check-package.mjs`.
 *
 * 与功能测试工作台的那份是各自独立的副本：两个包必须能分别打包、分别校验，
 * 不共享任何脚本或依赖。
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const notes = []

async function exists(path) {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

function require_(condition, message) {
  if (!condition) problems.push(message)
}

require_(/^(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*$/.test(manifest.name ?? ''), 'package.json name 不是合法 npm 包名')
require_(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(manifest.version ?? ''), 'package.json version 不是完整 SemVer')
require_(manifest.type === 'module', 'package.json 建议声明 "type": "module"')
require_(typeof manifest.main === 'string', 'package.json 缺少 main')
require_(manifest.exports?.['.'] !== undefined, 'package.json 缺少 exports["."]')
require_(manifest.exports?.['./client'] !== undefined, 'package.json 缺少 exports["./client"]')
require_(manifest.dsh?.bundle?.patch !== undefined, 'package.json 缺少 dsh.bundle.patch')
require_(manifest.dsh?.client?.platform === 'web', 'package.json dsh.client.platform 必须是 "web"')
require_(
  Array.isArray(manifest.dsh?.client?.inject) && manifest.dsh.client.inject.includes('dsh-desktop-workbenches'),
  'package.json dsh.client.inject 必须包含 dsh-desktop-workbenches'
)

const declared = [
  ['main', manifest.main],
  ['exports["."]', manifest.exports?.['.']],
  ['exports["./client"]', manifest.exports?.['./client']],
  ['dsh.bundle.patch', manifest.dsh?.bundle?.patch]
]

for (const [label, relative] of declared) {
  if (typeof relative !== 'string') continue
  if (!(await exists(join(root, relative)))) problems.push(`${label} 指向的文件不存在：${relative}`)
}

// files 是白名单：列进去的必须真实存在，否则 npm pack 会静默漏文件。
const files = Array.isArray(manifest.files) ? manifest.files : []
for (const required of ['cordis.patch.yml', 'lib/client.js', 'dsh/index.js', 'dsh/workbench-home.mjs']) {
  if (!files.includes(required)) problems.push(`files 缺少 ${required}`)
}
for (const entry of files) {
  if (!(await exists(join(root, entry)))) problems.push(`files 里列了不存在的文件：${entry}`)
}

const patchPath = join(root, manifest.dsh?.bundle?.patch ?? 'cordis.patch.yml')
if (await exists(patchPath)) {
  const patch = await readFile(patchPath, 'utf8')
  if (!patch.trim()) problems.push('cordis.patch.yml 为空文件，会导致启动失败')
  if (!patch.includes(manifest.name)) problems.push('cordis.patch.yml 未写本包 npm 包名')
  if (!/^\s*-?\s*insert:/m.test(patch)) problems.push('cordis.patch.yml 缺少 insert 行')
} else {
  problems.push('cordis.patch.yml 不存在')
}

const serverEntry = join(root, manifest.exports?.['.'] ?? manifest.main ?? '')
if (await exists(serverEntry)) {
  const source = await readFile(serverEntry, 'utf8')
  for (const token of ['export const name', 'export const inject', 'Schema.object', 'export function apply']) {
    if (!source.includes(token)) problems.push(`服务端入口缺少 ${token}`)
  }
  // 专属文件夹的路由必须登记在服务端入口里，否则界面拿不到状态。
  if (!source.includes('/home')) problems.push('服务端入口未登记 /home 路由')
}

const clientEntry = join(root, manifest.exports?.['./client'] ?? '')
if (await exists(clientEntry)) {
  const source = await readFile(clientEntry, 'utf8')
  if (!source.includes('window.__ModuleLoader__.load(')) problems.push('客户端入口未通过 window.__ModuleLoader__.load 注册')
  if (!source.includes(`'${manifest.name}'`)) notes.push(`客户端模块 id 与包名 ${manifest.name} 不一致（本地身份仍由宿主按包名生成）`)
  if (!source.includes('desktopWorkbenches.register(')) problems.push('客户端入口未调用 desktopWorkbenches.register')
  require_(source.length > 2000, '客户端入口看起来不是已构建的单文件模块')
  // 空态不该再让用户挑工作区，那是会话散落的来源。
  if (source.includes('chatPickWorkspace') && source.includes('uxwChatPick{')) {
    problems.push('客户端仍在渲染工作区下拉框，会话会散落到用户其它工作区')
  }
}

const peerNames = Object.keys(manifest.peerDependencies ?? {})
for (const name of peerNames) {
  require_(!name.startsWith('@deepseek-ai/') || /-rc\.|-alpha\.|-beta\.|>=|\|\|/.test(manifest.peerDependencies[name]), `peerDependencies["${name}"] 需要覆盖预发布版本`)
}

if (problems.length) {
  console.error('包校验未通过：')
  for (const problem of problems) console.error(` ✗ ${problem}`)
  process.exit(1)
}

console.log(`包校验通过：${manifest.name}@${manifest.version}`)
for (const note of notes) console.log(` · ${note}`)