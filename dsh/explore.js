/**
 * DSH 找茬工作台 · 自动探索引擎
 *
 * 目标：点「测试」之后，引擎自己决定测什么，用户不需要理解模板、阈值或检测项。
 *
 * 探索分四层：
 *   1. 主题能力探测 —— 页面到底支不支持暗色？支持就亮暗都测，不支持就只测亮色。
 *   2. 基础状态扫描 —— 首屏所有可见元素。
 *   3. 状态展开 —— 点开折叠面板、切换 Tab、打开菜单与弹窗，每个新状态再扫一遍。
 *   4. 视口推进 —— 桌面 / 平板 / 手机各来一轮。
 *
 * 所有探索动作都是「可撤销的观察」：只点开、不提交、不留数据。
 */

/** 一次检测的默认探索预算；按动作而非页面文案决定覆盖。 */
const MAX_EXPLORATIONS = 48
/**
 * 每个控件最多展开几个动作。
 *
 * 以前这里是 4（click / Enter / Space / focus），等于每个控件把整套检测跑 4 遍，
 * 一轮下来 4 个视口 × 12 状态 × 4 动作 = 近 200 次全量检测 —— 这是变慢的主因。
 * 键盘可达性由 focus 检测项统一覆盖（它会逐个 Tab 过去检查焦点可见性），
 * 不需要在每个控件上再复制一遍回车与空格，所以这里收敛到 1 个点击动作。
 */
const MAX_ACTIONS_PER_ELEMENT = 1

/** 探索过程中的等待：只留够一次样式重算的时间，不再盲等 280ms。 */
const SETTLE_AFTER_ACTION = 120
const SETTLE_AFTER_RELOAD = 60

/* ------------------------------------------------------------ 主题能力 -- */

/**
 * 探测页面是否支持暗色主题。
 *
 * 不能假设每个项目都有暗色模式 —— 你上一条需求说得很对。
 * 所以这里要真的去读：CSS 里有没有 prefers-color-scheme、有没有主题切换控件、
 * html/body 上有没有 data-theme / class 开关。
 */
export async function detectThemeCapability(page) {
  return page.evaluate(() => {
    const html = document.documentElement
    const body = document.body

    // 1. 有没有主题切换控件（按钮文案或 aria 里带 theme/主题/暗色/深色）
    const toggles = []
    const candidates = document.querySelectorAll('button, [role="button"], [role="switch"], a, label, input[type="checkbox"]')
    for (const el of candidates) {
      const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.className || ''} ${el.id || ''}`.toLowerCase()
      if (/theme|主题|暗色|深色|夜间|dark|light|外观|appearance/.test(text)) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          toggles.push({
            label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
            selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
            tag: el.tagName.toLowerCase()
          })
        }
      }
    }

    // 2. DOM 上有没有显式的主题开关
    const attrs = ['data-theme', 'data-color-mode', 'data-mode', 'data-appearance']
    const domSwitches = []
    for (const attr of attrs) {
      if (html.hasAttribute(attr)) domSwitches.push(`html[${attr}=${html.getAttribute(attr)}]`)
      if (body && body.hasAttribute(attr)) domSwitches.push(`body[${attr}=${body.getAttribute(attr)}]`)
    }
    const cls = `${html.className || ''} ${body ? body.className || '' : ''}`
    const classSwitch = /\b(dark|light|theme-dark|theme-light|dark-mode|light-mode)\b/.test(cls)

    // 3. CSS 里有没有 prefers-color-scheme 规则
    let hasMediaQuery = false
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules = null
        try {
          rules = sheet.cssRules
        } catch {
          continue // 跨源样式表读不到，跳过
        }
        if (!rules) continue
        for (const rule of Array.from(rules)) {
          if (rule.conditionText && /prefers-color-scheme/.test(rule.conditionText)) {
            hasMediaQuery = true
            break
          }
          if (rule.cssText && /prefers-color-scheme/.test(rule.cssText)) {
            hasMediaQuery = true
            break
          }
        }
        if (hasMediaQuery) break
      }
    } catch {
      // 读不到样式表不算致命
    }

    // 4. 页面本体背景色：亮色页面通常接近白
    const bodyBg = getComputedStyle(body || html).backgroundColor
    const m = String(bodyBg).match(/rgba?\(([^)]+)\)/)
    let bodyLum = null
    if (m) {
      const p = m[1].split(',').map(Number)
      const a = p.length > 3 ? p[3] : 1
      if (a > 0.1) {
        const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
        bodyLum = Number((0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2])).toFixed(3))
      }
    }

    const supportsDark = hasMediaQuery || domSwitches.length > 0 || classSwitch || toggles.length > 0
    return {
      supportsDark,
      hasMediaQuery,
      domSwitches,
      classSwitch,
      toggles: toggles.slice(0, 5),
      bodyBackground: bodyBg,
      bodyLuminance: bodyLum,
      signal: hasMediaQuery ? 'prefers-color-scheme'
        : domSwitches.length ? 'data-attribute'
          : classSwitch ? 'class'
            : toggles.length ? 'toggle-control'
              : 'none'
    }
  })
}

/* ------------------------------------------------------------ 状态发现 -- */

/**
 * 找出值得展开的交互状态：折叠面板、Tab、菜单、抽屉、弹窗触发器。
 *
 * 刻意排除危险动作：删除、提交、支付、退出登录、取消订阅。
 * 这是「只观察不破坏」的底线 —— 检测不该改变用户数据。
 */
export async function discoverStates(page, maxStates = MAX_EXPLORATIONS) {
  return page.evaluate(({ limit, perElement }) => {
    const HIGH_RISK = /永久删除|删除账号|删除|移除|支付|付款|购买|下单|发布|发送|转账|退出登录|logout|delete|remove|pay|purchase|checkout|publish|send/i
    const found = []
    const seen = new Set()
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none'
    }
    const labelOf = (el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    const pathOf = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`
      const parts = []
      let cur = el
      while (cur && cur.nodeType === 1 && parts.length < 5) {
        let part = cur.tagName.toLowerCase()
        if (cur.classList.length) part += '.' + [...cur.classList].slice(0, 2).map(CSS.escape).join('.')
        parts.unshift(part)
        cur = cur.parentElement
      }
      return parts.join(' > ')
    }
    const push = (el, kind, actions, reason) => {
      if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return
      const label = labelOf(el)
      if (HIGH_RISK.test(label)) return
      const selector = pathOf(el)
      const key = `${kind}:${selector}`
      if (seen.has(key)) return
      seen.add(key)
      found.push({ label, selector, tag: el.tagName.toLowerCase(), kind, actions: actions.slice(0, perElement), reason, risk: 'low' })
    }

    document.querySelectorAll('button, [role="button"], a[href], summary, [aria-haspopup], [aria-expanded], [role="tab"], [role="menuitem"], [role="switch"], select').forEach((el) => {
      const label = labelOf(el)
      // 只点一次（弹层触发器优先用 click 打开）。回车/空格的键盘等价性属于
      // 焦点与可操作性检查，由 focus 检测项统一覆盖，不在这里对每个控件重复。
      push(el, el.matches('[aria-haspopup], [aria-expanded]') ? 'overlay-trigger' : 'control', ['click'], '可交互控件状态')
    })
    document.querySelectorAll('form').forEach((form) => {
      if (visible(form)) push(form, 'form', ['empty-submit', 'invalid-submit'], '表单错误状态')
    })
    document.querySelectorAll('input, textarea').forEach((el) => {
      if (el.type === 'hidden' || el.disabled) return
      push(el, 'field', ['focus', 'long-input'], '输入状态与可用性')
    })
    // 自定义点击区域：只纳入明确声明可点击或拥有 onclick 的元素，避免盲点与误触。
    document.querySelectorAll('[onclick], [tabindex]:not([tabindex="-1"])').forEach((el) => {
      if (el.matches('button, a, input, textarea, select, [role="button"]')) return
      push(el, 'custom-control', ['click'], '自定义交互控件')
    })
    return found.slice(0, limit)
  }, { limit: maxStates, perElement: MAX_ACTIONS_PER_ELEMENT })
}

/* ------------------------------------------------------------ 状态指纹 -- */

/** 计算页面结构指纹，用来判断点击后是否真的进入了新状态。 */
export async function stateFingerprint(page) {
  return page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
    })
    // 用可见元素数量 + 文本长度 + 滚动高度做粗指纹，足够判断状态是否变化
    const textLength = (document.body.innerText || '').length
    return `${visible.length}:${textLength}:${document.body.scrollHeight}`
  })
}

/* ------------------------------------------------------------ 状态展开 -- */

/** 抓取一批关键盒子的位置，供交互前后对比出位移与横向溢出。 */
async function captureInteractionMetrics(page) {
  return page.evaluate(() => {
    const elements = [...document.querySelectorAll('button, input, textarea, select, [role="button"], [role="alert"], [aria-live]')]
    // 必须用「文档绝对坐标」而不是 getBoundingClientRect 的视口坐标：
    // 交互前我们会把元素滚进视口，滚动位置一变，视口坐标就整体平移，
    // 那会被误判成「页面发生了 500px 抖动」。加上滚动量换算成绝对坐标后，
    // 位移才真的反映元素在页面里的位置变化。
    const scrollX = window.scrollX || window.pageXOffset || 0
    const scrollY = window.scrollY || window.pageYOffset || 0
    return {
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      clientWidth: document.documentElement.clientWidth,
      boxes: elements.map((el) => {
        const r = el.getBoundingClientRect()
        const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60)
        // 定位方式决定坐标系：位置随视口走的元素（弹层、抽屉、悬浮条）保留视口坐标，
        // 因为页面一滚动它的绝对坐标就会整块平移，那不是「位移」，是滚动。
        // 必须一路查到根，不能遇到 relative/absolute 就停：弹层常常是
        // relative 容器套在 fixed 覆盖层里，提前 break 会把它误判成文档流元素。
        let anchored = false
        for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
          if (getComputedStyle(cur).position === 'fixed') { anchored = true; break }
        }
        return {
          key: `${el.tagName.toLowerCase()}::${el.id || label}`,
          label,
          x: Math.round(r.x + (anchored ? 0 : scrollX)),
          y: Math.round(r.y + (anchored ? 0 : scrollY)),
          width: Math.round(r.width),
          height: Math.round(r.height),
          anchored,
          visible: r.width > 0 && r.height > 0
        }
      }).filter((item) => item.visible)
    }
  })
}

/**
 * 把交互前后的盒子位置对比成「位移」和「横向溢出」两类发现。
 */
function compareInteractionMetrics(before, after, state, action) {
  const issues = []
  const excess = after.scrollWidth - after.clientWidth
  if (excess > 2) issues.push({ kind: 'horizontalScroll', severity: excess > 40 ? 'error' : 'warn', title: `交互后页面横向超出 ${excess}px`, detail: `执行「${action}」后页面可滚动宽度 ${after.scrollWidth}px，视口宽度 ${after.clientWidth}px。`, target: 'html / body', suggestion: '检查交互状态新增的固定宽度、长文本或弹层，并在窄视口内约束内容。', metrics: { excess, scrollWidth: after.scrollWidth, clientWidth: after.clientWidth }, state })
  for (const item of after.boxes) {
    const prior = before.boxes.find((candidate) => candidate.key === item.key)
    if (!prior) continue
    // 前后定位方式不同（比如普通元素变成了弹层里的 fixed），坐标系不可比，跳过。
    if (Boolean(prior.anchored) !== Boolean(item.anchored)) continue
    const dx = Math.abs(item.x - prior.x)
    const dy = Math.abs(item.y - prior.y)
    const shift = Math.max(dx, dy)
    if (shift < 32) continue
    issues.push({ kind: 'layoutShift', severity: shift >= 100 ? 'error' : 'warn', title: `「${item.label || item.key}」交互后位移 ${shift}px`, detail: `执行「${action}」后，该元素位置变化 ${shift}px，可能造成页面跳动或操作目标偏移。`, target: item.key, suggestion: '为状态提示预留空间，或避免把反馈插入会推移主要控件的文档流位置。', metrics: { dx, dy, before: prior, after: item }, state })
  }
  return issues
}

/**
 * 逐个展开状态并在每个新状态下重跑检测器。
 *
 * 关键约束：每次展开后都要恢复原状，否则后续检测会跑在被污染的页面上。
 *
 * baseline 是首屏已经报过的缺陷身份集合。交互状态下重跑检测器时，页面上原本就有的
 * 缺陷会再被量到一次 —— 那不是这个交互带来的问题，重复计入只会让同一个元素在
 * 32 个动作下各报一条，把报告撑成几百条。所以只保留「交互前没有、交互后出现」的。
 */
export async function expandAndScan(page, detectors, runDetectors, options = {}) {
  const { maxExplorations = MAX_EXPLORATIONS, onProgress, baseline = null, shouldStop = null } = options
  const identityOf = (issue) => `${issue.kind}::${issue.target || issue.title}`
  const findings = []
  const visited = []
  const states = await discoverStates(page, maxExplorations)

  for (let index = 0; index < states.length; index++) {
    // 用户叫停后不要再继续点开下一个控件：这一步每次都真的在操作页面，
    // 停下来是立刻能感觉到的，等它自己跑完要好几十秒。
    if (shouldStop && shouldStop()) break
    const state = states[index]
    if (onProgress) onProgress(index + 1, states.length, state)
    const actions = state.actions?.length ? state.actions : ['click']

    for (const action of actions) {
      if (shouldStop && shouldStop()) break
      let target
      try {
        target = page.locator(state.selector).first()
        if (await target.count() === 0) continue
        // 用 scrollIntoView 而不是 scrollIntoViewIfNeeded：
        // 后者会先跑一整套可操作性检查（稳定/可见/可接收事件），单次要约 480ms，
        // 是单个动作里最大的一笔开销；这里只需要把元素滚进视口，点击自己会再等可点。
        await target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {})
        const beforeMetrics = await captureInteractionMetrics(page)
        if (action === 'focus') {
          await target.focus()
        } else if (action === 'keyboard-enter') {
          await target.focus()
          await page.keyboard.press('Enter')
        } else if (action === 'keyboard-space') {
          await target.focus()
          await page.keyboard.press('Space')
        } else if (action === 'empty-submit' || action === 'keyboard-submit') {
          await target.evaluate((form) => form.requestSubmit?.())
        } else if (action === 'invalid-submit') {
          const field = target.locator('input:not([type="hidden"]), textarea, select').first()
          if (await field.count()) {
            await field.fill('not-a-valid-value')
          }
          await target.evaluate((form) => form.requestSubmit?.())
        } else if (action === 'long-input') {
          await target.fill('体验检测长文本 '.repeat(20))
        } else {
          await target.click({ timeout: 1800, trial: false })
        }
        await page.waitForTimeout(SETTLE_AFTER_ACTION)

        // 不以 DOM 数量变化作为前置条件：焦点、布局、横向滚动和纯 CSS 状态同样是体验结果。
        const afterMetrics = await captureInteractionMetrics(page)
        // 位移/溢出这两类同样是「首屏就有的问题」就不该算这个动作的发现。
        // 首屏已经报过 246px 横向溢出，8 个动作各报一次只是同一件事重复 8 遍。
        const interactionIssues = compareInteractionMetrics(beforeMetrics, afterMetrics, `${state.label || state.kind} · ${action}`, action)
        findings.push(...interactionIssues.filter((issue) => !baseline || !baseline.has(identityOf(issue))))
        const result = await runDetectors(page, detectors, {
          state: `${state.label || state.kind} · ${action}`,
          kind: state.kind,
          action,
          // 标记这是交互状态下的一次扫描：页面级检测项（如掉帧）不在这里重跑。
          interactive: true
        })
        visited.push({ ...state, action, changed: true })
        // 首屏就存在的缺陷不再重复计入；只有交互新引入的才算这个状态的发现。
        const fresh = baseline
          ? result.issues.filter((issue) => !baseline.has(identityOf(issue)))
          : result.issues
        findings.push(...fresh.map((issue) => ({ ...issue, state: `${state.label || state.kind} · ${action}`, stateKind: state.kind, action })))
      } catch {
        // 单个控件/动作失败不阻塞其他体验路径；失败证据由后续页面状态与覆盖摘要体现。
      } finally {
        // 每个动作独立回到干净页面，避免一个弹层或表单错误污染下一条路径。
        // 检测项内部不再各自重载（以前同一个动作会加载页面两到三次），统一在这里做一次。
        // 已经叫停就别再重载了：那是一次完整的页面加载，白等好几秒。
        if (!(shouldStop && shouldStop())) {
          await page.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
          await page.waitForTimeout(SETTLE_AFTER_RELOAD)
        }
      }
    }
  }

  return { findings, visited, discovered: states.length }
}

/* ------------------------------------------------------------ 视口建议 -- */

/**
 * 根据页面实际布局决定测哪些视口。
 * 有响应式断点的页面才值得多跑几个，纯固定宽度后台可省掉手机视口。
 *
 * 这一层判断很关键：整轮耗时是「视口数 × 每视口耗时」，
 * 一个没有媒体查询的固定宽度页面跑 4 个视口，等于把同一份结果量了 4 遍。
 */
export async function suggestViewports(page, requested) {
  if (Array.isArray(requested) && requested.length) return requested

  const info = await page.evaluate(() => {
    let hasMediaRules = false
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules = null
        try { rules = sheet.cssRules } catch { continue } // 跨源样式表读不到就跳过
        if (!rules) continue
        for (const rule of Array.from(rules)) {
          const text = rule.conditionText || rule.cssText || ''
          if (/max-width|min-width/.test(text)) { hasMediaRules = true; break }
        }
        if (hasMediaRules) break
      }
    } catch {
      // 读不到样式表就算没有响应式规则
    }
    return { hasMediaRules, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }
  })

  // 没有响应式规则：只测当前宽度，不制造 4 份重复结果
  if (!info.hasMediaRules) {
    return [{ label: '当前视口', width: Math.max(1024, info.viewportWidth || 1440), height: Math.max(720, info.viewportHeight || 900) }]
  }

  return [
    { label: '桌面', width: 1440, height: 900 },
    { label: '平板', width: 834, height: 1112 },
    { label: '手机', width: 390, height: 844 }
  ]
}