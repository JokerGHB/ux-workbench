/**
 * DSH 找茬工作台 · 实时预览
 *
 * 体验缺陷的难点不在「测出来」，而在「看懂是哪个模块」。
 * 一条「对比度仅 1.8:1 · body > div.card > p.hint」对不熟悉这个页面的人等于没说。
 *
 * 所以检测结束后不在报告里干讲坐标，而是留一个真实浏览器会话：
 *   - 侧栏持续截取这个会话的画面，就是用户要看的那个网页本身
 *   - 点击某条缺陷，页面滚到对应模块并把它框出来
 *   - 点的是暗色组合的缺陷，就切到暗色再框，颜色对得上
 *
 * 会话是宿主的进程，关掉面板即回收；闲置也会自动关闭，不留后台浏览器。
 */

/** 叠加层的容器 id。用固定定位 + 滚动重算，避免被页面自身的 transform 带偏。 */
const OVERLAY_ID = '__dsh_ux_preview_layer'

/** 闲置多久回收会话（毫秒）。用户切走标签页时不该一直占着一个浏览器。 */
const IDLE_MS = 3 * 60 * 1000

/** 预览截图的画质：够看清布局，又不至于每秒传几百 KB。整页总览用这个。 */
const JPEG_QUALITY = 62

/**
 * 定位时的画质与像素密度。
 *
 * 定位场景只看一小块区域，体积有富余，所以拉高：
 * q62→q92 只多二十几 KB，2 倍密度让 12px 正文在缩到 41% 后仍有足够采样余量。
 * 实测 q92+2x 约 129KB（base64 后 173KB），单次点击换这个量是值得的。
 */
const FOCUS_JPEG_QUALITY = 92
const FOCUS_SCALE = 2

/**
 * 算出该截哪一块 —— 目标模块四周留点上下文。
 *
 * 留白是为了让用户看清「这个模块在什么位置、周围是什么」，
 * 贴边裁会让人失去空间感。但留太多又退回整页缩略图，所以按视口的 62% 起。
 */
function clipAround(rect, viewport) {
  if (!rect || !(rect.w > 0) || !(rect.h > 0)) return null
  const padX = Math.max(28, Math.round(viewport.width * 0.045))
  const padY = Math.max(28, Math.round(viewport.height * 0.05))

  // 至少保证 620x420 的视野，太小的元素（一个 24px 的按钮）也有上下文可看
  const minW = Math.min(viewport.width, 620)
  const minH = Math.min(viewport.height, 420)

  let w = Math.min(viewport.width, Math.max(rect.w + padX * 2, minW))
  let h = Math.min(viewport.height, Math.max(rect.h + padY * 2, minH))

  // 以元素为中心，再夹进视口
  let x = rect.x + rect.w / 2 - w / 2
  let y = rect.y + rect.h / 2 - h / 2

  const maxX = Math.max(0, viewport.width - w)
  const maxY = Math.max(0, viewport.height - h)
  x = Math.min(maxX, Math.max(0, x))
  y = Math.min(maxY, Math.max(0, y))

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(w, viewport.width - x)),
    height: Math.round(Math.min(h, viewport.height - y))
  }
}

/**
 * 往页面里注入的叠加层。
 *
 * 只画框，不碰页面元素本身 —— 检测工具不该修改被测对象，否则截出来的图
 * 和用户在真实环境看到的就不是同一个东西了。
 */
function overlayScript(markers, activeKey, activeTag = '') {
  return `(() => {
    const ID = ${JSON.stringify(OVERLAY_ID)};
    const markers = ${JSON.stringify(markers)};
    const activeKey = ${JSON.stringify(activeKey)};
    const activeTag = ${JSON.stringify(activeTag)};

    let layer = document.getElementById(ID);
    if (layer) layer.remove();
    layer = document.createElement('div');
    layer.id = ID;
    layer.setAttribute('data-dsh-ux', '1');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';

    const style = document.createElement('style');
    style.textContent = [
      '@keyframes dshUxPulse{0%,100%{box-shadow:0 0 0 0 currentColor}50%{box-shadow:0 0 0 5px transparent}}',
      '.dsh-ux-box{position:absolute;box-sizing:border-box;border-radius:5px;pointer-events:none;transition:left .18s ease,top .18s ease,width .18s ease,height .18s ease}',
      '.dsh-ux-box[data-active="1"]{animation:dshUxPulse 1.15s ease-out infinite}',
      '.dsh-ux-tag{position:absolute;transform:translateY(-100%);white-space:nowrap;font-size:10px;line-height:15px;font-weight:700;letter-spacing:.02em;padding:1px 6px;border-radius:4px 4px 4px 0;color:#fff;pointer-events:none}',
      '@media (prefers-reduced-motion:reduce){.dsh-ux-box[data-active="1"]{animation:none}}'
    ].join('');
    layer.appendChild(style);

    const boxes = markers.map((m, index) => {
      const color = m.color || '#E2703A';
      const isActive = m.key === activeKey;
      const box = document.createElement('div');
      box.className = 'dsh-ux-box';
      box.dataset.active = isActive ? '1' : '0';
      box.style.color = color;
      box.style.border = isActive ? '3px solid ' + color : '1.5px dashed ' + color;
      // 不要填充：这块区域里就是要看的文字，蒙一层色反而读不清。
      // 用「外发光描边」把注意力引过来，保持框内完全透明。
      box.style.background = 'transparent';
      box.style.opacity = isActive ? '1' : '.5';
      // 外发光在白底和深底上都看得见，又不会盖住框内内容
      box.style.boxShadow = isActive
        ? '0 0 0 2px rgba(255,255,255,.9), 0 0 0 5px color-mix(in srgb, ' + color + ' 42%, transparent), 0 6px 20px rgba(0,0,0,.22)'
        : 'none';
      box.style.zIndex = isActive ? '2' : '1';
      if (isActive && activeTag) {
        const tag = document.createElement('span');
        tag.className = 'dsh-ux-tag';
        tag.style.background = color;
        tag.textContent = activeTag;
        box.appendChild(tag);
      }
      layer.appendChild(box);
      return { box, rect: m.rect, index };
    });

    const place = () => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      for (const item of boxes) {
        const r = item.rect;
        if (!r) { item.box.style.display = 'none'; continue; }
        // 框向外扩出去，不要压住被测元素本身：
        // 16px 高的文字行上贴 3px 边框，边框会直接吃掉字。
        const pad = item.box.dataset.active === '1' ? 3 : 2;
        const top = r.y - sy - pad;
        item.box.style.left = (r.x - sx - pad) + 'px';
        item.box.style.top = top + 'px';
        item.box.style.width = Math.max(2, r.w + pad * 2) + 'px';
        item.box.style.height = Math.max(2, r.h + pad * 2) + 'px';
        // 元素贴着视口顶部时，标签没地方放 —— 翻到框内侧，别被裁掉
        const tag = item.box.querySelector('.dsh-ux-tag');
        if (tag) {
          const flip = top < 20;
          tag.style.transform = flip ? 'translateY(0)' : 'translateY(-100%)';
          tag.style.borderRadius = flip ? '0 4px 4px 4px' : '4px 4px 4px 0';
        }
      }
    };
    place();

    const root = document.documentElement;
    root.appendChild(layer);
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    window.__dshUxPreview = { layer, place };

    return { markers: boxes.length, active: Boolean(activeKey) };
  })()`
}

/** 清掉叠加层。切页面、关会话前调用。 */
function clearOverlayScript() {
  return `(() => {
    const layer = document.getElementById(${JSON.stringify(OVERLAY_ID)});
    if (layer) layer.remove();
    window.__dshUxPreview = null;
    return true;
  })()`
}

/**
 * 创建预览会话池。
 *
 * 依赖注入而不是直接 import playwright：工作台在没有浏览器驱动的部署里
 * 依然要能打开、能看历史记录，只是预览与检测不可用。
 */
import { summarizeBrowserError } from './errors.js'

export function createPreviewPool({ loadPlaywright, ensureBrowser, resolveUrl, log = () => {} }) {
  /** sessionId -> { context, page, signature, touchedAt, busy } */
  const sessions = new Map()
  /** 整个池子共用一个浏览器进程：每个会话单开一个 browser 太贵。 */
  let browser = null

  const launchBrowser = async () => {
    if (browser && browser.isConnected()) return browser
    const { chromium } = await loadPlaywright()
    const info = await ensureBrowser()
    browser = await chromium.launch({
      executablePath: info?.executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
    })
    browser.on('disconnected', () => { browser = null })
    return browser
  }

  const signatureOf = (target) => JSON.stringify({
    url: target.url,
    width: target.viewport?.width,
    height: target.viewport?.height,
    theme: target.theme || 'light'
  })

  const closeSession = async (id) => {
    const session = sessions.get(id)
    if (!session) return
    sessions.delete(id)
    await session.context.close().catch(() => {})
    // 会话都走了就释放浏览器，别在后台留一个空跑的进程
    if (sessions.size === 0 && browser) {
      const current = browser
      browser = null
      await current.close().catch(() => {})
    }
  }

  const closeAll = async () => {
    for (const id of Array.from(sessions.keys())) await closeSession(id)
  }

  // 闲置回收：用户关掉面板、切走标签页时不该留一个浏览器在后台空转
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (session.busy) continue
      if (now - session.touchedAt > IDLE_MS) closeSession(id).catch(() => {})
    }
  }, 30 * 1000)
  if (typeof sweeper.unref === 'function') sweeper.unref()

  /**
   * 打开（或复用）一个预览会话。
   *
   * 用 signature（地址 + 视口 + 主题）判断能否复用：同一份页面同一套环境
   * 就继续用同一个会话，切换组合才重建 —— 重建比原地改视口可靠。
   */
  const open = async (target) => {
    const signature = signatureOf(target)
    const wanted = Array.from(sessions.entries())
      .find(([, session]) => session.signature === signature)
    if (wanted) {
      wanted[1].touchedAt = Date.now()
      return wanted[0]
    }

    const chromiumBrowser = await launchBrowser()

    const context = await chromiumBrowser.newContext({
      viewport: {
        width: target.viewport?.width || 1440,
        height: target.viewport?.height || 900
      },
      colorScheme: target.theme === 'dark' ? 'dark' : 'light',
      // 2 倍像素密度：面板栏只有约 590px，1x 截图缩过去正文会糊成 4.9px。
      // 提高设备像素比是唯一能在「不改布局尺寸」的前提下拿到清晰像素的办法。
      deviceScaleFactor: FOCUS_SCALE
    })
    const page = await context.newPage()

    const url = resolveUrl(target)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (error) {
      // 会话没建成就要把上下文收掉，否则每失败一次就漏一个浏览器上下文。
      await context.close().catch(() => {})
      throw new Error(summarizeBrowserError(error, { url }))
    }
    if (target.theme) await page.emulateMedia({ colorScheme: target.theme })
    await page.waitForTimeout(420)

    const id = `pv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    sessions.set(id, { context, page, signature, touchedAt: Date.now(), busy: false })
    log(`预览会话已建立：${url}`)
    return id
  }

  /**
   * 截一帧整页总览。返回可直接塞进 <img src> 的 data URL。
   *
   * 总览用较低画质和逻辑尺寸：它只是「这是被测页面」的交代，
   * 真正要看细节是用 focus() 裁出来的那一块。
   */
  const frame = async (id) => {
    const session = sessions.get(id)
    if (!session) return null
    session.touchedAt = Date.now()
    const buffer = await session.page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, animations: 'disabled' })
    // 报告的是 CSS 逻辑尺寸，不是位图尺寸 —— 前端拿它算 aspect-ratio。
    const size = session.page.viewportSize() || { width: 1440, height: 900 }
    return {
      image: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      width: size.width,
      height: size.height,
      url: session.page.url()
    }
  }

  /**
   * 把一条缺陷「指」到页面上。
   *
   * 三步：滚到元素、画所有缺陷的框、把当前这条加粗并标类型。
   * 滚到之后等一小会儿再截图，避免截到滚动动画的中间帧。
   */
  const focus = async (id, { selector, rect, markers = [], activeKey, tag }) => {
    const session = sessions.get(id)
    if (!session) return null
    session.busy = true
    session.touchedAt = Date.now()
    try {
      if (selector) {
        await session.page.evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          return true;
        })()`).catch(() => {})
        await session.page.waitForTimeout(140)
      }

      // 滚动后 rect 需要重算：页面位置变了，元素在文档里的坐标不变，
      // 但如果元素是懒加载的，位置会变，所以以页面里真实的位置为准。
      // 这里同时取文档坐标（画叠加层用）和视口坐标（截图 clip 用）：
      // page.screenshot({clip}) 吃的是视口坐标，喂文档坐标会在滚动后裁错位置，
      // 而且截出来还是一张看起来正常的图，很难发现。
      const resolved = selector
        ? await session.page.evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              doc: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
              view: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
            };
          })()`).catch(() => null)
        : null

      // 叠加层用文档坐标画（它自己按 scroll 换算到视口），clip 用视口坐标。
      // 两个坐标系必须分开走，混用会在滚动后裁到别处。
      const activeDoc = resolved?.doc || rect || null
      const activeView = resolved?.view
        || (rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null)

      const list = markers.map((item) => ({
        ...item,
        rect: item.key === activeKey && activeDoc ? activeDoc : item.rect
      }))

      await session.page.evaluate(overlayScript(list, activeKey, tag)).catch(() => {})
      await session.page.waitForTimeout(180)

      // 关键：不要整页缩略图。
      // 面板栏只有约 590px 宽，整页 1440px 压进去是 41%，12px 正文会变成 4.9px，
      // 怎么调编码都救不回来 —— 必须少截一点、截大一点。
      // 所以这里裁到目标模块周边，并按 2 倍像素密度截。
      const viewport = session.page.viewportSize() || { width: 1440, height: 900 }
      const clip = activeView ? clipAround(activeView, viewport) : null
      const buffer = await session.page.screenshot({
        type: 'jpeg',
        quality: FOCUS_JPEG_QUALITY,
        animations: 'disabled',
        scale: 'device',
        ...(clip ? { clip } : {})
      })
      return {
        image: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        width: Math.round((clip ? clip.width : viewport.width) * FOCUS_SCALE),
        height: Math.round((clip ? clip.height : viewport.height) * FOCUS_SCALE),
        url: session.page.url(),
        clipped: Boolean(clip),
        scale: FOCUS_SCALE,
        found: Boolean(activeDoc)
      }
    } finally {
      session.busy = false
    }
  }

  /**
   * 自检：叠加层在不在、被框的元素是不是真的落在视口里。
   *
   * 只给测试与排障用。预览最怕的是「看起来框上了，其实框在屏幕外」，
   * 光看截图分辨不出来，所以这里直接把几何读回来对一遍。
   */
  const inspect = async (id) => {
    const session = sessions.get(id)
    if (!session) return { overlay: false, ok: false, note: '会话不存在' }
    return session.page.evaluate(`(() => {
      const layer = document.getElementById(${JSON.stringify(OVERLAY_ID)});
      if (!layer) return { overlay: false, ok: false, note: '没有叠加层' };
      const boxes = Array.from(layer.querySelectorAll('.dsh-ux-box'));
      const active = boxes.find((box) => box.dataset.active === '1');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!active) return { overlay: true, ok: false, note: '没有选中框', count: boxes.length };
      const r = active.getBoundingClientRect();
      const inView = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      const sized = r.width > 1 && r.height > 1;
      return {
        overlay: true,
        ok: inView && sized,
        count: boxes.length,
        note: 'active ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)
      };
    })()`).catch((error) => ({ overlay: false, ok: false, note: String(error.message || error) }))
  }

  return { open, frame, focus, inspect, close: closeSession, closeAll, size: () => sessions.size, clearOverlay: clearOverlayScript }
}

export { OVERLAY_ID }