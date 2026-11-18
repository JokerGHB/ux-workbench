/**
 * DSH 找茬工作台 · 本地项目服务
 *
 * 用户给的是「一个项目文件夹」，不是一个网址。要检测它，必须先把它的页面跑起来。
 * 这个模块负责把文件夹变成一个可访问的地址，分两种情形：
 *
 *   1. 有 package.json 且带 dev/start/preview 脚本 —— 起 npm 脚本，等端口就绪；
 *   2. 纯静态目录 —— 直接用一个内置静态服务托管，不必安装任何依赖。
 *
 * 两条约束贯穿全文：
 *   - 只监听 127.0.0.1，不把用户的开发服务暴露到局域网；
 *   - 进程必须能停掉，否则用户关掉工作台，后台还留着几个 node 在跑。
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'

/** 端口从这附近开始找空闲的，避开 vite(5173) 与常见后端端口。 */
const PORT_BASE = 5173
const PORT_TRIES = 40

/** 静态服务的 MIME 表。够覆盖前端项目的常见资源，未知类型按二进制流出去。 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.tsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
}

/** 起一个服务时最多等多久让它响应（毫秒）。Vite 冷启动偶尔要几秒。 */
const READY_TIMEOUT = 45 * 1000

/** 探测端口是否已经有东西在响应。 */
async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.status < 500
  } catch {
    return false
  }
}

/**
 * 找一个当前谁都没在用的端口。
 *
 * 只做「能不能 bind」是不够的：Windows 上允许在已被监听的端口上再次 bind
 * （取决于独占标志），于是会把一个陌生服务当成自己的。更糟的是随后的探活
 * 会被那个陌生服务的响应骗过，报「启动成功」却把别人的页面交给用户。
 * 所以先直接探活：有人响应就跳过。
 */
async function freePort(start) {
  for (let port = start; port < start + PORT_TRIES; port++) {
    // 第一关：已经有人在响应 —— 无论那是谁，都不能用
    if (await probe(`http://127.0.0.1:${port}/`)) continue

    // 第二关：能不能真的 bind 上
    const inUse = await new Promise((settle) => {
      const server = createServer()
      server.once('error', () => settle(true))
      server.once('listening', () => server.close(() => settle(false)))
      server.listen(port, '127.0.0.1')
    })
    if (!inUse) return port
  }
  throw new Error(`从 ${start} 起连续 ${PORT_TRIES} 个端口都被占用了。`)
}

/** 找 Web 根目录时优先看的子目录名，顺序就是优先级。 */
const WEB_DIR_HINTS = ['frontend', 'web', 'client', 'app', 'ui', 'site', 'www', 'demo', 'dist', 'build', 'out', 'public']

/** 这些一级子目录不必去找：不是前端入口，翻了只会拖慢启动。 */
const SKIP_DIRS = new Set([
  'node_modules', 'backend', 'server', 'api', 'e2e', 'test', 'tests', 'coverage', 'scripts', 'migrations', 'docs'
])

async function isDir(target) {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function hasFile(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/** 读 package.json 里能用来起服务的脚本。读不到就是没有。 */
async function readPackage(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    const scripts = pkg.scripts || {}
    // dev 最合适：热更新、不压缩，测出来的就是开发时的样子
    const script = ['dev', 'start', 'preview', 'serve'].find((name) => typeof scripts[name] === 'string') || ''
    return { script, name: pkg.name || '' }
  } catch {
    return null
  }
}

/**
 * 一个目录能不能托管出网页，以什么方式托管。
 * 不能就返回 null —— 调用方靠这个区分「是 Web 项目」和「只是个普通文件夹」。
 */
async function inspectDir(dir) {
  if (!(await isDir(dir))) return null

  const pkg = await readPackage(dir)
  if (pkg && pkg.script) return { mode: 'npm', script: pkg.script, root: dir, name: pkg.name }

  // 静态：先看目录自己的 index.html，再看它的构建产物
  if (await hasFile(join(dir, 'index.html'))) return { mode: 'static', root: dir }
  for (const sub of ['dist', 'build', 'out']) {
    if (await hasFile(join(dir, sub, 'index.html'))) return { mode: 'static', root: join(dir, sub) }
  }
  return null
}

/**
 * 判断一个项目文件夹该怎么跑起来，以及从哪个子目录跑。
 *
 * 只看根目录是不够的：像 crypto-visualizer 这种 frontend/ + backend/ 的结构，
 * 根目录既没有 package.json 也没有 index.html。早先这里会直接退回「静态托管根目录」，
 * 于是把一个空目录当网站托管出去，浏览器拿到 404 —— 而检测还照常跑完并报「未发现缺陷」。
 *
 * 现在的顺序：
 *   1. 根目录自己有 dev 脚本 → 直接用；
 *   2. 子目录里有 dev 脚本 → 用那个子目录（monorepo 的常见形态）；
 *   3. 根目录能静态托管 → 用根目录；
 *   4. 子目录能静态托管 → 用那个子目录；
 *   5. 都没有 → 明说这里没有可打开的网页。
 */
async function detectRunner(projectPath) {
  const root = resolve(projectPath)
  const own = await inspectDir(root)

  // 1. 根目录自带启动脚本：最理想，不要再往下猜
  if (own && own.mode === 'npm') return own

  // 收集候选子目录：常用名字优先，再补上没被覆盖的一级目录
  const candidates = []
  for (const name of WEB_DIR_HINTS) {
    const dir = join(root, name)
    if (await isDir(dir)) candidates.push(dir)
  }
  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const dir = join(root, entry.name)
      if (!candidates.includes(dir)) candidates.push(dir)
    }
  } catch {
    // 读不了子目录不影响根目录那两条判断
  }

  // 2. 子目录里的启动脚本（monorepo：前端在 frontend/ 这类位置）
  for (const dir of candidates) {
    const found = await inspectDir(dir)
    if (found && found.mode === 'npm') {
      return { ...found, note: `前端在 ${basename(dir)}/ 里，用的是 npm run ${found.script}` }
    }
  }

  // 3. 根目录静态托管
  if (own) return own

  // 4. 子目录静态托管（纯静态子目录或已构建的 dist/）
  for (const dir of candidates) {
    const found = await inspectDir(dir)
    if (found) return { ...found, note: `前端在 ${basename(dir)}/ 里` }
  }

  // 5. 没有任何可托管的东西
  throw new Error(
    `这个文件夹里没有可打开的网页：既没有 index.html，也没有带 dev/start/preview 脚本的 package.json。`
    + `如果它不是前端项目（比如只有后端代码），就没有页面可以做体验检测。路径：${root}`
  )
}

/**
 * 静态目录服务。
 *
 * 关键点：路径必须夹在项目根目录内，否则 `../` 就能读到用户机器上任意文件。
 */
function createStaticServer(projectPath) {
  const root = resolve(projectPath)
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      let relative = decodeURIComponent(url.pathname)
      if (relative.endsWith('/')) relative += 'index.html'

      // 拼完再 resolve，然后确认仍在 root 之内 —— 这样 ../ 穿越会落到 root 外而被拒。
      const target = resolve(root, `.${relative}`)
      if (target !== root && !target.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('Forbidden')
        return
      }

      let file = target
      try {
        const info = await stat(file)
        if (info.isDirectory()) file = join(file, 'index.html')
      } catch {
        // 单页应用回退：找不到的路径交给 index.html，由前端路由处理
        const fallback = join(root, 'index.html')
        try {
          await access(fallback)
          file = fallback
        } catch {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          response.end('Not found')
          return
        }
      }

      const info = await stat(file)
      response.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': info.size,
        // 检测要看到最新代码，别让浏览器拿缓存糊弄
        'cache-control': 'no-store'
      })
      createReadStream(file).pipe(response)
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(String(error?.message || error))
    }
  })
  return server
}

/**
 * 创建本地项目服务池。
 *
 * 一个项目对应一个条目：要么是 npm 子进程，要么是内置静态服务。
 * 重复启动同一个项目时复用已有条目，避免端口越占越多。
 */
export function createProjectServers({ log = () => {} } = {}) {
  /** projectPath -> { mode, url, port, script, child?, server?, startedAt } */
  const entries = new Map()

  const stop = async (projectPath) => {
    const entry = entries.get(projectPath)
    if (!entry) return false
    entries.delete(projectPath)
    if (entry.child) {
      // npm 会再拉起一层真正的 dev server，kill 单个进程可能留孤儿，
      // Windows 下用 taskkill 整棵树一起收。
      try {
        if (process.platform === 'win32') {
          // taskkill 是异步的：不 await 就往下走，端口可能还占着，
          // 调用方紧接着的重启会拿到一个「已被占用但没人应答」的端口。
          await new Promise((settle) => {
            const killer = spawn('taskkill', ['/pid', String(entry.child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
            killer.once('exit', () => settle())
            killer.once('error', () => settle())
          })
        } else {
          await new Promise((settle) => {
            entry.child.once('exit', () => settle())
            entry.child.kill('SIGTERM')
            // 兜底：连续不退就强杀，避免 stop 永远挂着
            setTimeout(() => { try { entry.child.kill('SIGKILL') } catch {} settle() }, 3000).unref?.()
          })
        }
      } catch {
        // 进程可能已经自己退了
      }
    }
    if (entry.server) await new Promise((settle) => entry.server.close(() => settle())).catch(() => {})

    // 等到端口真的不再应答再返回：这样「停止后立刻重启」不会撞上残留监听。
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      if (!(await probe(entry.url))) break
      await new Promise((settle) => setTimeout(settle, 150))
    }
    log(`项目服务已停止：${projectPath}`)
    return true
  }

  const stopAll = async () => {
    for (const path of Array.from(entries.keys())) await stop(path)
  }

  /**
   * 启动（或复用）一个项目的页面服务。
   *
   * 返回值里的 url 就是内置浏览器要加载的地址。失败时抛出可读的原因，
   * 让面板能直接显示「为什么打不开」，而不是干等一个空白的 iframe。
   */
  const start = async (projectPath, options = {}) => {
    const root = resolve(projectPath)
    const existing = entries.get(root)
    if (existing) {
      // 之前起来的还在响应就直接复用
      if (await probe(existing.url)) return { ...existing, reused: true }
      await stop(root)
    }

    const info = await detectRunner(root)
    // 实际托管的目录可能不是根目录（前端在 frontend/ 或 dist/ 里），
    // 起服务和静态托管的根都要用它，否则又会托管到一个空目录。
    const serveRoot = info.root || root

    if (info.mode === 'static') {
      const port = await freePort(Number(options.port) || PORT_BASE)
      const url = `http://127.0.0.1:${port}/`
      const server = createStaticServer(serveRoot)
      await new Promise((done, fail) => {
        server.once('error', fail)
        server.listen(port, '127.0.0.1', done)
      })
      const entry = { mode: 'static', url, port, script: '', server, root: serveRoot, startedAt: Date.now() }
      entries.set(root, entry)
      log(`静态服务已启动：${url} → ${serveRoot}`)
      return { ...entry, note: info.note || '' }
    }

    // npm 脚本模式：用固定端口起，Vite 之类的工具支持 --port
    const port = await freePort(Number(options.port) || PORT_BASE)
    const url = `http://127.0.0.1:${port}/`
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npm, ['run', info.script, '--', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: serveRoot,
      env: { ...process.env, BROWSER: 'none', PORT: String(port), HOST: '127.0.0.1' },
      // 不收集 stdout：某些 dev server 写得比读得快，pipe 满了会把它卡死。
      stdio: 'ignore',
      windowsHide: true,
      // npm 在 Windows 上是 .cmd，必须走 shell 才能被 spawn 起来
      shell: process.platform === 'win32'
    })

    const entry = { mode: 'npm', url, port, script: info.script, child, root: serveRoot, startedAt: Date.now() }
    entries.set(root, entry)

    // 等它真的能响应，再交给内置浏览器 —— 否则 iframe 先load出一个连接失败页。
    const deadline = Date.now() + READY_TIMEOUT
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        entries.delete(root)
        throw new Error(`启动脚本 ${info.script} 退出了（退出码 ${child.exitCode}）。请确认依赖已安装、脚本能在 ${serveRoot} 下独立运行。`)
      }
      if (await probe(url)) {
        log(`项目服务已启动：${url}（npm run ${info.script}）`)
        return { ...entry, reused: false }
      }
      await new Promise((settle) => setTimeout(settle, 600))
    }

    await stop(root)
    throw new Error(`等了 ${Math.round(READY_TIMEOUT / 1000)} 秒还没响应。端口 ${port} 上没有服务，请检查 ${info.script} 脚本的输出。`)
  }

  const status = (projectPath) => {
    const entry = entries.get(resolve(projectPath))
    if (!entry) return { running: false, url: '', script: '', port: null }
    return { running: true, url: entry.url, script: entry.script, port: entry.port, mode: entry.mode, root: entry.root }
  }

  return { start, stop, stopAll, status, list: () => Array.from(entries.entries()).map(([path, entry]) => ({ path, ...entry })) }
}

/** 从项目路径推断一个可读名字，用于自动命名「项目那一栏」的条目。 */
export function projectLabel(projectPath) {
  return basename(resolve(projectPath)) || '本地项目'
}