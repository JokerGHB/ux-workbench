# 上架投稿材料 · 找茬工作台 0.4.2

投稿目标仓库：`dataelement/awesome-dsh-workbench`
新增文件路径：`data/workbenches/JokerGHB__ux-workbench.yml`

本目录只是本机保存的投稿材料，不会被 npm 包收录（`package.json` 的 `files` 不含 `submission/`）。

---

## 1. 收录 YAML

见 `workbench.yml`，内容与要提交的 `data/workbenches/JokerGHB__ux-workbench.yml` 完全一致。

字段说明：

- `url` 与文件名 `JokerGHB__ux-workbench.yml` 对应。
- `category: development` —— 属于 7 个分类之一，也是最贴切的一个。
- 中英文简介各一行，只描述实际检出的七类缺陷，没有营销用语。
- 三张截图都在本仓库 `docs/screenshots/`，走 `raw.githubusercontent.com` 完整 HTTPS 地址。
- `tarball` 用固定文件名 `dsh-ux-workbench.tgz`（不带版本号），指向 `releases/latest/download/`。
- **不写** `version`、npm 包名、校验值、作者 ID，也**不写** `workbenchId`（新投稿不填）。

---

## 2. PR 描述（可直接粘贴）

```markdown
## 工作台用途

找茬工作台在真实浏览器里测量页面的体验缺陷，报出七类没有功能性 oracle 的问题：文字溢出容器、点击热区小于 44px、暗色模式残留亮色块、对比度低于 WCAG 阈值、键盘焦点不可见、点击后反馈延迟、动画掉帧。

每条缺陷给出可点的选择器、实测数值和修法；点一条记录会把页面里那个元素滚到视口正中。检测项、主题组合和视口由页面自身能力决定，不需要手动配置模板或阈值。

## 本机验收结果

- 包校验：`node scripts/check-package.mjs` 通过（`dsh-ux-workbench@0.4.2`）。
- 单元测试：`npm test` —— 20 项全部通过。
- 安装契约：完整 SemVer `0.4.2`；`repository` 指回本仓库；`dsh.bundle.patch` → `./cordis.patch.yml`；`exports["./client"]` → `./lib/client.js`；`dsh.client.inject` 含 `dsh-desktop-workbenches`。
- 包体积：152,816 字节（约 0.15 MiB），远低于 8 MiB 上限；18 个文件，无 `.env`、token、密钥、客户数据或本机绝对路径。
- 本机从安装包安装并在 Desktop 中实际打开工作台，界面与三张截图一致。

## 验证过的 Desktop 版本与平台

- DSH Desktop（EasyWork Dev 打包版），Harness profile `web`，Windows x64。
- 工作台以 `dsh-ux-workbench@0.4.2` 安装在 `profiles/web` 下，重启 Harness 后可见并可打开。

## 安装来源

GitHub Release 安装包：

`https://github.com/JokerGHB/ux-workbench/releases/latest/download/dsh-ux-workbench.tgz`

- Release tag：`v0.4.2`
- sha256：`44f8d5b95b7adb270664a5c8f8b207cb88517b3bb1fc525a340bb7a7a45cf60a`
- 包内 `package.json` 版本与 Release 对应，固定文件名不带版本号，后续发版只需替换资产。

## 外部依赖 / 网络访问 / 数据位置

- 依赖：`playwright-core`（随桌面版提供）与其驱动的系统浏览器，无原生模块、无需 node-gyp/Python/Rust。
- 网络：只在用户给出的地址上打开页面做测量；不向任何第三方上传内容。
- 数据位置：检测产物和记录保存在用户为工作台选择的文件夹下的 `ux-workbench/`，不上传。
- 宿主 API：通过 `dsh-desktop-workbenches` 注册，走工作台自己的 `/api/dsh-ux-workbench` 路由。

## 截图

三张均在最终可安装版本 0.4.2 上实拍，1600×1000（16:9），均在 2 MiB 以内：

1. `01-report.png` —— 缺陷报告：五处位置、严重度分级、每条带选择器与修法
2. `02-outcomes.png` —— 三种结局：有缺陷 / 测完干净 / 页面没打开（绝不画成通过）
3. `03-clean.png` —— 干净结果页
```

---

## 3. 提交前自查

| 验收项 | 状态 | 证据 |
|---|---|---|
| 公开仓库 + 许可证 | ✅ | GitHub 公开仓库，MIT |
| 真实可用代码 | ✅ | 18 个源文件，20/20 测试通过 |
| 至少一个安装来源 | ✅ | GitHub Release `v0.4.2` / `dsh-ux-workbench.tgz` |
| 打包 ≤ 8 MiB | ✅ | 152,816 B（0.15 MiB） |
| 无密钥/客户数据/绝对路径 | ✅ | 已逐文件核查 |
| 安装契约完整 | ✅ | 见上「本机验收结果」 |
| 中英文简介属实 | ✅ | 只描述实际实现的七个检测项 |
| 截图 1–5 张、格式/大小/宽高 | ✅ | 3 张 PNG，1600×1000，≤250 KiB |
| 截图在最终版本上实拍 | ✅ | 三张都在 0.4.2 界面上重拍，按钮为「开始检测」 |
| 截图地址可公开访问 | ✅ | `raw.githubusercontent.com`，远端文件大小与本地一致 |
| YAML 未写 version/包名/校验值/workbenchId | ✅ | 见 `workbench.yml` |
| PR 只新增自己的一个 YAML | ✅ | 单文件新增 |

**未验证项**：无。

---

## 4. 提交步骤

1. Fork `dataelement/awesome-dsh-workbench`。
2. 把 `workbench.yml` 放到 `data/workbenches/JokerGHB__ux-workbench.yml`。
3. （可选）在仓库根跑 `npm run check` 预检。
4. 提交 PR，描述粘贴上面第 2 节内容。
5. PR 创建后查看最新提交的检查日志，确认实际执行并通过。

---

## 5. 后续发版

走 GitHub Release 来源时，`tarball` 用固定文件名，普通发版**不需要**再提收录 PR：

1. 改 `package.json` 版本号，`npm pack`。
2. 建新 Release，上传同一文件名 `dsh-ux-workbench.tgz`。
3. 验证固定地址可下载、包内版本正确、sha256 一致。
4. 若界面有可见变化，重拍截图并更新仓库里的图片（YAML 地址不变）。

只有固定地址或文件名变化时，才需要提 PR 修改 `tarball`。