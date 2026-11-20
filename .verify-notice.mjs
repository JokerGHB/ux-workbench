/**
 * 「点不动」的守则。
 *
 * 用户的抱怨是「这一块点不动」。根因有两层：
 *   1. 检测器没给 rect，界面把整行渲染成不可点的 div
 *   2. 就算可点，没有预览会话时也是静默 return，点了没反应
 *
 * 现在的要求：
 *   - 没有 rect 的行仍然是按钮，可以点
 *   - 点了给出解释（轻提示），而不是毫无反应
 *   - 解释不能把报告整块换掉 —— 报告必须还在原地
 */

import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:5599/'

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(1800)

let pass = 0, fail = 0
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

console.log('=== 面板是否渲染 ===')
const hasPanel = await page.locator('.uxw').count() > 0
ok('工作台根节点存在', hasPanel)
if (!hasPanel) {
  console.log('页面文字:', (await page.locator('body').innerText()).slice(0, 500))
  console.log('错误:', errors.join('\n'))
  await browser.close()
  process.exit(1)
}

console.log('\n=== 先打开那条只有横向溢出的报告 ===')
// 历史里那条记录
const runRow = page.locator('.uxwRunRow .uxwRun').first()
await runRow.click()
await page.waitForTimeout(1500)

const issueRows = page.locator('.uxwRow')
const n = await issueRows.count()
console.log(`  报告里有 ${n} 条问题`)
ok('报告加载出来了', n > 0)

if (n > 0) {
  const row = issueRows.first()
  const tag = await row.evaluate((el) => el.tagName)
  const locatable = await row.getAttribute('data-locatable')
  console.log(`  第一条是 <${tag.toLowerCase()}>, data-locatable=${locatable}`)

  ok('没有 rect 的行仍然渲染成 button（可点）', tag === 'BUTTON', `实际 ${tag}`)
  ok('标了 data-locatable=false', locatable === 'false', `实际 ${locatable}`)

  console.log('\n=== 点它：应该有解释，报告不能被替换 ===')
  const titleBefore = await page.locator('.uxwHeadTitle').innerText()
  await row.click()
  await page.waitForTimeout(700)

  const notice = page.locator('.uxwNotice')
  const noticeCount = await notice.count()
  ok('出现了轻提示', noticeCount > 0, `实际 ${noticeCount} 个`)
  if (noticeCount > 0) {
    const text = await notice.innerText()
    console.log('  提示文字:', text.replace(/\n/g, ' | '))
    ok('解释了没有坐标', /坐标|框出来/.test(text), text)
    ok('提到整页溢出的排查方向', /布局层面|修复建议/.test(text), text)
  }

  // 关键：报告必须还在
  const titleAfter = await page.locator('.uxwHeadTitle').innerText().catch(() => '')
  ok('报告标题还在（没被错误条换掉）', titleAfter === titleBefore, `${titleBefore} → ${titleAfter}`)
  ok('问题列表还在', await page.locator('.uxwRow').count() === n)
  ok('没有渲染成致命错误条', await page.locator('.uxwAlert').count() === 0)

  console.log('\n=== 轻提示几秒后自动消失 ===')
  await page.waitForTimeout(6500)
  ok('提示已自动收起', await page.locator('.uxwNotice').count() === 0)
  ok('报告仍在', await page.locator('.uxwRow').count() === n)
}

console.log('\n=== 页面错误 ===')
if (errors.length) console.log(errors.join('\n'))
else console.log('  无')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)