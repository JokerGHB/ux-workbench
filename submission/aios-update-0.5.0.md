# AIOS 更新版本 · 逐字段清单

**结论先说：只换 tgz 不够。** 后台条目里存着 `version` 和 `tarball_sha256`，Desktop 安装时会先比对 sha256、再要求包内版本等于条目里的 `version`。只换包不改这两项，用户点安装会校验失败。

---

## 0.5.0 要改的三个地方

编辑页：`https://web.aios.cloud/#/console/platform/plugins/ast_01a1f84a-0675-705b-a150-c6695883b4dd/edit`

| 字段（界面文案） | 旧值（0.4.2） | **新值（0.5.0）** |
|---|---|---|
| Version / 版本 | `0.4.2` | **`0.5.0`** |
| Tarball SHA-256 | `44f8d5b9…cf60a` | **`4c860ec7261fe3b5d6db177846bf519623e5cd8997c35f3b1654022c5fbe5e7f`** |
| Description (中文) | 只讲体验检测 | **换成下面 0.5.0 的文案** |

**不用改**：Tarball 地址。它用的是固定地址

```
https://github.com/JokerGHB/ux-workbench/releases/latest/download/dsh-ux-workbench.tgz
```

`latest/download` 永远跟随最新 Release，地址本身不变。

**可选**：Description (English)、截图（本次界面有可见变化，建议至少补一张功能测试报告页的画面）。

---

## 0.5.0 简介文案

**中文**

```
在真实浏览器里测量页面的体验缺陷，报出文字溢出、点击热区过小、暗色残留、对比度不足、键盘焦点不可见、响应延迟和动画掉帧，并给出可点的位置与修法。另有独立的「功能测试」链路：按用例验证功能对不对，由 AI 执行，结论带证据写回工作台，和体验检测分开记录、分开渲染。
```

**英文**

```
Measures real-browser experience defects — text overflow, tap targets that are too small, light leftovers in dark mode, low contrast, invisible keyboard focus, slow feedback, and dropped animation frames — then points at the exact element and explains how to fix it. A separate functional-test lane verifies whether features actually work case by case, with evidence-backed results recorded apart from experience findings.
```

---

## 顺序很重要：必须同步改

Desktop 的安装校验有一个先后关系：

1. 从 `tarball` 下载包
2. 比对下载内容的 sha256 与条目里的 `tarball_sha256`
3. 比对包内 `package.json` 的 `version` 与条目里的 `version`

因为地址是固定跟随 latest，**一发布新 Release，这个地址就已经指向新包了**。此时若条目还没改，第 2 步立刻失败。

所以正确做法是：**发 Release 和改条目要在同一时间段内完成**，或者干脆先改不了就暂时别发 Release。

---

## 更新后的验证

1. 保存条目，确认 Version 显示 `0.5.0`。
2. 列表页点「发布目录快照」，scope 选 **workbench**。
3. 刷新 `https://web.aios.cloud/plugin-market/workbenches.json`，确认该条的 `version` 和 `distribution.version` 都是 `0.5.0`，`distribution.sha256` 是 `4c860ec7…5e7f`。
4. Desktop 市场里重新安装，**重启 Harness** 后打开，确认出现「功能测试」入口。

---

## 0.5.0 包的事实

- 文件：`dsh-ux-workbench-0.5.0.tgz`
- sha256：`4c860ec7261fe3b5d6db177846bf519623e5cd8997c35f3b1654022c5fbe5e7f`
- 大小：186,435 字节（0.18 MiB，上限 8 MiB）
- 18 个文件，与工作区逐字节一致
- 包内 `package.json` version = `0.5.0`，license = MIT
- `node scripts/check-package.mjs` 通过；`npm test` 40/40 通过
- Release：`v0.5.0`，资产名 `dsh-ux-workbench.tgz`（固定文件名）