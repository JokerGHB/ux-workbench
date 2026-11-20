/**
 * 验证用的静态服务器（5599）。
 *
 * 只服务工作台前端需要的几个文件，不做通用静态托管 ——
 * 目的是给 Playwright 一个稳定的地址去加载 .test-harness.html。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const PORT = Number(process.env.PORT || 5599)
const ROOT = process.cwd()

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const pathname = decodeURIComponent(url.pathname)
  // /harness-runs?scenario=runs 之类：任何非文件路径都当测试页，
  // query 原样留给页面自己解析（假数据按 scenario 分支）。
  const target = pathname.includes('.') ? pathname : '/.test-harness.html'
  const file = join(ROOT, target)
  // 防止越界读取
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return }
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`找茬工作台 测试页: http://127.0.0.1:${PORT}/`)
})