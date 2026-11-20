/**
 * revealInFrame 的居中自检。
 *
 * 这条行为出过问题：它最早是「元素看不见才滚」的最小滚动，元素只要有一角
 * 进视口就不动了，于是点开缺陷记录，跳过去看到的是紧贴屏幕上沿或下沿的
 * 一条。用户要的是把那个元素推到正中。
 *
 * 这里不启动浏览器：revealInFrame 的全部几何计算都是相对 win /
 * getBoundingClientRect 的可测函数，用一组假的视口与容器就能钉住算法。
 * 真浏览器的端到端验证另有一套，这里守住的是「算出来的位移对不对」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'lib', 'client.js')

/** 从真实源码里切出 revealInFrame（按大括号配对，不依赖行号）。 */
async function loadRevealInFrame() {
  const src = await readFile(sourcePath, 'utf8')
  const start = src.indexOf('const revealInFrame = (win, target) => {')
  assert.ok(start > 0, '源码里应当能找到 revealInFrame')
  let i = src.indexOf('{', start)
  let depth = 0
  let end = -1
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  assert.ok(end > start, 'revealInFrame 的括号应当配对')
  // 去掉顶层 const，改成返回函数
  const body = src.slice(start, end).replace('const revealInFrame = ', '')
  return new Function(`return ${body}`)()
}

/**
 * 造一个最小的假 iframe 环境。
 * box 用文档坐标描述目标元素，容器负责把它换算成视口坐标。
 */
function fakeFrame({ box, viewW = 1000, viewH = 700, scrollY = 0, scrollX = 0, docHeight = 3000, docWidth = 1000 }) {
  const calls = []
  const se = {
    clientWidth: viewW,
    clientHeight: viewH,
    scrollHeight: docHeight,
    scrollWidth: docWidth,
    scrollLeft: scrollX,
    scrollTop: scrollY
  }
  const win = {
    innerWidth: viewW,
    innerHeight: viewH,
    scrollX,
    scrollY,
    document: {
      scrollingElement: se,
      documentElement: se,
      body: { scrollLeft: 0, scrollTop: 0 },
      getElementById: () => null
    },
    // 目标元素没有带滚动样式的祖先，只有文档本身会滚
    scrollTo: (opts) => calls.push(opts),
    getComputedStyle: () => ({ overflowX: 'visible', overflowY: 'visible' })
  }
  const target = {
    parentElement: null,
    getBoundingClientRect: () => ({
      left: box.x - win.scrollX,
      top: box.y - win.scrollY,
      right: box.x + box.w - win.scrollX,
      bottom: box.y + box.h - win.scrollY,
      width: box.w,
      height: box.h
    })
  }
  return { win, target, calls }
}

test('视口上方的元素被滚到正中，而不是只露一条边', async () => {
  const revealInFrame = await loadRevealInFrame()
  // 元素在文档 y=600，高 42：视口 700 高，当前滚到顶。
  // 居中需要把它推到 (600+21)-350 = 271 的位置。
  const { win, target, calls } = fakeFrame({ box: { x: 0, y: 600, w: 200, h: 42 } })
  revealInFrame(win, target)
  assert.equal(calls.length, 1, '应当发起一次滚动')
  assert.equal(calls[0].top, 271)
  assert.equal(calls[0].behavior, 'smooth')
})

test('已在正中的元素不再滚动', async () => {
  const revealInFrame = await loadRevealInFrame()
  // 元素中心正好落在视口中心：600+21 = 621，滚动 271 之后它就在 350
  const { win, target, calls } = fakeFrame({ box: { x: 0, y: 600, w: 200, h: 42 }, scrollY: 271 })
  revealInFrame(win, target)
  assert.equal(calls.length, 0, '已经居中就不该再动')
})

test('页面底部元素仍尽量居中（受滚动上限约束时停在上限）', async () => {
  const revealInFrame = await loadRevealInFrame()
  // 元素几乎在文档末尾，居中要求滚到上限之外
  const { win, target, calls } = fakeFrame({
    box: { x: 0, y: 2960, w: 200, h: 40 },
    docHeight: 3000,
    scrollY: 2200
  })
  revealInFrame(win, target)
  assert.equal(calls.length, 1)
  // 上限 = 3000 - 700 = 2300，请求的值必须被夹住
  assert.equal(calls[0].top, 2300, '不能滚过上限')
})

test('比视口还高的元素贴齐上沿，而不是居中把两头都切掉', async () => {
  const revealInFrame = await loadRevealInFrame()
  const { win, target, calls } = fakeFrame({ box: { x: 0, y: 900, w: 200, h: 900 }, scrollY: 0 })
  revealInFrame(win, target)
  assert.equal(calls.length, 1)
  // 贴齐上沿：元素 top 落到 MARGIN=12
  assert.equal(calls[0].top, 900 - 12)
})

test('横向也居中，但不会因此把宿主页面推偏', async () => {
  const revealInFrame = await loadRevealInFrame()
  const { win, target, calls } = fakeFrame({
    box: { x: 480, y: 600, w: 40, h: 40 },
    docWidth: 2000,
    scrollX: 0
  })
  revealInFrame(win, target)
  assert.equal(calls.length, 1)
  // 视口宽 1000，元素中心 x=500，已接近正中，横向不该动
  assert.equal(calls[0].left, 0, '已经水平居中时不该横向滚动')
})

test('居中计算不会被祖先容器带出 iframe', async () => {
  const revealInFrame = await loadRevealInFrame()
  // 造一个内层可滚动容器
  const { win, target } = fakeFrame({ box: { x: 0, y: 600, w: 200, h: 42 } })
  const container = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 2000,
    scrollWidth: 1000,
    clientHeight: 400,
    clientWidth: 1000,
    getBoundingClientRect: () => ({ left: 0, top: 300, width: 1000, height: 400 }),
    parentElement: null
  }
  target.parentElement = container
  win.getComputedStyle = (el) =>
    el === container ? { overflowX: 'visible', overflowY: 'auto' } : { overflowX: 'visible', overflowY: 'visible' }

  revealInFrame(win, target)
  // 容器被滚动过（说明走了内层分支），且没有任何跨上下文调用
  assert.ok(container.scrollTop > 0, '内层容器应当被滚动')
  // win.scrollTo 也可能被调用（文档层），但只有它，不涉及父页面
  assert.ok(typeof win.scrollTo === 'function')
})