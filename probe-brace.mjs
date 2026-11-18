import { readFile } from "node:fs/promises"
const src = await readFile("D:/work/工作台/ux-workbench/lib/client.js", "utf8")
// 用 vm 拿到行号：包装成脚本，捕获栈里的行
const lines = src.split("\n")
// 逐行累加，找到深度变负的位置（说明前面多了一个 }）
let depth = 0
const suspects = []
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const stripped = line.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, "``").replace(/\/\/.*$/, "")
  const o = (stripped.match(/\{/g)||[]).length, c = (stripped.match(/\}/g)||[]).length
  depth += o - c
  if (depth < 0 && suspects.length < 5) suspects.push({ line: i+1, depth, text: line.trim().slice(0,90) })
}
console.log("首个变负位置:", JSON.stringify(suspects, null, 1))
