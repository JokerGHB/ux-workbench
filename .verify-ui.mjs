/**
 * 真实浏览器验证新界面：
 *   1. 文件树能渲染、能展开目录、能看到文件
 *   2. 点代码文件 → 右侧显示带行号的代码
 *   3. 左栏可拖宽，右栏是覆盖层（不挤压主区）
 *   4. 拖右栏时主区内容宽度不变（这就是「覆盖而不是挤压」的证据）
 */
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:5599/'

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(1200)

let pass = 0, fail = 0
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label} ${extra}`) }
}

console.log('=== 面板是否渲染 ===')
ok('工作台根节点存在', await page.locator('.uxw').count() > 0)
if (!(await page.locator('.uxw').count())) {
  console.log('页面文字:', (await page.locator('body').innerText()).slice(0, 400))
  console.log('错误:', errors.join('\n'))
  await browser.close()
  process.exit(1)
}

console.log('\n=== 项目是文件夹行，不是按钮卡片 ===')
// 项目行应该只是一个可点的行：没有卡片式边框、没有白底
const projStyle = await page.locator('.uxwProjMain').first().evaluate((el) => {
  const cs = getComputedStyle(el)
  return { bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderRadius }
})
console.log('  项目行样式:', JSON.stringify(projStyle))
ok('项目行没有边框', projStyle.border === '0px' || projStyle.border === '0')
ok('项目行没有填充底色', projStyle.bg === 'rgba(0, 0, 0, 0)' || projStyle.bg === 'transparent')
ok('项目行有展开箭头', await page.locator('.uxwProjRow .uxwTreeChevron').count() >= 2,
  `实际 ${await page.locator('.uxwProjRow .uxwTreeChevron').count()}`)

console.log('\n=== 点一下折叠，再点展开 ===')
const firstProj = page.locator('.uxwProjMain').first()
ok('初始是展开的', await page.locator('.uxwProj > .uxwTree').count() === 1)
await firstProj.click()
await page.waitForTimeout(450)
ok('再点一次折叠了文件树', await page.locator('.uxwProj > .uxwTree').count() === 0,
  `实际 ${await page.locator('.uxwProj > .uxwTree').count()} 棵`)
const chevronAfter = await page.locator('.uxwProjRow .uxwTreeChevron').first().getAttribute('data-open')
ok('折叠后箭头朝右', chevronAfter === 'false', `data-open=${chevronAfter}`)
await firstProj.click()
await page.waitForTimeout(450)
ok('再点又展开了', await page.locator('.uxwProj > .uxwTree').count() === 1)
const chevronOpen = await page.locator('.uxwProjRow .uxwTreeChevron').first().getAttribute('data-open')
ok('展开后箭头朝下', chevronOpen === 'true', `data-open=${chevronOpen}`)

console.log('\n=== 只有「项目」一个区，没有单独的「文件」区 ===')
const sideText = await page.locator('.uxwSide').innerText()
console.log('  左栏:', sideText.replace(/\s+/g, ' ').slice(0, 160))
ok('没有独立的「文件」标题', !/^\s*文件\s*$/m.test(sideText.split('\n').map((s) => s.trim()).join('\n')))
ok('有「项目」区', sideText.includes('项目'))

console.log('\n=== 文件树挂在当前项目下 ===')
const projBlocks = page.locator('.uxwProj')
ok('项目块存在', await projBlocks.count() >= 2, `实际 ${await projBlocks.count()} 个`)
// 只有当前选中的项目里才有文件树
const treesInProjects = await page.locator('.uxwProj > .uxwTree').count()
ok('只有展开的项目带文件树', treesInProjects === 1, `实际 ${treesInProjects} 棵`)

const treeRows = page.locator('.uxwProj > .uxwTree .uxwTreeRow')
const rowCount = await treeRows.count()
ok('文件树有内容', rowCount > 0, `实际 ${rowCount} 行`)
const rootNames = await treeRows.allInnerTexts()
console.log('  根目录:', rootNames.map((s) => s.trim()).join(' | '))
ok('列出了 src 目录', rootNames.some((s) => s.includes('src')))
ok('列出了 index.html', rootNames.some((s) => s.includes('index.html')))
ok('目录有展开箭头', await page.locator('.uxwTreeChevron').count() > 0)

// 展开 src
console.log('\n=== 展开目录 ===')
const srcRow = treeRows.filter({ hasText: 'src' }).first()
await srcRow.click()
await page.waitForTimeout(600)
const afterExpand = await treeRows.allInnerTexts()
console.log('  展开后:', afterExpand.map((s) => s.trim()).join(' | '))
ok('展开后出现 app.js', afterExpand.some((s) => s.includes('app.js')))
ok('展开后出现 style.css', afterExpand.some((s) => s.includes('style.css')))

console.log('\n=== 点文件看代码 ===')
const appRow = treeRows.filter({ hasText: 'app.js' }).first()
await appRow.click()
await page.waitForTimeout(800)
const codeText = await page.locator('.uxwCodeText').innerText().catch(() => '')
console.log('  代码首行:', codeText.split('\n')[0])
ok('代码区出现', codeText.length > 0)
ok('内容正确', codeText.includes('pick')
  ? true
  : codeText.includes('mount') || codeText.includes('export'))
const gutter = await page.locator('.uxwCodeGutter span').count()
ok('有行号', gutter > 0, `实际 ${gutter} 行`)
ok('右栏切到 file 模式', await page.locator('.uxwPv[data-mode=file]').count() > 0)
ok('文件名显示在头部', (await page.locator('.uxwCodeName').allInnerTexts()).join(' ').includes('app.js'))

console.log('\n=== 右栏是覆盖而非挤压 ===')
// 主区内容在右栏展开前后的宽度应保持不变
const mainBox = await page.locator('.uxwMain').boundingBox()
const reportText = await page.locator('.uxwMain').evaluate((el) => el.scrollWidth)
console.log(`  主区 ${Math.round(mainBox.width)}px, scrollWidth ${reportText}`)
const pvBox = await page.locator('.uxwPv').boundingBox()
ok('右栏存在且有宽度', pvBox && pvBox.width > 200, `实际 ${pvBox && Math.round(pvBox.width)}`)
// 覆盖的证据：右栏右边界贴住主区右边界，且它与主区重叠
const overlap = mainBox.x + mainBox.width - pvBox.x
console.log(`  右栏与主区横向重叠 ${Math.round(overlap)}px`)
ok('右栏覆盖在主区之上（有重叠）', overlap > 0)

console.log('\n=== 拖右栏改宽度 ===')
const beforeW = (await page.locator('.uxwPv').boundingBox()).width
const handle = page.locator('.uxwPvResize').first()
const hb = await handle.boundingBox()
if (hb) {
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 300)
  await page.mouse.down()
  await page.mouse.move(hb.x - 160, hb.y + 300, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(350)
}
const afterW = (await page.locator('.uxwPv').boundingBox()).width
console.log(`  宽度 ${Math.round(beforeW)}px -> ${Math.round(afterW)}px`)
ok('右栏可以拖宽', afterW > beforeW + 60, `变化 ${Math.round(afterW - beforeW)}px`)
// 拖动右栏时，报告区的「让位内边距」应随之变化，但主区盒子宽度不变
const mainAfter = await page.locator('.uxwMain').boundingBox()
ok('主区盒子宽度没被挤压', Math.abs(mainAfter.width - mainBox.width) < 2,
  `${Math.round(mainBox.width)} -> ${Math.round(mainAfter.width)}`)

console.log('\n=== 拖左栏改宽度 ===')
const sideBefore = (await page.locator('.uxwSide').boundingBox()).width
const lh = await page.locator('.uxwGutterHandle').first().boundingBox()
if (lh) {
  await page.mouse.move(lh.x + lh.width / 2, lh.y + 260)
  await page.mouse.down()
  await page.mouse.move(lh.x + 110, lh.y + 260, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}
const sideAfter = (await page.locator('.uxwSide').boundingBox()).width
console.log(`  左栏 ${Math.round(sideBefore)}px -> ${Math.round(sideAfter)}px`)
ok('左栏可以拖宽', sideAfter > sideBefore + 50, `变化 ${Math.round(sideAfter - sideBefore)}px`)

console.log('\n=== 宽度记忆 ===')
const savedSide = await page.evaluate(() => localStorage.getItem('uxw.sideWidth'))
const savedPv = await page.evaluate(() => localStorage.getItem('uxw.previewWidth'))
console.log(`  sideWidth=${savedSide} previewWidth=${savedPv}`)
ok('左栏宽度已记住', Number(savedSide) > 0)
ok('右栏宽度已记住', Number(savedPv) > 0)

console.log('\n=== 切换到另一个项目 ===')
// 点第二个项目：树应该搬过去，且已打开的文件被收掉
const projButtons = page.locator('.uxwProjMain')
console.log('  项目数:', await projButtons.count())
await projButtons.nth(1).click()
await page.waitForTimeout(700)
const treesAfterSwitch = await page.locator('.uxwProj > .uxwTree').count()
ok('切换后仍然只有一棵树', treesAfterSwitch === 1, `实际 ${treesAfterSwitch}`)
ok('切换后文件被收起', await page.locator('.uxwCode').count() === 0)
// 第二个项目指向 D:/other，mock 里没有它的目录，树应为空或显示提示
const activeName = await page.locator('.uxwProjRow[data-active=true] .uxwProjName').innerText()
console.log('  当前项目:', activeName.trim())
ok('当前项目已切到第二个', activeName.includes('other-project'))

console.log('\n=== 切回第一个项目 ===')
await projButtons.nth(0).click()
await page.waitForTimeout(600)
ok('切回后项目正确', (await page.locator('.uxwProjRow[data-active=true] .uxwProjName').innerText()).includes('demo-project'))
ok('切回后文件树回来', await page.locator('.uxwProj > .uxwTree .uxwTreeRow').count() > 0)

console.log('\n=== 关闭文件回到网页 ===')
if (await page.locator('.uxwCodeName').count()) {
  await page.locator('.uxwPvHead .uxwPvBtn').last().click()
  await page.waitForTimeout(400)
}
ok('关闭后不再显示代码', await page.locator('.uxwCode').count() === 0)

await page.screenshot({ path: '.shot-workbench.png', fullPage: false })
console.log('\n截图: .shot-workbench.png')

console.log('\n=== 页面错误 ===')
const real = errors.filter((e) => !/favicon|net::ERR_/.test(e))
console.log(real.length ? real.slice(0, 8).join('\n') : '  无')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
await browser.close()
process.exitCode = fail ? 1 : 0