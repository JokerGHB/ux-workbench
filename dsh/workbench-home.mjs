/**
 * 本工作台的专属文件夹。
 *
 * 体验测试工作台需要一块自己独占的磁盘位置：会话的 cwd 和检测产物落在那里，
 * 和别的场景互不干扰。位置固定在系统「文档」目录下的
 * `deepseek-harness/ux-test`，与宿主自己的 default-workspace 同级 —— 宿主
 * 也是用同一个 Documents 解析，这样用户找得到，行为也和宿主一致。
 *
 * 三条硬约束，改动时别破坏：
 *
 * 1. **绝不静默创建。** 目录只在用户点过确认之后才建。宿主的工作台规范
 *    明确禁止插件在默认位置偷偷建目录。
 * 2. **这个文件是体验测试工作台私有的。** 本包不读、不写、不探测任何别的
 *    工作台的目录，也不假设它们存在。单独安装本包就必须完整可用。
 * 3. **服务缺失要降级不能崩。** 旧宿主可能没有 workspaceRegistry；那种情况下
 *    返回 `available: false` 让界面退回「用户自己挑工作区」，而不是启动失败。
 * @module dsh-ux-workbench/workbench-home
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/**
 * 目录叶名。写死、且只在全新首次使用时采用；已经登记过的目录以记录为准，
 * 这样用户后来自己改名（比如改成中文）也能继续用。
 */
export const HOME_DIRECTORY = 'ux-test'

/** 左侧栏显示的名字。与磁盘目录名无关，用户看到的是这个。 */
export const HOME_TITLE = '体验测试'

/** 父目录名，和宿主自己的默认工作区保持同一层级。 */
const PARENT_DIRECTORY = 'deepseek-harness'

/** 记录文件，放在工作台自己的数据目录里，不进用户的文档区。 */
export const HOME_FILE = 'home.json'

const DOCUMENTS_TIMEOUT_MS = 8000

/**
 * 跑一个短命令并取标准输出。
 * @param file 可执行文件。
 * @param args 参数数组。
 * @returns 去掉行尾的 stdout。
 */
function run(file, args) {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { timeout: DOCUMENTS_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error) reject(error)
      else resolvePromise(String(stdout || ''))
    })
  })
}

/**
 * 解析本机的「文档」目录。
 *
 * 不用 `os.homedir() + Documents` 硬拼：Windows 的文档库可能被重定向到 D 盘，
 * macOS 和 Linux 各有自己的查询方式，OneDrive 也会改这个位置。宿主自己就是这么
 * 解析的，这里保持同一套口径。
 * @returns 绝对路径；解析不出来时抛错。
 */
async function systemDocumentsDirectory() {
  if (process.platform === 'win32') {
    const stdout = await run('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); '
      + '[Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments, '
      + '[Environment+SpecialFolderOption]::DoNotVerify)'
    ])
    const path = stdout.replace(/[\r\n]+$/, '').trim()
    if (!path) throw new Error('无法读取系统的「文档」目录。')
    return path
  }
  if (process.platform === 'darwin') {
    const stdout = await run('osascript', [
      '-e', 'POSIX path of (path to documents folder from user domain without folder creation)'
    ])
    const path = stdout.replace(/[\r\n]+$/, '').trim()
    if (!path) throw new Error('无法读取系统的「文档」目录。')
    return path
  }
  const stdout = await run('xdg-user-dir', ['DOCUMENTS'])
  const path = stdout.replace(/[\r\n]+$/, '').trim()
  // Linux 上没配 XDG 时 xdg-user-dir 会回落到家目录，那不是一个真正的「文档」目录。
  if (!path || path === '/') throw new Error('无法读取系统的「文档」目录。')
  return path
}

/**
 * 本工作台默认文件夹的绝对路径。
 * @returns `<Documents>/deepseek-harness/ux-test`。
 */
export async function defaultHomePath() {
  const documents = await systemDocumentsDirectory()
  return join(documents, PARENT_DIRECTORY, HOME_DIRECTORY)
}

/**
 * 判断路径是否存在并说明它是文件还是目录。
 * @param path 绝对路径。
 * @returns `{ exists, isDirectory }`。
 */
async function probePath(path) {
  try {
    const info = await stat(path)
    return { exists: true, isDirectory: info.isDirectory() }
  } catch {
    return { exists: false, isDirectory: false }
  }
}

/**
 * 读记录文件。读不到或坏了都当作「还没认领过」，不阻断后续流程。
 * @param root 工作台数据目录。
 * @returns 记录对象或 null。
 */
export async function readHomeRecord(root) {
  try {
    const parsed = JSON.parse(await readFile(join(root, HOME_FILE), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (typeof parsed.path !== 'string' || !parsed.path.trim()) return null
    return {
      path: resolve(parsed.path),
      workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : '',
      adoptedAt: typeof parsed.adoptedAt === 'string' ? parsed.adoptedAt : ''
    }
  } catch {
    return null
  }
}

/**
 * 把记录写回去。先写临时文件再改名，避免半截文件。
 * @param root 工作台数据目录。
 * @param record 记录对象。
 * @returns Nothing。
 */
async function writeHomeRecord(root, record) {
  const file = join(root, HOME_FILE)
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/**
 * 取宿主的「工作区命令」服务。
 *
 * 必须是 workspaceController，**不是** workspaceRegistry —— 这是踩过的坑：
 *
 * workspaceRegistry.create() 只把目录登记进权威表，不产生任何 RPC 结果。
 * 而左侧列表是客户端的 ClientWorkspaceModel，它的 create() 在拿到 unary
 * 结果后才会 `upsert(result.value.workspace)` 把新行插进列表。直接调
 * registry 的结果就是：磁盘建了、登记表里也有了，但左侧工作区列表里
 * 什么都看不到，用户以为没生效。
 *
 * workspaceController 注册为 remote 命名空间 `workspace`，它的 create()
 * 走的正是 WorkspaceCommands —— 和界面自己点「新建工作区」是同一条路，
 * 所以左侧会立刻出现这个文件夹，也就能在里面新建对话。
 *
 * @param ctx 宿主上下文。
 * @returns 控制器服务，或 null（旧宿主）。
 */
function registryOf(ctx) {
  const lookup = (name) => {
    try {
      return typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name]
    } catch { return undefined }
  }
  // 首选控制器的 create；它才会让界面列表刷新。
  // modern=true 表示 create 收 { path } 且返回 { workspace, created }。
  const controller = lookup('workspaceController')
  if (controller && typeof controller.create === 'function') return { service: controller, modern: true }
  // 退一步才用登记表：至少能建目录和记录，只是列表可能要重开才看得到。
  // 旧登记表 create 收路径字符串、直接返回实体 —— 调用形态必须区分开，
  // 否则回退路径会在 path.split 上炸掉（这条被单元测试抓到过）。
  const registry = lookup('workspaceRegistry')
  if (registry && typeof registry.create === 'function') return { service: registry, modern: false }
  return undefined
}

/**
 * 按路径查这个目录是否已经被登记成工作区。
 *
 * 不能拿 controller 干这事：workspaceController 只暴露 create/rename/delete/
 * follow 等命令，没有 resolveByPath。真正有 resolveByPath 的是更底层的
 * workspaceRegistry。这里单独取它，只在「够不够用得着提示用户」这个只读
 * 判断上用，不参与创建。
 *
 * @param ctx 宿主上下文。
 * @returns 解析函数，或 null。
 */
function pathResolverOf(ctx) {
  const lookup = (name) => {
    try {
      return typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name]
    } catch { return undefined }
  }
  const registry = lookup('workspaceRegistry')
  if (registry && typeof registry.resolveByPath === 'function') {
    return (path) => registry.resolveByPath(path)
  }
  return null
}

/**
 * 报告当前状态，供界面决定要不要让用户确认。
 *
 * 只读，绝不创建目录或登记工作区。
 * @param ctx 宿主上下文。
 * @param root 工作台数据目录。
 * @returns 状态对象。
 */
export async function describeHome(ctx, root) {
  const registry = registryOf(ctx)
  const record = await readHomeRecord(root)

  let suggested = ''
  let suggestionError = ''
  try {
    suggested = record?.path || await defaultHomePath()
  } catch (error) {
    suggestionError = error instanceof Error ? error.message : String(error)
  }

  // OneDrive 等同步盘会拖慢检测产物的写入，也可能造成文件锁冲突。只提醒，不阻止。
  const oneDrive = /onedrive|dropbox|google\s*drive|iCloud/i.test(suggested)

  if (!record) {
    const probe = suggested ? await probePath(suggested) : { exists: false, isDirectory: false }
    return {
      available: Boolean(registry && registry.service),
      adopted: false,
      path: suggested,
      title: HOME_TITLE,
      exists: probe.exists,
      // 目录已存在但没有认领记录：可能是用户自己建的，接管前必须问一句。
      needsConfirmation: probe.exists,
      oneDrive,
      suggestionError,
      reason: registry && registry.service ? '' : '当前版本不支持创建工作区，请手动选择已有文件夹。'
    }
  }

  const probe = await probePath(record.path)
  let registered = false
  const resolvePath = pathResolverOf(ctx)
  if (resolvePath) {
    try {
      const entity = await resolvePath(record.path)
      registered = entity !== undefined
    } catch { /* 路径没了或没登记，都按未登记处理 */ }
  }

  return {
    available: Boolean(registry && registry.service),
    adopted: probe.exists && probe.isDirectory,
    path: record.path,
    title: HOME_TITLE,
    workspaceId: record.workspaceId,
    exists: probe.exists,
    needsConfirmation: false,
    oneDrive,
    // 目录被用户删掉或挪走时要提示重建，而不是静默重新建一个。
    missing: !probe.exists,
    registered,
    reason: registry && registry.service ? '' : '当前版本不支持创建工作区，请手动选择已有文件夹。'
  }
}

/**
 * 认领一个目录：必要时创建它，然后登记成工作区，最后落记录。
 *
 * **只能由用户确认后调用。** 用户取消时不要调用本函数。
 * @param ctx 宿主上下文。
 * @param root 工作台数据目录。
 * @param requested 用户确认过的绝对路径；省略则用默认位置。
 * @returns `{ path, workspaceId, created }`。
 */
export async function adoptHome(ctx, root, requested) {
  const registry = registryOf(ctx)
  if (!registry || !registry.service) throw new Error('当前版本不支持创建工作区，请手动选择已有文件夹。')

  const target = resolve(requested && String(requested).trim() ? String(requested) : await defaultHomePath())

  let created = false
  const before = await probePath(target)
  if (before.exists && !before.isDirectory) throw new Error('这个路径是文件，不是文件夹。')
  if (!before.exists) {
    await mkdir(target, { recursive: true })
    created = true
  }

  // create() 对同一路径是幂等的，重复调用不会产生第二条登记。
  //
  // 两种宿主形态的调用方式不同，必须分开：
  //   workspaceController.create({ path }) → { workspace, created }（现代）
  //   workspaceRegistry.create(path)       → workspace 本体  （旧）
  // 早先统一传对象，回退路径直接 path.split 报错 —— 单元测试抓到的。
  const outcome = registry.modern
    ? await registry.service.create({ path: target })
    : await registry.service.create(target)
  const workspace = outcome && outcome.workspace ? outcome.workspace : outcome
  const workspaceId = String(workspace?.workspaceId || workspace?.id || '')
  const canonical = String(workspace?.path || target)

  await writeHomeRecord(root, {
    path: canonical,
    workspaceId,
    adoptedAt: new Date().toISOString()
  })

  // 标题只在「我们自己新建的默认目录」上补一个中文名。
  //
  // 用户在界面里挑了已有文件夹，那个名字是他自己起的，必须原样保留 ——
  // 强行改成「体验测试」会让人认不出这是自己刚建的那个。宿主 create()
  // 本来就用目录名做默认标题，用户选的目录不需要我们插手。
  if (created && basename(canonical) === HOME_DIRECTORY) {
    try {
      // controller 收 request 对象；旧 registry 收 (id, title)。
      const service = registry.service
      if (workspaceId && workspace?.title !== HOME_TITLE && typeof service.rename === 'function') {
        if (registry.modern) await service.rename({ workspaceId, title: HOME_TITLE })
        else await service.rename(workspaceId, HOME_TITLE)
      }
    } catch { /* 改名失败不影响目录本身 */ }
  }

  return { path: canonical, workspaceId, created }
}

/**
 * 取路径的最后一段。
 * @param path 绝对路径。
 * @returns 目录名。
 */
function basename(path) {
  const parts = String(path).split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || String(path)
}

/**
 * 纯路径推导，供测试使用，不触碰磁盘。
 * @param documents 文档目录。
 * @returns 默认 home 路径。
 */
export function homePathUnder(documents) {
  return join(documents, PARENT_DIRECTORY, HOME_DIRECTORY)
}