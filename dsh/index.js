/**
 * 找茬工作台 · 服务端入口
 *
 * 职责：
 *   1. 托管内置演示页（/api/dsh-ux-workbench/demo/）
 *   2. 提供工作台实例、模板、运行记录的本机接口
 *   3. 用 playwright-core 驱动本机浏览器执行检测
 *   4. 向 Agent 注册体验检测工具
 *
 * 按工作台开发规范：
 *   - 路由全部登记在本插件自己的 /api/<id>/ 前缀下
 *   - 所有路径段匹配 [A-Za-z0-9_$.-]，不含非 ASCII
 *   - 任何登记失败只记录不上抛（异步链抛错会升级成 fatal load failure）
 *   - 业务数据写在 dshHomePath('ux-workbench')，卸载不删用户数据
 */
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve, isAbsolute, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import {
  DETECTORS,
  detectBrowser,
  runChecks,
  decideDetectors,
  describePlan
} from './engine.js'
import {
  detectThemeCapability,
  discoverStates,
  expandAndScan,
  suggestViewports
} from './explore.js'
import { createPreviewPool } from './preview.js'
import { explainBrowserError } from './errors.js'
import { RunAborted, createCheckpoint, createShouldStop } from './cancel.js'
import { createProjectServers, projectLabel } from './project.js'
import { listDirectory, readProjectFile, FilesError } from './files.js'
import { SAMPLE_INSTANCES } from './templates.js'
import { describeHome, adoptHome, readHomeRecord } from './workbench-home.mjs'
import { identitySection } from './agent-persona.mjs'

export const name = 'dsh-ux-workbench'
export const inject = ['connection', 'tools', 'systemPrompt']
export const Config = Schema.object({
  root: Schema.string().required()
})

const API = '/api/dsh-ux-workbench'
const HERE = dirname(fileURLToPath(import.meta.url))
const DEMO_FILE = join(HERE, 'demo.html')

/** 随包下发的技能：文件在 skills/ux-experience-check/SKILL.md。 */
const SKILL_FILE = join(HERE, '..', 'skills', 'ux-experience-check', 'SKILL.md')
const SKILL_DESCRIPTION = '在找茬工作台里做一次真实的体验检测并给出可执行结论。当用户要求测试、检查、扫描、审计一个网页或本地项目，反馈文字溢出、暗色没适配、按钮太小、点着不跟手、对比度低、键盘看不见焦点，或想复用上次的检测结论时使用。'
const SKILL_WHEN_TO_USE = '用户说「测一下这个页面」「检查我的项目」「这个按钮文字溢出了」，或者需要一个页面在亮暗/多视口/展开状态下是否可用的结论。'

/**
 * 读技能正文。
 *
 * 读不到就返回空串（技能不登记），而不是抛错 —— 打包漏了文件不该让整个
 * 工作台装不上。frontmatter 由宿主解析，这里只去掉它再交给 register。
 */
function readSkillMarkdown() {
  try {
    return readFileSync(SKILL_FILE, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
  } catch {
    return ''
  }
}

const MAX_BODY_BYTES = 4 * 1024 * 1024
const INSTANCES_FILE = 'instances.json'
const RUNS_DIR = 'runs'

/**
 * 产物目录名。
 *
 * 按宿主（EasyWork）的规则，工作台产生的东西应该落在**用户自己选的那个
 * 项目文件夹里**，而不是 AppData 深处 —— 内置的质量检测工作台就是这么做的：
 * 它的 state.json 里记着 `docs/test-report.md`，那个文件确实在项目目录内。
 *
 * 用点前缀是为了不干扰用户的项目文件，也不会被 git status 当成源码。
 */
const ARTIFACT_DIR = '.ux-workbench'

const MAX_RUNS = 60

/**
 * 结论报告目录名（在 .ux-workbench 下，和 runs 并列）。
 *
 * 「检测结果」和「这次测试说明了什么」是两件事：引擎只能给出测量事实，
 * 判断和修法是 AI 写的。结论单独存一份，用户切走再回来还在。
 */
const REPORTS_DIR = 'reports'

/** 结论报告条数上限：和运行记录同一个量级，再老的就该归档了。 */
const MAX_REPORTS = 60

/** 内置示例实例的 id：始终受删除保护，不依赖落盘时是否写过 builtin 标记。 */
const SAMPLE_IDS = new Set(SAMPLE_INSTANCES.map((item) => item.id))

class WorkbenchError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

/* ------------------------------------------------------------------ 存储 -- */

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/** 清理上次强制关闭留下的临时文件。 */
async function sweepTemporaries(root) {
  for (const directory of [root, join(root, RUNS_DIR)]) {
    let entries = []
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.tmp-\d+-\d+$/.test(entry.name)) continue
      const file = join(directory, entry.name)
      try {
        const info = await stat(file)
        if (Date.now() - info.mtimeMs < 10 * 60 * 1000) continue
        await unlink(file)
      } catch {
        // 清不掉不影响启动
      }
    }
  }
}

function sanitizeId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : null
}

function sanitizeName(value, fallback = '未命名工作台') {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return fallback
  return text.slice(0, 120)
}

function sanitizeUrl(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === 'builtin:demo') return text
  if (!text) throw new WorkbenchError('请填写要检测的页面地址。')
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new WorkbenchError('页面地址不是合法 URL。')
  }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
    throw new WorkbenchError('只支持 http / https / file 地址。')
  }
  return text
}

function normalizeDetectors(input) {
  // null / 空数组 = 交给引擎自动决定（见 engine.js decideDetectors）
  if (input === null) return null
  if (!Array.isArray(input) || input.length === 0) return null
  return input
    .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    .filter((item) => Boolean(DETECTORS[item.id]))
    .map((item) => ({
      id: item.id,
      enabled: item.enabled !== false,
      options: item.options && typeof item.options === 'object' ? { ...item.options } : {}
    }))
}

function normalizeViewports(input) {
  // 空数组 = 由引擎按页面响应式能力自动决定
  const list = Array.isArray(input) ? input : []
  const cleaned = list
    .filter((item) => item && Number.isFinite(Number(item.width)) && Number.isFinite(Number(item.height)))
    .map((item) => ({
      label: sanitizeName(item.label, '视口'),
      width: Math.min(3840, Math.max(240, Math.round(Number(item.width)))),
      height: Math.min(2400, Math.max(240, Math.round(Number(item.height))))
    }))
  return cleaned.length ? cleaned : []
}

function normalizeThemes(input) {
  // null / 空数组 = 由引擎探测页面是否支持暗色
  if (input === null) return null
  const list = Array.isArray(input) ? input : []
  const cleaned = list.filter((item) => item === 'light' || item === 'dark')
  return cleaned.length ? Array.from(new Set(cleaned)) : null
}

/**
 * 校验一个本地项目文件夹。
 *
 * 只做形状校验（绝对路径、确实是个目录），不要求它一定是个 Web 项目 ——
 * 是纯静态页、Vite、还是 Next 都允许，具体怎么起服务交给 project-server 探测。
 */
function sanitizeProjectPath(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  if (!isAbsolute(text)) throw new WorkbenchError('项目文件夹需要是绝对路径。')
  return resolve(text)
}

/**
 * 给一段 HTML 注入 <base>，让页面里的相对资源仍然指向真实服务。
 *
 * 内置浏览器是通过 /live 转发的，文档地址变成了工作台自己；
 * 若不注入 base，页面里的 /app.js、./main.css 会打到转发路由上，全部 404。
 */
export function injectBase(html, href, restorePath = '') {
  const tag = `<base href="${href}">${restorePath ? restoreLocationScript(restorePath) : ''}`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`)
  return tag + html
}

/**
 * 把 iframe 文档地址上的 pathname 还原成「用户真正想打开的那条路径」。
 *
 * /live 代理让文档同源（这是能操作 iframe DOM 的前提），代价是文档地址变成了
 * /api/dsh-ux-workbench/live?u=...。对 hash 路由或静态页没影响，但纯 pathname
 * 路由（按 location.pathname 分支渲染）的应用会把它当成未知路径，直接渲染 404 页。
 *
 * 所以在应用脚本执行之前，同步把地址改回目标路径：replaceState 同源可用、
 * 不触发导航、不发 popstate，页面照常启动，路由读到的就是正确路径。
 * base 已在前面解析完成（且是绝对地址），改地址不影响相对资源解析。
 *
 * 注意 path 必须以 "/" 开头（调用方传的是 URL 的 pathname + search），
 * 拼到 location.origin 后面才是合法绝对地址。
 */
function restoreLocationScript(path) {
  const literal = JSON.stringify(path).replace(/</g, '\\u003c')
  // 必须拼成绝对地址再交给 replaceState：传相对路径时浏览器按 <base> 解析，
  // 而 base 指向项目端口——那是另一个源，会直接抛 SecurityError，
  // 又被 catch 吞掉，看起来「脚本明明注入了却毫无作用」。
  // 用 location.origin 拼出来就一定落在文档自己的源上。
  return `<script>(function(){try{history.replaceState(history.state,"",location.origin+${literal})}catch(e){}})();</script>`
}

function normalizeInstance(input, existing = null) {
  if (!input || typeof input !== 'object') throw new WorkbenchError('工作台实例数据不合法。')
  const id = existing?.id || sanitizeId(input.id) || `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  // 有项目文件夹时，网址允许为空 —— 由本地服务启动后回填。
  const projectPath = input.projectPath !== undefined
    ? sanitizeProjectPath(input.projectPath)
    : (existing?.projectPath || '')
  const rawUrl = input.url !== undefined ? input.url : existing?.url
  let url
  if (rawUrl === 'builtin:demo') url = 'builtin:demo'
  else if (rawUrl === undefined || rawUrl === null || rawUrl === '') url = projectPath ? '' : sanitizeUrl(rawUrl)
  else url = sanitizeUrl(rawUrl)
  return {
    id,
    name: sanitizeName(input.name, existing?.name || '未命名工作台'),
    url,
    projectPath,
    // 本地服务端口与启动脚本：由 project-server 探测后记录，重开面板时能直接复用。
    devServer: input.devServer && typeof input.devServer === 'object'
      ? {
        running: input.devServer.running === true,
        url: typeof input.devServer.url === 'string' ? input.devServer.url.slice(0, 400) : '',
        script: typeof input.devServer.script === 'string' ? input.devServer.script.slice(0, 60) : '',
        port: Number.isFinite(Number(input.devServer.port)) ? Number(input.devServer.port) : null
      }
      : (existing?.devServer || null),
    description: typeof input.description === 'string' ? input.description.slice(0, 400) : (existing?.description || ''),
    detectors: normalizeDetectors(input.detectors !== undefined ? input.detectors : existing?.detectors),
    viewports: normalizeViewports(input.viewports !== undefined ? input.viewports : existing?.viewports),
    themes: normalizeThemes(input.themes !== undefined ? input.themes : existing?.themes),
    builtin: existing?.builtin === true || SAMPLE_IDS.has(id),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

/* -------------------------------------------------------------- 任务调度 -- */

/** 运行中的任务：id -> { status, progress, run, startedAt } */
const jobs = new Map()

function pruneJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && job.finishedAt && job.finishedAt < cutoff) jobs.delete(id)
  }
}

/**
 * 找出「同一个目标正在跑」的那个任务。
 *
 * 为什么必须有这层：并发起跑不是幂等操作 —— 两个任务会各自开一个浏览器、
 * 各自扫一遍同一个页面，跑完各自落一条运行记录。用户看到的是「点一次测了两遍」，
 * 历史里躺着几条几乎一模一样的报告，而总耗时并没有变短（只是把负载叠在一起）。
 *
 * 目标身份用「实例 id」或「网址」来判：直接输入网址的临时检测没有实例 id，
 * 但同一个网址显然不该同时在跑两份。
 */
function findRunningJob(target) {
  const key = target?.id ? `inst:${target.id}` : `url:${target?.url || ''}`
  if (!key || key === 'url:') return null
  for (const job of jobs.values()) {
    if (job.status !== 'running') continue
    const jobKey = job.instanceId ? `inst:${job.instanceId}` : `url:${job.url || ''}`
    if (jobKey === key) return job
  }
  return null
}

/* ---------------------------------------------------------------- 执行器 -- */

/**
 * 从两个时间戳算一次检测的耗时（毫秒）。
 *
 * 返回 null 而不是 0：0ms 是「瞬间完成」这个有意义的事实，和「算不出来」必须区分开。
 * 旧记录没有 durationMs 字段，靠这个函数现场补算，列表里才不会出现一列空白。
 */
function elapsedOf(run) {
  if (Number.isFinite(run?.durationMs)) return run.durationMs
  const start = new Date(run?.startedAt || 0).getTime()
  const end = new Date(run?.finishedAt || 0).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || !start || !end) return null
  const delta = end - start
  return delta >= 0 ? delta : null
}

/**
 * 跑一次完整检测。
 *
 * 用户只需要给一个网址。执行流程：
 *   1. 打开页面，探测它到底支持哪些主题（不支持暗色就不测暗色）
 *   2. 根据实际能力决定要跑哪些检测器
 *   3. 根据响应式能力决定跑哪些视口
 *   4. 每个视口 × 主题下：先扫首屏，再自动展开可交互状态逐个扫
 *
 * 用户配置（instance.detectors / viewports / themes）只有在显式指定时才覆盖自动决策，
 * 留空即交给引擎 —— 这样「有的项目有夜间模式、有的没有」能自然处理。
 *
 * 传了 signal 就变成可中断的：每个耗时环节的开头都会过一次检查点，
 * 被叫停时抛 RunAborted，由收尾逻辑把已有结果整理好带走（见 cancel.js）。
 */
async function executeRun(instance, browserInfo, { chromium, signal } = {}, onProgress = () => {}) {
  const checkpoint = createCheckpoint(signal)
  const shouldStop = createShouldStop(signal)

  const run = {
    id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    instanceId: instance.id,
    instanceName: instance.name,
    url: instance.url,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: false,
    // 页面根本没打开（网址错、服务没起、返回 4xx/5xx）。
    // 这类结果不能进历史：一条「0 处缺陷」的记录会被读成「测过了，没问题」，
    // 而实际上一个像素都没测。blocked 的记录只在当次对话/面板里报错，不落盘。
    blocked: false,
    error: null,
    browser: browserInfo ? browserInfo.channel : null,
    combinations: [],
    issues: [],
    plan: null,
    exploration: null,
    summary: { error: 0, warn: 0, total: 0, ran: [], skipped: [] }
  }

  const browser = await chromium.launch({
    executablePath: browserInfo?.executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })

  try {
    const url = instance.url === 'builtin:demo'
      ? `file:///${DEMO_FILE.replace(/\\/g, '/')}`
      : instance.url

    /* ---- 第 1 步：探测页面能力（用一个临时上下文，不污染后续测量） ---- */

    checkpoint()
    onProgress({ phase: '探测页面能力' })
    let capability = { supportsDark: false, signal: 'none', toggles: [] }
    let viewports = instance.viewports
    let discovered = 0

    {
      const probeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const probePage = await probeContext.newPage()
      try {
        const probeResponse = await probePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        // 和正式检测里同样的判断：4xx/5xx 是「页面没正常打开」，不是「页面没问题」。
        // 这一步更早，拦住它就不会拿一个错误页去推断主题、视口和交互控件。
        const probeStatus = probeResponse ? probeResponse.status() : 0
        if (probeStatus >= 400) {
          throw new Error(`页面返回 HTTP ${probeStatus}（${url}）`)
        }
        await probePage.waitForTimeout(400)
        capability = await detectThemeCapability(probePage)
        if (!viewports || viewports.length === 0) {
          viewports = await suggestViewports(probePage, null)
        }
        const states = await discoverStates(probePage, 12)
        discovered = states.length
      } catch (error) {
        // 原始报文是「page.goto: net::ERR_... + Call log + 调用栈」，太吵。
        // 只留一句人话，地址单独说明，具体怎么办放在建议里。
        const explained = explainBrowserError(error, { url })
        run.error = `无法打开页面：${explained.reason}${explained.url ? `（${explained.url}）` : ''}。${explained.hint}`
      } finally {
        await probeContext.close().catch(() => {})
      }
    }

    if (run.error) {
      run.ok = false
      // 标记成「被阻断」：收尾时据此判定这次不算一次检测，不写进历史。
      run.blocked = true
      return run
    }

    /* ---- 第 2 步：自动决定测什么 ---- */

    const detectors = instance.detectors && instance.detectors.length
      ? instance.detectors
      : decideDetectors(capability, discovered)
    const themes = instance.themes && instance.themes.length
      ? instance.themes
      : (capability.supportsDark ? ['light', 'dark'] : ['light'])

    run.plan = {
      themeCapability: capability.signal,
      supportsDark: capability.supportsDark,
      themes,
      viewports,
      detectors: detectors.filter((d) => d.enabled).map((d) => d.id),
      discoveredStates: discovered,
      summary: describePlan(capability, viewports, discovered)
    }

    /* ---- 第 3 步：视口 × 主题 矩阵 ---- */

    for (const viewport of viewports) {
      for (const theme of themes) {
        // 每个「视口 × 主题」组合开头停一次：一次检测可能跑好几分钟，
        // 用户叫停后不该等剩下几个组合全跑完。
        checkpoint()

        const combo = {
          label: `${viewport.label} · ${theme === 'dark' ? '暗色' : '亮色'}`,
          viewport,
          theme,
          issues: [],
          states: [],
          ran: [],
          skipped: [],
          error: null
        }

        onProgress({ phase: `检测 ${combo.label}`, viewport: viewport.label, theme })

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: theme,
          deviceScaleFactor: 1
        })
        const page = await context.newPage()

        try {
          // builtin 演示页用查询参数强制主题
          const target = instance.url === 'builtin:demo' ? `${url}?theme=${theme}` : url
          const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 })
          // HTTP 4xx/5xx 不会让 goto 抛错 —— 页面「加载成功」了，只是内容是错误页。
          // 不拦住的话，接下来扫的是一个空白的 404 页，结论会变成「未发现缺陷」，
          // 把「站点没起来」谎报成「页面没问题」，这比不测更糟。
          const status = response ? response.status() : 0
          if (status >= 400) {
            // 用普通 Error 而不是 RunAborted：后者代表「用户叫停」，
            // 收尾时会把 message 丢掉（job.error = null），原因就看不到了。
            throw new Error(`页面返回 HTTP ${status}（${target}）。这不是「没有缺陷」，是页面没正常打开：本地服务可能没起来，或地址已经失效。先在面板里确认预览能打开，再重新检测。`)
          }
          await page.waitForTimeout(350)
          await page.emulateMedia({ colorScheme: theme })

          // 首屏
          const base = await runChecks(page, detectors, { theme, state: '首屏' })
          combo.issues = base.issues
          combo.ran = base.ran
          combo.skipped = base.skipped
          combo.states.push({ label: '首屏', issueCount: base.issues.length })

          // 自动展开状态，每个新状态再扫一遍。
          // 传入首屏缺陷身份作为基线：交互后重测到的那批「本来就有的问题」不算新发现，
          // 否则一个元素会在几十个动作下各记一条，报告又涨回几百。
          const baseline = new Set(base.issues.map((issue) => `${issue.kind}::${issue.target || issue.title}`))
          const expanded = await expandAndScan(
            page,
            detectors,
            async (targetPage, detectorsIn, context_) => runChecks(targetPage, detectorsIn, { theme, ...context_ }),
            {
              maxExplorations: 12,
              baseline,
              // 让展开循环自己知道该停了 —— 否则一次展开最多要跑 12 个控件，
              // 每个都真的在点页面，等它自然结束要好几十秒。
              shouldStop,
              onProgress: (index, total, state) => {
                onProgress({ phase: `检测 ${combo.label} · 展开 ${index}/${total} ${state.label}`, viewport: viewport.label, theme })
              }
            }
          )

          // 展开被叫停时，把这一轮已经发现的东西留下再抛出去，
          // 否则用户点停止会丢掉已经跑出来的结果。
          for (const issue of expanded.findings) {
            combo.issues.push(issue)
          }
          for (const visited of expanded.visited) {
            combo.states.push({ label: visited.label, kind: visited.kind, issueCount: expanded.findings.filter((f) => f.state === visited.label).length })
          }
          combo.explored = expanded.visited.length

          checkpoint()
        } catch (error) {
          // 停止不是错误：把这一轮已有的结果留下，然后原样抛给上层收尾。
          if (error instanceof RunAborted) {
            for (const issue of combo.issues) {
              issue.combination = combo.label
              run.issues.push(issue)
            }
            run.combinations.push({
              label: combo.label,
              viewport: combo.viewport,
              theme: combo.theme,
              issueCount: combo.issues.length,
              explored: combo.explored || 0,
              states: combo.states,
              ran: combo.ran || [],
              skipped: combo.skipped || [],
              error: null
            })
            throw error
          }
          const explained = explainBrowserError(error, { url })
          combo.error = `页面加载或检测失败：${explained.reason}${explained.url ? `（${explained.url}）` : ''}。${explained.hint}`
        } finally {
          await context.close().catch(() => {})
        }

        for (const issue of combo.issues) {
          issue.combination = combo.label
          run.issues.push(issue)
        }
        run.combinations.push({
          label: combo.label,
          viewport: combo.viewport,
          theme: combo.theme,
          issueCount: combo.issues.length,
          explored: combo.explored || 0,
          states: combo.states,
          ran: combo.ran || [],
          skipped: combo.skipped || [],
          error: combo.error
        })
      }
    }

    // 每个组合都失败了，也等于什么都没测到。这种情况如果照常收尾成 ok，
    // 报告会是一份「0 处缺陷」—— 和页面打不开是同一个谎，所以同样算阻断。
    const allFailed = run.combinations.length > 0 && run.combinations.every((combo) => combo.error)
    if (allFailed) {
      run.ok = false
      run.blocked = true
      run.error = run.combinations[0].error || '每个视口与主题组合都失败了。'
      return run
    }

    run.ok = true
  } catch (error) {
    if (error instanceof RunAborted) {
      // 用户主动停止：不是失败。已完成的那部分组合照常收进报告，
      // 让用户能看到「跑到一半已经发现了什么」。
      run.aborted = true
      run.error = null
      run.ok = false
    } else {
      // 走到这里的多半是浏览器自己起不来、或某一轮彻底崩了。
      // 同样不要直接把原始报文丢给用户。
      const explained = explainBrowserError(error, { url: typeof url === 'string' ? url : '' })
      run.error = `检测没能完成：${explained.reason}${explained.url ? `（${explained.url}）` : ''}。${explained.hint}`
    }
  } finally {
    await browser.close().catch(() => {})
    run.finishedAt = new Date().toISOString()
    // 耗时直接落盘：历史列表和详情都要显示它，
    // 每次读取再按两个时间戳算一遍既容易忘、也可能被时区/空值坑到。
    run.durationMs = elapsedOf(run)
  }

  // 同一元素上的同一类问题只留一条。
  //
  // 早先的键里带着 state 和 combination，于是「一个 118×36 的按钮点击热区偏小」
  // 这件事在 32 个交互动作 × 视口 × 主题下各记一条，一个演示页就攒出 432 条，
  // 其中 330 条来自 10 个元素。用户看到的是「几百处缺陷」，实际要改的只有 15 个。
  // 状态与组合不该改变「有几个东西要修」，它们只是证据 —— 收进 hits 里备查。
  const deduped = new Map()
  for (const issue of run.issues) {
    // 没有可定位目标的（例如动画掉帧）用标题当身份，避免全部并成一条
    const identity = issue.target || `${issue.kind}::${issue.title}`
    const key = `${issue.kind}::${identity}`
    const seen = deduped.get(key)
    if (!seen) {
      deduped.set(key, {
        ...issue,
        hits: 1,
        combinations: issue.combination ? [issue.combination] : [],
        states: issue.state ? [issue.state] : []
      })
      continue
    }
    seen.hits += 1
    // 严重程度的取舍：只要命中过 error，这个元素就算严重
    if (issue.severity === 'error') seen.severity = 'error'
    if (!seen.rect && issue.rect) seen.rect = issue.rect
    if (issue.combination && !seen.combinations.includes(issue.combination)) seen.combinations.push(issue.combination)
    if (issue.state && !seen.states.includes(issue.state)) seen.states.push(issue.state)
  }
  run.issues = Array.from(deduped.values())

  // 计数报「要修几处」，而不是「命中了多少次测量」。
  // 命中次数单独放进 hits，让想看覆盖面的人仍能查到。
  run.summary.total = run.issues.length
  run.summary.error = run.issues.filter((item) => item.severity === 'error').length
  run.summary.warn = run.issues.filter((item) => item.severity === 'warn').length
  run.summary.hits = run.issues.reduce((sum, item) => sum + (item.hits || 1), 0)
  // places 是显式别名：历史列表只有 summary，没有 issues 明细，
  // 得有个自解释的字段告诉它「这里存的是要修几处」。
  run.summary.places = run.summary.total
  run.summary.ran = run.plan ? run.plan.detectors : []

  return run
}

/* ---------------------------------------------------------------- 路由具 -- */

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}

function failure(error, fallback) {
  // 文件浏览的错误自带状态码（403 越界、404 不存在、413 太大），
  // 和 WorkbenchError 一样直接把 message 给用户 —— 这些都是用户能看懂并纠正的。
  if (error instanceof FilesError) return json({ error: error.message }, error.status)
  const message = error instanceof WorkbenchError ? error.message : fallback
  const status = error instanceof WorkbenchError ? error.status : 500
  return json({ error: message, detail: error instanceof WorkbenchError ? undefined : String(error?.message || error) }, status)
}

async function readBody(request) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new WorkbenchError('请求内容过大。', 413)
  const text = await request.text()
  if (!text) throw new WorkbenchError('请求需要 JSON 正文。')
  try {
    return JSON.parse(text)
  } catch {
    throw new WorkbenchError('请求正文不是合法 JSON。')
  }
}

/**
 * 把 runs/ 收回 MAX_RUNS 条以内。
 *
 * 和 saveRun 末尾那段淘汰重复，但触发时机不同：那边是「刚写完一条」，
 * 这里是「应用刚启动」。两个时机都需要 —— 只在写时清，就管不到
 * 手工恢复备份、改小上限、以及删掉一半记录又不再检测的情况。
 */
async function pruneRuns(runsDir) {
  let files = []
  try {
    files = (await readdir(runsDir)).filter((f) => f.endsWith('.json'))
  } catch {
    return
  }
  if (files.length <= MAX_RUNS) return
  const detailed = []
  for (const file of files) {
    const data = await readJson(join(runsDir, file), null)
    if (data) detailed.push({ file, startedAt: data.startedAt })
  }
  detailed.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  for (const extra of detailed.slice(MAX_RUNS)) {
    await unlink(join(runsDir, extra.file)).catch(() => {})
  }
}

/* ------------------------------------------------------------------ 主体 -- */

export function apply(ctx, config) {
  const root = resolve(config.root)
  const instancesFile = join(root, INSTANCES_FILE)

  /**
   * 当前该把检测产物写到哪。
   *
   * 规则跟宿主一致：**工作台文件夹在哪个项目里，产物就跟着那个项目走**。
   *   - 已经认领了文件夹 → `<该文件夹>/.ux-workbench/runs`
   *   - 还没认领          → 退回 `<root>/runs`（不能让记录无处可写）
   *
   * 每次读写都现算，而不是启动时算一次：用户完全可能在运行期间新建或
   * 改选文件夹，缓存住就会一直写进旧位置。
   */
  async function runsDirectory() {
    try {
      const record = await readHomeRecord(root)
      if (record && record.path) {
        const dir = join(record.path, ARTIFACT_DIR, RUNS_DIR)
        await mkdir(dir, { recursive: true })
        return dir
      }
    } catch { /* 目录建不出来就退回兜底位置，不要让检测本身失败 */ }
    // 兜底位置同样要建出来：还没认领文件夹时也不能写不进去。
    const fallback = join(root, RUNS_DIR)
    await mkdir(fallback, { recursive: true }).catch(() => {})
    return fallback
  }

  /**
   * AI 结论报告写到哪。
   *
   * 和 runs/ 同一套规则（跟着工作台文件夹走），但目录独立：
   * 两者一起被「清空检测记录」误删就丢掉了人的判断，而那是重跑不回来的东西。
   */
  async function reportsDirectory() {
    try {
      const record = await readHomeRecord(root)
      if (record && record.path) {
        const dir = join(record.path, ARTIFACT_DIR, REPORTS_DIR)
        await mkdir(dir, { recursive: true })
        return dir
      }
    } catch { /* 同 runsDirectory：建不出来就退兜底 */ }
    const fallback = join(root, REPORTS_DIR)
    await mkdir(fallback, { recursive: true }).catch(() => {})
    return fallback
  }

  sweepTemporaries(root).catch(() => {})
  // 启动时也扫一遍行数上限：淘汰原来只在「新记录落盘」时触发，
  // 于是删一半、从备份恢复、或换了上限值之后，超出的记录会一直躺着。
  // 产物目录现在跟着工作区走，所以先把真实目录解析出来再清。
  runsDirectory().then((dir) => pruneRuns(dir)).catch(() => {})


  // playwright-core 按需加载：装不上时工作台仍能打开，只是跑不了检测。
  let playwrightModule = null
  let playwrightError = null
  let browserInfo = null

  const loadPlaywright = async () => {
    if (playwrightModule) return playwrightModule
    if (playwrightError) throw new WorkbenchError(`浏览器驱动不可用：${playwrightError}`, 503)
    try {
      playwrightModule = await import('playwright-core')
      return playwrightModule
    } catch (error) {
      playwrightError = String(error?.message || error).slice(0, 200)
      throw new WorkbenchError(`浏览器驱动不可用：${playwrightError}`, 503)
    }
  }

  const ensureBrowser = async () => {
    if (browserInfo) return browserInfo
    const info = await detectBrowser({ access: async (p) => { await stat(p) } })
    if (!info) {
      throw new WorkbenchError('本机没有找到 Chrome 或 Edge。体验检测需要真实浏览器，请先安装其中之一。', 503)
    }
    browserInfo = info
    return browserInfo
  }

  /**
   * 侧栏预览池：一条真实浏览器会话 + 截图。
   *
   * 检测是在一次性上下文里跑完就关的，报告里只剩选择器和坐标；用户真正想看的
   * 还是「那个网页长什么样、问题在哪儿」。所以另起一个会话，让报告和网页并排。
   */
  const preview = createPreviewPool({
    loadPlaywright,
    ensureBrowser,
    resolveUrl: (target) => (target.url === 'builtin:demo'
      ? `file:///${DEMO_FILE.replace(/\\/g, '/')}${target.theme ? `?theme=${target.theme}` : ''}`
      : target.url),
    log: () => {}
  })

  /**
   * 本地项目服务池：把「一个项目文件夹」变成可以内嵌的网址。
   *
   * 检测与预览都只认网址，所以项目文件夹必须先跑起来。这里集中管理这些本地进程，
   * 插件停用时统一回收，不在后台留孤儿 node。
   */
  const projects = createProjectServers({ log: () => {} })

  /* --- 实例存储 --- */

  async function loadInstances() {
    const stored = await readJson(instancesFile, null)
    if (stored && Array.isArray(stored.instances)) return stored.instances
    // 首次启动：写入内置示例
    const initial = SAMPLE_INSTANCES.map((item) => normalizeInstance(item))
    await writeJsonAtomic(instancesFile, { version: 1, instances: initial })
    return initial
  }

  async function saveInstances(instances) {
    await writeJsonAtomic(instancesFile, { version: 1, instances })
  }

  /* --- 运行记录 --- */

  /**
   * 待读的记录目录：工作区里的在前，全局旧位置在后。
   *
   * 产物改成跟随工作区之后，改造前那批记录还留在全局位置。只读新目录的话，
   * 用户升级后会看到历史列表突然空了 —— 数据其实还在，只是换了地方。
   * 两个位置都读，旧记录继续可见，新记录落在工作区。
   * 同一 id 以工作区那份为准（排在前面，后面按 id 去重）。
   */
  async function runDirectories() {
    const primary = await runsDirectory()
    const legacy = join(root, RUNS_DIR)
    return primary === legacy ? [primary] : [primary, legacy]
  }

  async function listRuns(limit = 20) {
    const dirs = await runDirectories()
    const runs = []
    const seen = new Set()
    for (const runsDir of dirs) {
      let files = []
      try {
        files = await readdir(runsDir)
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const data = await readJson(join(runsDir, file), null)
        if (!data || !data.id) continue
        if (seen.has(data.id)) continue
        seen.add(data.id)
      runs.push({
          id: data.id,
          instanceId: data.instanceId,
          instanceName: data.instanceName,
          startedAt: data.startedAt,
          finishedAt: data.finishedAt,
          // 旧记录没有这个字段，用时间戳补算，保证每条历史都有耗时。
          durationMs: elapsedOf(data),
          ok: data.ok,
          // aborted 也要带上：面板要区分「失败」和「用户自己停的」，
          // 否则一次主动停止会被画成出错。
          aborted: data.aborted === true,
          error: data.error,
          browser: data.browser,
          summary: data.summary,
          combinations: (data.combinations || []).map((c) => ({ label: c.label, issueCount: c.issueCount, error: c.error }))
        })
      }
    }
    runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    return runs.slice(0, limit)
  }

  async function readRun(id) {
    const safe = sanitizeId(id)
    if (!safe) throw new WorkbenchError('运行记录标识不合法。')
    // 先找工作区，再找旧的全局位置 —— 升级前那批记录还能打开。
    let data = null
    for (const runsDir of await runDirectories()) {
      data = await readJson(join(runsDir, `${safe}.json`), null)
      if (data) break
    }
    if (!data) throw new WorkbenchError('运行记录不存在。', 404)
    // 旧记录没有 durationMs，这里补算，详情页也能显示耗时。
    return { ...data, durationMs: elapsedOf(data) }
  }

  /**
   * 删掉一条运行记录。
   *
   * id 必须过 sanitizeId —— 它是拼进文件路径的，不校验就等于把选择权交给请求方。
   * 已经不存在时返回 404 而不是静默成功：重复点删除多半说明界面状态旧了，
   * 让前端知道「这条其实已经没了」比假装成功更有用。
   */
  async function deleteRun(id) {
    const safe = sanitizeId(id)
    if (!safe) throw new WorkbenchError('运行记录标识不合法。', 400)
    let removed = false
    for (const runsDir of await runDirectories()) {
      try {
        await unlink(join(runsDir, `${safe}.json`))
        removed = true
        break
      } catch (error) {
        if (error && error.code === 'ENOENT') continue
        throw error
      }
    }
    if (!removed) throw new WorkbenchError('运行记录不存在。', 404)
    return { id: safe }
  }

  /**
   * 清空全部运行记录。
   *
   * 逐条发 DELETE 会很慢（60 条就是 60 次往返），而且中途失败会留下删了一半的
   * 列表 —— 用户看到的既不是清空前也不是清空后。这里一次读完目录、一次删完，
   * 返回真实删掉的条数。
   *
   * 只动 runs/ 下的 *.json：这个目录里不该有别的文件，但万一有（手工放的说明、
   * 备份子目录），一律不碰。宁可少删，不要误删。
   */
  async function clearRuns() {
    // 两个位置都要清：只清工作区会留下旧记录，用户点「清空」后发现还剩下几条。
    let removed = 0
    for (const runsDir of await runDirectories()) {
      let files = []
      try {
        files = (await readdir(runsDir)).filter((f) => f.endsWith('.json'))
      } catch (error) {
        if (error && error.code === 'ENOENT') continue
        throw error
      }
      for (const file of files) {
        try {
          await unlink(join(runsDir, file))
          removed++
        } catch {
          // 单个删不掉（被占用、权限）不该中断整场清空
        }
      }
    }
    return { removed }
  }

  async function saveRun(run) {
    // 被阻断的检测不落盘。
    //
    // 「页面打不开」和「页面没缺陷」在历史列表里长得一样（都是 0 处缺陷），
    // 但前者一个像素都没测到。存进去就等于留下一份「测过了、没问题」的假证据，
    // 而且会长期留在列表里骗人。这类结果只在当次的接口返回与面板错误里出现。
    if (run.blocked) return run
    const runsDir = await runsDirectory()
    await writeJsonAtomic(join(runsDir, `${run.id}.json`), run)
    // 只保留最近 MAX_RUNS 条
    try {
      const files = (await readdir(runsDir)).filter((f) => f.endsWith('.json'))
      if (files.length > MAX_RUNS) {
        const detailed = []
        for (const file of files) {
          const data = await readJson(join(runsDir, file), null)
          if (data) detailed.push({ file, startedAt: data.startedAt })
        }
        detailed.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        for (const extra of detailed.slice(MAX_RUNS)) {
          await unlink(join(runsDir, extra.file)).catch(() => {})
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }

  /* --- AI 结论报告 --- */

  /**
   * 一份结论报告的形状。
   *
   * 只留渲染需要的东西：Markdown 正文、标题、归属（哪个页面/项目）、时间。
   * 不把模型的原始回复整段塞进来 —— 面板要显示的是结论，不是对话记录。
   */
  function normalizeReport(input, existing = null) {
    if (!input || typeof input !== 'object') throw new WorkbenchError('结论内容不合法。')
    const markdown = typeof input.markdown === 'string' ? input.markdown.trim() : ''
    if (!markdown) throw new WorkbenchError('结论正文不能是空的。')
    // 正文上限：报告是给人读的，长到这个量级基本是误贴了整页 HTML。
    if (markdown.length > 200_000) throw new WorkbenchError('结论正文过长（上限 200000 字符）。', 413)

    const pick = (value, fallback = '', limit = 240) => {
      const text = typeof value === 'string' ? value.trim() : ''
      return text ? text.slice(0, limit) : fallback
    }

    return {
      id: existing?.id || `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: pick(input.title, firstHeading(markdown) || '体验检测结论', 160),
      target: pick(input.target, '', 320),
      instanceId: pick(input.instanceId, '', 80),
      runId: pick(input.runId, '', 80),
      summary: pick(input.summary, '', 200),
      markdown,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  /** 取 Markdown 第一个一级标题当报告标题，省得每次都要另填一个。 */
  function firstHeading(markdown) {
    const match = /^#\s+(.+)$/m.exec(String(markdown || ''))
    return match ? match[1].trim().slice(0, 160) : ''
  }

  async function saveReport(report) {
    const dir = await reportsDirectory()
    await writeJsonAtomic(join(dir, `${report.id}.json`), report)
    // 和运行记录一样按时间淘汰，避免目录无限长大
    try {
      const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
      if (files.length > MAX_REPORTS) {
        const detailed = []
        for (const file of files) {
          const data = await readJson(join(dir, file), null)
          if (data) detailed.push({ file, createdAt: data.createdAt })
        }
        detailed.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        for (const extra of detailed.slice(MAX_REPORTS)) {
          await unlink(join(dir, extra.file)).catch(() => {})
        }
      }
    } catch { /* 清理失败不影响保存 */ }
    return report
  }

  async function listReports(limit = 20) {
    const dirs = [await reportsDirectory()]
    const legacy = join(root, REPORTS_DIR)
    if (legacy !== dirs[0]) dirs.push(legacy)
    const seen = new Set()
    const list = []
    for (const dir of dirs) {
      let files = []
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const data = await readJson(join(dir, file), null)
        if (!data || !data.id || seen.has(data.id)) continue
        seen.add(data.id)
        list.push({
          id: data.id,
          title: data.title,
          target: data.target,
          instanceId: data.instanceId,
          runId: data.runId,
          summary: data.summary,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          // 列表页不需要全文，但给一个长度让界面能显示「共 N 字」
          length: typeof data.markdown === 'string' ? data.markdown.length : 0
        })
      }
    }
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return list.slice(0, limit)
  }

  async function readReport(id) {
    const safe = sanitizeId(id)
    if (!safe) throw new WorkbenchError('结论标识不合法。')
    let data = await readJson(join(await reportsDirectory(), `${safe}.json`), null)
    if (!data) data = await readJson(join(root, REPORTS_DIR, `${safe}.json`), null)
    if (!data) throw new WorkbenchError('这份结论不存在了。', 404)
    return data
  }

  /* --- 任务启动 --- */

  /**
   * 起一次检测并挂上「可停止」的能力。
   *
   * 两处发起检测（直接给网址、测已登记的项目）都要这一套：建 AbortController、
   * 跑、落盘、按结果定状态。早先这是复制的两段代码，改一处漏一处是迟早的事 ——
   * 尤其「用户停止」这种新增状态，漏掉一处就会出现「停了但按钮还在转」。
   */
  function launchJob(job, instance, browserInfo, chromium) {
    const controller = new AbortController()
    job.controller = controller

    executeRun(instance, browserInfo, { chromium, signal: controller.signal }, (progress) => {
      // 已经停止的任务不再更新进度，否则面板会在「已停止」之后又闪回进度文字
      if (controller.signal.aborted) return
      job.progress = progress
    })
      .then(async (run) => {
        await saveRun(run)
        job.status = run.aborted ? 'aborted' : (run.ok ? 'done' : 'failed')
        // blocked 的 run 没有落盘，runId 不能指过去 —— 面板拿它去读详情会 404。
        job.runId = run.blocked ? null : run.id
        job.error = run.error
        job.result = run
      })
      .catch((error) => {
        const aborted = error instanceof RunAborted
        job.status = aborted ? 'aborted' : 'failed'
        job.error = aborted ? null : String(error?.message || error).slice(0, 400)
      })
      .finally(() => {
        job.finishedAt = Date.now()
        job.controller = null
      })
  }

  /* --- 路由登记 --- */

  ctx.effect(() => {
    const disposers = []
    const register = (entry) => {
      try {
        const dispose = ctx.connection.fetch.register(entry)
        if (typeof dispose === 'function') disposers.push(dispose)
      } catch (error) {
        console.warn(`[dsh-ux-workbench] 路由 ${entry.path} 登记失败：${(error && error.message) || error}`)
      }
    }

    // 内置演示页
    register({
      path: `${API}/demo`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        try {
          const html = await readFile(DEMO_FILE, 'utf8')
          return new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
          })
        } catch {
          return new Response('demo not found', { status: 404 })
        }
      }
    })

    // 健康检查 + 能力探测
    register({
      path: `${API}/health`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        let browser = null
        let driverError = null
        try {
          const info = await ensureBrowser()
          browser = info.channel
        } catch (error) {
          driverError = String(error?.message || error)
        }
        let driver = true
        try {
          await loadPlaywright()
        } catch {
          driver = false
        }
        return json({
          ok: true,
          name,
          root,
          driver,
          driverError,
          browser,
          detectors: Object.entries(DETECTORS).map(([id, meta]) => ({ id, ...meta })),
          demoUrl: `${API}/demo`
        })
      }
    })

    // 工作台实例：GET 列表 + POST 增删改
    register({
      path: `${API}/home`,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      async fetch(request) {
        // GET 只读：问「现在是什么状态」，绝不建目录。
        // POST 才落地，且只有用户点过确认之后界面才会发。
        if (request.method !== 'POST') {
          try {
            return json(await describeHome(ctx, root))
          } catch (error) {
            return failure(error, '无法读取工作台文件夹状态。')
          }
        }
        try {
          const payload = await readBody(request)
          const result = await adoptHome(ctx, root, payload.path)
          return json({ ok: true, ...result })
        } catch (error) {
          return failure(error, '无法创建工作台文件夹。')
        }
      }
    })

    // 工作台实例：GET 列表 + POST 增删改
    register({
      path: `${API}/instances`,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      async fetch(request) {
        if (request.method !== 'POST') {
          try {
            const instances = await loadInstances()
            return json({ instances })
          } catch (error) {
            return failure(error, '无法读取工作台实例。')
          }
        }
        try {
          const payload = await readBody(request)
          const action = String(payload.action || '');
          const instances = await loadInstances()
          const index = payload.id ? instances.findIndex((item) => item.id === payload.id) : -1

          if (action === 'create') {
            const created = normalizeInstance(payload.instance)
            instances.push(created)
            await saveInstances(instances)
            return json({ ok: true, instance: created, instances })
          }
          if (action === 'update') {
            if (index < 0) throw new WorkbenchError('要更新的工作台不存在。', 404)
            const updated = normalizeInstance(payload.instance, instances[index])
            instances[index] = updated
            await saveInstances(instances)
            return json({ ok: true, instance: updated, instances })
          }
          if (action === 'delete') {
            if (index < 0) throw new WorkbenchError('要删除的工作台不存在。', 404)
            if (instances[index].builtin) throw new WorkbenchError('内置示例工作台不可删除。')
            const [removed] = instances.splice(index, 1)
            await saveInstances(instances)
            return json({ ok: true, removedId: removed.id, instances })
          }
          if (action === 'reset') {
            const initial = SAMPLE_INSTANCES.map((item) => normalizeInstance(item))
            await saveInstances(initial)
            return json({ ok: true, instances: initial })
          }
          throw new WorkbenchError('不支持的实例操作。')
        } catch (error) {
          return failure(error, '实例操作失败。')
        }
      }
    })

    // 清空全部历史记录。POST 而不是 DELETE：它没有 id，是「整批」操作，
    // 用 DELETE 挂在 /run 上会和「删一条」混在一起，路由要按查询参数分叉，容易漏。
    register({
      path: `${API}/runs-clear`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch() {
        try {
          return json({ ok: true, ...(await clearRuns()) })
        } catch (error) {
          return failure(error, '无法清空检测记录。')
        }
      }
    })

    // 发起一次检测（异步）；DELETE 用来删掉一条运行记录
    register({
      path: `${API}/run`,
      methods: ['POST', 'DELETE'],
      requestBody: 'buffered',
      async fetch(request) {
        if (request.method === 'DELETE') {
          try {
            const id = new URL(request.url).searchParams.get('id') || ''
            return json({ ok: true, ...(await deleteRun(id)) })
          } catch (error) {
            return failure(error, '无法删除运行记录。')
          }
        }
        try {
          const payload = await readBody(request)
          const instances = await loadInstances()

          // 直接给网址检测：网址不是项目，不该在「项目」栏留下条目。
          // 这里临时组一个实例跑完就丢，只把运行记录存进历史。
          const adhocUrl = typeof payload.url === 'string' ? payload.url.trim() : ''
          if (!payload.instanceId && adhocUrl) {
            const ephemeral = normalizeInstance({
              name: sanitizeName(adhocUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''), adhocUrl),
              url: adhocUrl,
              detectors: null,
              viewports: [],
              themes: null
            })
            const { chromium } = await loadPlaywright()
            const info = await ensureBrowser()
            pruneJobs()

            // 同一个网址已经在跑：直接把那次的任务交给调用方，不再起第二遍。
            // 前端据此仍然拿到 jobId 去轮询同一次结果，表现上「点一下只测一遍」。
            const running = findRunningJob(ephemeral)
            if (running) {
              return json({ ok: true, jobId: running.id, instanceName: running.instanceName, reused: true })
            }

            const jobId = `job-${randomUUID().slice(0, 8)}`
            const job = {
              id: jobId,
              instanceId: null,
              url: ephemeral.url,
              instanceName: ephemeral.name,
              status: 'running',
              startedAt: Date.now(),
              finishedAt: null,
              runId: null,
              error: null
            }
            jobs.set(jobId, job)

            launchJob(job, ephemeral, info, chromium)

            return json({ ok: true, jobId, instanceName: ephemeral.name })
          }

          const instance = instances.find((item) => item.id === payload.instanceId)
          if (!instance) throw new WorkbenchError('工作台实例不存在。', 404)

          // 支持临时覆盖配置（不落盘），便于「调了阈值先跑一下」
          const target = payload.override ? normalizeInstance({ ...instance, ...payload.override }, instance) : instance

          // 项目文件夹：检测前先把它的页面跑起来。服务已在运行会直接复用，
          // 所以反复点「测试」不会堆出好几个端口。
          // 注意条件是 projectPath，不是「url 为空」：上次启动留下的地址在进程
          // 重启后就是死端口，只看 url 为空会把检测指向一个连不上的页面。
          if (target.projectPath) {
            const started = await projects.start(target.projectPath)
            target.url = started.url
            const stored = instances.find((item) => item.id === target.id)
            if (stored) {
              stored.url = started.url
              stored.devServer = { running: true, url: started.url, script: started.script || '', port: started.port }
              stored.updatedAt = new Date().toISOString()
              await saveInstances(instances)
            }
          }

          if (!target.url) {
            throw new WorkbenchError('这个工作台既没有网址也没有可运行的项目文件夹。')
          }

          const { chromium } = await loadPlaywright()
          const info = await ensureBrowser()

          pruneJobs()

          // 同一个项目已经在跑：复用那次任务，不重复开浏览器。
          const running = findRunningJob(target)
          if (running) {
            return json({ ok: true, jobId: running.id, instanceName: running.instanceName, reused: true })
          }

          const jobId = `job-${randomUUID().slice(0, 8)}`
          const job = {
            id: jobId,
            instanceId: target.id,
            url: target.url,
            instanceName: target.name,
            status: 'running',
            startedAt: Date.now(),
            finishedAt: null,
            runId: null,
            error: null
          }
          jobs.set(jobId, job)

          launchJob(job, target, info, chromium)

          return json({ ok: true, jobId, instanceName: target.name })
        } catch (error) {
          return failure(error, '无法发起检测。')
        }
      }
    })

    // 轮询任务状态
    register({
      path: `${API}/job`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id')
          const job = jobs.get(String(id))
          if (!job) return json({ status: 'unknown' })
          return json({
            id: job.id,
            status: job.status,
            instanceName: job.instanceName,
            runId: job.runId,
            error: job.error,
            progress: job.progress || null,
            elapsedMs: (job.finishedAt || Date.now()) - job.startedAt,
            result: job.status === 'running' ? null : job.result || null
          })
        } catch (error) {
          return failure(error, '无法读取任务状态。')
        }
      }
    })

    /**
     * 当前正在跑的检测（不分发起方）。
     *
     * 「用户点按钮」和「AI 调 ux_run_check」都会登记 job，但面板原本只知道自己
     * 点出来的那个 jobId（`busy = Boolean(jobId)`）。于是 AI 一开跑，面板是静止的：
     * 没有转圈、没有秒数、按钮还写着「开始检测」——用户既看不出它在干活，
     * 也可能再点一下。
     *
     * 这里让面板能问「现在有谁在跑」，然后挂到同一个 job 上：
     * 进度、秒数、「停止」按钮全部复用现成的那一套，不需要另造一个界面。
     */
    register({
      path: `${API}/job-active`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        try {
          pruneJobs()
          const running = []
          for (const job of jobs.values()) {
            if (job.status !== 'running') continue
            running.push({
              id: job.id,
              instanceName: job.instanceName,
              instanceId: job.instanceId || null,
              url: job.url || '',
              startedAt: job.startedAt,
              elapsedMs: Date.now() - job.startedAt,
              progress: job.progress || null
            })
          }
          // 最晚开始的排前面：面板只需要接一个，取最近的那个最符合直觉
          running.sort((a, b) => b.startedAt - a.startedAt)
          return json({ ok: true, jobs: running })
        } catch (error) {
          return failure(error, '无法读取正在进行的检测。')
        }
      }
    })

    // 停止一个正在跑的检测
    register({
      path: `${API}/job-stop`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const payload = await readBody(request)
          const job = jobs.get(String(payload.id || ''))
          if (!job) throw new WorkbenchError('这个任务已经结束了。', 404)
          if (job.status !== 'running') {
            // 幂等：重复点停止不算错误，只是没东西可停了
            return json({ ok: true, status: job.status, already: true })
          }
          if (job.controller) job.controller.abort()
          // 立刻标成 stopped，让面板不用等浏览器那边收尾才改按钮
          job.status = 'aborted'
          job.error = null
          job.finishedAt = job.finishedAt || Date.now()
          return json({ ok: true, status: 'aborted' })
        } catch (error) {
          return failure(error, '无法停止这个任务。')
        }
      }
    })

    // 运行记录列表
    register({
      path: `${API}/runs`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const url = new URL(request.url)
          const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
          return json({ runs: await listRuns(limit) })
        } catch (error) {
          return failure(error, '无法读取运行记录。')
        }
      }
    })

    // 单次运行详情：GET 用 ?id= 避免路径段编码问题
    register({
      path: `${API}/run-detail`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const url = new URL(request.url)
          return json({ run: await readRun(String(url.searchParams.get('id') || '')) })
        } catch (error) {
          return failure(error, '无法读取运行详情。')
        }
      }
    })

    /* --- AI 结论报告 --- */

    // 结论列表（面板「结论」区）
    register({
      path: `${API}/reports`,
      methods: ['GET', 'POST', 'DELETE'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          if (request.method === 'GET') {
            const url = new URL(request.url)
            const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
            return json({ reports: await listReports(limit) })
          }
          if (request.method === 'DELETE') {
            // 面板删除单份结论。正文是 AI 写的，删掉不会自己长回来，所以要问过用户。
            const url = new URL(request.url)
            const safe = sanitizeId(String(url.searchParams.get('id') || ''))
            if (!safe) throw new WorkbenchError('结论标识不合法。')
            let removed = false
            for (const dir of [await reportsDirectory(), join(root, REPORTS_DIR)]) {
              try {
                await unlink(join(dir, `${safe}.json`))
                removed = true
                break
              } catch (error) {
                if (error && error.code === 'ENOENT') continue
                throw error
              }
            }
            if (!removed) throw new WorkbenchError('这份结论不存在了。', 404)
            return json({ ok: true, id: safe })
          }
          const payload = await readBody(request)
          const existing = payload?.id ? await readReport(payload.id).catch(() => null) : null
          return json({ ok: true, report: await saveReport(normalizeReport(payload, existing)) })
        } catch (error) {
          return failure(error, '处理结论时出错。')
        }
      }
    })

    // 单份结论全文
    register({
      path: `${API}/report`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const url = new URL(request.url)
          return json({ report: await readReport(String(url.searchParams.get('id') || '')) })
        } catch (error) {
          return failure(error, '读不到这份结论。')
        }
      }
    })

    /* --- 侧栏网页预览 --- */

    // 打开（或复用）一个预览会话
    register({
      path: `${API}/preview`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const payload = await readBody(request)
          let url = typeof payload.url === 'string' ? payload.url.trim() : ''
          // 项目文件夹：预览前确保服务在跑，然后把地址换成它的本地地址。
          if (!url && payload.projectPath) {
            const started = await projects.start(sanitizeProjectPath(payload.projectPath))
            url = started.url
          }
          const resolved = sanitizeUrl(url)
          const theme = payload.theme === 'dark' ? 'dark' : 'light'
          const viewport = normalizeViewports([payload.viewport || {}])[0]
            || { label: '桌面', width: 1440, height: 900 }
          const sessionId = await preview.open({ url: resolved, theme, viewport })
          return json({ ok: true, sessionId, url: resolved })
        } catch (error) {
          return failure(error, '无法打开预览会话。')
        }
      }
    })

    // 取一帧整页画面
    register({
      path: `${API}/preview-frame`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const session = new URL(request.url).searchParams.get('session') || ''
          const frame = await preview.frame(session)
          if (!frame) throw new WorkbenchError('预览会话已失效，请重新打开。', 404)
          return json(frame)
        } catch (error) {
          return failure(error, '无法读取预览画面。')
        }
      }
    })

    // 定位一条缺陷：滚过去、框出来、返回近景
    register({
      path: `${API}/preview-focus`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const payload = await readBody(request)
          const focus = await preview.focus(String(payload.session || ''), {
            selector: typeof payload.selector === 'string' ? payload.selector.slice(0, 500) : '',
            rect: payload.rect && typeof payload.rect === 'object' ? payload.rect : null,
            markers: Array.isArray(payload.markers) ? payload.markers.slice(0, 60) : [],
            activeKey: typeof payload.activeKey === 'string' ? payload.activeKey.slice(0, 200) : '',
            tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 40) : ''
          })
          if (!focus) throw new WorkbenchError('预览会话已失效，请重新打开。', 404)
          return json(focus)
        } catch (error) {
          return failure(error, '无法定位到该缺陷。')
        }
      }
    })

    /**
     * 本地项目：GET 查状态，POST 起停服务。
     *
     * 面板「项目」一栏贴的是文件夹，不是网址。起服务这一步放在服务端，因为
     * 只有这里能 spawn 子进程、能读到项目目录；浏览器侧没有这个权限。
     */
    register({
      path: `${API}/project-server`,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          if (request.method === 'GET') {
            const target = new URL(request.url).searchParams.get('path') || ''
            if (!target) return json({ running: false, url: '', script: '', port: null })
            return json(projects.status(target))
          }

          const payload = await readBody(request)
          const raw = String(payload.path || '').trim()
          if (!raw) throw new WorkbenchError('请先选择项目文件夹。')
          const projectPath = sanitizeProjectPath(raw)

          // 先确认它真的是个目录，否则 npm 会在一个不存在的 cwd 里报一堆难懂的错误
          try {
            const info = await stat(projectPath)
            if (!info.isDirectory()) throw new WorkbenchError(`${projectPath} 不是文件夹。`)
          } catch (error) {
            if (error instanceof WorkbenchError) throw error
            throw new WorkbenchError(`读不到项目文件夹：${projectPath}`)
          }

          if (String(payload.action || 'start') === 'stop') {
            const stopped = await projects.stop(projectPath)
            // 服务停了，实例上记录的地址也要作废，否则面板还会去加载一个死端口
            const instances = await loadInstances()
            const hit = instances.find((item) => item.projectPath === projectPath)
            if (hit) {
              hit.devServer = { running: false, url: '', script: hit.devServer?.script || '', port: null }
              await saveInstances(instances)
            }
            return json({ ok: true, stopped, ...projects.status(projectPath) })
          }

          const started = await projects.start(projectPath, { port: payload.port })
          const state = { running: true, url: started.url, script: started.script || '', port: started.port, mode: started.mode }

          // 服务起来后把地址写回对应实例：用户下次打开面板，内置浏览器能直接加载。
          const instances = await loadInstances()
          const hit = instances.find((item) => item.projectPath === projectPath)
          if (hit) {
            hit.devServer = state
            if (!hit.url) hit.url = started.url
            hit.updatedAt = new Date().toISOString()
            await saveInstances(instances)
          }

          return json({ ok: true, ...state, label: projectLabel(projectPath), note: started.note || '' })
        } catch (error) {
          return failure(error, '本地项目服务启动失败。')
        }
      }
    })

    /* --- 项目文件浏览 --- */

    /**
     * 按需列一层目录，供面板渲染文件树。
     *
     * 用实例 id 而不是直接传文件夹路径：路径由服务端从实例里取，
     * 前端就没有办法指定一个任意的根目录去读。
     */
    register({
      path: `${API}/files`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const url = new URL(request.url)
          const instances = await loadInstances()
          const instance = instances.find((item) => item.id === url.searchParams.get('instanceId'))
          if (!instance) throw new WorkbenchError('工作台实例不存在。', 404)
          if (!instance.projectPath) throw new WorkbenchError('这个实例没有关联项目文件夹。')

          const listing = await listDirectory(instance.projectPath, url.searchParams.get('path') || '')
          return json({ ok: true, root: instance.projectPath, ...listing })
        } catch (error) {
          return failure(error, '无法读取项目文件。')
        }
      }
    })

    // 读单个文件内容
    register({
      path: `${API}/file`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const url = new URL(request.url)
          const instances = await loadInstances()
          const instance = instances.find((item) => item.id === url.searchParams.get('instanceId'))
          if (!instance) throw new WorkbenchError('工作台实例不存在。', 404)
          if (!instance.projectPath) throw new WorkbenchError('这个实例没有关联项目文件夹。')

          const file = await readProjectFile(instance.projectPath, url.searchParams.get('path') || '')
          return json({ ok: true, ...file })
        } catch (error) {
          return failure(error, '无法读取这个文件。')
        }
      }
    })

    /**
     * 内置浏览器的页面代理。
     *
     * 面板和项目服务端口不同 → 是两个源，父窗口碰不到 iframe 里的 DOM，
     * 「点一条问题跳到那个按钮」就做不到。这里把项目页以同源方式转出来：
     *   - HTML 文档由本路由转发，并注入 <base href="项目真实地址">，
     *     于是页面里的 /app.js、./main.js、fetch('/api') 仍然去真实服务取；
     *   - 去掉 X-Frame-Options / CSP 的 frame 限制，才能被内嵌；
     *   - 文档同源之后，面板可以直接滚动、高亮、点按钮。
     *
     * 只代理本机回环地址：这是工作台自己的本地服务，不能变成一个能读内网的跳板。
     */
    register({
      path: `${API}/live`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const raw = new URL(request.url).searchParams.get('u') || ''
          let target
          if (raw === 'builtin:demo') {
            target = new URL(`file:///${DEMO_FILE.replace(/\\/g, '/')}`)
          } else {
            try {
              target = new URL(raw)
            } catch {
              throw new WorkbenchError('预览地址不合法。')
            }
          }
          const host = target.hostname.toLowerCase()
          const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
          // 内置演示页是工作台自己的文件，也要能装进内置浏览器
          if (target.protocol === 'file:') {
            if (target.pathname.replace(/^\//, '').replace(/\//g, '\\').toLowerCase() !== DEMO_FILE.replace(/\//g, '\\').toLowerCase()) {
              throw new WorkbenchError('内置浏览器只托管本机项目地址。')
            }
            const html = await readFile(DEMO_FILE, 'utf8')
            return new Response(injectBase(html, './'), {
              status: 200,
              headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
            })
          }
          if (!loopback || !['http:', 'https:'].includes(target.protocol)) {
            throw new WorkbenchError('内置浏览器只托管本机项目地址。')
          }

          const upstream = await fetch(target.href, {
            redirect: 'follow',
            headers: { 'user-agent': 'dsh-ux-workbench', accept: 'text/html,application/xhtml+xml' }
          })
          const type = String(upstream.headers.get('content-type') || '')
          if (!type.includes('html')) {
            return new Response(upstream.body, {
              status: upstream.status,
              headers: { 'content-type': type || 'application/octet-stream', 'cache-control': 'no-store' }
            })
          }

          let html = await upstream.text()
          // base 必须指向真实服务，否则页面里的相对资源会打到本路由上。
          // 同时把 iframe 文档地址还原成目标路径（含 search），否则纯 pathname
          // 路由的应用会把代理地址当成未知路径，直接渲染自己的 404 页。
          html = injectBase(html, target.href, `${target.pathname}${target.search}`)

          return new Response(html, {
            status: upstream.status,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store'
              // 刻意不透传 X-Frame-Options / CSP：不透传即不限制内嵌
            }
          })
        } catch (error) {
          const message = String(error?.message || error)
          const html = `<!doctype html><meta charset="utf-8"><style>
            body{margin:0;display:grid;place-items:center;height:100vh;font:13px system-ui;color:#666;background:#fff;text-align:center;padding:24px}
          </style><div><b style="display:block;font-size:14px;color:#333;margin-bottom:8px">页面还没准备好</b>${message.replace(/[<>&]/g, '')}
          <div style="margin-top:10px;color:#999">项目服务可能还在启动，稍等一下再试。</div></div>`
          return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
        }
      }
    })

    return () => {
      for (const dispose of disposers) {
        if (typeof dispose === 'function') dispose()
      }
      // 插件停用/重载时收掉所有本地服务，不在后台留 node 进程。
      projects.stopAll().catch(() => {})
    }
  }, 'ux-workbench: api routes')

  /* --- Agent 工具 --- */

  ctx.effect(() => {
    const register = (tool) => {
      try {
        ctx.tools.register(tool)
      } catch (error) {
        console.warn(`[dsh-ux-workbench] 工具登记失败：${(error && error.message) || error}`)
      }
    }

    register(defineTool({
      name: 'ux_list_instances',
      description: 'List the UX test workbench projects and pages BEFORE looking anywhere else on disk. The workbench has its own project area; when the user mentions a project by name, call this first — the project is probably already registered here, with a saved folder path and dev server. Only if nothing here matches should you search the filesystem. Returns each project name, id, folder path and current URL.',
      parameters: {},
      output: textOutput(),
      async execute() {
        const instances = await loadInstances()
        if (!instances.length) return '工作台里还没有任何项目。可以先用 ux_create_instance 添加一个项目文件夹或网址；如果用户指的文件夹不在这里，再去电脑里找。'
        const lines = instances.map((item) => {
          const mode = item.detectors && item.detectors.length
            ? `手动指定 ${item.detectors.filter((d) => d.enabled).map((d) => d.id).join('/')}`
            : '自动决定检测项'
          // 项目文件夹的实例可能还没有地址（服务没起过），要把文件夹显示出来，
          // 否则这行看起来像是「空实例」。
          const where = item.url || (item.projectPath ? `本地项目 ${item.projectPath}（未启动）` : '（无地址）')
          const path = item.projectPath ? `\n    文件夹：${item.projectPath}` : ''
          return `- ${item.name}（id=${item.id}）${where} · ${mode}${path}`
        })
        return `工作台项目（${instances.length} 个，优先用这里的，不要先去电脑里检索）：\n${lines.join('\n')}`
      }
    }))

    register(defineTool({
      name: 'ux_start_project',
      description: 'Start (or restart) the local dev server for a workbench project and return the URL it serves. Use this when the user asks you to start / run / launch their project ("帮我启动一下 xxx", "把项目跑起来"). Resolves the project by name inside the workbench first; only pass projectPath when the folder is not registered yet. After starting, tell the user the exact URL, what is being served, and how to test it.',
      parameters: {
        project: { type: 'string', description: 'Project name as shown in the workbench project list, e.g. "crypto-visualizer". Resolved inside the workbench, so do NOT search the disk first.' },
        projectPath: { type: 'string', description: 'Absolute path to a project folder. Only when the project is not in the workbench list yet.' }
      },
      output: textOutput(),
      async execute(args) {
        const instances = await loadInstances()
        const requestedName = typeof args?.project === 'string' ? args.project.trim() : ''
        const requestedPath = typeof args?.projectPath === 'string' ? args.projectPath.trim() : ''

        // 和 ux_run_check 用同一套按名字匹配，避免「能测但启动不了」这种不一致
        let instance = null
        if (requestedName) {
          instance = instances.find((item) => item.id === requestedName)
            || instances.find((item) => (item.name || '').toLowerCase() === requestedName.toLowerCase())
            || instances.find((item) => (item.name || '').toLowerCase().includes(requestedName.toLowerCase()))
            || instances.find((item) => String(item.projectPath || '').toLowerCase().includes(requestedName.toLowerCase()))
            || null
          if (!instance) {
            const names = instances.map((item) => item.name).filter(Boolean)
            return `工作台里没有叫「${requestedName}」的项目。\n`
              + (names.length ? `工作台现有项目：${names.join('、')}\n` : '工作台目前没有任何项目。\n')
              + '如果它是电脑上的一个文件夹，把绝对路径给我（projectPath），或者在面板里添加项目文件夹。'
          }
        }

        // 只有网址没有文件夹的实例没法「启动」——它指向的服务不归工作台管
        const projectPath = requestedPath || instance?.projectPath || ''
        if (!projectPath) {
          if (instance?.url) {
            return `「${instance.name}」是一个网址（${instance.url}），不是本地项目文件夹，没有需要启动的服务。\n`
              + '如果它现在打不开，先把那个服务自己跑起来，或者给我项目文件夹的绝对路径。'
          }
          return '需要告诉我一个项目名字（工作台里的）或者项目文件夹的绝对路径。'
        }

        // 先确认目录本身存在，否则报出来的错误会绕到 npm 上，看不懂
        try {
          const info = await stat(projectPath)
          if (!info.isDirectory()) return `${projectPath} 不是一个文件夹。`
        } catch {
          return `读不到这个项目文件夹：${projectPath}`
        }

        try {
          const started = await projects.start(projectPath)

          // 起完把地址写回实例：面板开着的时候也该跟着变，而不是等用户手动刷新
          const list = await loadInstances()
          const hit = list.find((item) => item.projectPath === projectPath
            || (instance && item.id === instance.id))
          const label = hit?.name || instance?.name || projectLabel(projectPath)
          if (hit) {
            hit.url = started.url
            hit.devServer = {
              running: true,
              url: started.url,
              script: started.script || '',
              port: started.port,
              mode: started.mode || ''
            }
            hit.updatedAt = new Date().toISOString()
            await saveInstances(list)
          }

          const how = started.mode === 'npm'
            ? `npm run ${started.script}（在前端目录里跑）`
            : '内置静态服务（这个目录里没有启动脚本，直接托管 index.html）'
          return [
            `已启动「${label}」。`,
            `网址：${started.url}`,
            `启动方式：${how}`,
            started.root && started.root !== projectPath ? `实际托管目录：${started.root}` : '',
            started.note ? `说明：${started.note}` : '',
            '',
            '接下来可以这样测：',
            '1. 面板右侧的网页预览现在就能打开这个地址，先看一眼页面是不是你要测的那个；',
            `2. 说一句「测一下 ${label}」，或者直接告诉我网址 ${started.url}，我就跑一次完整体验检测；`,
            '3. 也可以自己在面板顶部的输入框里确认地址，然后点「开始检测」。',
            '',
            '这个工作台测的是交互体验问题：文字溢出、点击区域太小、暗色模式残留白块、对比度不足、键盘焦点看不见、点击反馈慢、动画掉帧。功能是否正确不是它的主要职责。',
            '它叫「找茬工作台」，左侧项目、中间报告、右侧网页预览都在同一个面板里。'
          ].filter(Boolean).join('\n')
        } catch (error) {
          // 最常见的一种失败要说清楚：文件夹里根本没有网页，不是「启动失败」
          const message = String(error?.message || error)
          if (/没有可打开的网页/.test(message)) {
            return `「${instance?.name || projectLabel(projectPath)}」启动不了：这个文件夹里没有前端页面，没有可测的东西。\n\n`
              + '体验检测测的是网页上的交互与视觉缺陷，不是后端逻辑。'
              + '如果前端在别的文件夹，把那个路径给我（常见的比如 frontend/、web/、client/）。'
          }
          return `「${instance?.name || projectLabel(projectPath)}」没能启动：${message}\n路径：${projectPath}\n\n`
            + '常见原因：依赖没装（先跑一次包安装）、启动脚本自己报错、端口被占。'
        }
      }
    }))

    register(defineTool({
      name: 'ux_run_check',
      description: 'Run a real-browser UX/visual experience check and persist the run in the UX workbench history. MUST be used when the user asks to test, detect, scan, audit, inspect, or check a webpage. Do not answer with testing instructions instead of running it. The engine opens the URL, detects dark-theme support, chooses applicable detectors and viewports, explores low-risk interactive states, and returns measured defects with selectors, metrics and fixes.',
      parameters: {
        url: { type: 'string', description: 'Page URL to test. Omit to test the first registered instance, or pass projectPath for a local project folder.' },
        project: { type: 'string', description: 'Project name as shown in the workbench project list, for example "crypto-visualizer". Use this when the user refers to a project by name — it resolves inside the workbench, so you do NOT need to search the disk first.' },
        projectPath: { type: 'string', description: 'Absolute path to a local project folder to test. The workbench starts it, then tests the served page. Only needed when the project is not already in the workbench list.' },
        instanceId: { type: 'string', description: 'Instance id from ux_list_instances.' }
      },
      output: textOutput(),
      async execute(args) {
        const instances = await loadInstances()
        const requestedUrl = typeof args?.url === 'string' ? args.url.trim() : ''
        const requestedProject = typeof args?.projectPath === 'string' ? args.projectPath.trim() : ''
        const requestedName = typeof args?.project === 'string' ? args.project.trim() : ''
        // 按名字找项目：用户说「测一下 crypto-visualizer」，不该让他再报一次绝对路径。
        // 匹配顺序是 id → 名字完全相同 → 名字包含（都忽略大小写）。
        const byName = requestedName
          ? (instances.find((item) => item.id === requestedName)
            || instances.find((item) => (item.name || '').toLowerCase() === requestedName.toLowerCase())
            || instances.find((item) => (item.name || '').toLowerCase().includes(requestedName.toLowerCase()))
            || instances.find((item) => String(item.projectPath || '').toLowerCase().includes(requestedName.toLowerCase()))
            || null)
          : null
        if (requestedName && !byName) {
          const names = instances.map((item) => item.name).filter(Boolean)
          return `工作台里没有叫「${requestedName}」的项目。\n`
            + (names.length ? `工作台现有项目：${names.join('、')}\n` : '工作台目前没有任何项目。\n')
            + '如果它确实是电脑上的一个文件夹，把绝对路径给我（projectPath），或者在面板里用「添加项目文件夹」加进来。'
        }
        const instance = args?.instanceId
          ? instances.find((item) => item.id === args.instanceId)
          : byName
            || (requestedUrl
              ? instances.find((item) => !item.builtin && item.url === requestedUrl) || null
              : requestedProject
                ? instances.find((item) => item.projectPath === requestedProject) || null
                : instances[0])
        if (!instance && !requestedUrl && !requestedProject) {
          const names = instances.map((item) => item.name).filter(Boolean)
          throw new WorkbenchError(
            '没有可用的工作台项目，也没有给网址或项目文件夹。'
            + (names.length ? `工作台现有项目：${names.join('、')}。` : '')
          )
        }

        // 网址不是项目：直接跑，不登记。只有项目文件夹才进「项目」栏。
        // 这样从对话里让 AI 测一个网址，也不会在面板的项目栏留下一串地址。
        let registered = instance
        if (!registered && requestedProject) {
          const created = normalizeInstance({
            name: projectLabel(requestedProject),
            url: '',
            projectPath: requestedProject,
            detectors: null,
            viewports: [],
            themes: null
          })
          const next = [...instances, created]
          await saveInstances(next)
          registered = created
        }
        if (!registered && requestedUrl) {
          registered = normalizeInstance({
            name: sanitizeName(requestedUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''), requestedUrl),
            url: requestedUrl,
            detectors: null,
            viewports: [],
            themes: null
          })
        }

        const target = registered

        // 项目文件夹：先把它跑起来，再检测。和面板走同一条路，
        // 保证「面板里能看」和「工具跑出来的」是同一个页面。
        if (target.projectPath) {
          try {
            const started = await projects.start(target.projectPath)
            target.url = started.url
            const list = await loadInstances()
            const hit = list.find((item) => item.id === target.id)
            if (hit) {
              hit.url = started.url
              hit.devServer = { running: true, url: started.url, script: started.script || '', port: started.port }
              await saveInstances(list)
            }
          } catch (error) {
            const message = String(error?.message || error)
            // 「这个文件夹里没有网页」和「服务起不来」是两回事：
            // 前者根本没有可测的对象，说成启动失败会让用户一直去修启动命令。
            if (/没有可打开的网页/.test(message)) {
              return `「${target.name}」检测不了：这个文件夹里没有前端页面，没有可测的东西。\n\n`
                + '体验检测测的是网页上的交互与视觉缺陷（文字溢出、点击区域太小、暗色残留、对比度、焦点、反馈延迟、掉帧），'
                + '不是后端逻辑。\n'
                + '如果前端在别的文件夹，把那个路径给我；如果还没写页面，就没有可检测的内容。'
            }
            return `项目文件夹没跑起来：${message}\n路径：${target.projectPath}`
          }
        }

        const { chromium } = await loadPlaywright()
        const info = await ensureBrowser()

        // 这条路径（AI 调用 ux_run_check）以前直接开跑、不登记任务，
        // 于是它既躲过了「同一个目标正在跑」的检查，自己也可能被重复触发。
        // 现在也建一个 job 记录：面板能看到进度，并发的第二次调用也能被识别出来。
        pruneJobs()
        const running = findRunningJob(target)
        if (running) {
          return `「${target.name}」正在检测中（任务 ${running.id}，已跑 ${Math.round((Date.now() - running.startedAt) / 1000)}s）。\n`
            + `不重复启动第二次：同一次检测会同时落进运行记录，等它跑完后再看结果即可。\n`
            + `${running.url ? `网址：${running.url}\n` : ''}如需中断，在工作台面板点「停止」。`
        }

        const jobId = `job-${randomUUID().slice(0, 8)}`
        // 挂上 AbortController：这样面板的「停止」对 AI 发起的检测同样有效，
        // 而不是只把状态标成 aborted、浏览器还在后台继续跑。
        const controller = new AbortController()
        const job = {
          id: jobId,
          instanceId: target.id || null,
          url: target.url,
          instanceName: target.name,
          status: 'running',
          startedAt: Date.now(),
          finishedAt: null,
          runId: null,
          error: null,
          controller
        }
        jobs.set(jobId, job)

        let run
        try {
          // 和 launchJob 一样把阶段写进 job：面板接上这个任务后要显示
          // 「正在探测主题 / 正在展开状态」这些文字，否则只有一个转圈。
          run = await executeRun(target, info, { chromium, signal: controller.signal }, (progress) => {
            job.progress = progress
          })
          await saveRun(run)
          // 已经被叫停的任务不要覆盖成 done：停止不是完成。
          job.status = run.aborted || controller.signal.aborted ? 'aborted' : (run.ok ? 'done' : 'failed')
          job.runId = run.id
          job.error = run.error
          job.result = run
        } catch (error) {
          job.status = error instanceof RunAborted || controller.signal.aborted ? 'aborted' : 'failed'
          job.error = job.status === 'aborted' ? null : String(error?.message || error).slice(0, 400)
          throw error
        } finally {
          job.finishedAt = Date.now()
          job.controller = null
        }

        const runRef = `运行记录 id=${run.id}；工作台面板会自动把网址填进输入框并展示这次报告与网页预览，所以不必把整页原文再复述一遍。`
        if (run.blocked) {
          // 页面没打开：这次不算一次检测，也没有运行记录。
          // 早先这里会落一条「0 处缺陷」的记录，历史列表把它画成 ✓ ——
          // 一次什么都没测到的失败，在界面上看起来像「测过了，很干净」。
          return `这次没法检测「${run.instanceName}」，没有产生运行记录。\n\n`
            + `${run.error || '页面没有正常打开。'}\n\n`
            + '这不是「没有发现缺陷」——页面根本没打开，一个像素都没测到。\n'
            + '先把服务跑起来、确认地址能打开（面板右侧预览是最快的确认方式），再重新检测。'
        }
        // 被用户叫停不是失败：error 是 null，直接走「检测失败」会打印出 "检测失败：null"。
        if (run.aborted) {
          return `「${run.instanceName}」这次检测被手动停止了，已跑完的部分已保存。\n${runRef}`
        }
        if (!run.ok) return `检测失败：${run.error || '未知原因'}\n${runRef}`
        const plan = run.plan ? `${run.plan.summary}\n检测项：${run.plan.detectors.join('/')}` : ''
        if (!run.issues.length) return `「${run.instanceName}」测完了，未发现体验缺陷。\n${plan}\n共 ${run.combinations.length} 个组合，页面正常打开并完整检测过。\n${runRef}`

        const grouped = new Map()
        for (const issue of run.issues) {
          if (!grouped.has(issue.kind)) grouped.set(issue.kind, [])
          grouped.get(issue.kind).push(issue)
        }
        const sections = []
        for (const [kind, list] of grouped) {
          const title = DETECTORS[kind]?.label || kind
          // 每条缺陷已经按元素合并过，这里不再叠加状态列表：
          // 一个缺陷在 32 个动作下命中时，把 32 个状态名写进一行只会让工具输出失去可读性。
          const lines = list.slice(0, 8).map((issue) => {
            const extra = (issue.hits || 1) > 1 ? `（命中 ${issue.hits} 次，已验证跨状态/视口稳定复现）` : ''
            return `- ${issue.title}${extra}\n  ${issue.detail}${issue.target ? `\n  位置：${issue.target}` : ''}\n  建议：${issue.suggestion}`
          })
          const more = list.length > 8 ? `\n  …另有 ${list.length - 8} 处，见工作台面板` : ''
          sections.push(`## ${title}（${list.length} 处）\n${lines.join('\n')}${more}`)
        }
        const hitsTotal = run.summary.hits && run.summary.hits > run.summary.total
          ? `，共 ${run.summary.hits} 次命中已合并为 ${run.summary.total} 处`
          : ''
        return `「${run.instanceName}」共 ${run.summary.total} 处体验缺陷（严重 ${run.summary.error}，提示 ${run.summary.warn}${hitsTotal}）：\n${plan}\n\n${sections.join('\n\n')}\n\n${runRef}`
      }
    }))

    register(defineTool({
      name: 'ux_create_instance',
      description: 'Register a page in the UX test workbench so it can be tested repeatedly. Give a page URL, or a local projectPath for a project folder (the workbench starts it and tests whatever it serves). Detectors, themes and viewports are decided automatically per page.',
      parameters: {
        name: { type: 'string', required: true, description: 'Instance name.' },
        url: { type: 'string', description: 'Page URL, or "builtin:demo" for the built-in demo page. Omit when projectPath is given.' },
        projectPath: { type: 'string', description: 'Absolute path to a local project folder. The workbench starts a static server or its dev script, then tests the served page.' },
        description: { type: 'string', description: 'What this instance is for.' }
      },
      output: textOutput(),
      async execute(args) {
        const projectPath = typeof args?.projectPath === 'string' ? args.projectPath.trim() : ''
        if (!args?.url && !projectPath) {
          return '需要给一个网址，或者一个本地项目文件夹路径（projectPath）。'
        }
        const created = normalizeInstance({
          name: args?.name || (projectPath ? projectLabel(projectPath) : ''),
          url: args?.url || '',
          projectPath,
          description: args?.description,
          detectors: null,
          viewports: [],
          themes: null
        })
        const instances = await loadInstances()
        instances.push(created)
        await saveInstances(instances)
        const target = created.url || `本地项目 ${created.projectPath}`
        return `已登记「${created.name}」（id=${created.id}），目标 ${target}。检测项、主题与视口会在开跑时按页面实际能力自动决定。用 ux_run_check 可以立刻跑一次。`
      }
    }))

    register(defineTool({
      name: 'ux_save_report',
      description: 'Write your conclusion back into the UX workbench so the user can read it in the panel. This is the required last step after testing: the tool run record only holds measurements, while what you judged and how to fix it belongs here. Never finish a check with the conclusion living only in the chat. Provide Markdown; the first "# heading" becomes the title.',
      parameters: {
        markdown: { type: 'string', required: true, description: 'The conclusion as Markdown: what was tested, findings with severity and location, and how to fix each one.' },
        title: { type: 'string', description: 'Short report title. Defaults to the first Markdown heading.' },
        summary: { type: 'string', description: 'One-line verdict shown in the report list, e.g. "通过 3 项，遗留 2 处对比度问题".' },
        target: { type: 'string', description: 'Which page or project this conclusion is about (URL or folder path).' },
        instanceId: { type: 'string', description: 'Workbench instance id, when the check ran on a registered project.' },
        runId: { type: 'string', description: 'The run id returned by ux_run_check, to tie the conclusion to that measurement.' },
        id: { type: 'string', description: 'Existing report id to overwrite instead of creating a new one.' }
      },
      output: textOutput(),
      async execute(args) {
        const existing = args?.id ? await readReport(String(args.id)).catch(() => null) : null
        const report = await saveReport(normalizeReport(args, existing))
        // 不要说「面板能看到」：结论区已经从面板上去掉了，结论只在对话里读。
        // 说错会让 AI 之后跟用户讲一个不存在的界面。
        return `结论已存档：「${report.title}」（id=${report.id}）${existing ? '（已更新原结论）' : ''}。`
          + `\n用 ux_list_reports 可以再读回来，便于对比「修了没有」。`
      }
    }))

    register(defineTool({
      name: 'ux_list_reports',
      description: 'List conclusions already saved in the UX workbench, newest first. Use it to check whether this page was tested before, or to answer "上次测完是什么结论".',
      parameters: {
        limit: { type: 'number', description: 'How many to return, default 10.' }
      },
      output: textOutput(),
      async execute(args) {
        const limit = Math.min(50, Math.max(1, Number(args?.limit) || 10))
        const reports = await listReports(limit)
        if (!reports.length) return '工作台里还没有任何结论报告。测完用 ux_save_report 写一份。'
        return reports.map((item) => {
          const where = item.target ? `\n  对象：${item.target}` : ''
          const run = item.runId ? `\n  关联运行：${item.runId}` : ''
          return `- ${item.title}（id=${item.id}）\n  ${item.createdAt}${item.summary ? `：${item.summary}` : ''}${where}${run}`
        }).join('\n')
      }
    }))

    return () => {}
  }, 'ux-workbench: agent tools')

  /**
   * 会话身份：只在属于本工作台的会话里渲染。
   *
   * 没有这一步，工作台里新建的会话拿到的是一张白纸 —— 模型看得到工具，
   * 却不知道自己处在工作台里、该主动开场、该把结论写回工作台。
   */
  ctx.effect(() => ctx.systemPrompt.section(identitySection(root)), 'ux-workbench: identity')

  /**
   * 随插件下发的技能：装上就有，不需要用户自己去技能目录里放文件。
   *
   * `skills` 是宿主的可选服务（老版本没有），所以用 ctx.inject 探测 ——
   * 缺了只是少一个技能，工作台其它功能照常。
   */
  ctx.inject(['skills'], (scoped) => {
    scoped.effect(() => {
      const content = readSkillMarkdown()
      if (!content) return () => {}
      try {
        return scoped.skills.register({
          name: 'ux-experience-check',
          description: SKILL_DESCRIPTION,
          whenToUse: SKILL_WHEN_TO_USE,
          source: 'bundled',
          content
        })
      } catch (error) {
        // 同名技能已存在、宿主版本不认这个字段 —— 都不能让插件装载失败。
        console.warn(`[dsh-ux-workbench] 技能登记失败：${(error && error.message) || error}`)
        return () => {}
      }
    }, 'ux-workbench: skill')
  })

  ctx.systemPrompt.section({
    name: 'tool:ux-workbench',
    order: 133,
    text: [
      'The 找茬工作台 (Bug Hunt workbench) is a DSH workbench for real-browser experience checks on web pages (体验检测 / 交互丝滑性 / 视觉缺陷). When you mention it to the user, call it 找茬工作台.',
      'The workbench keeps its own project area. When the user names a project — 「测一下 xxx」「xxx 有问题」「检查我的 xxx」 — resolve it in the workbench FIRST: call ux_list_instances, or pass project="xxx" to ux_run_check, which matches by name inside the workbench.',
      'Do NOT search the filesystem, do not ask the user for a path, and do not claim the project is missing before checking the workbench project list. These projects are already registered with their folder path and dev server; searching the disk first wastes the user\'s time and often finds the wrong copy.',
      'Only when nothing in the workbench matches that name should you look on the computer — and then hand the absolute path over as projectPath, or ask the user to add the folder in the panel.',
      'When the user says “帮我检测/测试/扫描/检查/审计一个网站” or provides a URL with a testing request, you MUST call ux_run_check with that URL. Do not merely describe how to test it and do not claim success without the tool result.',
      'ux_run_check persists every completed run in this workbench history. After the tool returns, summarize the actual URL, plan, combinations, defect totals, severity, locations and fixes; distinguish tool facts from interpretation.',
      'When the user says “帮我启动/运行/跑起来 xxx” or “把项目跑起来”, call ux_start_project with the project name. Do not tell them to start it themselves and do not grep the disk for a start command.',
      'After ux_start_project succeeds, report the exact URL, what is being served, and how to test it: preview it in the panel, then either say “测一下 <项目名>” or run ux_run_check on that URL. Mention that this workbench measures experience defects (overflow, tap targets, dark-mode leftovers, contrast, focus visibility, feedback latency, dropped frames), not functional correctness.',
      'If the folder has no frontend page, say so plainly: without a page there is nothing to measure. Do not invent a URL.',
      'If the browser is unavailable or the URL cannot be opened, report the test as blocked/failed with the returned reason; never turn a blocked run into a pass.',
      'The engine automatically detects theme support, chooses detectors and viewports, expands low-risk interactive states, and returns measured defects with selectors, metrics and fixes.',
      'This workbench detects experience defects that have no functional oracle: text overflow past a container, tap targets below 44px, light-colored blocks left behind in dark mode,',
      'contrast below the WCAG threshold, invisible keyboard focus, slow interaction feedback, and animation frame drops.',
      'When the user says a button text overflows, the dark theme still has light modules, or interaction feels not smooth, prefer ux_run_check over guessing.',
      'After a check, call ux_save_report to write the conclusion back into the workbench — the run record only stores measurements, and a conclusion left only in the chat is gone once the user switches sessions.',
      'Do not ask the user to pick a template or set thresholds: the page is measured against a defined standard, not against a per-project profile.'
    ].join(' ')
  })
}

function textOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
  }
}
