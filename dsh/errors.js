/**
 * 把浏览器的原始报错翻成一句人话。
 *
 * 顺便解释「为什么要这层」：Playwright 抛出来的错误长这样 ——
 *
 *   无法打开页面：page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5500/index.html
 *   Call log:
 *     - navigating to "http://127.0.0.1:5500/index.html", waiting until "domcontentloaded"
 *
 * 对每天开浏览器的人来说这些词有意义；对只想「测一下我的页面」的人来说，
 * 这一坨既占满面板又不告诉他该做什么。所以这里只取「哪里错了 + 该怎么办」，
 * 原始报文降级到第二行，需要排查的人还能看到。
 */

/**
 * 常见网络错误 → { 原因, 建议 }
 *
 * 键是 Playwright / Chromium 的 net:: 错误码。只收真正会遇到的那些：
 * 写太多只会变成一张没人维护的对照表。
 */
const NET_ERRORS = [
  {
    // 放在最前面：这是唯一一种「浏览器其实打开了」的失败。
    // page.goto 拿到 4xx/5xx 不抛错，如果不先认出来，就会被当成一次
    // 正常加载去扫，最后报「未发现缺陷」—— 把站点没起来谎报成页面没问题。
    match: /页面返回 HTTP (\d{3})/i,
    reason: '页面返回了错误状态码',
    hint: '本地服务可能没起来，或这个地址已经失效。先在面板右侧确认预览能打开，再重新检测。'
  },
  {
    // 同一个意思的另一种报法：某些版本的 Playwright 对 4xx/5xx
    // 直接抛 ERR_HTTP_RESPONSE_CODE_FAILURE，而不是让 goto 正常返回。
    match: /ERR_HTTP_RESPONSE_CODE_FAILURE/i,
    reason: '页面返回了错误状态码',
    hint: '服务在响应，但返回的是错误页（常见的是 404）。确认地址对不对，以及本地服务是不是真的起来了。'
  },
  {
    match: /ERR_INVALID_HTTP_RESPONSE/i,
    reason: '服务返回的内容不是网页',
    hint: '端口上有东西在监听，但它不像正常的网页服务。确认地址和端口。'
  },
  {
    match: /ERR_CONNECTION_REFUSED/i,
    reason: '没有服务在这个端口上监听',
    hint: '地址拼错了，或者页面服务还没启动。本地预览请先把它跑起来，再点检测。'
  },
  {
    match: /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/i,
    reason: '域名解析不到',
    hint: '检查域名有没有写错，以及当前网络能不能访问外网。'
  },
  {
    match: /ERR_INTERNET_DISCONNECTED/i,
    reason: '当前网络已断开',
    hint: '连上网络后再试。'
  },
  {
    match: /ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|Timeout \d+ms exceeded|Timeout of \d+ms exceeded/i,
    reason: '连接超时，页面没有响应',
    hint: '服务可能卡住了，也可能地址不可达。确认这个地址在浏览器里能打开再测。'
  },
  {
    match: /ERR_CONNECTION_RESET|ECONNRESET|socket hang up/i,
    reason: '连接被中途重置',
    hint: '目标服务拒绝了这次连接。稍后重试，或确认它没有限制访问来源。'
  },
  {
    match: /ERR_CERT|SSL|TLS|certificate/i,
    reason: 'HTTPS 证书有问题',
    hint: '证书无效或已过期。本地自签证书的站点，建议先用 http 地址测。'
  },
  {
    match: /ERR_ABORTED/i,
    reason: '页面加载被中止',
    hint: '目标页面可能跳转到了别的地址，或主动取消了加载。'
  },
  {
    match: /ERR_EMPTY_RESPONSE/i,
    reason: '服务没有返回任何内容',
    hint: '端口上有东西在监听，但它不是正常的网页服务。确认地址和端口。'
  },
  {
    match: /ERR_FILE_NOT_FOUND|net::ERR_FILE_NOT_FOUND/i,
    reason: '本地文件不存在',
    hint: '路径可能写错了，或文件已经被移走。'
  },
  {
    match: /ERR_INVALID_URL|Invalid URL/i,
    reason: '网址格式不对',
    hint: '需要以 http:// 或 https:// 开头，例如 https://example.com。'
  }
]

/**
 * @param {unknown} error 捕获到的错误
 * @param {{ url?: string, action?: string }} [context]
 * @returns {{ reason: string, hint: string, raw: string, url: string }}
 */
export function explainBrowserError(error, context = {}) {
  // 先剥掉 ANSI 颜色码再判断。
  //
  // Playwright 的 Call log 是带颜色输出的，原文长这样：
  //   \u001b[2m  - navigating to "http://…", waiting until "domcontentloaded"\u001b[22m
  // 转义序列夹在行首，`^-\s` 这类「行首」锚点全部落空 ——
  // 于是过滤看着写了、实际一条都没滤掉，面板上就显示一堆英文调用备注。
  const raw = stripAnsi(String((error && error.message) || error || '')).trim()
  const url = context.url || extractUrl(raw) || ''

  for (const entry of NET_ERRORS) {
    if (entry.match.test(raw)) {
      return { reason: entry.reason, hint: entry.hint, raw, url }
    }
  }

  // 认不出来就退回原始信息，但同样去掉 Call log 那一坨噪音。
  return {
    reason: cleanup(raw) || '页面打不开',
    hint: '确认这个地址在浏览器里能正常打开，再点检测。',
    raw,
    url
  }
}

/** 去掉 ANSI 转义序列（颜色、光标控制）。 */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

/** 把错误整理成一行适合直接展示的中文。 */
export function summarizeBrowserError(error, context = {}) {
  const { reason, hint, url } = explainBrowserError(error, context)
  const where = url ? `（${url}）` : ''
  return `无法打开网页：${reason}${where}。${hint}`
}

/** 从 Playwright 的报文里抠出它正在访问的地址。 */
function extractUrl(raw) {
  const text = stripAnsi(raw)
  const at = text.match(/\bat\s+(https?:\/\/[^\s]+)/i)
  if (at) return at[1]
  const navigating = text.match(/navigating to\s+"([^"]+)"/i)
  if (navigating) return navigating[1]
  return ''
}

/**
 * 去掉多行调用日志，只留第一句实质内容。
 *
 * Playwright 的报文是「第一行说事 + 空行 + Call log + 缩进的调用栈」，
 * 后面那截是给人贴 issue 用的，不是给面板显示的。
 *
 * 还有一种更烦人的单行形态，Playwright 会把调用备注塞在同一行里：
 *
 *   page.goto: net::ERR_ABORTED at http://x/y - navigating to "http://x/y", waiting until "domcontentloaded"
 *
 * 这时候只按行过滤是不够的，得把 "at <地址>" 和 "- navigating to ..." 这些
 * 片段一起剪掉，否则面板上就会看到「无法打开页面：at http://… - navigating to "http://…"」
 * 这种把同一个地址说两遍、还夹着英文动词的句子。
 */
function cleanup(raw) {
  return stripAnsi(String(raw))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Call log:/i.test(line) && !/^-\s/.test(line) && !/^waiting until/i.test(line))
    .join(' ')
    .replace(/\s*page\.goto:\s*/i, '')
    .replace(/\s*net::[A-Z_]+\s*/i, ' ')
    // 单行形态里的调用备注：从 "at <url>" 或 "navigating to" 开始到行尾都是噪音
    .replace(/\s+-?\s*navigating to\s+"[^"]*".*$/i, '')
    .replace(/\s+at\s+https?:\/\/\S+.*$/i, '')
    .replace(/\s*,\s*waiting until.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:：。,.、-]+/, '')
    .trim()
    .slice(0, 160)
}