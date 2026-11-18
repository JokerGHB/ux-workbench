/**
 * 优化前后对比验证：真实走 index.js 的 executeRun 路径不现实（需要插件运行时），
 * 所以这里复刻 executeRun 的组合循环，直接调生产模块，确保测的是改完的代码。
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PKG = 'D:/work/工作台/ux-workbench'
const engine = await import(pathToFileURL(path.join(PKG, 'dsh/engine.js')).href)
const explore = await import(pathToFileURL(path.join(PKG, 'dsh/explore.js')).href)

const url = process.argv[2] || 'http://127.0.0.1:5500/index.html'
const bi = await engine.detectBrowser(fs)
const browser = await chromium.launch({ executablePath: bi.executablePath, headless: true, args: ['--no-sandbox'] })

const t0 = Date.now()

// 复刻 executeRun 第 1 步：探测
const probeCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const probePage = await probeCtx.newPage()
await probePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await probePage.waitForTimeout(400)
const capability = await explore.detectThemeCapability(probePage)
const viewports = await explore.suggestViewports(probePage, null)
const states = await explore.discoverStates(probePage, 12)
await probeCtx.close()

const detectors = engine.decideDetectors(capability, states.length)
const themes = capability.supportsDark ? ['light', 'dark'] : ['light']

console.log('URL:', url)
console.log('视口:', viewports.map((v) => `${v.label}(${v.width})`).join(', '))
console.log('主题:', themes.join(','), '| 检测项:', detectors.filter((d) => d.enabled).map((d) => d.id).join(','))
console.log('发现状态:', states.length, '\n')

let totalIssues = 0
for (const viewport of viewports) {
  for (const theme of themes) {
    const t = Date.now()
    const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(350)
    await page.emulateMedia({ colorScheme: theme })

    const base = await engine.runChecks(page, detectors, { theme, state: '首屏' })
    const baseline = new Set(base.issues.map((i) => `${i.kind}::${i.target || i.title}`))
    const expanded = await explore.expandAndScan(
      page, detectors,
      async (p, d, c) => engine.runChecks(p, d, { theme, ...c }),
      { maxExplorations: 12, baseline }
    )
    const count = base.issues.length + expanded.findings.length
    totalIssues += count
    console.log(`${(viewport.label + ' · ' + theme).padEnd(18)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  首屏=${base.issues.length} 交互新增=${expanded.findings.length} 动作=${expanded.visited.length} 跳过=${[...new Set([...base.skipped, ...(expanded.skipped || [])])].join('/') || '-'}`)
    await ctx.close()
  }
}

await browser.close()
const total = (Date.now() - t0) / 1000
console.log(`\n整轮 ${total.toFixed(1)}s | 缺陷合计 ${totalIssues}`)