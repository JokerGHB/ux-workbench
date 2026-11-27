/**
 * 新手导览的自检。
 *
 * 这里守两类东西，都是「改坏了不会报错，只会静默指错地方」的那种：
 *
 * 1. **步骤表的锚点真的存在**。导览靠 data-tour 属性找人，靠 id 或
 *    「第几个按钮」都不可靠。但属性是手写的，加新步骤忘了挂属性，
 *    运行时只会表现为「那一步被跳过了」—— 不报错、不明显，最难发现。
 * 所以这里把「步骤里写的每个 anchor」和「源码里挂的 data-tour」对齐。
 *
 * 2. **定位算法的边界**。卡片绝不能落到面板外面 —— 出了界就被面板
 *    的 overflow 裁掉，用户看到的是半张卡片或者干脆没有了。
 *    这个算法纯几何，用假的矩形就能钉死。
 *
 * 不启动浏览器：placeTourCard 和 TOUR_STEPS 都是可独立求值的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'lib', 'client.js')

const source = () => readFile(sourcePath, 'utf8')

/**
 * 从源码里切出一段声明体（按括号配对，不依赖行号）。
 *
 * 支持两种写法：
 *   const NAME = <表达式>
 *   function NAME(...) { ... }
 * 返回去掉声明头之后的「剩余部分」—— const 给表达式本身，
 * function 给 `(...) { ... }`，两者拼回 `NAME = ` 后都能直接求值。
 */
function sliceConst(src, name) {
  const constHead = `const ${name} = `
  const funcHead = `function ${name}(`
  const isFunc = !src.includes(constHead)
  const head = isFunc ? funcHead : constHead
  const start = src.indexOf(head)
  assert.ok(start > 0, `源码里应当能找到 ${head.trim()}`)

  if (isFunc) {
    // 从参数表的 '(' 开始配对。注意不能一配平就收工：参数表结束时
    // depth 也会回到 0，那样切出来的只有 `(...)`，没有函数体。
    // 所以要等到「进过 body 的 { 并且整体归零」才算结束。
    let i = start + head.length - 1
    let depth = 0
    let inBody = false
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '{') inBody = true
      if (c === '(' || c === '{' || c === '[') depth++
      else if (c === ')' || c === '}' || c === ']') depth--
      if (inBody && depth === 0) break
    }
    assert.ok(inBody && depth === 0, `${name} 的括号没有配平`)
    return src.slice(start + head.length - 1, i + 1)
  }

  // const：从 '=' 之后开始，按三种括号一起配对。
  // 有一处必须特判：`const f = (a, b) => ...` 里参数表闭合时 depth 也会回零，
  // 直接收工会切出只有 `(a, b)` 的残片。所以归零后先看后面是不是 `=>`，
  // 是就继续往下扫表达式主体。
  let i = start + head.length
  let depth = 0
  let began = false
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '{' || c === '[' || c === '(') { depth++; began = true }
    else if (c === '}' || c === ']' || c === ')') depth--
    else if (!began && c === '\n') break
    if (began && depth === 0) {
      // 看穿空白：接下来是 `=>` 就说明这只是参数表，不是表达式结束。
      // 把游标推到 `>` 之后并重新开始计数，避免箭头体另起一行时被当成结尾。
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (src.startsWith('=>', j)) {
        // 箭头体还没开始读：游标推到 `>` 之后，began 复位。
        // 但不能设 began=true —— 紧跟着的空格会被误判成「表达式已结束」。
        i = j + 1
        began = false
        depth = 0
        continue
      }
      i++
      break
    }
  }
  return src.slice(start + head.length, i)
}

/** 求值 placeTourCard 需要的常量与函数。 */
async function loadPlacer() {
  const src = await source()
  const constants = ['TOUR_SPOT_PAD', 'TOUR_GAP', 'TOUR_INSET']
    .map((name) => `const ${name} = ${sliceConst(src, name).trim().replace(/;$/, '')};`)
    .join('\n')
  const clamp = `const tourClamp = ${sliceConst(src, 'tourClamp').trim().replace(/;$/, '')};`
  const placer = `const placeTourCard = function ${sliceConst(src, 'placeTourCard')};`
  // eslint-disable-next-line no-new-func
  return new Function(`${constants}\n${clamp}\n${placer}\nreturn placeTourCard`)()
}

async function loadSteps() {
  const src = await source()
  const expr = sliceConst(src, 'TOUR_STEPS')
  // eslint-disable-next-line no-new-func
  return new Function(`return ${expr}`)()
}

test('步骤 id 唯一、place 合法', async () => {
  const steps = await loadSteps()
  assert.ok(steps.length >= 5, '导览至少要有 5 步')
  const ids = steps.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length, '步骤 id 不能重复')
  const legal = new Set(['top', 'bottom', 'left', 'right', 'center'])
  for (const step of steps) {
    assert.ok(legal.has(step.place), `${step.id} 的 place 非法：${step.place}`)
    assert.ok(step.title && step.body, `${step.id} 缺少文案键`)
    // 有锚点的步骤不能声明 center：center 是「没有锚点」的降级写法
    if (step.anchor) assert.notEqual(step.place, 'center', `${step.id} 有锚点却声明了 center`)
  }
})

test('步骤数是固定的，不许因为锚点量不到而变少', async () => {
  const src = await source()
  const steps = await loadSteps()
  // 这个数字是给用户的承诺：说七步就是七步。
  // 早先的实现在锚点量不到时会把整步过滤掉，于是功能测试模式
  // 或窄屏下七步会悄悄变成四步 —— 用户只看到一个变小的分母。
  assert.equal(steps.length, 7, '导览固定七步')

  // 源码里不能再出现「按锚点可用性过滤步骤」的逻辑
  assert.ok(!/buildTourPlan/.test(src), '不该再有 buildTourPlan 这类过滤：跳过 = 少讲内容')
  // 步骤表的长度必须直接来自 TOUR_STEPS，而不是某个可变数组
  assert.ok(/TOUR_STEPS\.length/.test(src), '总步数应当直接读 TOUR_STEPS 的长度')
  assert.ok(!/tourPlan/.test(src), '不该再有 tourPlan 这种「实际要走的步骤」影子状态')
})

test('步骤表里的文案键在中英两份词典里都有', async () => {
  const src = await source()
  const steps = await loadSteps()
  const zhAt = src.indexOf('const zh = {')
  assert.ok(zhAt > 0, '应有中文词典')
  const zh = src.slice(zhAt)

  for (const step of steps) {
    for (const key of [step.title, step.body]) {
      assert.ok(zh.includes(`${key}:`), `中文词典缺 ${key}`)
      // 两份词典都在同一份源码里，英文那份在中文之后；
      // 用「出现至少两次」确认中英都写了，而不是只有一边。
      const hits = src.match(new RegExp(`\\b${key}:`, 'g')) || []
      assert.ok(hits.length >= 2, `${key} 应当中英各一份，实际只有 ${hits.length} 份`)
    }
  }
})

test('最后一步的按钮叫「演示」，不是一长串', async () => {
  const src = await source()
  // 按钮就那么点宽，文案长了会把下一步挤走；用户也只要知道「这是演示」。
  assert.match(src, /tourRunDemo: '演示'/, '中文应当是「演示」')
  assert.match(src, /tourRunDemo: 'Demo'/, '英文应当是「Demo」')
  assert.ok(!/tourRunDemo: '跑一次演示场'/.test(src), '旧按钮文案应当已经换掉')
})

test('导览卡片里的按钮不带悬停变色', async () => {
  const src = await source()
  // 全局主色按钮靠 filter:brightness 提亮。导览是一屏一屏读的，
  // 鼠标扫过就闪一下等于给静止的说明加噪音，卡片内要压掉。
  assert.match(src, /\.uxwTourCard \.uxwBtn\[data-variant=primary\]:hover[^{]*\{[^}]*filter:none/,
    '主色按钮（下一步 / 演示）悬停不该提亮')
  // 只压卡片内的，不能把工作台其它地方的按钮一起改哑
  const globalPrimaryHover = src.match(/\.uxwBtn\[data-variant=primary\]:hover:not\(:disabled\)\{filter:brightness/g)
  assert.ok(globalPrimaryHover, '卡片外的按钮仍应保留悬停反馈')
})

test('每个 anchor 在源码里都有对应的 data-tour 属性', async () => {
  const src = await source()
  const steps = await loadSteps()
  // 只认对象字面量里的写法，避免匹配到测试或注释里的同名字符串
  const declared = new Set()
  const pattern = /'data-tour':\s*'([a-z0-9-]+)'/g
  let match
  while ((match = pattern.exec(src))) declared.add(match[1])

  for (const step of steps) {
    if (!step.anchor) continue
    assert.ok(
      declared.has(step.anchor),
      `步骤 ${step.id} 的锚点 "${step.anchor}" 在 client.js 里找不到 'data-tour': '${step.anchor}'`
    )
  }
  // 反向也查一次：挂上去却没人用的标记是噪音，会让人以为它还在生效
  const used = new Set(steps.map((s) => s.anchor).filter(Boolean))
  for (const anchor of declared) {
    if (anchor.startsWith('tour-')) continue // 重播按钮不属于步骤
    assert.ok(used.has(anchor), `data-tour="${anchor}" 挂上了，但没有步骤在用它`)
  }
})

test('卡片永远落在面板内', async () => {
  const place = await loadPlacer()
  const bounds = { width: 1200, height: 800 }
  const size = { width: 334, height: 190 }

  // 覆盖四个角、四条边、以及面板中心
  const spots = [
    null,
    { left: 0, top: 0, width: 80, height: 30 },
    { left: 1100, top: 0, width: 80, height: 30 },
    { left: 0, top: 760, width: 80, height: 30 },
    { left: 1100, top: 760, width: 80, height: 30 },
    { left: 600, top: 0, width: 60, height: 60 },
    { left: 600, top: 740, width: 60, height: 60 },
    { left: 0, top: 400, width: 60, height: 60 },
    { left: 1140, top: 400, width: 60, height: 60 },
    { left: 560, top: 380, width: 80, height: 40 },
    // 比面板还大：高亮整块主区那种情况
    { left: -10, top: -10, width: 1240, height: 830 }
  ]
  for (const spot of spots) {
    for (const prefer of ['top', 'bottom', 'left', 'right', 'center']) {
      const out = place(spot, size, bounds, prefer)
      const label = `spot=${JSON.stringify(spot)} prefer=${prefer}`
      assert.ok(out.left >= 0, `${label}: left 越界 ${out.left}`)
      assert.ok(out.top >= 0, `${label}: top 越界 ${out.top}`)
      assert.ok(out.left + size.width <= bounds.width, `${label}: 右边越界`)
      assert.ok(out.top + size.height <= bounds.height, `${label}: 下边越界`)
      assert.ok(Number.isFinite(out.arrowX) && Number.isFinite(out.arrowY), `${label}: 箭头坐标不是数`)
    }
  }
})

test('空间足够时沿用期望方向', async () => {
  const place = await loadPlacer()
  const bounds = { width: 1200, height: 800 }
  const size = { width: 300, height: 180 }
  const spot = { left: 500, top: 380, width: 100, height: 40 }

  // 四个方向空间都够，期望方向应当被尊重
  for (const prefer of ['top', 'bottom', 'left', 'right']) {
    const out = place(spot, size, bounds, prefer)
    assert.equal(out.dir, prefer, `期望 ${prefer}，实际 ${out.dir}`)
  }
})

test('期望方向放不下时换到放得下的方向', async () => {
  const place = await loadPlacer()
  const size = { width: 300, height: 180 }
  // 顶栏里的元素：上方几乎没有空间
  const spot = { left: 400, top: 4, width: 120, height: 44 }
  const out = place(spot, size, { width: 1200, height: 800 }, 'top')
  assert.notEqual(out.dir, 'top', '上方放不下就不该硬塞在上面')
  assert.equal(out.dir, 'bottom', '下方有充足空间，应当落到下面')
})

test('锚点居中时箭头指向锚点中心', async () => {
  const place = await loadPlacer()
  const bounds = { width: 1200, height: 800 }
  const size = { width: 300, height: 180 }
  // 卡片在锚点下方且水平居中：箭头应当落在卡片横向正中
  const centered = { left: 550, top: 300, width: 100, height: 40 }
  const out = place(centered, size, bounds, 'bottom')
  const midX = out.left + size.width / 2
  assert.ok(Math.abs((out.arrowX + 6) - midX) <= 3,
    `居中的锚点，箭头应在卡片中线附近，实际 ${out.arrowX} vs ${midX}`)

  // 锚点偏到很右边：卡片被夹回面板内后，箭头必须跟着往右偏，
  // 否则会指着空白 —— 这正是「被夹过之后不能用卡片中点」的原因
  const right = { left: 1150, top: 300, width: 40, height: 40 }
  const outRight = place(right, size, bounds, 'bottom')
  assert.ok(outRight.arrowX > outRight.left + size.width * 0.6,
    `锚点靠右时箭头应当右偏，实际 x=${outRight.arrowX}，卡片 left=${outRight.left}`)
  // 而且不能跑到卡片外面
  assert.ok(outRight.arrowX + 6 <= outRight.left + size.width,
    '箭头不该超出卡片右边界')
})

test('没有锚点的步骤居中，且不画箭头方向', async () => {
  const place = await loadPlacer()
  const out = place(null, { width: 300, height: 180 }, { width: 1200, height: 800 }, 'center')
  assert.equal(out.dir, 'center')
  // 居中：左上留白应当接近（面板 - 卡片）/ 2
  assert.equal(out.left, Math.round((1200 - 300) / 2))
  assert.equal(out.top, Math.round((800 - 180) / 2))
})

/* ------------------------------------------------------------ 锚点测量 -- */

/**
 * 造一个假的测量环境。
 *
 * measureTourAnchor 读的是 tourRootRef.current，所以把 { current: root }
 * 从外面注进去 —— 这样它是纯几何函数，不需要真浏览器。
 * rects 用「相对面板左上角」的坐标描述每个锚点，省去每次减 base。
 */
async function loadMeasurer({ panel, rects }) {
  const src = await source()
  const pad = sliceConst(src, 'TOUR_SPOT_PAD').trim()
  const body = sliceConst(src, 'measureTourAnchor').trim()
  const fakeEl = (r) => ({
    getBoundingClientRect: () => ({
      left: r.left, top: r.top, width: r.width, height: r.height,
      right: r.left + r.width, bottom: r.top + r.height
    })
  })
  const root = {
    getBoundingClientRect: () => ({
      left: 0, top: 0, width: panel.width, height: panel.height,
      right: panel.width, bottom: panel.height
    }),
    querySelector: (selector) => {
      const name = /\[data-tour="(.+)"\]/.exec(selector)
      const hit = name && rects[name[1]]
      return hit ? fakeEl(hit) : null
    }
  }
  const fn = new Function('tourRootRef', 'TOUR_SPOT_PAD', `const measureTourAnchor = ${body}; return measureTourAnchor`)
  return fn({ current: root }, Number(pad))
}

test('锚点被窗口挤出边界时应当裁剪，而不是判成不存在', async () => {
  // 这是那次的真 bug：窄窗口下顶栏被挤，网址框右半边超出面板，
  // 旧实现直接 return null，于是这一步被整个丢掉，七步只剩四步。
  const measure = await loadMeasurer({
    panel: { width: 600, height: 700 },
    rects: {
      'url-field': { left: 500, top: 22, width: 180, height: 34 }
    }
  })
  const spot = measure('url-field')
  assert.ok(spot, '露出一半的锚点也必须能量到')
  // 裁到面板右边界：可见宽度 = 600 - 500 = 100，再各加 6px 的 pad
  assert.equal(spot.width, 100 + 12, '应当只框住可见的那一半')
  assert.ok(spot.left + spot.width <= 600 + 12, '高亮框不该超出面板太多')
})

test('完全在面板外的锚点才返回 null', async () => {
  const measure = await loadMeasurer({
    panel: { width: 600, height: 700 },
    rects: {
      offscreen: { left: 900, top: 22, width: 100, height: 30 },
      above: { left: 20, top: -200, width: 100, height: 30 }
    }
  })
  assert.equal(measure('offscreen'), null, '完全在右侧之外，指不到')
  assert.equal(measure('above'), null, '完全在面板之上，指不到')
})

test('不存在的锚点返回 null，不抛错', async () => {
  const measure = await loadMeasurer({ panel: { width: 600, height: 700 }, rects: {} })
  assert.equal(measure('nothing-here'), null)
})

test('尺寸为 0 的锚点返回 null（display:none / 还没布局）', async () => {
  const measure = await loadMeasurer({
    panel: { width: 600, height: 700 },
    rects: { hidden: { left: 10, top: 10, width: 0, height: 0 } }
  })
  assert.equal(measure('hidden'), null)
})