# AIOS 后台上传 · 逐字段填写单

目标页面：`https://web.aios.cloud/#/console/platform/plugins`
点「新建」进入表单，**Kind 先选 `workbench`**（切到 workbench 后 owner/repository/tarball/sha256/截图这些字段才出现，`url` 会自动按 `https://github.com/<owner>/<repository>` 生成）。

保存后回到列表，用「发布目录快照」把 scope 选 `workbench` 推一次，市场里的 `workbenches.json` 才会更新。

---

## 表单逐字段

| 字段（界面文案） | 填什么 |
|---|---|
| Kind / 类型 | `workbench` |
| Name / 名称 | `找茬工作台` |
| Owner | `JokerGHB` |
| Repository | `ux-workbench` |
| URL | 自动生成 `https://github.com/JokerGHB/ux-workbench`，不用改 |
| Category / 分类 | `development`（开发） |
| Description (中文) | `在真实浏览器里测量页面的体验缺陷，报出文字溢出、点击热区过小、暗色残留、对比度不足、键盘焦点不可见、响应延迟和动画掉帧，并给出可点的位置与修法。` |
| Description (English) | `Measures real-browser experience defects — text overflow, tap targets that are too small, light leftovers in dark mode, low contrast, invisible keyboard focus, slow feedback, and dropped animation frames — then points at the exact element and explains how to fix it.` |
| Version / 版本 | `0.4.2` |
| Tarball | `https://github.com/JokerGHB/ux-workbench/releases/latest/download/dsh-ux-workbench.tgz` |
| Tarball SHA-256 | `44f8d5b95b7adb270664a5c8f8b207cb88517b3bb1fc525a340bb7a7a45cf60a` |
| Workbench screenshots / 截图 | 逐行贴下面 3 行，一行一个地址 |
| Install | 留空（workbench 条目一律 `install: ""`，表单也不显示这个字段） |
| Deprecated / 已废弃 | 不勾 |
| Replacement | 留空 |

### 截图地址（3 行，一行一个，顺序即展示顺序）

```
https://raw.githubusercontent.com/JokerGHB/ux-workbench/main/docs/screenshots/01-report.png
https://raw.githubusercontent.com/JokerGHB/ux-workbench/main/docs/screenshots/02-outcomes.png
https://raw.githubusercontent.com/JokerGHB/ux-workbench/main/docs/screenshots/03-clean.png
```

第一张是封面，用的是缺陷报告页——最能一眼说明这个工作台在干什么。

---

## 校验规则（表单会当场拦这些）

后台表单在这些条件下不允许保存，逐条已核对通过：

| 规则 | 我的值 |
|---|---|
| kind=workbench 时 name/owner/repository/category/version/tarball/tarballSha256 必填，中英文简介都要有 | ✅ 全部填写 |
| `tarball_sha256` 必须匹配 `/^[a-fA-F0-9]{64}$/` | ✅ 64 位小写十六进制 |
| 截图至少 1 条 | ✅ 3 条 |
| category 必须在 7 个 workbench 分类内 | ✅ `development` |
| owner + repository 拼接生成 url | ✅ 与仓库一致 |

Desktop 端安装时还会再验一次：从 tarball 下载后先比对 sha256，再检查包内 `package.json` 的 `version` 必须等于 `0.4.2`。两者都成立才会装上。

---

## 上传前的三项外部校验（已验证通过）

1. **下载地址可达**：`curl -L` 得到 `200`，152,816 字节，与上传的资产一致（不是 GitHub 的 HTML 错误页）。
2. **sha256 匹配**：下载后本地算出的 `44f8d5b9…cf60a` 与 GitHub 记录的 digest 一致。
3. **截图可公开访问**：三个 `raw.githubusercontent.com` 地址均返回 `image/png`，远端文件大小 210073 / 187725 / 249592 字节，与本地逐一相同。

---

## 保存之后

1. 列表页找到这一条，确认 Kind 显示 `workbench`、Version `0.4.2`。
2. 点「发布目录快照」，scope 选 **workbench**（不是 all，也不是 plugin——workbench 和 plugin 是两套独立目录）。
3. 刷新 `https://web.aios.cloud/plugin-market/workbenches.json`，确认 `dsh-ux-workbench` 出现在里面，且 `distribution.version` 为 `0.4.2`。
4. 在 DSH Desktop 的市场里搜「找茬工作台」，从市场装一次，**重启 Harness 后**打开工作台，确认界面正常。

第 3 步是关键：只保存条目不推快照，市场里的 `workbenches.json` 不会变，用户那边搜不到。

---

## 一个提醒

`releases/latest/download/dsh-ux-workbench.tgz` 是**固定地址**，跟随最新 Release。以后发新版本时，只要新 Release 上传同名文件，这个地址会自动指过去，后台条目**不用改**。

但要注意：后台条目里存的是 `version: 0.4.2` 和固定的 sha256。所以发新版时**必须**在后台把这两个字段一起改掉，否则 Desktop 下载到 0.5.0 的包、却拿它去比对 0.4.2 的 sha256，校验会失败、安装被拒。这是固定地址 + 店内校验组合下最容易踩的坑。