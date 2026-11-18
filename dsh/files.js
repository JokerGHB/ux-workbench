/**
 * 项目文件浏览：给面板提供「像 VS Code 一样的文件树 + 文件内容」。
 *
 * 安全边界是这个模块最重要的部分。面板只应该看到用户主动添加的那个项目文件夹，
 * 所以每次读路径都必须经过 confine()：把相对路径解析成绝对路径，再校验它没有
 * 用 `..` 逃出根目录、根目录本身确实是用户登记的文件夹。
 *
 * 不做的事：不跟随符号链接（跳出去就等于绕过边界）、不读超大文件、
 * 不读二进制（没意义且会把界面撑爆）、不列 node_modules 和 .git 这类噪音目录。
 */

import { readFile, readdir, stat, realpath } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, sep } from 'node:path'

/** 列目录时跳过的目录名：它们是产物或元数据，不是用户要看的代码。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.turbo',
  '.venv',
  '__pycache__'
])

/** 单文件读取上限。超过这个尺寸的多半是数据文件或打包产物，展示没有价值。 */
const MAX_FILE_BYTES = 1024 * 1024

/** 单层最多列多少条：防止一个巨大目录把响应撑爆。 */
const MAX_ENTRIES = 500

/** 二进制嗅探只看开头这么多字节。 */
const SNIFF_BYTES = 8000

export class FilesError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'FilesError'
    this.status = status
  }
}

/**
 * 把一个「用户给的相对路径」安全地解析成绝对路径。
 *
 * 三道关：
 *   1. 相对路径不能是绝对路径（否则直接就跳出根目录了）
 *   2. resolve 之后必须仍在根目录内部（挡住 `../..`）
 *   3. 用 realpath 再确认一次（挡住符号链接指向外部）
 */
async function confine(rootPath, relativePath) {
  const root = resolve(rootPath)
  const rel = typeof relativePath === 'string' ? relativePath.trim() : ''

  if (isAbsolute(rel)) {
    throw new FilesError('路径必须是相对项目文件夹的路径。')
  }

  const target = resolve(join(root, rel))
  // 相等表示根目录自身；否则必须带分隔符前缀，避免 `root-evil` 绕过 `root`
  if (target !== root && !target.startsWith(root + sep)) {
    throw new FilesError('这个路径不在项目文件夹里。', 403)
  }

  // 符号链接可能把 target 指到根目录外面，用真实路径复核。
  let realRoot
  let realTarget
  try {
    realRoot = await realpath(root)
    realTarget = await realpath(target)
  } catch {
    throw new FilesError('路径不存在。', 404)
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
    throw new FilesError('这个路径不在项目文件夹里。', 403)
  }

  return { root: realRoot, target: realTarget }
}

/**
 * 判断内容像不像二进制。
 *
 * 只看开头有没有 NUL 字节。这是 git 用的同一套朴素判据，
 * 对代码和文本足够准，也不会误伤带 emoji 的 UTF-8。
 */
function looksBinary(buffer) {
  const stop = Math.min(buffer.length, SNIFF_BYTES)
  for (let i = 0; i < stop; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

/** 给界面用的语言标记，纯粹为了着色和缩略图。 */
function kindOf(name, stats) {
  if (stats.isDirectory()) return 'dir'
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif'].includes(ext)) return 'image'
  if (['.md', '.markdown', '.txt', '.log'].includes(ext)) return 'text'
  if (['.json', '.yml', '.yaml', '.toml', '.ini', '.env'].includes(ext)) return 'config'
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font'
  if (['.zip', '.gz', '.tar', '.7z', '.rar', '.pdf', '.docx', '.xlsx', '.pptx', '.ppt', '.doc', '.xls', '.exe', '.dll', '.node'].includes(ext)) return 'archive'
  return 'code'
}

/**
 * 列一个目录的直接子项（不递归）。
 *
 * 递归交给前端按需展开：一次把整棵树铺开会在大项目上卡很久，
 * 而用户其实只看得到展开的那一层。
 */
export async function listDirectory(rootPath, relativePath = '') {
  if (!rootPath) throw new FilesError('这个项目没有文件夹路径。')
  const { root, target } = await confine(rootPath, relativePath)

  const info = await stat(target)
  if (!info.isDirectory()) throw new FilesError('这个路径不是文件夹。')

  let entries
  try {
    entries = await readdir(target, { withFileTypes: true })
  } catch (error) {
    throw new FilesError(`读不到这个文件夹：${error?.code || error?.message || error}`, 403)
  }

  const items = []
  for (const entry of entries) {
    // 跳过噪音目录。名字以 . 开头的其它文件夹保留（.github、.vscode 用户可能要看）
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    if (SKIP_DIRS.has(entry.name)) continue

    const full = join(target, entry.name)
    let stats
    try {
      stats = await stat(full)
    } catch {
      // 单个条目读不到（权限、竞态删除）不该让整层失败
      continue
    }

    // 符号链接：只认指向根目录内部的。这里不跟随，直接判断类型为 link 并跳过列表，
    // 让它以普通文件的样子出现由前端决定；为了简单可靠，这里直接不列出。
    if (entry.isSymbolicLink()) continue

    items.push({
      name: entry.name,
      path: relative(root, full).split(sep).join('/'),
      dir: stats.isDirectory(),
      size: stats.isDirectory() ? 0 : stats.size,
      kind: kindOf(entry.name, stats),
      // 前端用它决定「这一层要不要显示展开箭头」
      hasChildren: stats.isDirectory()
    })

    if (items.length >= MAX_ENTRIES) break
  }

  // 目录在前，然后按名字排。前端不再操心排序。
  items.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  })

  return { path: relative(root, target).split(sep).join('/'), entries: items }
}

/**
 * 读一个文件的内容。
 *
 * 返回的 text 供界面直接渲染；二进制给出明确的 binary 标记而不是一堆乱码。
 */
export async function readProjectFile(rootPath, relativePath) {
  if (!rootPath) throw new FilesError('这个项目没有文件夹路径。')
  if (!relativePath) throw new FilesError('请指定要打开的文件。')

  const { root, target } = await confine(rootPath, relativePath)
  const info = await stat(target)
  if (info.isDirectory()) throw new FilesError('这是一个文件夹，不是文件。')

  if (info.size > MAX_FILE_BYTES) {
    throw new FilesError(`文件太大（${(info.size / 1024 / 1024).toFixed(1)} MB），不在面板里打开。`, 413)
  }

  const buffer = await readFile(target)

  if (looksBinary(buffer)) {
    return {
      path: relative(root, target).split(sep).join('/'),
      name: target.slice(target.lastIndexOf(sep) + 1),
      size: info.size,
      binary: true,
      text: ''
    }
  }

  // 去掉 UTF-8 BOM：它会在编辑器里显示成一个看不见的怪字符，还会破坏第一行的判断
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')

  return {
    path: relative(root, target).split(sep).join('/'),
    name: target.slice(target.lastIndexOf(sep) + 1),
    size: info.size,
    binary: false,
    text
  }
}