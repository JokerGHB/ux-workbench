/**
 * DSH 找茬工作台 · 检测引擎
 *
 * 只用 playwright-core 驱动浏览器，在真实渲染结果上做判定。
 * 所有检测器都返回结构化缺陷，带元素定位信息，便于直接改代码。
 *
 * 设计前提：框架只执行标准，不制定标准。每个检测器的阈值由使用者在
 * 工作台里配置，默认值只是通用起点。
 */

export const DETECTORS = {
  overflow: {
    label: '文字溢出裁切',
    description: '元素内容超出容器且被裁切（没有省略号兜底），用户会看不到完整文字。',
    defaults: { limit: 50 }
  },
  horizontalScroll: {
    label: '页面横向溢出',
    description: '页面内容宽度超过视口，移动端出现非预期横向滚动。',
    defaults: { tolerance: 2 }
  },
  layoutShift: {
    label: '交互后布局跳动',
    description: '交互反馈或错误提示导致主要控件发生明显位移。',
    defaults: { thresholdPx: 32 }
  },
  tapTarget: {
    label: '点击目标过小',
    description: '可点击区域小于无障碍建议尺寸，手指或鼠标难准确命中。',
    // 两档，别把「舒适尺寸」当硬标准：
    //   minSize     —— 硬底线。低于它才算缺陷（WCAG 2.2 AA 2.5.8 目标尺寸 24×24）。
    //   comfortable —— 桌面上的建议值。桌面密集界面 32px 高是常规做法，
    //                  拿 44 去量会把满屏正常按钮全标成提示，等于没提示。
    //   touchComfortable —— 触屏视口（宽 ≤ 600）改用 44，那也是 WCAG 2.5.5 AAA 的值。
    // 早先只拿 44 当唯一阈值，连 118×36 的正常按钮也会被判「严重」，
    // 一个页面能刷出几百条同质缺陷，报告直接失去可读性。
    defaults: { minSize: 24, comfortable: 32, touchComfortable: 44 }
  },
  darkLeak: {
    label: '暗色模式亮色残留',
    description: '暗色主题下仍有大面积高亮度背景，夜间观看刺眼。',
    defaults: { luminanceThreshold: 0.55, minArea: 2000 }
  },
  contrast: {
    label: '文字对比度不足',
    description: '前景色与背景色的 WCAG 对比度低于阈值，文字难以辨认。',
    defaults: { minRatio: 3.0 }
  },
  focus: {
    label: '键盘焦点不可见',
    description: 'Tab 键移动到该元素时没有可见的焦点指示，键盘用户会迷路。',
    defaults: { maxTabs: 25 }
  },
  feedback: {
    label: '交互反馈延迟',
    description: '触发动作后迟迟没有可见反馈，用户会以为没点上而重复点击。',
    defaults: { feedbackMs: 150, timeoutMs: 3000 }
  },
  jank: {
    label: '动画掉帧卡顿',
    description: '交互触发的动画存在明显掉帧，观感不流畅。',
    defaults: { frameJankMs: 34, maxJankRatio: 0.1, durationMs: 800 }
  }
}

/* ------------------------------------------------------------------ 浏览器 -- */

/** 候选浏览器路径（Windows / macOS / Linux 常见安装位置）。 */
const BROWSER_CANDIDATES = [
  { channel: 'msedge', paths: ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/microsoft-edge'] },
  { channel: 'chrome', paths: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Users\\Public\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'] }
]

/**
 * 探测本机可用的浏览器。
 * 只用本机已安装的浏览器，不下载内核 —— 下载需要几百 MB，且企业网络常被拦。
 */
export async function detectBrowser(fs) {
  for (const candidate of BROWSER_CANDIDATES) {
    for (const path of candidate.paths) {
      try {
        await fs.access(path)
        return { channel: candidate.channel, executablePath: path }
      } catch {
        // 继续找下一个
      }
    }
  }
  return null
}

/* ---------------------------------------------------------------- 页面检测 -- */

/**
 * 生成元素的定位路径。
 *
 * 同名同级兄弟节点（同为 button.btn-tiny 之类）必须能被区分开，否则会把两个
 * 不同元素合并成一条缺陷。做法：只有当兄弟节点「标签 + class 签名」相同时，
 * 才追加 :nth-of-type(n)；其余情况保持路径干净。
 *
 * 注意：本函数会被 toString() 注入到页面里执行，因此只能依赖浏览器全局对象，
 * 不能引用模块作用域的任何变量。
 */
export function selectorPath(el) {
  const signature = (node) => {
    let seg = node.tagName.toLowerCase()
    const cls = (node.className && typeof node.className === 'string')
      ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
      : []
    if (cls.length) seg += '.' + cls.join('.')
    return seg
  }
  const parts = []
  let cur = el
  while (cur && cur.nodeType === 1 && parts.length < 4) {
    if (cur.id) { parts.unshift(cur.tagName.toLowerCase() + '#' + cur.id); break }
    let seg = signature(cur)
    const parent = cur.parentElement
    if (parent && parent.children) {
      const siblings = Array.from(parent.children)
      const twins = siblings.filter((node) => signature(node) === seg)
      if (twins.length > 1) {
        const sameTag = siblings.filter((node) => node.tagName === cur.tagName)
        seg += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')'
      }
    }
    parts.unshift(seg)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

/** 在页面上下文里执行的通用工具（以字符串注入，避免闭包序列化问题）。 */
const PAGE_HELPERS = `
  const __sel = 'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], input[type="submit"], input[type="button"], .btn, label, summary, select';
  function __visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function __label(el) {
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    if (t) return t.slice(0, 60);
    return (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().slice(0, 60);
  }
  function __path(el) { return (${selectorPath.toString()})(el); }
  function __rect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height)
    };
  }
  function __parseColor(color) {
    const m = String(color).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function __relLum(r, g, b) {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  /**
   * 元素的「真实」背景色。
   *
   * 直接拿 getComputedStyle(el).backgroundColor 算亮度是错的：页面上大量元素用的是
   * rgba(255,255,255,.08) 这类半透明白，其 RGB 分量是 255（算出来亮度 1.0，等同纯白），
   * 但它叠在深色底上合成后接近黑色。按分量算会把「深色底上的轻微高光」全部报成
   * 「暗色模式亮色残留」—— 实测一个页面 6 条 darkLeak 全是这么来的。
   * 必须逐层向上做 alpha 合成，直到遇到不透明层。
   *
   * 渐变背景没有单一颜色，无法用单色亮度判定，返回 gradient 让调用方跳过而不是瞎猜。
   */
  function __realBg(el) {
    const layers = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const cs = getComputedStyle(cur);
      const bgImg = cs.backgroundImage;
      if (bgImg && bgImg !== 'none' && bgImg.indexOf('gradient') !== -1) {
        return { gradient: bgImg.slice(0, 80) };
      }
      const c = __parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
      cur = cur.parentElement;
    }
    let base = [255, 255, 255];
    if (layers.length && layers[layers.length - 1].a >= 1) {
      const L = layers[layers.length - 1];
      base = [L.r, L.g, L.b];
    }
    for (let i = layers.length - 2; i >= 0; i--) {
      const L = layers[i];
      base = [0, 1, 2].map((k) => [L.r, L.g, L.b][k] * L.a + base[k] * (1 - L.a));
    }
    return { rgb: base.map((v) => Math.round(v)) };
  }
  /** 相对亮度。传 el 时按真实合成背景算（渐变返回 null）；否则按给定颜色算。 */
  function __lum(color, el) {
    if (el) {
      const bg = __realBg(el);
      if (bg.gradient || !bg.rgb) return null;
      return __relLum(bg.rgb[0], bg.rgb[1], bg.rgb[2]);
    }
    const c = __parseColor(color);
    if (!c || c.a < 0.05) return null;
    return __relLum(c.r, c.g, c.b);
  }
`

/** 检测：页面横向溢出。 */
export async function detectHorizontalScroll(page, opts = {}) {
  const tolerance = opts.tolerance ?? DETECTORS.horizontalScroll.defaults.tolerance
  const info = await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const clientWidth = document.documentElement.clientWidth;
    const docScrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);

    /**
     * 找出真正把页面撑宽的元凶。
     *
     * 只报「html / body 超了 246px」用户拿不到任何线索：一半的页面都有
     * 一句 position:absolute 的装饰、一个 min-width 的表格、一段不换行的
     * 代码块。要指出具体是哪个元素、多宽、超出多少。
     *
     * 从「右边界超过视口」的元素里挑最靠外的那个 —— 它就是撑开的源头；
     * 它的祖先通常只是被动跟着变宽，报祖先等于没报。
     */
    const culprits = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el === document.body) continue;
      if (!__visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const overhang = r.right - clientWidth;
      if (overhang <= 1) continue;
      const cs = getComputedStyle(el);
      // 自己开了横向滚动的容器是「局部滚动」，是有意为之，不算页面横向溢出
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      const parent = el.parentElement;
      // 只和「有布局意义的」父级比。
      // body / html 永远跟着内容变宽，拿它们当父级会把每个元素都判成
      // 「父级也被撑宽 → 源头在上面」，最后一层层跳过去只剩 html/body 可报。
      const meaningfulParent = parent && parent !== document.body && parent !== document.documentElement
        ? parent
        : null;
      const parentOverhang = meaningfulParent ? meaningfulParent.getBoundingClientRect().right - clientWidth : 0;
      /**
       * 谁才是源头？
       *
       * 父级和它一样宽，说明是**它**把父级撑开的 —— 它才是源头，不能排除。
       * 反过来，父级比它更外扩，说明父级还被别的东西撑着，源头在父级，
       * 这时才跳过它。
       *
       * 早先写成「父级也超了就跳过」，方向正好反了：
       * <main><pre> 里 pre 撑宽 main，结果 pre 被排除、只报 main，
       * 而 main 自己没写任何宽度，用户对着它无从下手。
       */
      if (meaningfulParent && parentOverhang > overhang + 1) continue;
      culprits.push({
        selector: __path(el),
        label: __label(el),
        rect: __rect(el),
        width: Math.round(r.width),
        overhang: Math.round(overhang),
        // 真实 DOM 深度：排序时用来在「超出量相同」的情况下挑最内层。
        // 不能用选择器里的 '>' 个数推，两条路径的起始层级可能不同。
        depth: (() => { let d = 0; let node = el; while (node && node !== document.documentElement) { d++; node = node.parentElement } return d })(),
        css: (() => {
          // 说清楚「凭什么这么宽」，用户才知道改哪一行。
          //
          // 注意 getComputedStyle().width 永远返回已解析的像素值，不会等于
          // 'auto' —— 不能拿它判断「有没有写死宽度」，否则被内容撑开的容器
          // 会被误报成 width: 4638px 这种计算值。
          // 作者真写下的 width 要去样式表里找（内联或 CSS 规则）。
          const hasText = (el.textContent || '').trim().length > 0
          if (cs.whiteSpace === 'nowrap' && hasText) return 'white-space: nowrap'
          if (cs.minWidth && cs.minWidth !== 'auto' && cs.minWidth !== '0px') return 'min-width: ' + cs.minWidth
          if (cs.position === 'absolute' || cs.position === 'fixed') return 'position: ' + cs.position

          const authoredWidth = (() => {
            if (el.style && el.style.width) return el.style.width
            // 找匹配该元素的规则里最后一条 width 声明。
            // 只读 CSSOM，不解析样式表文本 —— 更准，也不受注释干扰。
            let found = ''
            for (const sheet of Array.from(document.styleSheets)) {
              let rules
              try { rules = sheet.cssRules } catch { continue } // 跨域样式表读不到，跳过
              const walk = (list) => {
                for (const rule of Array.from(list || [])) {
                  // 分组规则（@media / @supports）要进去找。
                  // 注意：普通 CSSStyleRule 上也有 cssRules（新版 Chromium 给空列表），
                  // 只判它存不存在，会把每条普通规则都当成组 ——
                  // 递归一个空列表然后 continue，width 永远读不出来。
                  if (rule.cssRules && rule.cssRules.length) { walk(rule.cssRules); continue }
                  if (!rule.selectorText || !rule.style) continue
                  const width = rule.style.getPropertyValue('width')
                  if (!width) continue
                  try { if (el.matches(rule.selectorText)) found = width } catch { /* 选择器不合法，跳过 */ }
                }
              }
              walk(rules)
            }
            return found
          })()

          // 只有这个宽度确实等于或超过视口，它才是「撑宽页面」的原因；
          // 一个 width:100px 的按钮不会把页面撑开。
          if (authoredWidth) {
            const px = parseFloat(authoredWidth)
            const isAbsolutePx = /px$/.test(authoredWidth) && Number.isFinite(px)
            if (!isAbsolutePx || px >= clientWidth) return 'width: ' + authoredWidth
          }
          return ''
        })()
      });
    }
    // 排序：先看超出量（越大越可疑），超出量相同时取 DOM 更深的那个。
    // 深度很重要 —— <main><pre> 里两者一样宽，但 pre 是把 main 撑开的那个，
    // 报 main 等于让用户去改一个自己没写宽度的容器。
    culprits.sort((a, b) => (b.overhang - a.overhang) || (b.depth - a.depth));
    return {
      scrollWidth: docScrollWidth,
      clientWidth,
      viewportWidth: window.innerWidth,
      culprits: culprits.slice(0, 6)
    };
  })()`)
  const overflow = info.scrollWidth - info.clientWidth
  if (overflow <= tolerance) return []

  const top = info.culprits[0]
  // 找到源头就报源头：可点击、能框出来、给得出具体建议。
  // 找不到才退回 html/body —— 这时确实没有单一元素可指。
  if (top) {
    return [{
      kind: 'horizontalScroll',
      severity: overflow > 40 ? 'error' : 'warn',
      title: `页面横向超出 ${overflow}px`,
      detail: `页面可滚动宽度 ${info.scrollWidth}px，视口宽度 ${info.clientWidth}px；窄屏上可能出现意外横向滚动。最外扩的元素是 ${top.selector}（宽 ${top.width}px，超出 ${top.overhang}px）${top.css ? `，${top.css}` : ''}。`,
      target: top.selector,
      label: top.label,
      rect: top.rect,
      suggestion: top.css
        ? `这个元素写着 ${top.css}，是它把页面撑宽的。改成随视口收缩（如 max-width:100%、flex-wrap、允许换行），或让它在局部容器内横向滚动。`
        : '检查这个元素的固定宽度、最小宽度、绝对定位和不可换行内容；让它随视口收缩或在局部容器内滚动。',
      metrics: { ...info, overflow }
    }]
  }

  return [{
    kind: 'horizontalScroll',
    severity: overflow > 40 ? 'error' : 'warn',
    title: `页面横向超出 ${overflow}px`,
    detail: `页面可滚动宽度 ${info.scrollWidth}px，视口宽度 ${info.clientWidth}px；窄屏上可能出现意外横向滚动。没找到单一撑宽的元素，很可能是多处内容叠加。`,
    target: 'html / body',
    suggestion: '检查固定宽度、最小宽度、绝对定位和不可换行内容；让内容随视口收缩或在局部容器内滚动。',
    metrics: { ...info, overflow }
  }]
}

/** 检测：文字溢出裁切。 */
export async function detectOverflow(page, opts = {}) {
  const limit = opts.limit ?? DETECTORS.overflow.defaults.limit
  const raw = await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const out = [];
    for (const el of Array.from(document.querySelectorAll(__sel))) {
      if (!__visible(el)) continue;
      const cs = getComputedStyle(el);
      const ox = el.scrollWidth > el.clientWidth + 1;
      const oy = el.scrollHeight > el.clientHeight + 1;
      if (!ox && !oy) continue;

      /**
       * scrollWidth 变大不等于「文字溢出」。
       *
       * 按钮上贴了绝对定位的「新」角标（右上角小图）时，scrollWidth 会被撑大
       * 二十来像素，而按钮里的文字其实完完整整在自己的盒子里 —— 报「文字溢出容器
       * 边界」是错的，那枚角标本来就要画到外面。实测「创空间」按钮：文字右边界
       * 721px、按钮右边界 736px，文字没超，纯粹是角标把 scrollWidth 撑到了 91。
       *
       * 判据：用 Range 拿真实文字矩形，逐一看它有没有越过内容盒。
       * 文字没越界、且把盒子撑大的是绝对定位/固定定位子元素，那就不是文字溢出。
       */
      const textOverflows = (() => {
        const er0 = el.getBoundingClientRect();
        // padding box 作边界：边框内的 padding 区域是文字可以合法占据的
        const right = er0.left + el.clientLeft + el.clientWidth;
        const bottom = er0.top + el.clientTop + el.clientHeight;
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node, hit = false;
        while ((node = tw.nextNode())) {
          if (!(node.textContent || '').trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width <= 0 && r.height <= 0) continue;
            if (r.right > right + 1 || r.bottom > bottom + 1) { hit = true; break; }
          }
          if (hit) break;
        }
        return hit;
      })();

      if (!textOverflows) {
        // 文字没越界。若撑大盒子的是普通文档流子元素，仍值得报（会压邻元素）；
        // 但绝对/固定定位子元素是刻意的徽标、装饰，不算缺陷。
        const er1 = el.getBoundingClientRect();
        const pr = er1.left + el.clientLeft + el.clientWidth;
        const pb = er1.top + el.clientTop + el.clientHeight;
        const flowChildOverflow = Array.from(el.children).some((c) => {
          const ccs = getComputedStyle(c);
          if (ccs.position === 'absolute' || ccs.position === 'fixed') return false;
          const cr = c.getBoundingClientRect();
          return cr.right > pr + 1 || cr.bottom > pb + 1;
        });
        if (!flowChildOverflow) continue;
      }

      const clipsX = cs.overflowX !== 'visible';
      const clipsY = cs.overflowY !== 'visible';
      const ellipsis = cs.textOverflow === 'ellipsis';
      const clipped = (ox && clipsX && !ellipsis) || (oy && clipsY && !ellipsis);
      // overflow:visible 时内容没被裁切，但会直接画到盒子外面，
      // 压到相邻元素上 —— 同样是可见的布局损坏，不能只报 clipped。
      const spilled = (ox && !clipsX) || (oy && !clipsY);
      if (!clipped && !spilled) continue;
      out.push({
        label: __label(el),
        selector: __path(el),
        rect: __rect(el),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
        overflowX: ox, overflowY: oy, clipped, spilled,
        overflowStyle: cs.overflow,
        textOverflow: cs.textOverflow
      });
    }
    return out;
  })()`)

  return raw
    .slice(0, limit)
    .map((item) => item.clipped
      ? {
          kind: 'overflow',
          severity: 'error',
          title: `「${item.label || item.selector}」文字被裁切`,
          detail: `内容 ${item.scrollWidth}×${item.scrollHeight}px，容器 ${item.clientWidth}×${item.clientHeight}px；overflow=${item.overflowStyle}，text-overflow=${item.textOverflow}。超出部分用户看不到。`,
          target: item.selector,
          suggestion: '让按钮宽度自适应内容、允许换行，或加上 text-overflow: ellipsis + title 提示。',
          metrics: item
        }
      : {
          kind: 'overflow',
          severity: 'error',
          title: `「${item.label || item.selector}」文字溢出容器边界`,
          detail: `内容 ${item.scrollWidth}×${item.scrollHeight}px，容器 ${item.clientWidth}×${item.clientHeight}px；overflow=${item.overflowStyle}（visible，未被裁切）。多出的内容直接画到盒子外，会压住相邻元素。`,
          target: item.selector,
          suggestion: '让宽度自适应内容（去掉固定 width）、允许换行，或用 min-width 配合 padding 给文字留出足够空间。',
          metrics: item
        })
}

/** 检测：点击目标过小。 */
export async function detectTapTarget(page, opts = {}) {
  const minSize = opts.minSize ?? DETECTORS.tapTarget.defaults.minSize
  const touchComfortable = opts.touchComfortable ?? DETECTORS.tapTarget.defaults.touchComfortable

  // 舒适尺寸按视口走：窄视口相当于手指操作，标准提到 44；
  // 桌面密集界面用 32，否则整屏按钮全是「提示」。
  const viewportWidth = await page.evaluate(() => window.innerWidth).catch(() => 1280)
  const touch = viewportWidth <= 600
  const comfortable = opts.comfortable
    ?? (touch ? touchComfortable : DETECTORS.tapTarget.defaults.comfortable)

  const selector = 'button, a, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], '
    + 'input[type="checkbox"], input[type="radio"], input[type="submit"], .btn'
  const raw = await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const out = [];
    for (const el of Array.from(document.querySelectorAll(${JSON.stringify(selector)}))) {
      if (!__visible(el)) continue;
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width), height = Math.round(r.height);
      // 任意一边低于舒适尺寸就收集，判定分档放在下面做，页面里只负责量
      if (width >= ${comfortable} && height >= ${comfortable}) continue;
      const ecs = getComputedStyle(el);
      out.push({
        label: __label(el), selector: __path(el), rect: __rect(el),
        tag: el.tagName.toLowerCase(), width, height,
        inline: ecs.display === 'inline',
        // 纯文字目标 vs 图标目标：前者尺寸被字号和行高约束，后者应当有足够热区。
        textLen: (el.textContent || '').trim().length,
        hasMedia: Boolean(el.querySelector('img, svg, canvas, video')),
        lineHeight: parseFloat(ecs.lineHeight) || 0,
        fontSize: parseFloat(ecs.fontSize) || 0
      });
    }
    return out;
  })()`)

  // 行内链文字天然只有文字那么大，拿舒适尺寸去量它毫无意义 —— 它不靠热区命中，
  // 靠的是行内阅读流。这类只按硬底线判，且不报「应该加 padding」。
  return raw
    .map((item) => {
      const smallest = Math.min(item.width, item.height)

      /**
       * 分级，而不是一律按 24px 判「严重」。
       *
       * 实测一个正常官网首页，15 条「严重」里有 6 条是页脚导航链接（高 23px）和
       * 两行备案号（高 20px）—— 尺寸由字号和行高决定，离 24px 硬底线只差几像素，
       * 却和 8×8 的轮播圆点并列成「严重」，报告立刻失去可信度。
       *
       * 判据：
       *   纯文字目标（有文字、无图片/SVG），高度≈行高  → 尺寸被排版约束，
       *     只在「明显小于」硬底线时才算缺陷，差几像素记为提示。
       *   图标/圆点类目标（无文字或有媒体）            → 热区就是它唯一的存在，
       *     低于硬底线是真缺陷，保持严重。
       */
      // 只要带有真实文字就是文字目标，哪怕旁边还有一枚徽标图标 ——
      // 「公安备案」那种「图标 + 文字」的页脚链接仍是靠文字命中，不能因为
      // 有图标就退回 24px 硬底线。纯图标/纯圆点（无文字）才严格判定。
      const textOnly = item.textLen >= 2
      const lineConstrained = textOnly
        && item.lineHeight > 0
        && item.height <= item.lineHeight + 6
      // 文字目标给 4px 容差：23px、20px 这种贴着行高的链接不算「命中困难」
      const effectiveMin = lineConstrained ? Math.max(minSize - 4, 16) : minSize
      const isError = smallest < effectiveMin
      if (!isError && item.tag === 'a' && item.inline) return null
      return {
        kind: 'tapTarget',
        severity: isError ? 'error' : 'warn',
        title: `「${item.label || item.selector}」点击区域 ${item.width}×${item.height}px`,
        detail: isError
          ? `小于硬底线 ${minSize}×${minSize}px，触摸设备上很难准确命中，属于可访问性缺陷。`
          : lineConstrained
            ? `纯文字目标，高度 ${item.height}px 由字号/行高决定，低于${touch ? '触屏' : '桌面'}舒适尺寸 ${comfortable}px，但不影响点击命中（WCAG 2.5.8 对行内文字有豁免）。仅作提示。`
            : `低于${touch ? '触屏' : '桌面'}舒适尺寸 ${comfortable}×${comfortable}px（未触及 ${minSize}px 硬底线），仍可点击，但精密操作或手指命中会吃力。`,
        target: item.selector,
        suggestion: isError
          ? `把可点击区域扩展到至少 ${minSize}×${minSize}px；触屏为主时建议 ${touchComfortable}×${touchComfortable}px，可用 padding 扩热区而不改视觉尺寸。`
          : `有余力时把热区补到 ${comfortable}×${comfortable}px（padding 或 ::after 覆盖层均可），视觉尺寸不必变。`,
        metrics: { ...item, minSize, comfortable, touch, lineConstrained, effectiveMin }
      }
    })
    .filter(Boolean)
}

/** 检测：暗色模式亮色残留。 */
export async function detectDarkLeak(page, opts = {}) {
  const threshold = opts.luminanceThreshold ?? DETECTORS.darkLeak.defaults.luminanceThreshold
  const minArea = opts.minArea ?? DETECTORS.darkLeak.defaults.minArea
  const raw = await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const out = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!__visible(el)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < ${minArea}) continue;
      // 只关心「自己画了背景」的元素；自身完全透明的不该由它背锅，
      // 真正的亮色底会在祖先那层被量到。
      const own = __parseColor(cs.backgroundColor);
      if (!own || own.a < 0.05) continue;
      // 关键：按合成后的真实颜色判亮度，不能按 rgba 的分量判。
      const bg = __realBg(el);
      if (bg.gradient || !bg.rgb) continue;
      const lum = __relLum(bg.rgb[0], bg.rgb[1], bg.rgb[2]);
      if (lum <= ${threshold}) continue;
      out.push({
        label: __label(el), selector: __path(el), rect: __rect(el),
        background: cs.backgroundColor,
        composited: 'rgb(' + bg.rgb.join(', ') + ')',
        luminance: Number(lum.toFixed(3)),
        area: Math.round(area)
      });
    }
    return out;
  })()`)

  const seen = new Map()
  for (const item of raw) {
    const prev = seen.get(item.selector)
    if (!prev || item.area > prev.area) seen.set(item.selector, item)
  }

  return Array.from(seen.values())
    .sort((a, b) => b.area - a.area)
    .slice(0, 30)
    .map((item) => ({
      kind: 'darkLeak',
      severity: 'error',
      title: `「${item.label || item.selector}」在暗色下仍是亮色`,
      detail: `背景 ${item.background}，相对亮度 ${item.luminance}（阈值 ${threshold}），覆盖 ${item.area}px²。`,
      target: item.selector,
      suggestion: '把硬编码的白底/浅底换成主题变量（如 var(--bg-layer-1)），跟随 color-scheme。',
      metrics: item
    }))
}

/** 检测：文字对比度不足。 */
export async function detectContrast(page, opts = {}) {
  const minRatio = opts.minRatio ?? DETECTORS.contrast.defaults.minRatio
  const raw = await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    function ratio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
    const out = [];
    let skippedGradient = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, count = 0;
    while ((node = walker.nextNode()) && count < 800) {
      const text = (node.textContent || '').trim();
      if (text.length < 2) continue;
      const el = node.parentElement;
      if (!el || !__visible(el)) continue;
      const cs = getComputedStyle(el);
      // 前景可能是半透明的（rgba(255,255,255,.96)），先算真实背景，
      // 再把前景按 alpha 合成上去，否则「白字叠深底」会被当成「白字叠白底」。
      const bg = __realBg(el);
      // 渐变背景没有单一底色，单色对比度无从谈起。跳过并计数，
      // 不拿 255 当兜底 —— 那会把深色渐变上的白字报成 1.0:1。
      if (bg.gradient || !bg.rgb) { skippedGradient++; continue; }
      const bgLum = __relLum(bg.rgb[0], bg.rgb[1], bg.rgb[2]);
      const fg = __parseColor(cs.color);
      if (!fg) continue;
      const fgRgb = fg.a >= 1
        ? [fg.r, fg.g, fg.b]
        : [0, 1, 2].map((k) => [fg.r, fg.g, fg.b][k] * fg.a + bg.rgb[k] * (1 - fg.a));
      const fgLum = __relLum(fgRgb[0], fgRgb[1], fgRgb[2]);
      const cr = ratio(fgLum, bgLum);
      if (cr < ${minRatio}) {
        out.push({ text: text.slice(0, 40), selector: __path(el), rect: __rect(el), color: cs.color, background: 'rgb(' + bg.rgb.join(', ') + ')', ratio: Number(cr.toFixed(2)), fontSize: cs.fontSize });
      }
      count++;
    }
    return { out, skippedGradient };
  })()`)

  return raw.out.slice(0, 40).map((item) => ({
    kind: 'contrast',
    severity: item.ratio < 2 ? 'error' : 'warn',
    title: `「${item.text}」对比度仅 ${item.ratio}:1`,
    detail: `前景 ${item.color} 叠在 ${item.background} 上，字号 ${item.fontSize}，低于阈值 ${minRatio}:1。`,
    target: item.selector,
    suggestion: '加深正文颜色或提亮背景，正文建议 ≥4.5:1，大字 ≥3:1。',
    metrics: item
  }))
}

/** 检测：键盘焦点不可见。 */
export async function detectFocus(page, opts = {}) {
  const maxTabs = opts.maxTabs ?? DETECTORS.focus.defaults.maxTabs
  const issues = []
  const visited = new Set()

  await page.evaluate(() => { document.body.focus?.() })

  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const cs = getComputedStyle(el);
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
      const hasBorder = parseFloat(cs.borderWidth) > 0;
      const ringVar = cs.getPropertyValue('--dsw-focus-ring-color') || cs.getPropertyValue('--focus-ring-color');
      return {
        label: __label(el), selector: __path(el), rect: __rect(el),
        visible: hasOutline || (hasShadow && hasBorder) || ringVar.trim() !== '',
        outline: cs.outlineStyle + ' ' + cs.outlineWidth,
        shadow: (cs.boxShadow || 'none').slice(0, 60)
      };
    })()`)

    if (!info) continue
    if (visited.has(info.selector)) continue
    visited.add(info.selector)

    if (!info.visible) {
      issues.push({
        kind: 'focus',
        severity: 'error',
        title: `「${info.label || info.selector}」聚焦时无视觉指示`,
        detail: `第 ${i + 1} 次 Tab 到达该元素；outline=${info.outline}，box-shadow=${info.shadow}，均无可见焦点环。`,
        target: info.selector,
        suggestion: '加 :focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }，不要用 outline:none 直接抹掉。',
        metrics: info
      })
    }
  }
  return issues
}

/** 检测：交互反馈延迟。 */
export async function detectFeedback(page, opts = {}) {
  const threshold = opts.feedbackMs ?? DETECTORS.feedback.defaults.feedbackMs
  const timeout = opts.timeoutMs ?? DETECTORS.feedback.defaults.timeoutMs
  const selector = opts.selector || 'button:visible, [role="button"]:visible'
  const limit = opts.limit ?? 5

  const handles = await page.locator(selector).all()
  const results = []

  for (const handle of handles.slice(0, limit)) {
    let label = ''
    let path = ''
    let rect = null
    try {
      const info = await handle.evaluate(`(el) => {
        ${PAGE_HELPERS}
        return { label: __label(el), selector: __path(el), rect: __rect(el) };
      }`)
      label = info.label
      path = info.selector
      rect = info.rect
    } catch {
      continue
    }

    const before = await page.evaluate(() => document.body.innerHTML.length)
    const t0 = Date.now()
    try {
      await handle.click({ timeout: 2000 })
    } catch {
      continue
    }

    let latency = null
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const changed = await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const busy = document.querySelector('[aria-busy="true"], [class*="loading"], [class*="spinner"], [class*="pending"]');
        return { len: document.body.innerHTML.length, busy: Boolean(busy) };
      })()`)
      if (changed.len !== before || changed.busy) {
        latency = Date.now() - t0
        break
      }
      await page.waitForTimeout(15)
    }

    if (latency !== null && latency > threshold) {
      results.push({
        kind: 'feedback',
        severity: latency > threshold * 3 ? 'error' : 'warn',
        title: `「${label || path}」响应耗时 ${latency}ms`,
        detail: `点击到出现可见变化用了 ${latency}ms，超过阈值 ${threshold}ms。用户会怀疑是否点中。`,
        target: path,
        suggestion: '点击后立即给出乐观反馈（按钮置 loading / 禁用态），把等待可见化。',
        metrics: { latency, threshold, rect }
      })
    } else if (latency === null) {
      // 等满 timeout 都没等到任何可见变化 —— 这正是「点了没反应」，
      // 恰恰是这个检测项存在的理由。以前这里直接跳过，等于在最该报的地方不报。
      results.push({
        kind: 'feedback',
        severity: 'error',
        title: `「${label || path}」点击后 ${timeout}ms 内无可见反馈`,
        detail: `点击后没有出现任何可见变化（DOM 无更新、无 busy/loading 状态），超过判定上限 ${timeout}ms。`,
        target: path,
        suggestion: '点击后立即给出乐观反馈（按钮置 loading / 禁用态），把等待可见化；若该元素本就不接受点击，请改用 button 语义或去掉可点击样式。',
        metrics: { latency: null, timeout, threshold, rect }
      })
    }

    // 不在这里重载页面：外层 expandAndScan 每轮动作结束后会统一回到干净页面，
    // 检测项自己再 goto 一次等于同一个动作把页面加载两遍（实测每轮多出 40-90ms）。
  }
  return results
}

/** 检测：动画掉帧。 */
export async function detectJank(page, opts = {}) {
  const jankMs = opts.frameJankMs ?? DETECTORS.jank.defaults.frameJankMs
  const maxRatio = opts.maxJankRatio ?? DETECTORS.jank.defaults.maxJankRatio
  const duration = opts.durationMs ?? DETECTORS.jank.defaults.durationMs
  const selector = opts.selector || 'button:visible'

  const handle = page.locator(selector).first()
  if (await handle.count() === 0) return []

  // 掉帧的锅通常在那个被点出来的动画上，把它一并记下来，前端才好指过去
  let rect = null
  let target = '动画过程'
  try {
    const info = await handle.evaluate(`(el) => {
      ${PAGE_HELPERS}
      return { selector: __path(el), rect: __rect(el), label: __label(el) };
    }`)
    rect = info.rect
    target = info.selector
  } catch {
    rect = null
  }

  await page.evaluate(() => {
    window.__uxFrames = []
    window.__uxSampling = true
    const tick = (t) => {
      if (!window.__uxSampling) return
      window.__uxFrames.push(t)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  try {
    await handle.click({ timeout: 2000 })
  } catch {
    return []
  }
  await page.waitForTimeout(duration)

  const frames = await page.evaluate(() => {
    window.__uxSampling = false
    return window.__uxFrames || []
  })

  if (frames.length < 4) return []

  const gaps = []
  for (let i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1])
  const janks = gaps.filter((g) => g > jankMs)
  const ratio = janks.length / gaps.length
  const maxGap = Math.round(Math.max(...gaps))

  if (ratio <= maxRatio) return []

  return [{
    kind: 'jank',
    severity: ratio > 0.25 ? 'error' : 'warn',
    title: `动画掉帧率 ${(ratio * 100).toFixed(0)}%`,
    detail: `采样 ${frames.length} 帧，${janks.length} 帧间隔超过 ${jankMs}ms，最长帧 ${maxGap}ms（阈值：掉帧率 ≤${(maxRatio * 100).toFixed(0)}%）。`,
    target,
    suggestion: '优先用 transform/opacity 做动画，避免触发布局重排；重活拆到 requestIdleCallback。',
    metrics: { totalFrames: frames.length, jankCount: janks.length, jankRatio: Number(ratio.toFixed(3)), maxGap, rect }
  }]
}

/* ------------------------------------------------------------------ 调度 -- */

const RUNNERS = {
  overflow: detectOverflow,
  horizontalScroll: detectHorizontalScroll,
  tapTarget: detectTapTarget,
  darkLeak: detectDarkLeak,
  contrast: detectContrast,
  focus: detectFocus,
  feedback: detectFeedback,
  jank: detectJank
}

/**
 * 只对特定主题有意义的检测项。
 * 暗色残留检测必须在暗色下跑 —— 在亮色页面里找「亮色大色块」只会得到一片误报。
 */
const REQUIRES_THEME = {
  darkLeak: 'dark'
}

/**
 * 只在首屏跑一次的检测项。
 *
 * 掉帧检测要真实点击并采样一帧序列，单次固定几百毫秒，且必须等在动画窗口内才有意义。
 * 它测的是「页面动画是否流畅」，这是个页面级属性，不会因为换了 12 个折叠状态就变成
 * 12 个不同结论 —— 但对每个状态都重采样一次，一轮就是上百科 × 几百毫秒的纯等待。
 * 所以只保留首屏那一次采样，既保住这个能力，又不把它塞进每一次动作。
 */
const FIRST_SCREEN_ONLY = new Set(['jank'])

/**
 * 按检测项配置跑一次完整检测。
 * detectors 形如 [{ id, enabled, options }]
 * context.theme 为 'light' | 'dark'，用于跳过当前主题下无意义的检测项。
 * context.state 为该状态的可读标签（由自动探索给出），只用于标注缺陷来源。
 */
export async function runChecks(page, detectors, context = {}) {
  const issues = []
  const ran = []
  const skipped = []

  for (const item of detectors) {
    if (!item || item.enabled === false) {
      if (item?.id) skipped.push(item.id)
      continue
    }
    const runner = RUNNERS[item.id]
    if (!runner) {
      skipped.push(item.id)
      continue
    }
    // 主题不匹配的检测项直接跳过，并记进 skipped，让用户知道「这次没跑它、原因是什么」
    const requiredTheme = REQUIRES_THEME[item.id]
    if (requiredTheme && context.theme && context.theme !== requiredTheme) {
      skipped.push(`${item.id}（仅${requiredTheme === 'dark' ? '暗色' : '亮色'}主题）`)
      continue
    }
    // 首屏专属检测项在后续交互状态下不重跑，避免为页面级属性付出上百次重复采样。
    if (context.interactive && FIRST_SCREEN_ONLY.has(item.id)) {
      if (!skipped.includes(item.id)) skipped.push(`${item.id}（仅首屏）`)
      continue
    }
    ran.push(item.id)
    try {
      const found = await runner(page, item.options || {})
      for (const issue of found) {
        // 把元素在页面里的位置提到顶层：前端要用它把缺陷「指」到真实页面的那个模块上
        const rect = issue.rect || issue.metrics?.rect || null
        issues.push({
          ...issue,
          ...(rect ? { rect } : {}),
          ...(context.state ? { state: context.state } : {})
        })
      }
    } catch (error) {
      issues.push({
        kind: item.id,
        severity: 'warn',
        title: `${DETECTORS[item.id]?.label || item.id} 检测未完成`,
        detail: String(error?.message || error).slice(0, 300),
        target: '',
        suggestion: '检查页面是否需要登录、是否有弹窗遮挡，或调小该检测项的范围。',
        metrics: {},
        ...(context.state ? { state: context.state } : {})
      })
    }
  }

  return { issues, ran, skipped }
}

/* -------------------------------------------------------------- 自动决策 -- */

/**
 * 根据页面实际能力决定要跑哪些检测项。
 *
 * 这是「用户不用选模板」的关键：用户只给一个网址，
 * 引擎自己判断这个项目有没有暗色、有没有交互控件、有没有响应式布局。
 */
export function decideDetectors(capability, discoveredStates = 0) {
  const dark = Boolean(capability?.supportsDark)
  const clickable = discoveredStates > 0

  return [
    // 视觉基础：任何页面都值得测
    { id: 'overflow', enabled: true, options: {} },
    { id: 'horizontalScroll', enabled: true, options: {} },
    { id: 'tapTarget', enabled: true, options: {} },
    { id: 'contrast', enabled: true, options: { minRatio: 3.0 } },
    { id: 'focus', enabled: true, options: { maxTabs: 20 } },
    // 只在页面真的支持暗色时才测暗色残留
    { id: 'darkLeak', enabled: dark, options: {} },
    // 只有存在可交互且不破坏数据的控件时，才做点击类检测。
    // 这两项每次都要真实点击并采样，是单次动作里最贵的两个，所以范围收紧：
    // feedback 由 12 个按钮减到 4 个，等待上限由 2.5s 减到 0.8s；
    // jank 采样窗口由 700ms 减到 400ms（掉帧本身是毫秒级特征，400ms 足够看出）。
    { id: 'feedback', enabled: clickable, options: { feedbackMs: 200, limit: 4, timeoutMs: 800 } },
    { id: 'jank', enabled: clickable, options: { frameJankMs: 34, maxJankRatio: 0.15, durationMs: 400 } }
  ]
}

/** 把自动决定的结果转成一句人话，告诉用户这次为什么这么测。 */
export function describePlan(capability, viewports, discoveredStates) {
  const themeText = capability?.supportsDark
    ? `检测到暗色能力（${capability.signal}），亮暗两套都会测`
    : '未检测到暗色主题，只测亮色'
  return `${themeText}；${viewports.length} 个视口；发现 ${discoveredStates} 个候选交互控件，将覆盖低风险点击、表单错误、键盘与弹层状态`
}

export { RUNNERS }