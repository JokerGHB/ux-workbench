/**
 * 找茬工作台 · 客户端入口（已构建的单文件模块）
 *
 * 交互模型：一个网址输入框 + 一个测试按钮。
 * 没有模板、没有阈值面板、没有检测项勾选 —— 引擎自己决定测什么。
 *
 * 视觉方向：「测量仪器」。
 * 七类检测各有专属色相，颜色不是装饰而是数据编码 ——
 * 扫一眼结果列表，凭颜色就能分辨缺陷类型。
 * 所有色相都用 color-mix 叠在宿主表面上，因此亮暗两套都成立。
 */
window.__ModuleLoader__.load({
  id: 'dsh-ux-workbench',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-ux-workbench'
    const API = '/api/dsh-ux-workbench'
    const REPOSITORY = 'https://github.com/JokerGHB/ux-workbench'

    /* 左栏宽度的上下限。拖到 0 或拖得比主区还宽都没法用，所以写死边界。 */
    const MIN_SIDE = 180
    const MAX_SIDE = 520
    /* 右侧栏（网页/代码）的宽度范围。窄到 260 以下代码就折行到没法看。 */
    const MIN_PREVIEW = 260
    const MAX_PREVIEW = 900
    /* 历史记录默认露出几条：再多就把上面的项目和文件树顶到看不见了。 */
    const RUNS_PREVIEW = 10

    /* ------------------------------------------------------- 色彩语义表 -- */

    /** 每个检测项一个色相：色相间距足够大，灰度下也不至于糊成一片。 */
    const DETECTOR_META = {
      overflow: { label: '文字溢出', hue: '#E2703A', note: '文字被容器裁切' },
      tapTarget: { label: '点击热区', hue: '#8B6FD4', note: '点击区域偏小' },
      darkLeak: { label: '暗色残留', hue: '#4E7CD8', note: '暗色下仍为亮色' },
      contrast: { label: '对比度', hue: '#0F9C87', note: '文字与背景太接近' },
      focus: { label: '焦点可见', hue: '#CE5A9E', note: '键盘聚焦无指示' },
      feedback: { label: '响应延迟', hue: '#2A93BE', note: '点击后迟迟无反馈' },
      jank: { label: '动画掉帧', hue: '#D75461', note: '动效卡顿不连贯' }
    }

    const metaOf = (kind) => DETECTOR_META[kind] || { label: kind, hue: 'var(--dsw-alias-label-tertiary)', note: '' }

    /* ------------------------------------------------------------- 样式 -- */

    const css = `
.uxw{
  /* 带上兜底色：宿主没有这个变量时，整条 background 会失效变成 none，
     图标和很多强调色就一起消失。--uxw-brand 是整套视觉的根。 */
  --uxw-brand:var(--dsw-alias-state-business-primary,#0F9C87);
  --uxw-ease:cubic-bezier(.22,.61,.36,1);
  position:relative;display:flex;flex-direction:column;flex:1 1 auto;
  width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font-size:13px;line-height:20px;-webkit-font-smoothing:antialiased;
  font-family:var(--dsw-font-family-base,inherit);
}
.uxw *,.uxw *::before,.uxw *::after{box-sizing:border-box}
.uxw ::selection{background:color-mix(in srgb,var(--uxw-brand) 30%,transparent)}
.uxw ::-webkit-scrollbar{width:10px;height:10px}
.uxw ::-webkit-scrollbar-track{background:transparent}
.uxw ::-webkit-scrollbar-thumb{border:3px solid transparent;background-clip:padding-box;border-radius:999px;background-color:color-mix(in srgb,var(--dsw-alias-label-primary) 17%,transparent)}
.uxw ::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent)}
.uxw :focus-visible{outline:2px solid var(--uxw-brand);outline-offset:2px;border-radius:6px}

/* ═══ 顶栏 ═══ */
.uxwTop{position:relative;display:flex;align-items:center;gap:12px;flex:0 0 auto;min-height:60px;padding:10px 18px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);overflow:hidden}
.uxwTop::after{content:"";position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(120% 180% at 0% 0%,color-mix(in srgb,var(--uxw-brand) 13%,transparent),transparent 62%),
  radial-gradient(90% 160% at 88% 0%,color-mix(in srgb,#0F9C87 10%,transparent),transparent 58%)}
.uxwTop>*{position:relative;z-index:1}
.uxwBrand{display:flex;align-items:center;gap:10px;flex:0 0 auto}
.uxwMark{position:relative;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;
  background:linear-gradient(150deg,color-mix(in srgb,var(--uxw-brand) 92%,#fff),var(--uxw-brand) 46%,color-mix(in srgb,var(--uxw-brand) 58%,#0b1020));
  color:#fff;font-size:10px;font-weight:800;letter-spacing:.03em;
  box-shadow:0 1px 1px rgba(0,0,0,.2),0 3px 12px color-mix(in srgb,var(--uxw-brand) 38%,transparent),inset 0 1px 0 rgba(255,255,255,.32)}
/* 图标是放大镜 + 镜片里的一道裂痕。不要文字缩写：
   30px 的方块里放两个字母，远看只是一团白，认不出是什么工具。 */
.uxwMark svg{width:17px;height:17px;display:block}
.uxwMark::after{content:"";position:absolute;inset:-3px;border-radius:12px;border:1px solid color-mix(in srgb,var(--uxw-brand) 26%,transparent)}
.uxwBrandText{display:flex;flex-direction:column;gap:1px;min-width:0}
.uxwBrandName{font-size:14px;line-height:19px;font-weight:680;letter-spacing:-.012em;white-space:nowrap}
.uxwBrandSub{font-size:10px;line-height:14px;font-weight:500;letter-spacing:.055em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.uxwDivider{flex:0 0 auto;width:1px;height:24px;background:linear-gradient(transparent,var(--dsw-alias-border-l2) 22%,var(--dsw-alias-border-l2) 78%,transparent)}
.uxwSpacer{flex:1 1 auto;min-width:4px}

/* 网址输入组：输入框与按钮合成一体 */
.uxwField{display:flex;align-items:center;flex:1 1 auto;min-width:0;max-width:640px;height:34px;padding:2px;border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);
  transition:border-color .16s var(--uxw-ease),box-shadow .16s var(--uxw-ease)}
.uxwField:hover{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,var(--dsw-alias-border-l2))}
.uxwField[data-focused=true]{border-color:var(--uxw-brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--uxw-brand) 16%,transparent)}
.uxwField[data-busy=true]{border-color:color-mix(in srgb,var(--uxw-brand) 34%,var(--dsw-alias-border-l2))}
.uxwInput{flex:1 1 auto;min-width:0;height:100%;padding:0 10px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary);background:transparent;border:0;outline:none}
.uxwInput::placeholder{color:var(--dsw-alias-label-tertiary)}
.uxwGo{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;height:100%;padding:0 15px;font:inherit;font-size:12.5px;font-weight:600;white-space:nowrap;cursor:pointer;color:#fff;border:0;border-radius:8px;
  background:linear-gradient(150deg,color-mix(in srgb,var(--uxw-brand) 86%,#fff),var(--uxw-brand));
  box-shadow:0 1px 2px rgba(0,0,0,.18),0 2px 10px color-mix(in srgb,var(--uxw-brand) 32%,transparent);
  transition:filter .15s var(--uxw-ease),transform .1s var(--uxw-ease),box-shadow .15s var(--uxw-ease)}
.uxwGo:hover:not(:disabled){filter:brightness(1.09);box-shadow:0 1px 2px rgba(0,0,0,.2),0 4px 16px color-mix(in srgb,var(--uxw-brand) 44%,transparent)}
.uxwGo:active:not(:disabled){transform:translateY(1px)}
.uxwGo:disabled{cursor:not-allowed;filter:saturate(.5) brightness(.95);opacity:.72;box-shadow:none}
/* 检测中：这个按钮变成「停止」，常态就是红色 —— 它是个打断动作，要一眼认出来。
   hover 只是稍微提亮，不换色：颜色本身就是「这是停止」的信息，不该等悬停才出现。 */
.uxwGo[data-mode=stop]{background:linear-gradient(150deg,#e2695e,#c9483a);box-shadow:0 1px 2px rgba(0,0,0,.2),0 2px 10px rgba(201,72,58,.34)}
.uxwGo[data-mode=stop]:hover:not(:disabled){background:linear-gradient(150deg,#ea7568,#d4503f);box-shadow:0 1px 2px rgba(0,0,0,.22),0 4px 16px rgba(201,72,58,.46);filter:none}
.uxwGo[data-mode=stop]:disabled{opacity:.6}

/* 通用按钮 */
.uxwBtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;font:inherit;font-size:12.5px;line-height:20px;font-weight:550;white-space:nowrap;cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;transition:background .14s var(--uxw-ease),border-color .14s var(--uxw-ease),transform .1s var(--uxw-ease)}
.uxwBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,var(--dsw-alias-border-l2))}
.uxwBtn:active:not(:disabled){transform:translateY(.5px)}
.uxwBtn:disabled{cursor:not-allowed;opacity:.45}
.uxwBtn[data-variant=primary]{color:#fff;background:linear-gradient(150deg,color-mix(in srgb,var(--uxw-brand) 86%,#fff),var(--uxw-brand));border-color:transparent;box-shadow:0 1px 2px rgba(0,0,0,.16),0 2px 9px color-mix(in srgb,var(--uxw-brand) 30%,transparent)}
.uxwBtn[data-variant=primary]:hover:not(:disabled){filter:brightness(1.08)}
.uxwBtn[data-variant=quiet]{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);padding:5px 9px;font-weight:500}
.uxwBtn[data-variant=quiet]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:transparent}
.uxwBtn[data-variant=danger]{color:var(--dsw-alias-state-error-primary,#d9534f);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 32%,var(--dsw-alias-border-l2))}
.uxwBtn[data-variant=danger]:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 11%,transparent)}
.uxwIcon{width:13px;height:13px;flex:0 0 auto;stroke:currentColor;stroke-width:1.75;fill:none;stroke-linecap:round;stroke-linejoin:round}

/* 顶栏开关：网页展示 / AI 对话。
   这两个按钮常驻在网址栏右侧，是主操作之外唯一的分区入口，
   所以要给足点击高度（44px 热区，视觉上仍是一枚小按钮）。 */
.uxwToggle{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px;line-height:18px;font-weight:550;
  color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:8px;transition:background .14s var(--uxw-ease),color .14s var(--uxw-ease)}
.uxwToggle{position:relative;min-height:44px}
.uxwToggle::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
.uxwToggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.uxwToggle[data-on=true]{color:var(--uxw-brand);background:color-mix(in srgb,var(--uxw-brand) 11%,transparent);border-color:color-mix(in srgb,var(--uxw-brand) 26%,transparent)}
/* 顶部窄的时候这两个按钮会挤掉网址框，先让文字消失，只留图标 */
@media(max-width:860px){.uxwToggle{font-size:0;gap:0;padding:6px 8px}.uxwToggle .uxwIcon{width:15px;height:15px}}

/* 一句话说明：没有记录、没有项目时的占位文字 */
.uxwNote{padding:2px 7px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}

/* 运行结果里的小计数徽标：有缺陷是红，全通过是绿 */
.uxwRunNum{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:17px;padding:0 5px;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;border-radius:5px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.uxwRunNum[data-bad=true]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 13%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 30%,transparent);color:var(--dsw-alias-state-error-primary,#d9534f)}
.uxwRunNum[data-ok=true]{background:color-mix(in srgb,#0F9C87 14%,transparent);border-color:color-mix(in srgb,#0F9C87 30%,transparent);color:#0F9C87}
/* 失败/停止的记录：中性灰横杠，绝不使用绿色对勾 */
.uxwRunNum[data-failed=true]{background:color-mix(in srgb,#8B8894 12%,transparent);border-color:color-mix(in srgb,#8B8894 26%,transparent);color:#8B8894}

/* 侧栏项目名：一行截断，长路径靠 title 提示 */

/* ═══ 骨架 ═══ */
.uxwBody{display:flex;flex:1 1 auto;min-width:0;min-height:0}
.uxwBody[data-preview=false] .uxwPv{display:none}
/* 右栏收起时报告占满整个宽度 */
.uxwMainSplit[data-preview=false] .uxwSplitReport{padding-right:0}

/* ═══ 文件树 ═══ */
.uxwTree{padding:2px 0 6px}
.uxwTreeRow{display:flex;align-items:center;gap:4px;width:100%;padding:4px 8px 4px 8px;font:inherit;font-size:11.5px;line-height:17px;text-align:left;
  color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:6px;cursor:pointer;min-width:0;
  transition:background .12s var(--uxw-ease),color .12s var(--uxw-ease)}
.uxwTreeRow:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.uxwTreeRow[data-active=true]{background:color-mix(in srgb,var(--uxw-brand) 12%,transparent);color:var(--dsw-alias-label-primary);font-weight:600}
.uxwTreeRow[data-dir=true]{font-weight:560}
.uxwTreeChevron{display:inline-flex;align-items:center;justify-content:center;flex:0 0 12px;width:12px;height:12px;
  color:var(--dsw-alias-label-tertiary);transition:transform .14s var(--uxw-ease)}
.uxwTreeChevron svg{width:10px;height:10px}
.uxwTreeChevron[data-open=true]{transform:rotate(90deg)}
.uxwTreeIcon{display:inline-flex;align-items:center;flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}
.uxwTreeIcon svg{width:12px;height:12px}
/* 图标按类型上色：目录用品牌色，配置/文本/图片各有区分，扫一眼就知道是什么 */
.uxwTreeIcon[data-kind=dir]{color:color-mix(in srgb,var(--uxw-brand) 78%,var(--dsw-alias-label-primary))}
.uxwTreeIcon[data-kind=config]{color:#C08A2E}
.uxwTreeIcon[data-kind=text]{color:#5B8EC4}
.uxwTreeIcon[data-kind=image]{color:#8B6FB8}
.uxwTreeIcon[data-kind=archive],.uxwTreeIcon[data-kind=font]{color:var(--dsw-alias-label-tertiary);opacity:.6}
.uxwTreeName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uxwTreeNote{display:flex;align-items:center;gap:6px;padding:5px 10px;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-tertiary)}

/* ═══ 代码查看 ═══ */
.uxwCode{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden}
.uxwCodeHead{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:6px 8px 6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.uxwCodeName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:620;color:var(--dsw-alias-label-secondary)}
.uxwCodeSize{flex:0 0 auto;margin-left:auto;font-size:9.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.uxwCodeBody{display:flex;flex:1 1 auto;min-height:0;overflow:auto;background:var(--dsw-alias-bg-layer-1)}
.uxwCodeGutter{display:flex;flex-direction:column;flex:0 0 auto;padding:8px 6px 8px 10px;text-align:right;user-select:none;
  font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);opacity:.55;
  border-right:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.uxwCodeText{flex:1 1 auto;margin:0;padding:8px 12px;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11px;line-height:17px;
  color:var(--dsw-alias-label-secondary);white-space:pre;tab-size:2}

/* 拖动分隔条：命中区比视觉宽度宽，鼠标不用瞄得很准 */
.uxwGutterHandle{position:relative;flex:0 0 auto;width:0;cursor:col-resize;align-self:stretch;z-index:3}
.uxwGutterHandle::before{content:"";position:absolute;top:0;bottom:0;left:-4px;width:9px}
.uxwGutterHandle::after{content:"";position:absolute;top:0;bottom:0;left:-1px;width:2px;background:transparent;transition:background .14s var(--uxw-ease)}
.uxwGutterHandle:hover::after,.uxwGutterHandle[data-dragging=true]::after{background:color-mix(in srgb,var(--uxw-brand) 62%,transparent)}
/* 拖动时别让 iframe 吃掉鼠标事件，否则一划出去就断了 */
.uxw[data-resizing=true]{cursor:col-resize;user-select:none}
.uxw[data-resizing=true] iframe{pointer-events:none}

/* ═══ 左栏 ═══ */
.uxwSide{display:flex;flex-direction:column;flex:0 0 auto;width:252px;min-height:0;border-right:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 78%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-layer-2) 94%,transparent),var(--dsw-alias-bg-layer-2))}
.uxwSideScroll{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 10px}
.uxwSideHead{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 6px 8px}
.uxwSideActions{display:flex;align-items:center;gap:2px}
.uxwSideTitle{font-size:10px;font-weight:750;letter-spacing:.09em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
/* 文件树挂在项目下面：左侧竖线 + 内缩，看得出它属于上面那个项目，
   而不是又一个并列的区块。 */
.uxwProj{margin:0 0 2px}
.uxwProj>.uxwTree{position:relative;margin:0 0 4px 12px;padding:3px 0 3px 10px}
.uxwProj>.uxwTree::before{content:"";position:absolute;left:0;top:1px;bottom:1px;width:2px;border-radius:1px;
  /* 不用 color-mix(--uxw-brand)：那个变量指向宿主色板，取不到时会退成透明，
     竖线就直接消失了。这里直接给一个稳定的中性色。 */
  background:var(--dsw-alias-border-l2,#e3e5e9)}
/* 项目行：和文件树里的目录行同一套观感 —— 一行、有箭头、点整行展开。
   不再做成卡片按钮：那是「选中」的语义，这里要的是「文件夹」。 */
.uxwProjRow{display:flex;align-items:center;gap:2px;min-width:0}
.uxwProjMain{display:flex !important;align-items:center;gap:5px;flex:1 1 auto;min-width:0;
  padding:4px 6px 4px 4px;margin:0;font:inherit;font-size:11.5px;line-height:17px;text-align:left;
  color:var(--dsw-alias-label-secondary);background:transparent !important;border:0 !important;border-radius:6px;
  cursor:pointer;transition:background .13s var(--uxw-ease),color .13s var(--uxw-ease)}
.uxwProjMain:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
/* 有报告在显示的那个项目稍作强调，但不加框、不填底 */
.uxwProjRow[data-active=true]>.uxwProjMain{color:var(--dsw-alias-label-primary);font-weight:620}
.uxwProjName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 删除按钮平时不挡视线，鼠标到这一行才显出来 */
.uxwProjRow>.uxwItemAction{opacity:0;transition:opacity .13s var(--uxw-ease)}
.uxwProjRow:hover>.uxwItemAction,.uxwProjRow[data-active=true]>.uxwItemAction{opacity:.72}
.uxwChip{display:inline-flex;align-items:center;flex:0 0 auto;padding:0 4px;font-size:9.5px;line-height:14px;font-weight:700;letter-spacing:.02em;border-radius:4px;background:color-mix(in srgb,var(--uxw-brand) 15%,transparent);color:color-mix(in srgb,var(--uxw-brand) 82%,var(--dsw-alias-label-primary))}
.uxwItemAction{position:relative;display:grid;place-items:center;flex:0 0 auto;width:32px;height:32px;align-self:center;padding:0;color:var(--dsw-alias-label-tertiary);background:transparent;border:1px solid transparent;border-radius:8px;cursor:pointer;opacity:.72;transition:background .14s var(--uxw-ease),color .14s var(--uxw-ease),opacity .14s var(--uxw-ease)}
.uxwItemAction::before{content:"";position:absolute;inset:-6px}
.uxwItemAction:hover{opacity:1;color:var(--dsw-alias-state-error-primary,#d9534f);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 11%,transparent)}
.uxwItemAction .uxwIcon{width:13px;height:13px;pointer-events:none}

/* 行高至少 44px：里面有个 44×44 的删除热区，行太矮热区会溢到相邻行 */
.uxwRunRow{display:flex;align-items:center;gap:3px;margin:0 0 5px;min-height:44px}
/* 历史「展开更多」：收起时是一行省略号，展开后箭头朝上。
   用虚线把它们和真实记录区分开 —— 它不是一条检测记录，是一个开关。 */
.uxwRunsMore{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:34px;margin:2px 0 0;
  padding:0 10px;font:inherit;font-size:11px;color:var(--dsw-alias-label-tertiary);background:transparent;
  border:1px dashed var(--dsw-alias-border-l2);border-radius:9px;cursor:pointer;
  transition:color .14s var(--uxw-ease),background .14s var(--uxw-ease),border-color .14s var(--uxw-ease)}
.uxwRunsMore:hover{color:color-mix(in srgb,var(--uxw-brand) 82%,var(--dsw-alias-label-primary));
  background:color-mix(in srgb,var(--uxw-brand) 6%,transparent);
  border-color:color-mix(in srgb,var(--uxw-brand) 34%,var(--dsw-alias-border-l2))}
.uxwRunsMoreDots{font-size:13px;line-height:1;letter-spacing:1px;font-weight:700}
.uxwRunsMoreNum{font-variant-numeric:tabular-nums;font-weight:700;
  color:color-mix(in srgb,var(--uxw-brand) 74%,var(--dsw-alias-label-primary))}
.uxwRun{position:relative;display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;padding:9px 11px;font:inherit;font-size:12px;text-align:left;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:10px;cursor:pointer;transition:background .14s var(--uxw-ease),color .14s var(--uxw-ease),border-color .14s var(--uxw-ease)}
.uxwRun:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.uxwRun[data-active=true]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-weight:620}
/* 名字吃掉剩余宽度并在需要时省略，耗时和条数各自固定不换行：
   长 URL 记录不能把耗时挤到看不见，也不能让整行折成两行。 */
.uxwRunName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uxwRunTook{flex:0 0 auto;font-size:10.5px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
/* 删除按钮：默认可见但不抢注意力。
   热区要 44×44 —— 30px 的视觉尺寸配 inset:-7px 刚好 44，
   用伪元素扩而不是把按钮做大，否则行高会被撑开、列表变松。
   焦点环单独写：浏览器默认的 auto 在深色底上几乎看不见。 */
.uxwRunDel{position:relative;display:grid;place-items:center;flex:0 0 auto;width:30px;height:30px;padding:0;color:var(--dsw-alias-label-tertiary);background:transparent;border:1px solid transparent;border-radius:8px;cursor:pointer;opacity:.7;transition:background .14s var(--uxw-ease),color .14s var(--uxw-ease),opacity .14s var(--uxw-ease)}
.uxwRunDel::before{content:"";position:absolute;inset:-7px;min-width:44px;min-height:44px;margin:auto}
.uxwRunDel:hover{opacity:1;color:var(--dsw-alias-state-error-primary,#d9534f);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 11%,transparent)}
.uxwRunDel:focus-visible{opacity:1;color:var(--dsw-alias-state-error-primary,#d9534f);outline:2px solid var(--uxw-brand);outline-offset:2px}
/* 悬停在整行上时也点亮：用户是朝着行去的，不是朝着这个 13px 的小图标去的 */
.uxwRunRow:hover .uxwRunDel{opacity:1}
.uxwRunDel .uxwIcon{width:13px;height:13px;pointer-events:none}

.uxwSideFoot{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l2);font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.uxwDot{width:6px;height:6px;flex:0 0 auto;border-radius:50%;background:#0F9C87;box-shadow:0 0 0 3px color-mix(in srgb,#0F9C87 18%,transparent)}
.uxwDot[data-bad=true]{background:var(--dsw-alias-state-error-primary,#d9534f);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 18%,transparent)}

/* ═══ 主区 ═══ */
.uxwMain{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;position:relative}
.uxwMainScroll{flex:1 1 auto;min-height:0;overflow:auto;padding:22px 26px 40px}

/* 结果头部 */
.uxwHead{display:flex;align-items:flex-start;gap:12px;margin:0 0 18px}
.uxwHeadMain{flex:1 1 auto;min-width:0}
.uxwHeadTitle{margin:0;font-size:19px;line-height:27px;font-weight:690;letter-spacing:-.022em;overflow-wrap:anywhere}
.uxwHeadUrl{margin:3px 0 0;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}

/* 结论条 */
.uxwVerdict{display:flex;align-items:center;gap:12px;padding:14px 16px;margin:0 0 14px;border-radius:12px;position:relative;overflow:hidden;
  background:linear-gradient(135deg,var(--uxw-vb-bg),color-mix(in srgb,var(--uxw-vb) 4%,var(--dsw-alias-bg-layer-2)));
  border:1px solid color-mix(in srgb,var(--uxw-vb) 26%,transparent)}
.uxwVerdict[data-tone=bad]{--uxw-vb:var(--dsw-alias-state-error-primary,#d9534f);--uxw-vb-bg:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 11%,var(--dsw-alias-bg-layer-2))}
.uxwVerdict[data-tone=ok]{--uxw-vb:#0F9C87;--uxw-vb-bg:color-mix(in srgb,#0F9C87 11%,var(--dsw-alias-bg-layer-2))}
/* 「没测成」既不是红（有问题）也不是绿（没问题），用中性灰：
   它表达的是「这次没有结论」，用任何一方的颜色都会误导。 */
.uxwVerdict[data-tone=failed]{--uxw-vb:#B4552D;--uxw-vb-bg:color-mix(in srgb,#B4552D 11%,var(--dsw-alias-bg-layer-2))}
.uxwVerdict[data-tone=aborted]{--uxw-vb:#8B8894;--uxw-vb-bg:color-mix(in srgb,#8B8894 11%,var(--dsw-alias-bg-layer-2))}
.uxwVerdictError{margin:4px 0 0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);
  word-break:break-word}
.uxwVerdictIcon{display:grid;place-items:center;flex:0 0 auto;width:38px;height:38px;border-radius:11px;color:#fff;
  background:linear-gradient(150deg,color-mix(in srgb,var(--uxw-vb) 84%,#fff),var(--uxw-vb));
  box-shadow:0 2px 10px color-mix(in srgb,var(--uxw-vb) 40%,transparent)}
.uxwVerdictIcon .uxwIcon{width:19px;height:19px;stroke-width:2}
.uxwVerdictText{flex:1 1 auto;min-width:0}
.uxwVerdictTitle{margin:0;font-size:14.5px;line-height:21px;font-weight:670;letter-spacing:-.012em;color:color-mix(in srgb,var(--uxw-vb) 72%,var(--dsw-alias-label-primary))}
.uxwVerdictDesc{margin:2px 0 0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.uxwVerdictNums{display:flex;align-items:baseline;gap:16px;flex:0 0 auto}
.uxwVerdictNum{display:flex;flex-direction:column;align-items:flex-end;gap:0}
.uxwVerdictNum b{font-size:22px;line-height:25px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.uxwVerdictNum span{font-size:10px;line-height:14px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.uxwVerdictNum[data-k=error] b{color:var(--dsw-alias-state-error-primary,#d9534f)}
.uxwVerdictNum[data-k=warn] b{color:var(--dsw-alias-state-warning-primary,#c8860d)}
.uxwVerdictNum[data-k=total] b{color:var(--dsw-alias-label-primary)}

/* 策略条 */
.uxwPlan{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:10px 14px;margin:0 0 20px;border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.uxwPlanLead{display:inline-flex;align-items:center;gap:5px;font-weight:650;letter-spacing:.02em;color:var(--uxw-brand);text-transform:uppercase;font-size:10px}
.uxwPlanSep{width:1px;height:12px;background:var(--dsw-alias-border-l2)}
.uxwPlanTag{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;font-size:10.5px;font-weight:600;line-height:17px;border-radius:6px;white-space:nowrap;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.uxwPlanTag[data-hue]{background:color-mix(in srgb,var(--hue) 13%,transparent);border-color:color-mix(in srgb,var(--hue) 30%,transparent);color:color-mix(in srgb,var(--hue) 78%,var(--dsw-alias-label-primary))}
.uxwPlanDot{width:5px;height:5px;border-radius:50%;background:currentColor}

/* 缺陷分组 */
.uxwGroup{margin:0 0 22px}
.uxwGroup:last-child{margin-bottom:0}
.uxwGroupHead{display:flex;align-items:center;gap:9px;margin:0 0 10px}
.uxwGroupChip{display:grid;place-items:center;flex:0 0 auto;width:22px;height:22px;border-radius:7px;
  background:color-mix(in srgb,var(--hue) 15%,transparent);border:1px solid color-mix(in srgb,var(--hue) 32%,transparent);color:var(--hue)}
.uxwGroupChip .uxwIcon{width:12px;height:12px;stroke-width:2}
.uxwGroupTitle{margin:0;font-size:12.5px;line-height:19px;font-weight:670;letter-spacing:-.005em;color:var(--dsw-alias-label-primary);flex:0 0 auto}
.uxwGroupNote{flex:0 0 auto;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.uxwGroupRule{flex:1 1 auto;height:1px;min-width:12px;background:linear-gradient(90deg,color-mix(in srgb,var(--hue) 34%,transparent),transparent)}
.uxwGroupCount{flex:0 0 auto;padding:1px 7px;font-size:10.5px;line-height:16px;font-weight:750;border-radius:5px;font-variant-numeric:tabular-nums;
  background:color-mix(in srgb,var(--hue) 14%,transparent);color:color-mix(in srgb,var(--hue) 82%,var(--dsw-alias-label-primary))}
.uxwGroupCount[data-sev=error]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 13%,transparent);color:var(--dsw-alias-state-error-primary,#d9534f)}

.uxwIssues{display:flex;flex-direction:column;gap:8px}
.uxwIssue{position:relative;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);
  transition:border-color .15s var(--uxw-ease),box-shadow .15s var(--uxw-ease)}
.uxwIssue:hover{border-color:color-mix(in srgb,var(--hue) 40%,var(--dsw-alias-border-l2));box-shadow:0 2px 12px rgba(0,0,0,.07)}

/* 聚合后的目标行：同一检测项的多个元素压进一张卡片 */
.uxwRows{display:flex;flex-direction:column;margin:4px 0 0}
.uxwRow{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 62%,transparent)}
.uxwRow:first-child{border-top:0;padding-top:2px}
.uxwRowSev{flex:0 0 auto;width:5px;height:5px;margin-top:7px;border-radius:50%;background:var(--dsw-alias-state-warning-primary,#c8860d)}
.uxwRowSev[data-sev=error]{background:var(--dsw-alias-state-error-primary,#d9534f);box-shadow:0 0 0 2.5px color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 18%,transparent)}
.uxwRowBody{flex:1 1 auto;min-width:0}
.uxwRowTitle{margin:0;font-size:12px;line-height:18px;font-weight:560;letter-spacing:-.003em;overflow-wrap:anywhere}
.uxwRowPath{display:block;margin:1px 0 0;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:9.5px;line-height:14px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
/* 证据徽标：跨几个组合、几个状态。放右侧当旁证，不占标题的宽度。 */
.uxwRowEv{display:flex;align-items:center;gap:4px;flex:0 0 auto;padding-top:1px;white-space:nowrap}
.uxwRowStates{flex:0 0 auto;padding:0 5px;font-size:9.5px;line-height:15px;font-weight:600;border-radius:4px;font-variant-numeric:tabular-nums;
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-tertiary)}
.uxwRowCombo{flex:0 0 auto;padding:0 5px;margin-top:1px;font-size:9.5px;line-height:15px;font-weight:600;white-space:nowrap;border-radius:4px;font-variant-numeric:tabular-nums;
  background:color-mix(in srgb,var(--hue) 12%,transparent);color:color-mix(in srgb,var(--hue) 76%,var(--dsw-alias-label-primary))}
.uxwCount{display:inline-flex;align-items:center;padding:0 6px;font-size:10px;line-height:16px;font-weight:750;border-radius:5px;font-variant-numeric:tabular-nums;
  background:color-mix(in srgb,var(--hue) 13%,transparent);color:color-mix(in srgb,var(--hue) 80%,var(--dsw-alias-label-primary))}
.uxwIssueHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.uxwSev{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;padding:1px 7px;font-size:9.5px;font-weight:750;line-height:16px;letter-spacing:.05em;text-transform:uppercase;border-radius:5px;white-space:nowrap}
.uxwSev[data-sev=error]{color:var(--dsw-alias-state-error-primary,#d9534f);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 13%,transparent)}
.uxwSev[data-sev=warn]{color:var(--dsw-alias-state-warning-primary,#c8860d);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#c8860d) 14%,transparent)}
.uxwSev .uxwIcon{width:9px;height:9px;stroke-width:2.6}
.uxwIssueTitle{flex:1 1 auto;min-width:0;margin:0;font-size:12.5px;line-height:19px;font-weight:640;letter-spacing:-.005em;overflow-wrap:anywhere}
.uxwIssueDetail{margin:6px 0 0;font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.uxwMeta{display:flex;flex-wrap:wrap;gap:5px;margin:9px 0 0}
.uxwMetaTag{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;font-size:10px;line-height:16px;border-radius:5px;white-space:nowrap;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.uxwMetaTag[data-code=true]{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:normal;overflow-wrap:anywhere}
.uxwFix{display:flex;gap:8px;margin:9px 0 0;padding:8px 11px;font-size:11.5px;line-height:17px;border-radius:7px;color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--hue) 7%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--hue) 18%,transparent)}
.uxwFixLabel{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:color-mix(in srgb,var(--hue) 76%,var(--dsw-alias-label-primary))}


/* 报告 + 网页 并排；窄屏自动落回单列 */
.uxwMainSplit{position:relative;display:flex;align-items:stretch;height:100%;min-width:0}
.uxwSplitReport{flex:1 1 auto;min-width:0;height:100%;overflow:auto;transition:padding-right .18s var(--uxw-ease)}
/* 右侧栏展开时给报告让出位置：栏是覆盖层，报告不能藏在它下面 */
.uxwMainSplit[data-preview=true] .uxwSplitReport{padding-right:var(--uxw-pv-w,0px)}
.uxwSplitReportInner{min-width:0}
/* 右侧栏：覆盖在报告之上，不挤占内容宽度 —— 和 VS Code 侧栏一致的观感。
   用 --uxw-pv-w 这个变量把宽度同时传给覆盖层和报告的让位内边距。 */
.uxwPv{position:absolute;top:0;right:0;bottom:0;display:flex;flex-direction:column;width:var(--uxw-pv-w,42%);
  min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1);box-shadow:-6px 0 22px rgba(0,0,0,.08);z-index:2}
/* 右栏自己也能拖：分隔条贴在它的左缘 */
.uxwPvResize{position:absolute;top:0;bottom:0;left:-5px;width:10px;cursor:col-resize;z-index:3}
/* 文件模式：代码占满整个右栏，不再显示浏览器头和底栏 */
.uxwPv[data-mode=file]{--uxw-pv-bg:var(--dsw-alias-bg-layer-1)}
.uxwPvHead{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
/* 标题吃掉左侧余量，把文件名之外的东西推到右边 */
.uxwPvTitle{margin-right:auto;font-size:11px;font-weight:650;letter-spacing:.01em;color:var(--dsw-alias-label-secondary)}
.uxwPvSize{flex:0 0 auto;padding:0 5px;font-size:9.5px;line-height:15px;border-radius:4px;font-variant-numeric:tabular-nums;
  font-family:ui-monospace,"SF Mono",Consolas,monospace;color:var(--dsw-alias-label-tertiary);background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.uxwPvStage{position:relative;display:flex;align-items:flex-start;justify-content:center;min-height:180px;padding:0;background:var(--dsw-alias-bg-base,var(--dsw-alias-bg-layer-2));overflow:auto}
.uxwPvStage img{display:block;width:100%;height:auto}
/* 内置浏览器：真页面装进 iframe，可滚动、可点击 */
.uxwPvLive{position:relative;width:100%;height:100%;min-height:380px;background:#fff}
.uxwPvFrame{display:block;width:100%;height:100%;min-height:380px;border:0;background:#fff}
.uxwPvVeil{position:absolute;inset:0;pointer-events:none;background:color-mix(in srgb,var(--uxw-brand) 6%,transparent);transition:background .12s linear}
.uxwPvLiveTag{padding:0 6px;font-size:9.5px;line-height:15px;border-radius:4px;background:color-mix(in srgb,#3aa76d 14%,transparent);
  color:color-mix(in srgb,#2f8b5b 82%,var(--dsw-alias-label-primary));border:1px solid color-mix(in srgb,#3aa76d 28%,transparent)}
/* 内置浏览器要让 iframe 撑满，而不是像截图那样按图高 */
.uxwPvStage:has(.uxwPvLive){flex:1;overflow:hidden;align-items:stretch}
.uxwPvEmpty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:34px 16px;text-align:center;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.uxwPvBtn{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 10px;cursor:pointer;font:inherit;font-size:11px;border-radius:7px;
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2)}
.uxwPvBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.uxwPvFoot{display:flex;align-items:center;gap:6px;padding:6px 10px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.uxwPvFoot code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:9.5px}
/* 地址栏：网页展示自带的网址输入行。
   一个项目常常不止一个页面（首页、后台、详情…），用户要能就地换地址去看另一页，
   而不是回到顶部重跑一次检测、或者换一条记录才能看到别的地方。 */
.uxwPvNav{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-2)}
.uxwPvNavField{display:flex;align-items:center;gap:5px;flex:1 1 auto;min-width:0;height:32px;padding:0 8px;border-radius:7px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);
  transition:border-color .14s var(--uxw-ease),box-shadow .14s var(--uxw-ease)}
.uxwPvNavField:focus-within{border-color:color-mix(in srgb,var(--uxw-brand) 56%,var(--dsw-alias-border-l2));
  box-shadow:0 0 0 3px color-mix(in srgb,var(--uxw-brand) 12%,transparent)}
.uxwPvNavField .uxwIcon{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}
.uxwPvNavInput{flex:1 1 auto;min-width:0;height:100%;padding:0;font:inherit;font-size:11px;
  font-family:ui-monospace,"SF Mono",Consolas,monospace;color:var(--dsw-alias-label-primary);
  background:transparent;border:0;outline:none}
.uxwPvNavInput::placeholder{font-family:inherit;color:var(--dsw-alias-label-tertiary)}
.uxwPvNavGo{display:inline-flex;align-items:center;justify-content:center;gap:4px;flex:0 0 auto;min-height:32px;padding:0 10px;
  font:inherit;font-size:11px;font-weight:600;cursor:pointer;color:var(--dsw-alias-label-secondary);
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}
.uxwPvNavGo:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
/* 地址没变时按钮是禁用的：给一个「按不动」的外观，而不是看起来能点却没反应 */
.uxwPvNavGo:disabled{cursor:default;color:var(--dsw-alias-label-tertiary);opacity:.6}
.uxwPvNavGo .uxwIcon{width:11px;height:11px}
button.uxwRow{width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;background:transparent;border-left:0;border-right:0;border-bottom:0;border-radius:6px}
button.uxwRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.uxwRow[data-selected=true]{background:color-mix(in srgb,var(--hue) 10%,transparent);box-shadow:inset 2px 0 0 var(--hue)}
/* 定位不了的条目仍可点（点了会解释为什么），但让人预期到「它不会框出来」：
   鼠标保持箭头，标题不用下划线，避免看起来像能跳转的链接。 */
.uxwRow[data-locatable=false]{cursor:help}
.uxwRow[data-locatable=false] .uxwRowTitle{color:var(--dsw-alias-label-secondary)}
@media(max-width:1080px){
  /* 窄屏：右栏浮在上面而不是挤走报告，宽度略收 */
  .uxwPv{width:min(var(--uxw-pv-w,42%),64%)}
}

/* ═══ 放大查看 ═══
   放大后网页占满主区，问题记录收成右侧一栏。
   刻意不用 transform:scale —— 缩放会把页面按另一个宽度重排，
   缺陷坐标（在检测视口下量的）就对不上了。这里让 iframe 拿到
   容器的真实像素宽度，页面按自己的响应式规则正常排版。 */
.uxwMainSplit[data-expanded=true]{position:absolute;inset:0;z-index:40;height:100%;background:var(--dsw-alias-bg-layer-1)}
/* 放大时网页区在左、问题栏在右：用 order 翻转，不改 DOM 顺序 */
.uxwMainSplit[data-expanded=true] .uxwPv{position:relative;order:1;flex:1 1 auto;width:auto;
  border:0;border-radius:0;box-shadow:none}
.uxwMainSplit[data-expanded=true] .uxwPvResize{display:none}
/* 网页区跟着容器走：窗口大就是大窗口、窗口小就是小窗口，
   iframe 拿容器的真实像素，页面按自己的响应式规则重排 ——
   和真浏览器拖窗口完全同一种行为。钉死尺寸反而看不到响应式了。 */
.uxwMainSplit[data-expanded=true] .uxwPvStage{min-height:0;flex:1 1 auto;align-items:stretch}
.uxwMainSplit[data-expanded=true] .uxwPvFrame{min-height:0;height:100%}
.uxwMainSplit[data-expanded=true] .uxwPvLive{min-height:0;height:100%}
/* 右侧问题栏：只留缺陷分组，标题/结论/策略条在放大态下没地方摆 */
.uxwMainSplit[data-expanded=true] .uxwSplitReport{order:2;flex:0 0 320px;padding-right:0;height:100%;
  overflow:auto;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.uxwMainSplit[data-expanded=true] .uxwHead,
.uxwMainSplit[data-expanded=true] .uxwVerdict,
.uxwMainSplit[data-expanded=true] .uxwPlan{display:none}
.uxwMainSplit[data-expanded=true] .uxwMainScroll{padding:12px 13px 24px}
.uxwMainSplit[data-expanded=true] .uxwGroup{margin-bottom:16px}
/* 放大态的退出按钮在网页区右上角给个颜色，一眼能找到出口 */
.uxwPvHead[data-expanded=true] .uxwPvBtn[data-act=collapse]{color:var(--uxw-brand);
  border-color:color-mix(in srgb,var(--uxw-brand) 40%,var(--dsw-alias-border-l2));
  background:color-mix(in srgb,var(--uxw-brand) 9%,transparent)}
@media(max-width:1080px){
  .uxwMainSplit[data-expanded=true] .uxwSplitReport{flex:0 0 260px}
}

/* 放大态让出左侧项目栏的 252px —— 页面要尽量接近真实窗口宽度才看得全。
   顶栏保留：「退出工作台」在那儿，不能为了看页面把出口藏起来。 */
.uxwBody[data-expanded=true] .uxwSide{display:none}
.uxwBody[data-expanded=true] .uxwMain{position:relative}

/* 空状态 */
.uxwEmpty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:100%;padding:64px 28px;text-align:center;background:radial-gradient(500px 280px at 50% 35%,color-mix(in srgb,var(--uxw-brand) 8%,transparent),transparent 72%)}
.uxwEmptyArt{position:relative;display:grid;place-items:center;width:82px;height:82px;margin:0 0 6px;border-radius:24px;background:color-mix(in srgb,var(--uxw-brand) 9%,transparent);border:1px solid color-mix(in srgb,var(--uxw-brand) 22%,transparent);box-shadow:0 14px 34px color-mix(in srgb,var(--uxw-brand) 12%,transparent)}
.uxwEmptyArt svg{width:66px;height:66px}
.uxwEmptyTitle{font-size:18px;line-height:25px;font-weight:720;letter-spacing:-.022em;color:var(--dsw-alias-label-primary)}
.uxwEmptyText{max-width:480px;margin:0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}
.uxwEmptyHint{display:flex;align-items:center;gap:8px;margin-top:4px;padding:10px 14px;border:1px solid color-mix(in srgb,var(--uxw-brand) 20%,transparent);border-radius:10px;background:color-mix(in srgb,var(--uxw-brand) 6%,transparent);color:color-mix(in srgb,var(--uxw-brand) 76%,var(--dsw-alias-label-primary));font-size:11px}

/* 进度 */
.uxwBusy{display:flex;align-items:center;gap:11px;padding:13px 15px;margin:0 0 18px;border-radius:11px;
  background:linear-gradient(135deg,color-mix(in srgb,var(--uxw-brand) 9%,var(--dsw-alias-bg-layer-2)),var(--dsw-alias-bg-layer-2));
  border:1px solid color-mix(in srgb,var(--uxw-brand) 24%,transparent)}
.uxwSpin{width:15px;height:15px;flex:0 0 auto;border-radius:50%;border:2px solid color-mix(in srgb,var(--uxw-brand) 25%,transparent);border-top-color:var(--uxw-brand);animation:uxwSpin .68s linear infinite}
@keyframes uxwSpin{to{transform:rotate(360deg)}}
.uxwBusyBody{flex:1 1 auto;min-width:0}
.uxwBusyPhase{display:block;font-size:12.5px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uxwBusyHint{display:block;font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.uxwBusyTime{flex:0 0 auto;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--uxw-brand)}
@media(prefers-reduced-motion:reduce){.uxwSpin{animation-duration:2.6s}}

/* 提示 */
.uxwAlert{display:flex;align-items:flex-start;gap:9px;padding:11px 14px;margin:0 0 18px;font-size:11.5px;line-height:18px;border-radius:10px;
  color:var(--dsw-alias-state-error-primary,#d9534f);
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 9%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 25%,transparent)}
.uxwAlertBody{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
/* 轻提示：解释型，不是错误。用中性色，避免和「检测失败」的红色混淆；
   也不该挤掉报告，所以不占满主区，只压在最上面一行。 */
.uxwNotice{display:flex;align-items:flex-start;gap:9px;padding:9px 13px;margin:0 0 14px;font-size:11.5px;line-height:18px;border-radius:9px;
  color:var(--dsw-alias-label-secondary);
  background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 13%,transparent)}

/* 弹窗 */
.uxwModalBackdrop{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:20px;background:color-mix(in srgb,#000 48%,transparent);backdrop-filter:blur(2px)}
.uxwModal{width:min(428px,100%);padding:22px;display:flex;flex-direction:column;gap:15px;border-radius:14px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 26px 68px rgba(0,0,0,.34),0 2px 8px rgba(0,0,0,.16)}
.uxwModalTitle{margin:0;font-size:15.5px;line-height:23px;font-weight:680;letter-spacing:-.015em}
.uxwModalActions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}
.uxwFormField{display:flex;flex-direction:column;gap:6px}
.uxwFormLabel{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.uxwFormInput{width:100%;padding:8px 11px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;transition:border-color .15s var(--uxw-ease),box-shadow .15s var(--uxw-ease)}
.uxwFormInput::placeholder{color:var(--dsw-alias-label-tertiary)}
.uxwFormInput:focus{border-color:var(--uxw-brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--uxw-brand) 16%,transparent)}
.uxwHint{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.uxwBody2{margin:0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}
/* 文件夹确认卡里的路径、警告、错误。这三个类仍在使用，之前也缺样式。 */
.uxwHomePath{margin:0;padding:8px 11px;font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
  font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);word-break:break-all;
  background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent));
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
/* 路径 + 「选择文件夹」并排；路径可伸缩，按钮不被压扁。 */
.uxwHomePathRow{display:flex;align-items:flex-start;gap:8px}
.uxwHomePathRow .uxwHomePath{flex:1 1 auto;min-width:0}
.uxwHomePathRow .uxwBtn{flex:0 0 auto;white-space:nowrap}
/* 图标按钮：固定方块，不带文字，和输入框右边对齐。 */
.uxwBtn[data-variant=icon]{flex:0 0 auto;width:32px;height:32px;min-width:32px;padding:0;display:inline-flex;
  align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);background:transparent;
  border-color:var(--dsw-alias-border-l2)}
.uxwBtn[data-variant=icon]:hover:not(:disabled){color:var(--uxw-brand);border-color:color-mix(in srgb,var(--uxw-brand) 45%,var(--dsw-alias-border-l2));
  background:color-mix(in srgb,var(--uxw-brand) 8%,transparent)}
.uxwHomeWarn{margin:0;font-size:11.5px;line-height:18px;color:var(--dsw-alias-state-warning-primary,#B26A00)}
.uxwHomeErr{margin:0;font-size:11.5px;line-height:18px;color:var(--dsw-alias-state-error-primary,#C0392B)}

/* ═══ 原生会话（宿主注入，不再自建聊天界面） ═══
   这里只负责给宿主那个被 portal 进来的 span 撑出空间。
   消息流、输入框、模型选择、审批都归宿主，样式也归宿主 ——
   我们改它们的样式会在下一次 Desktop 更新后错位。 */
.uxwChat{display:flex;flex-direction:column;flex:0 0 auto;width:392px;min-width:0;min-height:0;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.uxwNativeConversation{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0;height:100%;overflow:hidden}
.uxwNativeConversation>span{display:flex !important;flex:1 1 auto;min-height:0;min-width:0}
.uxwChatEmpty{display:flex;flex-direction:column;align-items:center;gap:9px;margin:auto;padding:22px 18px;text-align:center;font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.uxwChatEmpty b{display:block;margin:0 0 2px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
/* 开场指令：左对齐贴在卡片里，而不是每行居中 —— 三句不同长度的话居中会显得零散，
   左对齐才读得出「这是一个列表」。图标只做视觉锚点，不承担语义。 */
.uxwChatStarters{display:flex;flex-direction:column;align-items:stretch;gap:2px;width:100%;max-width:320px;margin:8px 0 2px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);text-align:left}
.uxwChatStartersTitle{font-size:10.5px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary);margin-bottom:3px}
.uxwChatStarter{display:flex;align-items:flex-start;gap:6px;padding:3px 0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.uxwChatStarter .uxwIcon{flex:0 0 auto;margin-top:2px;opacity:.75}
.uxwChatFail{max-width:100%;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#d9534f)}
/* 空会话里两种测试的分工说明。
   刻意做成不可点的块：它解释「这两种测试分别怎么开口」，不是操作按钮。
   做成按钮会让人以为点了会发生什么，而真正该发生的事是「自己去说一句」。 */
.uxwChatModes{display:flex;flex-direction:column;gap:6px;width:100%;max-width:320px;margin:10px 0 0}
.uxwChatMode{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:9px 11px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.uxwChatMode[data-kind=ux]{--uxw-chat-hue:var(--uxw-brand)}
.uxwChatMode[data-kind=func]{--uxw-chat-hue:#5B6BD6}
.uxwChatModeTitle{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;font-weight:640;
  color:color-mix(in srgb,var(--uxw-chat-hue) 84%,var(--dsw-alias-label-primary))}
.uxwChatModeTitle .uxwIcon{width:13px;height:13px}
.uxwChatModeDesc{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
/* 例句：等宽 + 前缀竖线，看得出「这是一句可以照着说的话」 */
.uxwChatModeSay{width:100%;margin-top:3px;padding-left:7px;font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-secondary);border-left:2px solid color-mix(in srgb,var(--uxw-chat-hue) 34%,transparent)}
@media(max-width:1180px){.uxwChat{width:330px}}
@media(max-width:900px){.uxwChat{width:100%}}

@media(max-width:980px){.uxwSide{width:184px}.uxwMainScroll{padding:18px 18px 36px}.uxwVerdictNums{gap:12px}}
@media(max-width:760px){.uxwSide{display:none}.uxwBrandSub{display:none}.uxwVerdict{flex-wrap:wrap}.uxwVerdictNums{width:100%;justify-content:flex-start}}

/* ═══ 模式开关 ═══
   两个模式的数据、工具、渲染完全分开，所以这个开关不是「筛选项」，
   是切换整套主区内容。视觉上必须一眼看出现在在哪个模式：
   体验 = 品牌青绿，功能 = 蓝紫。颜色只是提示，真正的隔离在数据层。 */
.uxwModes{display:flex;align-items:center;flex:0 0 auto;height:34px;padding:2px;gap:2px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.uxwMode{display:inline-flex;align-items:center;gap:5px;height:100%;padding:0 11px;font:inherit;font-size:12px;font-weight:600;
  white-space:nowrap;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:8px;cursor:pointer;
  transition:background .14s var(--uxw-ease),color .14s var(--uxw-ease)}
.uxwMode:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.uxwMode[data-on=true]{color:#fff;background:linear-gradient(150deg,color-mix(in srgb,var(--uxw-mode-hue) 84%,#fff),var(--uxw-mode-hue));
  box-shadow:0 1px 2px rgba(0,0,0,.16),0 2px 8px color-mix(in srgb,var(--uxw-mode-hue) 30%,transparent)}
.uxwMode .uxwIcon{width:13px;height:13px}
/* 两个模式各自的色相，挂在 .uxw 上，主区/模式开关共用 */
.uxw[data-mode=ux]{--uxw-mode-hue:var(--uxw-brand)}
.uxw[data-mode=func]{--uxw-mode-hue:#5B6BD6}

/* ═══ 功能测试报告 ═══
   和体验报告刻意长得不一样：体验是「按检测器分组的缺陷行」，功能是
   「按状态分组的用例」。共用一套外观会让人以为两者是同一种结论。 */
.uxwFunc{display:flex;flex-direction:column;gap:14px}
.uxwFuncHead{display:flex;flex-direction:column;gap:3px}
.uxwFuncTitle{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;line-height:23px;font-weight:680;letter-spacing:-.012em}
.uxwFuncTitle .uxwIcon{width:15px;height:15px;color:var(--uxw-mode-hue)}
.uxwFuncTag{display:inline-flex;align-items:center;padding:0 6px;font-size:9.5px;line-height:15px;font-weight:750;letter-spacing:.05em;
  text-transform:uppercase;border-radius:5px;color:color-mix(in srgb,var(--uxw-mode-hue) 88%,var(--dsw-alias-label-primary));
  background:color-mix(in srgb,var(--uxw-mode-hue) 14%,transparent)}
.uxwFuncMeta{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* 结论条：三个数字回答「过没过」，不是「有几处缺陷」 */
.uxwFuncVerdict{display:flex;align-items:center;gap:14px;padding:13px 15px;border-radius:12px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform)}
.uxwFuncVerdict[data-tone=failed]{border-color:color-mix(in srgb,#C2413A 32%,var(--dsw-alias-border-l2));
  background:color-mix(in srgb,#C2413A 5%,var(--dsw-alias-bg-module-platform))}
.uxwFuncVerdict[data-tone=blocked]{border-color:color-mix(in srgb,#C8860D 32%,var(--dsw-alias-border-l2));
  background:color-mix(in srgb,#C8860D 5%,var(--dsw-alias-bg-module-platform))}
.uxwFuncVerdict[data-tone=passed]{border-color:color-mix(in srgb,#0F9C87 30%,var(--dsw-alias-border-l2))}
.uxwFuncVerdictIcon{display:grid;place-items:center;flex:0 0 auto;width:30px;height:30px;border-radius:9px;
  color:#fff;background:var(--uxw-func-tone,#0F9C87)}
.uxwFuncVerdictIcon .uxwIcon{width:16px;height:16px}
.uxwFuncVerdict[data-tone=failed]{--uxw-func-tone:#C2413A}
.uxwFuncVerdict[data-tone=blocked]{--uxw-func-tone:#C8860D}
.uxwFuncVerdictText{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto}
.uxwFuncVerdictTitle{margin:0;font-size:13px;line-height:19px;font-weight:640;color:var(--dsw-alias-label-primary)}
.uxwFuncVerdictDesc{margin:0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.uxwFuncCounts{display:flex;align-items:center;gap:16px;flex:0 0 auto}
.uxwFuncCount{display:flex;flex-direction:column;align-items:center;gap:0;min-width:34px}
.uxwFuncCount b{font-size:19px;line-height:24px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.uxwFuncCount span{font-size:10px;line-height:14px;font-weight:600;letter-spacing:.03em;color:var(--dsw-alias-label-tertiary)}
.uxwFuncCount[data-k=fail] b{color:#C2413A}
.uxwFuncCount[data-k=blocked] b{color:#C8860D}
.uxwFuncCount[data-k=pass] b{color:#0F9C87}
.uxwFuncCount[data-k=total] b{color:color-mix(in srgb,var(--uxw-mode-hue) 82%,var(--dsw-alias-label-primary))}

/* 用例分组 */
.uxwFuncGroup{display:flex;flex-direction:column;gap:8px}
.uxwFuncGroupHead{display:flex;align-items:center;gap:8px;padding:0 2px}
.uxwFuncGroupTitle{margin:0;font-size:12px;line-height:18px;font-weight:680;letter-spacing:-.005em;color:var(--dsw-alias-label-secondary)}
.uxwFuncGroupRule{flex:1 1 auto;height:1px;background:var(--dsw-alias-border-l2)}
.uxwFuncGroupCount{font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}

/* 一条用例：折叠时只有名字 + 状态，点开才看步骤/预期/实际 */
.uxwFuncCase{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);overflow:hidden}
.uxwFuncCase[data-status=fail]{border-color:color-mix(in srgb,#C2413A 26%,var(--dsw-alias-border-l2))}
.uxwFuncCase[data-status=blocked]{border-color:color-mix(in srgb,#C8860D 26%,var(--dsw-alias-border-l2))}
.uxwFuncCaseHead{display:flex;align-items:center;gap:8px;width:100%;padding:9px 11px;font:inherit;text-align:left;
  color:inherit;background:transparent;border:0;cursor:pointer;transition:background .13s var(--uxw-ease)}
.uxwFuncCaseHead:hover{background:var(--dsw-alias-interactive-bg-hover)}
.uxwFuncChevron{flex:0 0 auto;width:9px;height:9px;color:var(--dsw-alias-label-tertiary);transition:transform .15s var(--uxw-ease)}
.uxwFuncCaseHead[data-open=true] .uxwFuncChevron{transform:rotate(90deg)}
.uxwFuncBadge{display:inline-flex;align-items:center;flex:0 0 auto;padding:0 6px;font-size:9.5px;line-height:15px;font-weight:750;
  letter-spacing:.03em;border-radius:5px;white-space:nowrap}
.uxwFuncBadge[data-status=pass]{color:color-mix(in srgb,#0F9C87 88%,var(--dsw-alias-label-primary));background:color-mix(in srgb,#0F9C87 14%,transparent)}
.uxwFuncBadge[data-status=fail]{color:color-mix(in srgb,#C2413A 90%,var(--dsw-alias-label-primary));background:color-mix(in srgb,#C2413A 14%,transparent)}
.uxwFuncBadge[data-status=blocked]{color:color-mix(in srgb,#C8860D 92%,var(--dsw-alias-label-primary));background:color-mix(in srgb,#C8860D 15%,transparent)}
.uxwFuncBadge[data-status=skip]{color:var(--dsw-alias-label-tertiary);background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 13%,transparent)}
.uxwFuncCaseName{flex:1 1 auto;min-width:0;font-size:12.5px;line-height:18px;font-weight:560;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uxwFuncSev{flex:0 0 auto;font-size:10px;line-height:14px;font-weight:700;letter-spacing:.03em;color:#C2413A}
.uxwFuncSev[data-sev=critical]{color:#C2413A}
.uxwFuncSev[data-sev=blocker]{color:#A3251F}
.uxwFuncSev[data-sev=major]{color:#C8860D}
.uxwFuncSev[data-sev=minor]{color:var(--dsw-alias-label-tertiary)}
.uxwFuncCaseBody{display:flex;flex-direction:column;gap:9px;padding:0 11px 11px 28px}
.uxwFuncField{display:flex;flex-direction:column;gap:2px}
.uxwFuncLabel{font-size:10px;line-height:14px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.uxwFuncValue{margin:0;font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.uxwFuncValue[data-tone=fail]{color:color-mix(in srgb,#C2413A 78%,var(--dsw-alias-label-primary))}
.uxwFuncSteps{margin:0;padding:0 0 0 16px;list-style:decimal}
.uxwFuncSteps li{font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);word-break:break-word}
.uxwFuncEvidence{display:flex;flex-direction:column;gap:3px;margin:0;padding:7px 9px;border-radius:8px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2)}
.uxwFuncEvLabel{font-size:10px;font-weight:700;letter-spacing:.03em;color:var(--dsw-alias-label-tertiary)}
.uxwFuncEvValue{margin:0;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:10.5px;line-height:16px;
  color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto}

/* Markdown 兜底：结构化用例缺失时（AI 只交了正文）整块渲染正文。
   不装作结构化 —— 用等宽 + 保留换行，让「这是一段文字」一目了然。 */
.uxwFuncMd{display:flex;flex-direction:column;gap:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-module-platform);overflow:hidden}
.uxwFuncMdHead{display:flex;align-items:center;gap:8px;width:100%;padding:9px 11px;font:inherit;font-size:11.5px;font-weight:600;
  text-align:left;color:var(--dsw-alias-label-secondary);background:transparent;border:0;cursor:pointer;
  transition:background .13s var(--uxw-ease)}
.uxwFuncMdHead:hover{background:var(--dsw-alias-interactive-bg-hover)}
.uxwFuncMdHead .uxwFuncChevron{width:9px;height:9px}
.uxwFuncMdHead[data-open=true] .uxwFuncChevron{transform:rotate(90deg)}
.uxwFuncMdBody{margin:0;padding:0 13px 13px;font-family:var(--dsw-font-family-base,inherit);font-size:11.5px;line-height:19px;
  color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;max-height:560px;overflow:auto}

/* 功能模式下的空状态。
   这里原来还有一条「发起功能测试」的按钮样式。按钮删了 —— 功能测试的
   入口是右侧对话本身，面板不该替用户开口。 */
.uxwFuncEmpty{display:flex;flex-direction:column;align-items:center;gap:10px;margin:auto;padding:32px 20px;text-align:center}
.uxwFuncEmptyArt{display:grid;place-items:center;width:62px;height:62px;border-radius:18px;
  color:color-mix(in srgb,var(--uxw-mode-hue) 80%,var(--dsw-alias-label-primary));
  background:color-mix(in srgb,var(--uxw-mode-hue) 9%,transparent);
  border:1px solid color-mix(in srgb,var(--uxw-mode-hue) 20%,transparent)}
.uxwFuncEmptyArt .uxwIcon{width:26px;height:26px}
.uxwFuncEmptyTitle{font-size:13.5px;line-height:20px;font-weight:640;color:var(--dsw-alias-label-primary)}
/* 「去哪儿发起」这一句是空态里唯一的行动指引，所以它比普通小字重一点、
   带一点模式色。没有灰色说明段 —— 空态不讲概念。 */
.uxwFuncEmptyHint{margin:2px 0 0;max-width:440px;font-size:11.5px;line-height:18px;font-weight:560;
  color:color-mix(in srgb,var(--uxw-mode-hue) 78%,var(--dsw-alias-label-primary))}

/* 左栏历史：功能模式下的报告行。和检测记录同构（一行、有徽标、可删），
   但徽标是「通过/失败」而不是缺陷数 —— 单位不同，数字不能互相顶替。 */
.uxwFuncRow{display:flex;align-items:center;gap:3px;margin:0 0 5px;min-height:44px}
.uxwFuncRowMain{display:flex!important;align-items:center;gap:6px;flex:1 1 auto;min-width:0;padding:5px 7px;margin:0;font:inherit;
  font-size:11.5px;line-height:17px;text-align:left;color:var(--dsw-alias-label-secondary);background:transparent!important;
  border:0!important;border-radius:6px;cursor:pointer;transition:background .13s var(--uxw-ease),color .13s var(--uxw-ease)}
.uxwFuncRowMain:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.uxwFuncRow[data-active=true] .uxwFuncRowMain{color:var(--dsw-alias-label-primary);font-weight:620}
.uxwFuncRowName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uxwFuncRowNum{flex:0 0 auto;font-size:10px;line-height:15px;font-weight:750;font-variant-numeric:tabular-nums;padding:0 5px;border-radius:4px}
.uxwFuncRowNum[data-verdict=passed]{color:#0F9C87;background:color-mix(in srgb,#0F9C87 13%,transparent)}
.uxwFuncRowNum[data-verdict=failed]{color:#C2413A;background:color-mix(in srgb,#C2413A 13%,transparent)}
.uxwFuncRowNum[data-verdict=blocked]{color:#C8860D;background:color-mix(in srgb,#C8860D 14%,transparent)}

/* ═══ 新手导览 ═══
   打洞用的是「高亮方块 + 巨大外阴影」而不是 SVG mask：
   一个元素就能造出「周围变暗、目标透亮」的效果，不用维护四块遮罩，
   目标移动时只改一个 left/top，暗角自动跟着走。 */
/* overflow:hidden 是必须的：压暗靠的是高亮框那颗 9999px 的外阴影，
   不裁的话暗色会漫出面板、糊住宿主界面和右侧的会话栏。 */
.uxwTour{position:absolute;inset:0;z-index:40;overflow:hidden}
/* 没有锚点的步骤（开场 / 收尾）：整块压暗，卡片居中 */
.uxwTourVeil{position:absolute;inset:0;background:color-mix(in srgb,#000 48%,transparent)}
.uxwTourSpot{position:absolute;pointer-events:none;border-radius:10px;
  border:2px solid var(--uxw-brand);
  /* 第一圈是做给暗色看的白色细边：暗底上纯品牌色边框会和背景糊在一起 */
  box-shadow:0 0 0 3px color-mix(in srgb,#fff 58%,transparent),0 0 0 9999px color-mix(in srgb,#000 48%,transparent);
  transition:left .2s var(--uxw-ease),top .2s var(--uxw-ease),width .2s var(--uxw-ease),height .2s var(--uxw-ease)}
/* 拦截层：导览是「只演示」，用户点哪儿都不该改变面板状态。
   放在高亮框之上、卡片之下 —— 高亮框自己是 pointer-events:none。 */
.uxwTourBlock{position:absolute;inset:0;cursor:default}
.uxwTourCard{position:absolute;z-index:2;width:min(334px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;
  display:flex;flex-direction:column;gap:9px;padding:16px 16px 13px;border-radius:13px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);
  box-shadow:0 26px 68px rgba(0,0,0,.34),0 2px 8px rgba(0,0,0,.16);
  transition:left .18s var(--uxw-ease),top .18s var(--uxw-ease)}
/* 箭头：一个旋转 45° 的小方块，只留朝外的两条边，看起来就是卡片长出的一个角。
   它必须是卡片的**兄弟节点**而不是子节点 —— 卡片有 overflow:auto（长正文要滚），
   子元素画在边界外会被直接裁掉，箭头就永远不出现。 */
.uxwTourArrow{position:absolute;z-index:1;width:12px;height:12px;transform:rotate(45deg);
  background:var(--dsw-alias-bg-layer-1)}
.uxwTourArrow[data-to=top]{border-left:1px solid var(--dsw-alias-border-l2);border-top:1px solid var(--dsw-alias-border-l2)}
.uxwTourArrow[data-to=bottom]{border-right:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2)}
.uxwTourArrow[data-to=left]{border-left:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2)}
.uxwTourArrow[data-to=right]{border-right:1px solid var(--dsw-alias-border-l2);border-top:1px solid var(--dsw-alias-border-l2)}
.uxwTourHead{display:flex;align-items:center;gap:8px}
.uxwTourStep{flex:0 0 auto;font-size:10px;line-height:15px;font-weight:750;letter-spacing:.05em;font-variant-numeric:tabular-nums;
  padding:1px 6px;border-radius:5px;color:color-mix(in srgb,var(--uxw-brand) 86%,var(--dsw-alias-label-primary));
  background:color-mix(in srgb,var(--uxw-brand) 12%,transparent)}
.uxwTourTitle{margin:0;flex:1 1 auto;min-width:0;font-size:14px;line-height:21px;font-weight:680;letter-spacing:-.012em}
.uxwTourBody{margin:0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}
.uxwTourFoot{display:flex;align-items:center;gap:8px;margin-top:2px}
.uxwTourDots{display:flex;align-items:center;gap:4px;flex:1 1 auto}
.uxwTourDot{width:5px;height:5px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}
.uxwTourDot[data-on=true]{width:14px;background:var(--uxw-brand)}
/* 跳过常驻在右上角：走到一半发现没兴趣的人，不该被逼着点七次「下一步」。 */
.uxwTourSkip{flex:0 0 auto;padding:2px 4px;font:inherit;font-size:11px;line-height:16px;cursor:pointer;
  color:var(--dsw-alias-label-tertiary);background:transparent;border:0;border-radius:5px}
.uxwTourSkip:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.uxwTourActions{display:flex;align-items:center;justify-content:flex-end;gap:6px}
/* 导览卡片里的按钮不要悬停变色。
   全局 .uxwBtn 靠 :hover 换底色 / 给主色按钮加 filter:brightness(1.08)，
   在密集的工具栏里那是个好用的「能点」确认；但导览是一屏一屏读的，
   鼠标随手扫过按钮就闪一下，等于给静止的说明加噪音。
   这里只把悬停时的底色和提亮压回默认值，不动别的按钮，也不动
   :active 的下沉 —— 那是点击反馈，不属于悬停。 */
.uxwTourCard .uxwBtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}
.uxwTourCard .uxwBtn[data-variant=primary]:hover:not(:disabled){filter:none;background:linear-gradient(150deg,color-mix(in srgb,var(--uxw-brand) 86%,#fff),var(--uxw-brand))}
@media(prefers-reduced-motion:reduce){.uxwTourSpot,.uxwTourCard{transition:none}}
`

    function installStyles() {
      const existing = document.querySelector('style[data-plugin-css="dsh-ux-workbench"]')
      if (existing) {
        if (existing.textContent !== css) existing.textContent = css
        return
      }
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-ux-workbench'
      style.dataset.pluginCss = 'dsh-ux-workbench'
      style.textContent = css
      document.head.appendChild(style)
    }

    /**
     * 工作台文件夹刚刚就绪的通知。
     *
     * 确认卡在面板根层，原生会话兜底在更深一层，两者各自持有自己的 home
     * 状态、各自读一次 /home —— 创建成功后它们互相不知道。早先就是因此：
     * 建完文件夹、左侧也工作了，但对话区仍按旧的 home=null 渲染，不认这
     * 个文件夹，用户以为「创建了但没生效」。
     *
     * 用一个 DOM 事件把这件事广播出去，比让两层共享状态简单得多，也不会
     * 因为层级重排而失效。
     */
    const HOME_READY_EVENT = 'dsh-ux-workbench:home-ready'

    /* ------------------------------------------------------------- 图标 -- */

    const ICONS = {
      play: 'M5.5 3.2v9.6l7.6-4.8-7.6-4.8z',
      redo: 'M13 8a5 5 0 11-1.6-3.7M13 2.6V5.4h-2.8',
      plus: 'M8 3.6v8.8M3.6 8h8.8',
      check: 'M3.2 8.4l3.1 3.1 6.5-7.4',
      shield: 'M8 1.8l5 2v4.1c0 3-2.1 5.2-5 6.3-2.9-1.1-5-3.3-5-6.3V3.8l5-2z',
      alert: 'M8 2.4l6.1 11.2H1.9L8 2.4zM8 6.6v3.5M8 12.1v.01',
      info: 'M8 7.3v4.2M8 4.7v.01M8 1.8a6.2 6.2 0 100 12.4A6.2 6.2 0 008 1.8z',
      scan: 'M2.6 5.6V2.6h3M10.4 2.6h3v3M13.4 10.4v3h-3M5.6 13.4h-3v-3M2.6 8h10.8',
      overflow: 'M3.4 4.6h9.2M3.4 8h5.2M3.4 11.4h9.2M11.4 8h2.2',
      tap: 'M8 1.9a2.1 2.1 0 012.1 2.1v4.3l2.4.8a1.5 1.5 0 01.9 1.9l-.7 2.3a1.7 1.7 0 01-1.6 1.2H6.9a1.7 1.7 0 01-1.3-.6L3.3 11.2a1.2 1.2 0 011.7-1.7l1 .9V4a2.1 2.1 0 012-2.1z',
      moon: 'M13.2 9.6A5.6 5.6 0 116.4 2.8a4.5 4.5 0 006.8 6.8z',
      contrast: 'M8 1.9a6.1 6.1 0 100 12.2A6.1 6.1 0 008 1.9zM8 1.9v12.2',
      focus: 'M4.2 2.6H2.6v1.6M11.8 2.6h1.6v1.6M13.4 11.8v1.6h-1.6M4.2 13.4H2.6v-1.6M8 5.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z',
      clock: 'M8 1.9a6.1 6.1 0 100 12.2A6.1 6.1 0 008 1.9zM8 4.7V8l2.3 1.6',
      jank: 'M2.2 9.6l2.3-3.4 1.9 2.1 1.8-4.6 1.9 4.3 1.7-1.6 2 3.2',
      close: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6',
      link: 'M6.6 9.4l2.8-2.8M7.1 4.6l1-1a2.5 2.5 0 013.6 3.6l-1 1M8.9 11.4l-1 1a2.5 2.5 0 01-3.6-3.6l1-1',
      trash: 'M3.4 4.8h9.2M6 4.8V3.2h4v1.6M4.4 4.8l.6 8.2h6l.6-8.2',
      send: 'M2.6 8h9.4M8.6 4.2L12.4 8l-3.8 3.8',
      chat: 'M2.7 3.4h10.6a.9.9 0 01.9.9v5.4a.9.9 0 01-.9.9H7.6L4.4 13.2v-2.6H2.7a.9.9 0 01-.9-.9V4.3a.9.9 0 01.9-.9z',
      refresh: 'M13.2 8a5.2 5.2 0 11-1.7-3.9M13.2 2.4v3.2H10',
      monitor: 'M2.2 3.2h11.6a.8.8 0 01.8.8v6.2a.8.8 0 01-.8.8H2.2a.8.8 0 01-.8-.8V4a.8.8 0 01.8-.8zM5.6 13.2h4.8M8 11v2.2',
      folder: 'M2.4 4.2a1 1 0 011-1h3l1.3 1.6h4.9a1 1 0 011 1v5.6a1 1 0 01-1 1H3.4a1 1 0 01-1-1V4.2z',
      folderOpen: 'M2.4 4.2a1 1 0 011-1h3l1.3 1.6h4.9a1 1 0 011 1v.9M2.4 6.9h11.4a.66.66 0 01.64.83l-1.12 4.05a1 1 0 01-.96.72H3.5a1 1 0 01-.96-.72L1.42 7.73a.66.66 0 01.64-.83z',
      file: 'M9.2 1.9H4.6a1 1 0 00-1 1v10.2a1 1 0 001 1h6.8a1 1 0 001-1V5.3L9.2 1.9zM9.2 1.9v3.4h3.2',
      chevron: 'M6 4.2L9.8 8 6 11.8',
      code: 'M5.6 5.2L2.6 8l3 2.8M10.4 5.2L13.4 8l-3 2.8',
      // 四角外扩：全屏打开；四角内收：退出全屏。方向相反，一眼能对上
      expand: 'M6.2 2.4H2.4v3.8M9.8 2.4h3.8v3.8M13.6 9.8v3.8H9.8M2.4 9.8v3.8h3.8',
      collapse: 'M2.4 6.2h3.8V2.4M13.6 6.2H9.8V2.4M9.8 13.6v-3.8h3.8M6.2 13.6v-3.8H2.4',
      /* 功能测试相关图标。
         bug：不是甲虫写实图，是「一个带腿的方块」—— 16px 下写实必糊。
         flask：功能验证 = 按用例跑一遍，比「齿轮」更能表明这是测试。
         pass/fail 用对勾与叉，形状差异最大，色盲也能分辨。 */
      eye: 'M1.6 8S4.1 3.6 8 3.6 14.4 8 14.4 8 11.9 12.4 8 12.4 1.6 8 1.6 8zM8 6a2 2 0 100 4 2 2 0 000-4z',
      bug: 'M5.4 4.6a2.6 2.6 0 015.2 0v.6h.9a.8.8 0 110 1.6h-.9v.5l1.5-1a.8.8 0 01.9 1.3l-1.9 1.3c-.4 1.9-1.8 3.1-3.5 3.1s-3.1-1.2-3.5-3.1L2.1 7.6a.8.8 0 01.9-1.3l1.5 1v-.5h-.9a.8.8 0 110-1.6h.9v-.6zM6.4 7h1.2v1.4H6.4V7zm2 0h1.2v1.4H8.4V7z',
      flask: 'M6.4 1.9h3.2M7 1.9v3.5L3.4 12a1.1 1.1 0 00.9 1.7h7.4a1.1 1.1 0 00.9-1.7L9 5.4V1.9M4.9 9.4h6.2',
      pass: 'M8 1.9a6.1 6.1 0 100 12.2A6.1 6.1 0 008 1.9zM5.3 8.1l1.9 1.9 3.5-3.9',
      fail: 'M8 1.9a6.1 6.1 0 100 12.2A6.1 6.1 0 008 1.9zM6 6l4 4M10 6l-4 4',
      blocked: 'M8 1.9a6.1 6.1 0 100 12.2A6.1 6.1 0 008 1.9zM2.6 8h10.8',
      // 导览重播入口。问号画在圆里，和「信息」图标（i）在形状上也分得开。
      help: 'M8 1.9a6.1 6.1 0 100 12.2A6.1 6.1 0 008 1.9zM6.2 6.4a1.9 1.9 0 013.7.5c0 1.2-1.9 1.5-1.9 2.8M8 11.5v.01'
    }

    const KIND_ICON = {
      overflow: ICONS.overflow,
      tapTarget: ICONS.tap,
      darkLeak: ICONS.moon,
      contrast: ICONS.contrast,
      focus: ICONS.focus,
      feedback: ICONS.clock,
      jank: ICONS.jank
    }

    const icon = (path, extra) => h('svg', {
      className: 'uxwIcon',
      viewBox: '0 0 16 16',
      'aria-hidden': 'true',
      ...(extra || {})
    }, h('path', { d: path }))

    // 停止图标要实心：描边画出来的小方框在 13px 下几乎看不见，
    // 而这个按钮是检测中唯一的出口，必须一眼能看到。
    const stopIcon = () => h('svg', {
      className: 'uxwIcon',
      viewBox: '0 0 16 16',
      'aria-hidden': 'true'
    }, h('rect', { x: 4.2, y: 4.2, width: 7.6, height: 7.6, rx: 1.4, fill: 'currentColor', stroke: 'none' }))

    /* ------------------------------------------------------------- 文案 -- */

    const zh = {
      title: '找茬工作台',
      brandSub: '真实浏览器测量',
      urlPlaceholder: '粘贴网址，回车即测',
      urlLabel: '要检测的网址',
      urlHint: '网址不进「项目」栏，结果只留在历史记录里。',
      test: '开始检测',
      stop: '停止',
      stopping: '正在停止',
      stopHint: '中断这次检测，已经发现的结果会保留',
      testHint: '在真实浏览器里跑一遍体验检测',
      testing: '检测中',
      // 已经有结果时按钮仍然叫「开始检测」：用户是在发起一次新检测，
      // 「重新」暗示覆盖掉手头这份结果，读起来反而犹豫。
      retest: '开始检测',
      instances: '项目',
      add: '添加项目',
      runs: '历史',
      noRuns: '还没有检测记录',
      // 文案里不放 {n}：宿主 t() 的占位符插值行为不保证，条数在渲染时自己拼
      runsMore: '展开更多',
      runsLess: '收起',
      took: '耗时',
      ready: '就绪',
      noBrowser: '未找到浏览器',
      emptyTitle: '还没有项目',
      emptyText: '添加一个本地项目文件夹，或在上方输入网址直接检测。网址只进历史记录，不会堆在这里。',
      // 报告区为空是另一回事：项目可能已经加了，只是还没跑过检测。
      // 两处共用一句「还没有项目」会自相矛盾 —— 左边明明列着项目。
      emptyRunTitle: '还没有检测结果',
      emptyRunText: '点右上角「开始检测」跑一次；也可以先在左侧展开项目文件，直接看代码。',
      plan: '本次策略',
      states: '展开状态',
      viewports: '视口',
      detectors: '检测项',
      // AI 结论区
      total: '总计',
      severe: '严重',
      hints: '提示',
      clean: '本次没有发现缺陷',
      cleanText: '启用的检测项在所有组合下都通过了。',
      // 「没测成」必须和「测了没问题」分开说。两者缺陷数都是 0，
      // 但前者一个像素都没测到，说成「没有发现缺陷」就是假证据。
      runFailed: '本次检测没有完成',
      runFailedText: '页面没有正常打开，所以什么都没测到。这不是「没有缺陷」。',
      runFailedHint: '确认地址能打开、本地服务已经启动，然后重新检测。',
      runAborted: '本次检测已停止',
      runAbortedText: '只跑了一部分组合，下面的结果不完整。',
      found: '发现体验缺陷',
      
      foundDescHits: '同一元素上的同类问题已合并，条数是要修的位置数，不是测量次数。',
      
      hits: '命中',
      fix: '修复建议',
      severityError: '严重',
      severityWarn: '提示',
      loadFailed: '检测失败',
      dismiss: '知道了',
      needUrl: '请先填写要检测的页面地址。',
      cancel: '取消',
      save: '保存',
      remove: '移除',
      confirmRemove: '从列表移除这个项目？不会删除你的页面或代码。',
      removeRun: '删除记录',
      confirmRemoveRun: '删除这条检测记录？只删掉这次的检测结果，不会动你的页面和代码。',
      clearRuns: '清空',
      confirmClearRuns: '清空所有检测记录？只删结果，不会动你的页面和代码。',
      builtinTag: '内置',
      busyHint: '正在操作真实浏览器，请勿关闭面板',

      // 对话栏
      chat: 'AI 对话',
      preview: '网页展示',
  previewOn: '展开网页展示',
  previewOff: '收起网页展示',
      previewOpening: '正在打开页面…',
      previewIdle: '选中一条检测记录即可查看页面',
      previewFailed: '页面打不开',
      previewRetry: '重试',
      liveBadge: '实时',
      files: '文件',
      filesEmpty: '这个项目文件夹是空的',
      filesFailed: '读不到文件',
      filesLoading: '正在读取…',
      binaryFile: '这是二进制文件，不能在面板里预览',
      fileTooBig: '文件太大，不能在面板里打开',
      closeFile: '关闭文件',
      backToPage: '回到网页',
      dragHint: '拖动可以调整宽度',
      noProjectFolder: '这个项目没有关联文件夹',
      reloadPage: '重新加载页面',
      expandPage: '放大查看',
      collapsePage: '退出放大',
      // 地址栏：网页展示里就地换地址。一个项目多个页面时，不用回到顶部重跑检测。
      pvUrlPlaceholder: '输入网址，回车即可换页',
      pvUrlLabel: '网页展示的当前网址',
      pvGo: '打开',
      pvGoHint: '在这个网页区里打开这个地址',
      pvEmptyHint: '在上面输入网址，或从左侧选一条记录。',
      addFolder: '添加项目文件夹',
      changeFolder: '更换文件夹',
      runProject: '打开预览',
      projectStarting: '启动中…',
      projectEmpty: '也可以添加本地项目文件夹',
      projectHint: '选择本地项目文件夹，工作台会自动把它跑起来并显示在右边。',
      projectFailed: '项目没跑起来',
      projectNoFolder: '还没有添加项目文件夹',
      locate: '在页面上定位',
      located: '已定位',
      chatOpen: '打开对话',
      chatClose: '收起对话',
      chatHint: '对话就是左侧会话栏里的同一个会话',
      chatNewTitle: '我是体验测试 AI',
      // 空会话不摆一句「新建会话就能对话」—— 用户要的是「这个工作台里 AI 会做什么」。
      // 三行说清身份，下面给可以直接点的开场指令。
      chatNewText: '我在真实浏览器里把一个页面跑一遍：检查文字溢出、点击热区、暗色残留、对比度、焦点可见性、响应延迟和动画掉帧，然后把结论写回这个工作台。先在下面新建会话，我就从这一步开始。',
      chatStarterTitle: '可以这样开始',
      chatStarterDemo: '跑一遍内置演示场，看看七类缺陷长什么样',
      chatStarterProject: '测一下我添加的项目',
      chatStarterUrl: '检测一个网址（先把地址贴到上方输入框）',
      chatPickWorkspace: '选择工作区',
      chatNewHere: '在此工作区新建会话',
      chatNewWorkspace: '新建工作区并开始对话',
      chatStarting: '正在创建…',

      /* ── 模式 ── */
      modeUx: '体验检测',
      modeFunc: '功能测试',
      modeUxHint: '页面好不好用：溢出、热区、暗色、对比度、焦点、卡顿',
      modeFuncHint: '功能对不对：按用例验证预期与实际',
      // 空对话里的一句例句：告诉用户这两种测试分别怎么开口，比给按钮管用
      chatSayUx: '例如：测一下这个页面的体验',
      chatSayFunc: '例如：测一下 xx 项目的登录功能',

      /* ── 功能测试报告 ── */
      funcTag: '功能测试',
      funcNoReport: '还没有功能测试报告',
      funcStartInChat: '在右侧对话里说一句「测一下哪个项目的什么功能」就行，AI 会先问你测试档位再开跑。',
      funcPickReport: '选中左边一份报告查看详情',
      funcVerdictPassed: '全部用例通过',
      funcVerdictFailed: '存在失败用例',
      funcVerdictBlocked: '有阻塞未验证',
      funcVerdictPassedText: '这个范围内按用例验证的行为都符合预期。',
      funcVerdictFailedText: '下面列出的失败用例需要先修。通过的部分不代表其它功能没问题。',
      funcVerdictBlockedText: '有用例没跑成。没验证过的部分不能算通过 —— 补上环境或权限后重测。',
      funcCountTotal: '用例',
      funcCountPass: '通过',
      funcCountFail: '失败',
      funcCountBlocked: '阻塞',
      funcGroupFail: '失败',
      funcGroupBlocked: '阻塞',
      funcGroupSkip: '跳过',
      funcGroupPass: '通过',
      funcSteps: '步骤',
      funcExpected: '预期',
      funcActual: '实际',
      funcNote: '备注',
      funcEvidence: '证据',
      funcMarkdown: '完整报告正文',
      // 没有 cases[] 时的兜底说明：不装作结构化，明说这是纯正文
      funcMarkdownFallback: '没有结构化用例，直接看正文',
      funcSevBlocker: '致命',
      funcSevCritical: '严重',
      funcSevMajor: '一般',
      funcSevMinor: '轻微',
      funcStatusPass: '通过',
      funcStatusFail: '失败',
      funcStatusBlocked: '阻塞',
      funcStatusSkip: '跳过',
      funcMode: '档位',
      funcRemoveReport: '删除报告',
      funcConfirmRemoveReport: '删除这份功能测试报告？只删结论，不动你的代码和页面。',
      funcReports: '功能测试记录',
      funcRegressionHint: '这是对话式、一次性的功能排查。如果这些问题值得长期防回归，可以把用例固化成可执行回归，去「功能测试工作台」跑确定性执行。',
      funcDocs: '正文',

      /* ── 新手导览 ── */
      // 文案目标：每步只说这一屏是什么、下一步该点哪儿。不解释概念，不列功能。
      tourReplay: '重新看一遍导览',
      tourSkip: '跳过',
      tourPrev: '上一步',
      tourNext: '下一步',
      tourDone: '开始使用',
      tourRunDemo: '演示',
      tourIntroTitle: '这里是找茬工作台',
      tourIntroBody: '贴一个网址，或者加一个项目，它就会在真实浏览器里把你的页面跑一遍，把用起来别扭的地方一条条列出来。接下来六步，带你把界面认一遍。',
      tourProjectTitle: '加一个本地项目',
      tourProjectBody: '点左边这个文件夹图标，选你的项目目录。工作台会自己把它启动起来，页面随即出现在右边。',
      tourUrlTitle: '也可以直接贴网址',
      tourUrlBody: '把网址填进这一栏，按回车就开始测。测完的记录会留在左边历史里。',
      tourModesTitle: '先选你要测什么',
      tourModesBody: '「体验检测」帮你找页面用起来别扭的地方；「功能测试」按用例验证功能对不对。这一个开关决定右边出现什么。',
      tourPreviewTitle: '右边就是你的页面',
      tourPreviewBody: '这是真实网页，可以滚、可以点。点左边任意一条问题，页面会滚到那个位置，并把相关元素框出来。',
      tourRunsTitle: '测过的都在这儿',
      tourRunsBody: '每测一次就多一行。数字是要改的问题数，对勾是全部通过，横杠是这次没测成。',
      tourStartTitle: '现在试一次',
      tourStartBody: '演示场是一个故意做坏的页面，七类问题都塞满了。点「演示」跑一遍，你就能看到检测在做什么。也可以先自己逛逛。'
    }

    const en = {
      title: 'Bug Hunt',
      brandSub: 'real-browser measurement',
      urlPlaceholder: 'Paste a URL and press Enter',
      urlLabel: 'URL to check',
      urlHint: 'URLs never enter the project list — results stay in history.',
      test: 'Run check',
      stop: 'Stop',
      stopping: 'Stopping',
      stopHint: 'Interrupt this run — findings so far are kept',
      testHint: 'Run an experience check in a real browser',
      testing: 'Checking',
      retest: 'Run check',
      instances: 'Projects',
      add: 'Add project',
      runs: 'History',
      noRuns: 'No checks yet',
      runsMore: 'Show more',
      runsLess: 'Show less',
      took: 'Took',
      ready: 'Ready',
      noBrowser: 'No browser found',
      emptyTitle: 'No projects yet',
      emptyText: 'Add a local project folder, or type a URL above to check it directly. URLs only go to history — they never pile up here.',
      emptyRunTitle: 'No check results yet',
      emptyRunText: 'Hit "Run check" at the top right; or expand a project on the left to read its code.',
      plan: 'Strategy',
      states: 'States',
      viewports: 'Viewports',
      detectors: 'Detectors',
      total: 'Total',
      severe: 'Severe',
      hints: 'Hints',
      clean: 'No defects this time',
      cleanText: 'Every enabled detector passed in all combinations.',
      runFailed: 'This check did not finish',
      runFailedText: 'The page never opened, so nothing was measured. This is not "no defects".',
      runFailedHint: 'Make sure the URL opens and the local server is running, then check again.',
      runAborted: 'This check was stopped',
      runAbortedText: 'Only some combinations ran, so the results below are incomplete.',
      found: 'Experience defects found',
      
      foundDescHits: 'Same problem on the same element is merged: the count is places to fix, not measurements.',
      
      hits: 'hits',
      fix: 'Fix',
      severityError: 'Severe',
      severityWarn: 'Hint',
      loadFailed: 'Check failed',
      dismiss: 'Dismiss',
      needUrl: 'Enter a page URL first.',
      cancel: 'Cancel',
      save: 'Save',
      remove: 'Remove',
      confirmRemove: 'Remove this project from the list? Your pages and code are untouched.',
      removeRun: 'Delete record',
      confirmRemoveRun: 'Delete this check record? Only the result goes away — your pages and code are untouched.',
      clearRuns: 'Clear all',
      confirmClearRuns: 'Clear all check records? Only the results go away — your pages and code are untouched.',
      builtinTag: 'built-in',
      busyHint: 'Driving a real browser — keep this panel open',

      // chat dock
      chat: 'AI chat',
      preview: 'Live page',
  previewOn: 'Show live page',
  previewOff: 'Hide live page',
      previewOpening: 'Opening the page…',
      previewIdle: 'Pick a run to see the page',
      previewFailed: 'Page failed to open',
      previewRetry: 'Retry',
      liveBadge: 'Live',
      files: 'Files',
      filesEmpty: 'This project folder is empty',
      filesFailed: 'Could not read files',
      filesLoading: 'Loading…',
      binaryFile: 'Binary file — cannot preview here',
      fileTooBig: 'File too large to open here',
      closeFile: 'Close file',
      backToPage: 'Back to page',
      dragHint: 'Drag to resize',
      noProjectFolder: 'This project has no folder',
      reloadPage: 'Reload the page',
      expandPage: 'Expand',
      collapsePage: 'Exit full screen',
      // Address bar: change the page in place instead of re-running a check.
      pvUrlPlaceholder: 'Type a URL and press Enter to switch page',
      pvUrlLabel: 'Current URL of the live page',
      pvGo: 'Open',
      pvGoHint: 'Open this address inside the live page panel',
      pvEmptyHint: 'Type a URL above, or pick a record on the left.',
      addFolder: 'Add project folder',
      changeFolder: 'Change folder',
      runProject: 'Open preview',
      projectStarting: 'Starting…',
      projectEmpty: 'You can also add a local project folder',
      projectHint: 'Pick a local project folder — the workbench runs it and shows it on the right.',
      projectFailed: 'Project did not start',
      projectNoFolder: 'No project folder added yet',
      locate: 'Locate on page',
      located: 'Located',
      chatOpen: 'Open chat',
      chatClose: 'Collapse chat',
      chatHint: 'This is the same session as the one in the left sidebar',
      chatNewTitle: 'I am the experience-test agent',
      chatNewText: 'I open a page in a real browser and measure it: text overflow, tap targets, dark-mode leftovers, contrast, focus visibility, feedback latency and dropped frames — then write the conclusion back into this workbench. Create a session below and I will start there.',
      chatStarterTitle: 'Try one of these',
      chatStarterDemo: 'Run the built-in demo and see the seven defect types',
      chatStarterProject: 'Check a project I added',
      chatStarterUrl: 'Check a URL (paste it into the box above first)',
      chatPickWorkspace: 'Choose a workspace',
      chatNewHere: 'New session in this workspace',
      chatNewWorkspace: 'New workspace and start chatting',
      chatStarting: 'Creating…',

      /* ── modes ── */
      modeUx: 'Experience',
      modeFunc: 'Functional',
      modeUxHint: 'Is the page usable: overflow, tap targets, dark mode, contrast, focus, jank',
      modeFuncHint: 'Does the feature work: cases with expected vs actual',
      chatSayUx: 'e.g. check how this page feels to use',
      chatSayFunc: 'e.g. test the login flow of project xx',

      /* ── functional reports ── */
      funcTag: 'Functional',
      funcNoReport: 'No functional report yet',
      funcStartInChat: 'Just say which project and which feature in the chat on the right. The AI asks for the depth first, then runs it.',
      funcPickReport: 'Pick a report on the left',
      funcVerdictPassed: 'Every case passed',
      funcVerdictFailed: 'Failing cases found',
      funcVerdictBlocked: 'Some cases never ran',
      funcVerdictPassedText: 'Everything verified in this scope behaved as expected.',
      funcVerdictFailedText: 'Fix the failing cases below first. The passing ones do not prove the rest works.',
      funcVerdictBlockedText: 'Some cases did not run. Unverified is not passing — fix the environment or permissions and retest.',
      funcCountTotal: 'Cases',
      funcCountPass: 'Pass',
      funcCountFail: 'Fail',
      funcCountBlocked: 'Blocked',
      funcGroupFail: 'Failing',
      funcGroupBlocked: 'Blocked',
      funcGroupSkip: 'Skipped',
      funcGroupPass: 'Passing',
      funcSteps: 'Steps',
      funcExpected: 'Expected',
      funcActual: 'Actual',
      funcNote: 'Note',
      funcEvidence: 'Evidence',
      funcMarkdown: 'Full report',
      funcMarkdownFallback: 'no structured cases — showing the report text',
      funcSevBlocker: 'Blocker',
      funcSevCritical: 'Critical',
      funcSevMajor: 'Major',
      funcSevMinor: 'Minor',
      funcStatusPass: 'Pass',
      funcStatusFail: 'Fail',
      funcStatusBlocked: 'Blocked',
      funcStatusSkip: 'Skipped',
      funcMode: 'Depth',
      funcRemoveReport: 'Delete report',
      funcConfirmRemoveReport: 'Delete this functional report? Only the conclusion goes away — your code and pages are untouched.',
      funcReports: 'Functional reports',
      funcRegressionHint: 'This is conversational, one-off functional triage. If these findings deserve long-term regression coverage, turn them into executable cases in the Functional Test workbench.',
      funcDocs: 'report',

      /* ── onboarding tour ── */
      tourReplay: 'Replay the tour',
      tourSkip: 'Skip',
      tourPrev: 'Back',
      tourNext: 'Next',
      tourDone: 'Start using it',
      tourRunDemo: 'Demo',
      tourIntroTitle: 'This is the Bug Hunt workbench',
      tourIntroBody: 'Paste a URL or add a project, and it runs your page in a real browser and lists the places that feel wrong. Six more steps to learn the screen.',
      tourProjectTitle: 'Add a local project',
      tourProjectBody: 'Click this folder icon and pick your project folder. The workbench starts it for you, and the page shows up on the right.',
      tourUrlTitle: 'Or paste a URL',
      tourUrlBody: 'Type a URL in this field and press Enter to start. The run stays in the history on the left.',
      tourModesTitle: 'Pick what you want to test',
      tourModesBody: 'Experience check finds the places your page feels wrong to use. Functional test verifies features case by case. This switch decides what the main area shows.',
      tourPreviewTitle: 'The right side is your page',
      tourPreviewBody: 'This is the real page — scroll it, click it. Click any finding on the left and it scrolls there and outlines the element.',
      tourRunsTitle: 'Every run you make',
      tourRunsBody: 'One line per run. A number is how many things to fix, a check means all clear, a dash means the run never finished.',
      tourStartTitle: 'Try it now',
      tourStartBody: 'The demo page is deliberately broken, with all seven kinds of findings. Click Demo to see what a check does. Or look around first.'
    }

    /* --------------------------------------------------------------- API -- */

    /**
     * 把可能夹带浏览器原始报错的文本压成一句人话。
     *
     * 服务端已经会整理错误了，这里是最后一道兜底：任何路径漏出来的
     * 「page.goto: net::ERR_... + Call log + 调用栈」都在这里被截断。
     * 面板宽度有限，一坨英文调用栈会把它整个顶变形。
     */
    const tidyError = (text) => {
      const raw = String(text == null ? '' : text)
      const NET = [
        [/ERR_CONNECTION_REFUSED/i, '没有服务在这个端口上监听。地址可能写错了，或者页面服务还没启动。'],
        [/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/i, '域名解析不到，检查域名是否写错或网络是否可访问外网。'],
        [/ERR_INTERNET_DISCONNECTED/i, '当前网络已断开，连上后再试。'],
        [/ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|Timeout \d+ms exceeded|Timeout of \d+ms exceeded/i, '连接超时，页面没有响应。确认这个地址在浏览器里能打开。'],
        [/ERR_CONNECTION_RESET|ECONNRESET/i, '连接被中途重置，目标服务拒绝了这次连接。'],
        [/ERR_CERT|SSL|TLS|certificate/i, 'HTTPS 证书有问题，建议先用 http 地址测。'],
        [/ERR_EMPTY_RESPONSE/i, '端口有东西在监听，但它没有返回网页内容。'],
        [/ERR_ABORTED/i, '页面加载被中止了。'],
        [/ERR_INVALID_URL|Invalid URL/i, '网址格式不对，需要以 http:// 或 https:// 开头。']
      ]
      for (const [pattern, message] of NET) {
        if (pattern.test(raw)) {
          const url = (raw.match(/\bat\s+(https?:\/\/[^\s]+)/i) || raw.match(/navigating to\s+"([^"]+)"/i) || [])[1]
          return url ? `无法打开网页（${url}）：${message}` : `无法打开网页：${message}`
        }
      }
      // 没有已知错误码：至少把 Call log 之后那截噪音切掉
      const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^Call log:/i.test(l)) || ''
      return firstLine.replace(/^page\.goto:\s*/i, '').slice(0, 160) || raw.slice(0, 160)
    }

    async function callApi(path, options) {
      // 方法必须能被调用方指定：删除走 DELETE，否则会被当成 GET 打到只注册了 POST 的路由上
      const method = options?.method || (options?.body ? 'POST' : 'GET')
      const response = await fetch(`${API}/${path}`, {
        credentials: 'same-origin',
        headers: options?.body ? { 'content-type': 'application/json' } : undefined,
        method,
        body: options?.body ? JSON.stringify(options.body) : undefined
      })
      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }
      if (!response.ok) throw new Error(tidyError((data && data.error) || `HTTP ${response.status}`))
      return data
    }

    /* ------------------------------------------------------------- 小组件 -- */

    /** 空状态插画：环形量规，用三个检测色相做渐变。纯几何，不是拟物插画。 */
    function EmptyArt() {
      return h('div', { className: 'uxwEmptyArt' },
        h('svg', { viewBox: '0 0 66 66', 'aria-hidden': 'true' },
          h('defs', null,
            h('linearGradient', { id: 'uxwArtGrad', x1: '0', y1: '0', x2: '1', y2: '1' },
              h('stop', { offset: '0%', stopColor: '#4E7CD8' }),
              h('stop', { offset: '52%', stopColor: '#0F9C87' }),
              h('stop', { offset: '100%', stopColor: '#E2703A' }))),
          h('circle', { cx: '33', cy: '33', r: '29', fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: '1' }),
          h('circle', { cx: '33', cy: '33', r: '20', fill: 'none', stroke: 'url(#uxwArtGrad)', strokeWidth: '1.6', strokeLinecap: 'round', strokeDasharray: '46 80', opacity: '.92' }),
          h('path', { d: 'M33 9v6M33 51v6M9 33h6M51 33h6', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: '1.4', strokeLinecap: 'round' }),
          h('rect', { x: '24', y: '24', width: '18', height: '13', rx: '3.5', fill: 'none', stroke: 'url(#uxwArtGrad)', strokeWidth: '1.8' }),
          h('path', { d: 'M28 30h7M28 33.5h4.5', stroke: 'url(#uxwArtGrad)', strokeWidth: '1.8', strokeLinecap: 'round', opacity: '.7' })))
    }

    /**
     * 把同一检测项的缺陷按「目标元素」聚合。
     * 亮色/暗色各报一次、多个视口各报一次，本质是同一个元素同一个问题，
     * 平铺出来会让 26 条看着像 26 个问题，实际只有 15 个元素。
     *
     * keyOf 默认只按目标元素分，因为同一组里检测项已经相同。跨组统计（结论条）
     * 必须把检测项一起算进 key：一个按钮既有「热区偏小」又有「焦点不可见」，
     * 那是两件事，不能被并成一件。
     */
    /**
     * 把毫秒格式化成一眼能读的耗时。
     *
     * 检测通常几秒到几分钟，所以：
     *   小于 1 秒   → 850ms
     *   小于 1 分钟 → 4.2s
     *   一分钟后    → 5m12s（精确到秒，不再要小数）
     * 拿不到时间就返回空串，调用方据此整块不渲染，而不是显示 0 或 NaN。
     */
    function formatDuration(ms) {
      if (!Number.isFinite(ms) || ms < 0) return ''
      if (ms < 1000) return `${Math.round(ms)}ms`
      // 先按 0.1 秒取整再判断是否满一分钟，否则 59999ms 会显示成「60.0s」——
      // 差 1ms 不算一分钟，但写成 60.0s 读者会以为它已经进位了。
      const tenths = Math.round(ms / 100)
      if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`
      const total = Math.round(ms / 1000)
      const m = Math.floor(total / 60)
      const s = total % 60
      return `${m}m${String(s).padStart(2, '0')}s`
    }

    function aggregate(issues, keyOf) {
      const identify = keyOf || ((issue) => issue.target || issue.title)
      const map = new Map()
      for (const issue of issues) {
        const key = identify(issue)
        if (!map.has(key)) {
          map.set(key, {
            key,
            title: issue.title,
            detail: issue.detail,
            suggestion: issue.suggestion,
            target: issue.target,
            severity: issue.severity,
            // 只有拿到坐标的缺陷才能在页面上定位；没有坐标的退化成静态行
            rect: issue.rect || null,
            combos: [],
            states: new Set(),
            hits: 0
          })
        }
        const bucket = map.get(key)
        bucket.hits += issue.hits || 1
        if (issue.severity === 'error') bucket.severity = 'error'
        if (!bucket.rect && issue.rect) bucket.rect = issue.rect
        // 组合同理：合并后的记录用 combinations 数组记下全部组合。
        const combos = Array.isArray(issue.combinations)
          ? issue.combinations
          : (issue.combination ? [issue.combination] : [])
        for (const combination of combos) {
          if (combination && !bucket.combos.includes(combination)) bucket.combos.push(combination)
        }
        // 服务端合并后的记录带 states 数组（完整复现状态），单条记录只有 state。
        // 两种都要收：否则新记录只认一个状态，证据徽标会永远显示 1。
        if (Array.isArray(issue.states)) {
          for (const state of issue.states) {
            if (state && state !== '首屏') bucket.states.add(state)
          }
        } else if (issue.state && issue.state !== '首屏') {
          bucket.states.add(issue.state)
        }
      }
      return Array.from(map.values())
    }

    /** 同一检测项的修复建议通常完全一样，提到组级只说一次。 */
    function uniformSuggestion(buckets) {
      const all = buckets.map((b) => b.suggestion).filter(Boolean)
      if (all.length === 0) return { shared: null, rest: true }
      const first = all[0]
      return all.every((s) => s === first) ? { shared: first, rest: false } : { shared: null, rest: true }
    }



    /**
     * 缺陷的证据规模：它是在多少个交互状态、多少个组合下复现的。
     *
     * 这两个数字早先被拼进标题，一行能到 700 多字符。它们其实不是缺陷描述，
     * 而是「这个结论有多稳」的旁证 —— 放成右侧的小徽标就够了。
     */
    function evidenceOf(bucket) {
      const states = bucket.states ? bucket.states.size : 0
      const combos = bucket.combos ? bucket.combos.length : 0
      return { states, combos }
    }

    function IssueRow({ bucket, showSuggestion, selected, onLocate, t }) {
      const sev = bucket.severity === 'error' ? 'error' : 'warn'
      const states = Array.from(bucket.states)
      const combos = bucket.combos.map((c) => c.replace('当前视口 · ', ''))
      const evidence = evidenceOf(bucket)
      const tooltip = [
        bucket.title,
        states.length ? `复现状态：${states.slice(0, 12).join(' / ')}${states.length > 12 ? ` 等 ${states.length} 项` : ''}` : '',
        combos.length > 1 ? `组合：${combos.join(' / ')}` : '',
        t ? t('locate') : ''
      ].filter(Boolean).join('\n')
      const body = [
        h('span', { key: 'sev', className: 'uxwRowSev', 'data-sev': sev }),
        h('div', { key: 'body', className: 'uxwRowBody' },
          h('p', { className: 'uxwRowTitle' }, bucket.title),
          h('code', { className: 'uxwRowPath' }, bucket.target || bucket.detail),
          showSuggestion && bucket.suggestion
            ? h('span', { className: 'uxwRowPath', style: { marginTop: '3px' } }, '→ ' + bucket.suggestion)
            : null),
        h('span', { key: 'ev', className: 'uxwRowEv' },
          evidence.combos > 1
            ? h('span', { className: 'uxwRowCombo', title: combos.join(' / ') }, `×${evidence.combos}`)
            : null,
          evidence.states > 1
            ? h('span', { className: 'uxwRowStates', title: `${evidence.states} 个交互状态下复现` }, `${evidence.states} 状态`)
            : null)
      ]

      // 有坐标才可点：点了会在侧栏网页上滚过去并框出来。
      //
      // 没坐标的（例如整个页面横向溢出、或者旧记录里缺少 rect 的条目）
      // 不能静默变成不可点的 div —— 用户点了没反应，只会以为这个面板坏了。
      // 所以照样渲染成按钮，但把原因写在 title 里，点了给一句解释。
      if (onLocate) {
        const locatable = Boolean(bucket.rect)
        return h('button', {
          type: 'button',
          className: 'uxwRow',
          'data-selected': Boolean(selected),
          'data-locatable': locatable ? 'true' : 'false',
          title: locatable ? tooltip : `${bucket.title}\n这条没有元素坐标，无法在页面上框出来。`,
          onClick: () => onLocate(bucket)
        }, body)
      }
      return h('div', { className: 'uxwRow', title: tooltip }, body)
    }

    /**
     * 功能测试报告的渲染。
     *
     * 和体验报告的 IssueRow / uxwGroup **长得不像**是刻意的：
     * 体验报告的单位是「一处缺陷」，功能报告的单位是「一个用例过没过」。
     * 做成同一种外观，用户会下意识把「失败 3 个用例」读成「3 处体验缺陷」。
     *
     * 三层信息，按「要不要展开」分层：
     *   1. 结论条：几个用例、通过/失败/阻塞各多少 —— 一眼看到过没过；
     *   2. 用例列表：按 失败 → 阻塞 → 跳过 → 通过 排序，点开看步骤/预期/实际/证据；
     *   3. Markdown 全文：折叠在底部。cases 缺失时它升格为主内容（降级路径）。
     */
    function FuncReport({ t, report, openCases, onToggleCase, openMarkdown, onToggleMarkdown }) {
      const cases = Array.isArray(report.cases) ? report.cases : []
      const counts = report.counts || { total: cases.length, pass: 0, fail: 0, blocked: 0, skip: 0 }
      const verdict = report.verdict || 'passed'

      const SEV = {
        blocker: t('funcSevBlocker'),
        critical: t('funcSevCritical'),
        major: t('funcSevMajor'),
        minor: t('funcSevMinor')
      }
      const STATUS = {
        pass: t('funcStatusPass'),
        fail: t('funcStatusFail'),
        blocked: t('funcStatusBlocked'),
        skip: t('funcStatusSkip')
      }

      const verdictIcon = verdict === 'failed'
        ? ICONS.fail
        : (verdict === 'blocked' ? ICONS.blocked : ICONS.pass)
      const verdictTitle = verdict === 'failed'
        ? t('funcVerdictFailed')
        : (verdict === 'blocked' ? t('funcVerdictBlocked') : t('funcVerdictPassed'))
      const verdictDesc = verdict === 'failed'
        ? t('funcVerdictFailedText')
        : (verdict === 'blocked' ? t('funcVerdictBlockedText') : t('funcVerdictPassedText'))

      const meta = [report.projectName, report.mode ? `${t('funcMode')} ${report.mode}` : '', report.createdAt
        ? new Date(report.createdAt).toLocaleString()
        : ''].filter(Boolean).join(' · ')

      // 分组顺序就是「该先看哪个」的顺序。pass 放最后：
      // 它数量最多、最没信息量，摆前面会把失败用例挤下去。
      const ORDER = ['fail', 'blocked', 'skip', 'pass']
      const GROUP_LABEL = {
        fail: t('funcGroupFail'),
        blocked: t('funcGroupBlocked'),
        skip: t('funcGroupSkip'),
        pass: t('funcGroupPass')
      }
      const grouped = ORDER
        .map((status) => [status, cases.filter((item) => item.status === status)])
        .filter(([, list]) => list.length > 0)

      const caseView = (item) => {
        const open = openCases[item.id] === true
        return h('article', { key: item.id, className: 'uxwFuncCase', 'data-status': item.status },
          h('button', {
            type: 'button',
            className: 'uxwFuncCaseHead',
            'data-open': open,
            'aria-expanded': open,
            onClick: () => onToggleCase(item.id)
          },
          h('span', { className: 'uxwFuncChevron', 'aria-hidden': 'true' }, icon(ICONS.chevron)),
          h('span', { className: 'uxwFuncBadge', 'data-status': item.status }, STATUS[item.status] || item.status),
          h('span', { className: 'uxwFuncCaseName', title: item.name }, item.name),
          // 通过的用例不标严重度：一条「通过了但严重度极高」的用例只会让人困惑
          item.status !== 'pass' && SEV[item.severity]
            ? h('span', { className: 'uxwFuncSev', 'data-sev': item.severity }, SEV[item.severity])
            : null),

          open
            ? h('div', { className: 'uxwFuncCaseBody' },
              item.steps && item.steps.length
                ? h('div', { className: 'uxwFuncField' },
                  h('span', { className: 'uxwFuncLabel' }, t('funcSteps')),
                  h('ol', { className: 'uxwFuncSteps' },
                    item.steps.map((step, index) => h('li', { key: index }, step))))
                : null,
              item.expected
                ? h('div', { className: 'uxwFuncField' },
                  h('span', { className: 'uxwFuncLabel' }, t('funcExpected')),
                  h('p', { className: 'uxwFuncValue' }, item.expected))
                : null,
              item.actual
                ? h('div', { className: 'uxwFuncField' },
                  h('span', { className: 'uxwFuncLabel' }, t('funcActual')),
                  h('p', {
                    className: 'uxwFuncValue',
                    // 只给失败用例的实际结果上色：通过的「实际」是正常输出，
                    // 标红会让整页看起来到处都是问题。
                    'data-tone': item.status === 'fail' ? 'fail' : undefined
                  }, item.actual))
                : null,
              item.note
                ? h('div', { className: 'uxwFuncField' },
                  h('span', { className: 'uxwFuncLabel' }, t('funcNote')),
                  h('p', { className: 'uxwFuncValue' }, item.note))
                : null,
              item.evidence && item.evidence.length
                ? h('div', { className: 'uxwFuncField' },
                  h('span', { className: 'uxwFuncLabel' }, t('funcEvidence')),
                  item.evidence.map((ev, index) => h('div', { key: index, className: 'uxwFuncEvidence' },
                    ev.label ? h('span', { className: 'uxwFuncEvLabel' }, ev.label) : null,
                    h('p', { className: 'uxwFuncEvValue' }, ev.value))))
                : null)
            : null)
      }

      return h('div', { className: 'uxwFunc' },
        h('div', { className: 'uxwFuncHead' },
          h('h2', { className: 'uxwFuncTitle' },
            icon(ICONS.flask),
            report.title,
            h('span', { className: 'uxwFuncTag' }, t('funcTag'))),
          meta ? h('p', { className: 'uxwFuncMeta', title: meta }, meta) : null),

        h('div', { className: 'uxwFuncVerdict', 'data-tone': verdict },
          h('div', { className: 'uxwFuncVerdictIcon', 'aria-hidden': 'true' }, icon(verdictIcon)),
          h('div', { className: 'uxwFuncVerdictText' },
            h('p', { className: 'uxwFuncVerdictTitle' }, verdictTitle),
            h('p', { className: 'uxwFuncVerdictDesc' },
              report.summary ? `${report.summary}` : verdictDesc)),
          // 数字回答的是「几个用例过没过」。不要在这里挂「缺陷 N 处」——
          // 那是体验检测的量纲，混进来就分不清自己在看哪种报告。
          h('div', { className: 'uxwFuncCounts' },
            h('div', { className: 'uxwFuncCount', 'data-k': 'total' },
              h('b', null, String(counts.total)), h('span', null, t('funcCountTotal'))),
            h('div', { className: 'uxwFuncCount', 'data-k': 'fail' },
              h('b', null, String(counts.fail)), h('span', null, t('funcCountFail'))),
            h('div', { className: 'uxwFuncCount', 'data-k': 'blocked' },
              h('b', null, String(counts.blocked)), h('span', null, t('funcCountBlocked'))),
            h('div', { className: 'uxwFuncCount', 'data-k': 'pass' },
              h('b', null, String(counts.pass)), h('span', null, t('funcCountPass'))))),

        // 用例分组。cases 为空时整块不出现 —— 下面 Markdown 兜底会顶上。
        grouped.length
          ? grouped.map(([status, list]) => h('section', { key: status, className: 'uxwFuncGroup' },
            h('div', { className: 'uxwFuncGroupHead' },
              h('h3', { className: 'uxwFuncGroupTitle' }, GROUP_LABEL[status]),
              h('span', { className: 'uxwFuncGroupRule' }),
              h('span', { className: 'uxwFuncGroupCount' }, String(list.length))),
            list.map(caseView)))
          : null,

        // Markdown 全文：永远存在（服务端要求正文非空），默认收起。
        // cases 为空时它默认展开 —— 那种情况下这就是唯一的内容。
        h('div', { className: 'uxwFuncMd' },
          h('button', {
            type: 'button',
            className: 'uxwFuncMdHead',
            'data-open': cases.length === 0 ? true : openMarkdown,
            'aria-expanded': cases.length === 0 ? true : openMarkdown,
            onClick: onToggleMarkdown,
            // 没有结构化用例时不给折叠：折起来页面就空了
            disabled: cases.length === 0
          },
          h('span', { className: 'uxwFuncChevron', 'aria-hidden': 'true' }, icon(ICONS.chevron)),
          cases.length === 0 ? t('funcMarkdown') + ' · ' + t('funcMarkdownFallback') : t('funcMarkdown')),
          (cases.length === 0 || openMarkdown)
            ? h('p', { className: 'uxwFuncMdBody' }, report.markdown)
            : null))
    }

    function Modal({ title, children, onClose, actions }) {
      return h('div', {
        className: 'uxwModalBackdrop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onClick: (event) => { if (event.target === event.currentTarget) onClose() }
      }, h('div', { className: 'uxwModal' },
        h('h2', { className: 'uxwModalTitle' }, title),
        children,
        h('div', { className: 'uxwModalActions' }, actions)))
    }

    const field = (label, input) => h('label', { className: 'uxwFormField' },
      h('span', { className: 'uxwFormLabel' }, label),
      input)

    /* --------------------------------------------------------------- 预览 -- */

    /**
     * 这个地址能不能装进内置浏览器，能则返回 iframe 的 src。
     *
     * 规则：只托管本机回环地址。线上站点受 X-Frame-Options / CSP 限制，
     * 硬塞进 iframe 只会得到一个白框，不如老实走截图。
     * 走 /live 同源代理的第二个原因：面板与项目端口不同即为跨域，
     * 不经代理时父窗口读不到 iframe 的 DOM，「点问题跳过去」就废了。
     */
    const liveSrcOf = (url) => {
      if (!url || typeof url !== 'string') return ''
      // 内置演示页也是本地文件，同样可以装进内置浏览器实时操作
      if (url === 'builtin:demo') return `${API}/live?u=${encodeURIComponent('builtin:demo')}`
      if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(url)) return ''
      return `${API}/live?u=${encodeURIComponent(url)}`
    }

    /**
     * 项目文件树。
     *
     * 按需加载：只有展开某一层时才去请求那一层。一次把整棵树拉下来在大项目上
     * 会卡住（node_modules 动辄几万个文件），而用户其实只看得到展开的那几层。
     *
     * 展开状态用「路径集合」维护而不是嵌在节点里：目录内容是按需异步填进来的，
     * 若把 expanded 挂在每个节点对象上，每次加载都要深拷贝整棵树去更新一个布尔值。
     */
    function FileTree({ t, instanceId, activePath, onOpenFile }) {
      // path -> { entries, loading, error }。根目录的 path 是 ''
      const [dirs, setDirs] = React.useState({})
      const [expanded, setExpanded] = React.useState(() => new Set(['']))

      const load = React.useCallback(async (path) => {
        setDirs((current) => ({ ...current, [path]: { ...(current[path] || {}), loading: true, error: null } }))
        try {
          const query = `files?instanceId=${encodeURIComponent(instanceId)}&path=${encodeURIComponent(path)}`
          const data = await callApi(query)
          setDirs((current) => ({ ...current, [path]: { entries: data.entries || [], loading: false, error: null } }))
        } catch (failure) {
          setDirs((current) => ({ ...current, [path]: { entries: [], loading: false, error: String(failure.message || failure) } }))
        }
      }, [instanceId])

      // 实例换了就把整棵树丢掉：否则会把上一个项目的目录内容显示在新项目下面
      React.useEffect(() => {
        setDirs({})
        setExpanded(new Set(['']))
        if (instanceId) load('')
      }, [instanceId, load])

      const toggle = (path) => {
        setExpanded((current) => {
          const next = new Set(current)
          if (next.has(path)) {
            next.delete(path)
          } else {
            next.add(path)
            // 展开时才去取内容；已经取过就复用（除非上次失败，重试一次）
            const known = dirs[path]
            if (!known || (!known.entries && !known.loading) || known.error) load(path)
          }
          return next
        })
      }

      const rows = []
      const walk = (path, depth) => {
        const state = dirs[path]
        if (!state) return
        if (state.loading && !state.entries) {
          rows.push(h('div', { key: `${path}:loading`, className: 'uxwTreeNote', style: { paddingLeft: `${depth * 13 + 20}px` } },
            h('span', { className: 'uxwSpin' }), t('filesLoading')))
          return
        }
        if (state.error) {
          rows.push(h('div', { key: `${path}:err`, className: 'uxwTreeNote', style: { paddingLeft: `${depth * 13 + 20}px` }, title: state.error },
            t('filesFailed')))
          return
        }
        if (!state.entries || state.entries.length === 0) {
          if (path === '') rows.push(h('div', { key: 'empty', className: 'uxwTreeNote' }, t('filesEmpty')))
          return
        }
        for (const entry of state.entries) {
          const isOpen = expanded.has(entry.path)
          rows.push(h('button', {
            key: entry.path,
            type: 'button',
            className: 'uxwTreeRow',
            'data-dir': entry.dir ? 'true' : 'false',
            'data-active': !entry.dir && entry.path === activePath ? 'true' : 'false',
            style: { paddingLeft: `${depth * 13 + 8}px` },
            title: entry.path,
            onClick: () => (entry.dir ? toggle(entry.path) : onOpenFile(entry.path))
          },
          // 目录显示展开箭头；文件用同样宽度的空位对齐，不然文字会参差不齐
          entry.dir
            ? h('span', { className: 'uxwTreeChevron', 'data-open': isOpen ? 'true' : 'false' }, icon(ICONS.chevron))
            : h('span', { className: 'uxwTreeChevron' }),
          h('span', { className: 'uxwTreeIcon', 'data-kind': entry.kind },
            icon(entry.dir ? (isOpen ? ICONS.folderOpen : ICONS.folder) : ICONS.file)),
          h('span', { className: 'uxwTreeName' }, entry.name)))
          if (entry.dir && isOpen) walk(entry.path, depth + 1)
        }
      }

      walk('', 0)

      return h('div', { className: 'uxwTree' }, rows)
    }

    /**
     * 代码查看器。
     *
     * 只做「看」，不做编辑 —— 这个工作台的职责是检测体验缺陷，
     * 内置一个编辑器会引出保存、冲突、撤销一堆与本职无关的问题。
     * 行号是必须的：缺陷报告里会提到行，没有行号就对不上。
     */
    function CodeViewer({ t, file }) {
      const lines = React.useMemo(() => {
        if (!file || file.binary || !file.text) return []
        return file.text.split('\n')
      }, [file])

      if (!file) return null

      // 文件名和关闭按钮在外层面板头部已经有了，这里不再重复一遍 ——
      // 两行头叠在一起既占地方又显得没做完。
      if (file.binary) {
        return h('div', { className: 'uxwPvEmpty' }, t('binaryFile'))
      }

      return h('div', { className: 'uxwCode' },
        h('div', { className: 'uxwCodeBody' },
          h('div', { className: 'uxwCodeGutter', 'aria-hidden': 'true' },
            lines.map((_, i) => h('span', { key: i }, String(i + 1)))),
          h('pre', { className: 'uxwCodeText' }, file.text)))
    }

    /**
     * 内置浏览器。
     *
     * 早先这里是「服务端截一张图，前端显示图片」。问题是图不会动：用户没法滚动、
     * 没法点、看不出交互效果，等于隔着玻璃看页面。现在直接用 iframe 装真实页面。
     *
     * 能内嵌的前提是走 /live 同源代理：面板与项目端口不同即跨域，跨域时父窗口
     * 读不到 iframe 的 DOM，「点问题跳过去」就做不到。线上站点无法代理，
     * 仍退回截图 —— 那是浏览器安全策略决定的，不是可以绕的选择。
     */
    function BuiltinBrowser({ t, state, frame, onRetry, locating, frameRef, expanded, onToggleExpand, onNavigate, fileError, resize }) {
      const failed = state.status === 'failed'
      const opening = state.status === 'opening'
      const url = state.url || ''
      // 只有本机地址才可能内嵌；线上站点受 X-Frame-Options / CSP 限制
      const src = liveSrcOf(url)
      const embeddable = Boolean(src)

      // frameRef 由面板传入：点缺陷时面板要通过它操作 iframe 里的页面。
      // 万一没传（独立使用），退回一个自己的 ref，组件仍然能工作。
      const ownRef = React.useRef(null)
      const nodeRef = frameRef || ownRef

      /**
       * 地址栏里正在输入的文字。
       *
       * 和 state.url 分开：页面上点链接跳走时 state.url 会跟着变（这里没有浏览器
       * 的历史栈，只能靠面板知道当前地址），但用户正在框里打字的时候不能被外部值
       * 顶掉，否则打一半的字会自己消失。所以只在 url 变化、且用户没在输入时同步。
       */
      const [draft, setDraft] = React.useState(url)
      const typingRef = React.useRef(false)
      React.useEffect(() => {
        if (typingRef.current) return
        setDraft(url)
      }, [url])

      const go = () => {
        const target = draft.trim()
        if (!target) return
        typingRef.current = false
        if (onNavigate) onNavigate(target)
      }

      /**
       * 网页区当前的真实像素宽高，显示在头部。
       *
       * 「只看到一部分」的本质是这个框太窄。把真实数字摆出来，
       * 放大之后一眼能看出确实变宽了，而不是怀疑页面被裁掉了。
       */
      const [size, setSize] = React.useState({ w: 0, h: 0 })
      React.useEffect(() => {
        const el = nodeRef.current
        if (!el || typeof ResizeObserver === 'undefined') return undefined
        const sync = () => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })
        sync()
        const ro = new ResizeObserver(sync)
        ro.observe(el)
        return () => ro.disconnect()
      }, [nodeRef, src, expanded])

      const stage = () => {
        if (failed) {
          return h('div', { className: 'uxwPvEmpty' },
            h('b', null, t('previewFailed')),
            h('span', null, state.reason || ''),
            h('button', { type: 'button', className: 'uxwPvBtn', onClick: onRetry }, icon(ICONS.refresh), t('previewRetry')))
        }
        if (embeddable && url) {
          return h('div', { className: 'uxwPvLive' },
            h('iframe', {
              ref: nodeRef,
              src,
              title: t('preview'),
              className: 'uxwPvFrame',
              // 允许页面跑脚本、用同一份 cookie；sandbox 里的 allow-forms 让表单也能测
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals'
            }),
            locating ? h('span', { className: 'uxwPvVeil' }) : null)
        }
        // 非本机页面：退回截图，并说明为什么不能内嵌
        if (!frame && opening) {
          return h('div', { className: 'uxwPvEmpty' }, h('span', { className: 'uxwSpin' }), t('previewOpening'))
        }
        // 完全没有地址：有地址栏时就直接告诉用户「在上面填一个」，比让他去翻记录快
        if (!frame && !url) {
          return h('div', { className: 'uxwPvEmpty' }, onNavigate ? t('pvEmptyHint') : t('previewIdle'))
        }
        if (!frame) return h('div', { className: 'uxwPvEmpty' }, t('previewIdle'))
        return h('img', {
          src: frame.image,
          alt: t('preview'),
          width: frame.width,
          height: frame.height,
          style: locating ? { opacity: '.55', transition: 'opacity .12s linear' } : undefined
        })
      }

      // 宽高只对内置浏览器有意义（截图有自己的原始尺寸）
      const sizeTag = embeddable && size.w
        ? h('span', { className: 'uxwPvSize', title: '网页区的真实像素尺寸' }, `${size.w}×${size.h}`)
        : null

      return h('section', { className: 'uxwPv', 'data-mode': 'page', 'aria-label': t('preview') },
        // 拖动分隔条：贴在右栏左缘，命中区比视觉宽度宽。
        // 放大态由 CSS 隐藏 —— 那时候栏宽由布局决定，不该再拖。
        resize
          ? h('div', {
            className: 'uxwPvResize',
            'data-dragging': resize.dragging ? 'true' : 'false',
            title: resize.hint,
            onMouseDown: resize.onStart
          })
          : null,
        h('div', { className: 'uxwPvHead', 'data-expanded': expanded ? 'true' : 'false' },
          h('span', { className: 'uxwPvTitle' }, t('preview')),
          embeddable && url ? h('span', { className: 'uxwPvLiveTag' }, t('liveBadge')) : null,
          sizeTag,
          // 放大 / 退出：同一位置同一个按钮，只换图标和提示，不会「找不到出口」
          onToggleExpand ? h('button', {
            type: 'button',
            className: 'uxwPvBtn',
            'data-act': expanded ? 'collapse' : 'expand',
            title: expanded ? t('collapsePage') : t('expandPage'),
            'aria-label': expanded ? t('collapsePage') : t('expandPage'),
            'aria-pressed': Boolean(expanded),
            onClick: onToggleExpand
          }, icon(expanded ? ICONS.collapse : ICONS.expand), expanded ? t('collapsePage') : t('expandPage')) : null,
          url ? h('button', {
            type: 'button',
            className: 'uxwPvBtn',
            'data-act': 'reload',
            title: t('reloadPage'),
            onClick: () => {
              const el = nodeRef.current
              // 换 src 强制重载：直接改 iframe.contentWindow.location 会撞跨域
              if (el) el.src = src
              if (onRetry) onRetry()
            }
          }, icon(ICONS.refresh)) : null),
        // 地址栏：网页展示自己的网址输入行。
        //
        // 有了它，用户不必「回到顶部改网址 → 重跑检测」才能看另一个页面；
        // 一个项目常有好几个页面（首页、后台、详情），就地改地址最直接。
        // 放在头部下面而不是顶栏：它只作用于这块网页区，和「要测哪个网址」是两件事。
        onNavigate
          ? h('form', {
            className: 'uxwPvNav',
            onSubmit: (event) => { event.preventDefault(); go() }
          },
          h('div', { className: 'uxwPvNavField' },
            icon(ICONS.link),
            h('input', {
              className: 'uxwPvNavInput',
              value: draft,
              placeholder: t('pvUrlPlaceholder'),
              'aria-label': t('pvUrlLabel'),
              spellCheck: false,
              onChange: (event) => {
                typingRef.current = true
                setDraft(event.target.value)
              },
              // 离开输入框就交还给外部状态：用户点了别处，说明没有在改地址
              onBlur: () => { typingRef.current = false },
              onKeyDown: (event) => { if (event.key === 'Escape') { typingRef.current = false; setDraft(url) } }
            })),
          h('button', {
            type: 'submit',
            className: 'uxwPvNavGo',
            title: t('pvGoHint'),
            disabled: !draft.trim() || draft.trim() === url
          }, icon(ICONS.play), t('pvGo')))
          : null,
        // 读文件失败时右栏要说清楚，而不是留一片空白
        fileError ? h('div', { className: 'uxwPvEmpty' }, fileError) : h('div', { className: 'uxwPvStage' }, stage()),
        // 底栏只用来显示当前网址；有地址栏时它已经显示了地址，不再重复一行。
        !onNavigate && url
          ? h('div', { className: 'uxwPvFoot' },
            icon(ICONS.info),
            h('code', { title: url }, url))
          : null)
    }


    /* --------------------------------------------------------------- 面板 -- */

    /**
     * 没有原生会话时的兜底。
     *
     * 宿主只在与当前工作台绑定的会话存在时才把 conversation 传进来，
     * 所以刚注册完、或用户还没开过会话时这里是空的。不能摆一块空白，
     * 得告诉用户怎么开始。
     *
     * 而且必须由用户点一下才创建：打开工作台就静默造会话，
     * 会在左侧栏留下用户没要过的东西。
     */
    function NativeChatFallback({ t, service }) {
      const [workspaces, setWorkspaces] = React.useState([])
      const [chosen, setChosen] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [failure, setFailure] = React.useState(null)
      /**
       * 本工作台专属文件夹的状态。
       *
       * null = 还没问过；adopted=true 表示就绪，直接在里面开会话。
       * 没就绪时不摆「随便挑个工作区」的下拉框 —— 那正是会话散落到
       * 用户其它工作区里的原因。要开会话，先把工作台自己的文件夹准备好。
       */
      // 这里只需要知道「文件夹就绪了没有」，不需要再弹卡 —— 卡在面板根层。
      const [home, setHome] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        const read = () => {
          fetch(`${API}/home`, { headers: { 'content-type': 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => { if (alive && payload) setHome(payload) })
            .catch(() => {})
        }
        read()
        // 确认卡那边刚建好文件夹时重读一次，这样「默认选中本工作台文件夹」
        // 立刻生效，不用重开面板。
        const onReady = () => read()
        try { globalThis.addEventListener(HOME_READY_EVENT, onReady) } catch { /* 忽略 */ }
        return () => {
          alive = false
          try { globalThis.removeEventListener(HOME_READY_EVENT, onReady) } catch { /* 忽略 */ }
        }
      }, [])

      React.useEffect(() => {
        const ctx = service && service.ctx
        const list = ctx && ctx.workspaces && ctx.workspaces.list
        if (!list || typeof list.getSnapshot !== 'function') return undefined
        const read = () => {
          const snapshot = list.getSnapshot()
          const items = (snapshot && snapshot.items) || []
          setWorkspaces(items)
          // 默认选中本工作台自己的文件夹；老宿主没有这项能力时才退回第一个。
          setChosen((current) => current || (home && home.workspaceId) || (items[0] && items[0].workspaceId) || '')
        }
        read()
        if (typeof list.subscribe === 'function') return list.subscribe(read)
        return undefined
      }, [service, home && home.workspaceId])

      const start = async () => {
        if (busy || !service) return
        setBusy(true)
        setFailure(null)
        try {
          // run() 把导航登记进宿主的队列，避免和用户点侧栏互相打断。
          const task = chosen ? service.newSession(chosen) : service.newWorkspaceSession()
          if (typeof service.run === 'function') service.run(Promise.resolve(task))
          else await task
        } catch (reason) {
          setFailure(String((reason && reason.message) || reason))
        } finally {
          setBusy(false)
        }
      }

      const ready = home ? home.adopted === true : false
      return h('div', { className: 'uxwChatEmpty' },
        h('b', null, t('chatNewTitle')),
        t('chatNewText'),

        // 两种测试的分工说明。
        //
        // 这里原来是两个按钮，点了会替用户往对话里发一段固定指令。改掉了 ——
        // 按钮只能发那段固定文字，用户心里想的是「测一下支付流程」，
        // 反而要绕一圈。真正该给的是「这两种测试分别怎么开口」，让他照着说。
        // 所以现在是纯说明，不可点，不带箭头，不假装是个操作。
        h('div', { className: 'uxwChatModes' },
          h('div', { className: 'uxwChatMode', 'data-kind': 'ux' },
            h('span', { className: 'uxwChatModeTitle' }, icon(ICONS.eye), t('modeUx')),
            h('span', { className: 'uxwChatModeDesc' }, t('modeUxHint')),
            h('span', { className: 'uxwChatModeSay' }, t('chatSayUx'))),
          h('div', { className: 'uxwChatMode', 'data-kind': 'func' },
            h('span', { className: 'uxwChatModeTitle' }, icon(ICONS.bug), t('modeFunc')),
            h('span', { className: 'uxwChatModeDesc' }, t('modeFuncHint')),
            h('span', { className: 'uxwChatModeSay' }, t('chatSayFunc')))),

        // 开场指令：不是装饰。用户第一次打开这个工作台时，最想知道的是
        // 「我能说什么」—— 给几句可以直接照着说的，比让他自己猜更省事。
        h('div', { className: 'uxwChatStarters' },
          h('span', { className: 'uxwChatStartersTitle' }, t('chatStarterTitle')),
          h('span', { className: 'uxwChatStarter' }, icon(ICONS.scan), t('chatStarterDemo')),
          h('span', { className: 'uxwChatStarter' }, icon(ICONS.folder), t('chatStarterProject')),
          h('span', { className: 'uxwChatStarter' }, icon(ICONS.link), t('chatStarterUrl'))),

        // 没就绪时这里什么都不画：确认卡在面板根层，不重复。
        // 就绪后才给「在这里开新会话」的入口，且不再让用户选工作区。
        ready
          ? h('button', {
            type: 'button',
            className: 'uxwBtn',
            'data-variant': 'primary',
            disabled: busy || !service,
            onClick: start
          }, busy ? t('chatStarting') : t('chatNewHere'))
          : null,

        failure ? h('div', { className: 'uxwChatFail', role: 'alert' }, failure) : null)
    }


    /* ----------------------------------------------------------- 新手导览 -- */

    /**
     * 导览步骤表。
     *
     * `anchor` 是 DOM 上的 data-tour 属性值，不是类名也不是序号 ——
     * 靠「从左数第三个按钮」找元素，结构一改就静默指错地方，最难查。
     *
     * `place` 是卡片希望待的方向，调用方会按实际空间改方向。
     * 开场与收尾没有锚点：整块压暗、卡片居中。
     *
     * 步骤数是**固定**的：这里写了七步，用户就看到七步。
     * 早先的做法是「锚点量不到就把这一步丢掉」，结果功能测试模式下
     * 网址框不渲染、窄屏下左栏 display:none，七步会悄悄变成四步 ——
     * 少的是内容，用户却只看到一个变小的分母，完全无从察觉。
     * 现在改为：锚点量不到就退化成居中的卡片（整屏压暗、不画箭头），
     * 文案照讲。指不准位置总比漏讲一件事可接受。
     */
    const TOUR_STEPS = [
      { id: 'intro', anchor: null, place: 'center', title: 'tourIntroTitle', body: 'tourIntroBody' },
      { id: 'project', anchor: 'add-project', place: 'right', title: 'tourProjectTitle', body: 'tourProjectBody' },
      { id: 'url', anchor: 'url-field', place: 'bottom', title: 'tourUrlTitle', body: 'tourUrlBody' },
      { id: 'modes', anchor: 'modes', place: 'bottom', title: 'tourModesTitle', body: 'tourModesBody' },
      { id: 'preview', anchor: 'preview-toggle', place: 'bottom', title: 'tourPreviewTitle', body: 'tourPreviewBody' },
      { id: 'runs', anchor: 'runs', place: 'right', title: 'tourRunsTitle', body: 'tourRunsBody' },
      { id: 'start', anchor: null, place: 'center', title: 'tourStartTitle', body: 'tourStartBody' }
    ]

    /** 高亮框比目标外扩多少：贴着边框画会盖住元素自己的轮廓线。 */
    const TOUR_SPOT_PAD = 6
    /** 卡片与高亮框之间的空隙，也是卡片与面板边缘的最小留白。 */
    const TOUR_GAP = 14
    /** 面板内边距：卡片最多贴到离边这么近，再往外就出界了。 */
    const TOUR_INSET = 8

    const tourClamp = (value, low, high) => Math.max(low, Math.min(value, high))

    /**
     * 给一个高亮框挑卡片的落点。
     *
     * 输入：
     *   spot   高亮框在面板坐标系里的矩形 { left, top, width, height }
     *   size   卡片尺寸 { width, height }
     *   bounds 面板尺寸 { width, height }
     *   prefer 期望方向 'top' | 'bottom' | 'left' | 'right' | 'center'
     *
     * 返回 { left, top, dir, arrowX, arrowY }：
     *   dir    最终选中的方向（可能和 prefer 不同）
     *   arrowX/arrowY  箭头的绝对坐标（相对面板）。箭头是卡片的兄弟节点，
     *                  由调用方单独渲染 —— 卡片为了长正文设了 overflow，
     *                  画在边界外的子元素会被裁掉。
     *
     * left/top 一定被夹在面板内：出去的部分会被面板 overflow 裁掉，
     * 用户等于看不到那张卡片。
     *
     * 一个方向都放不下时（面板又窄又矮）按空间最大的方向摆，允许盖住
     * 一点目标 —— 位置不准总比整层消失强。
     */
    function placeTourCard(spot, size, bounds, prefer) {
      if (!spot) {
        // 居中步骤不画箭头（dir=center），但 arrowX/arrowY 照样给数：
        // 调用方不必区分「有箭头 / 没箭头」两套分支，少一个 null 判断。
        const left = Math.max(TOUR_INSET, Math.round((bounds.width - size.width) / 2))
        const top = Math.max(TOUR_INSET, Math.round((bounds.height - size.height) / 2))
        return {
          left,
          top,
          dir: 'center',
          arrowX: left + Math.round(size.width / 2),
          arrowY: top + Math.round(size.height / 2)
        }
      }

      const spotRight = spot.left + spot.width
      const spotBottom = spot.top + spot.height
      // 四个方向各自能把卡片放多远
      const room = {
        top: spot.top - TOUR_GAP - TOUR_INSET,
        bottom: bounds.height - spotBottom - TOUR_GAP - TOUR_INSET,
        left: spot.left - TOUR_GAP - TOUR_INSET,
        right: bounds.width - spotRight - TOUR_GAP - TOUR_INSET
      }
      const fits = {
        top: room.top >= size.height,
        bottom: room.bottom >= size.height,
        left: room.left >= size.width,
        right: room.right >= size.width
      }

      // 先把 prefer 当第一志愿；放不下就按「剩余空间够不够」从大到小轮。
      // 用空间而不是固定顺序：左栏很窄时 prefer=right 依旧成立，
      // 但顶栏那种又矮又宽的东西，top 往往比 left 更合适。
      const order = []
      if (prefer && prefer !== 'center') order.push(prefer)
      for (const dir of ['bottom', 'right', 'top', 'left']) {
        if (!order.includes(dir)) order.push(dir)
      }
      let dir = order.find((item) => fits[item]) || null

      // 一个都放不下：挑空间最大的方向摆，接受它可能盖住一点目标。
      // 目标比整个面板还大时（比如高亮整块主区）也走这里。
      if (!dir) {
        dir = order.reduce((best, item) => (room[item] > room[best] ? item : best), order[0])
      }

      let left
      let top
      if (dir === 'top' || dir === 'bottom') {
        // 沿横轴居中对齐锚点，再夹进面板 —— 卡片比锚点宽时优先保左边可见
        left = spot.left + spot.width / 2 - size.width / 2
        left = tourClamp(left, TOUR_INSET, Math.max(TOUR_INSET, bounds.width - size.width - TOUR_INSET))
        top = dir === 'top' ? spot.top - TOUR_GAP - size.height : spotBottom + TOUR_GAP
      } else {
        top = spot.top + spot.height / 2 - size.height / 2
        top = tourClamp(top, TOUR_INSET, Math.max(TOUR_INSET, bounds.height - size.height - TOUR_INSET))
        left = dir === 'left' ? spot.left - TOUR_GAP - size.width : spotRight + TOUR_GAP
      }

      // 兜底夹取：上面按方向算出来的值在极端情况下仍可能越界
      left = tourClamp(left, TOUR_INSET, Math.max(TOUR_INSET, bounds.width - size.width - TOUR_INSET))
      top = tourClamp(top, TOUR_INSET, Math.max(TOUR_INSET, bounds.height - size.height - TOUR_INSET))

      // 箭头指向锚点中心，而不是卡片中点 —— 卡片被夹回面板内之后两者常常不重合。
      // 先算百分比，再夹到 12%~88%，避免箭头跑到圆角外面去。
      const anchorX = spot.left + spot.width / 2
      const anchorY = spot.top + spot.height / 2
      const ratio = dir === 'top' || dir === 'bottom'
        ? tourClamp(((anchorX - left) / size.width) * 100, 12, 88)
        : tourClamp(((anchorY - top) / size.height) * 100, 12, 88)

      // 换成绝对坐标。箭头不能是卡片的子节点：卡片为了长正文设了
      // overflow:auto，画在边界外的子元素会被直接裁掉。
      const half = 6
      let arrowX
      let arrowY
      if (dir === 'top') {
        arrowX = left + (size.width * ratio) / 100 - half
        arrowY = top + size.height - half
      } else if (dir === 'bottom') {
        arrowX = left + (size.width * ratio) / 100 - half
        arrowY = top - half
      } else if (dir === 'left') {
        arrowX = left + size.width - half
        arrowY = top + (size.height * ratio) / 100 - half
      } else {
        arrowX = left - half
        arrowY = top + (size.height * ratio) / 100 - half
      }

      return {
        left: Math.round(left),
        top: Math.round(top),
        dir,
        arrowX: Math.round(arrowX),
        arrowY: Math.round(arrowY)
      }
    }

    function createPanel(t) {
      /**
       * 业务面板。
       *
       * 宿主传进来的 props：service / entry / active / conversation。
       *
       * conversation 必须由我们用掉、放进自己的布局。工作台规范写得很明确：
       * 原生会话由宿主提供的 conversation 节点放进业务布局，不能再创建一套聊天界面。
       * 早先这里自己写了一个 ChatDock —— 结构上就和左侧栏不连通：侧栏新建、删除、
       * 切换会话它都看不见，消息历史也各存一份。这就是「AI 对话又变回最开始的样子」。
       */
      return function UxWorkbenchPanel(props) {
        const conversation = (props && props.conversation) || null
        const service = (props && props.service) || null
        const [instances, setInstances] = React.useState([])
        const [meta, setMeta] = React.useState(null)
        const [runs, setRuns] = React.useState([])
        const [activeId, setActiveId] = React.useState(null)
        /**
         * 当前项目是否处于「展开」状态。
         *
         * 和 activeId 分开：点一个已展开的项目应该能把它收起来，
         * 但收起来不代表换项目 —— 报告还留在主区。所以需要两个状态。
         */
        const [expandedProject, setExpandedProject] = React.useState(true)
        const [detail, setDetail] = React.useState(null)
        const [jobId, setJobId] = React.useState(null)
        // 正在叫停：期间不重复发停止请求，也不让按钮文字乱跳
        const [stopping, setStopping] = React.useState(false)
        const [progress, setProgress] = React.useState(null)
        const [elapsed, setElapsed] = React.useState(0)
        const [error, setError] = React.useState(null)
        const [url, setUrl] = React.useState('')
        const [focused, setFocused] = React.useState(false)
        const [modal, setModal] = React.useState(null)
        // 正在调系统的文件夹选择器：期间按钮转圈，避免连点弹出好几个对话框
        const [picking, setPicking] = React.useState(false)
        // 默认收起：结果区优先占满宽度，需要问的时候再打开
        const [chatOpen, setChatOpen] = React.useState(false)
         const [previewOpen, setPreviewOpen] = React.useState(true)
        // 放大查看：网页区铺满主区，问题记录收成右侧栏
        const [expanded, setExpanded] = React.useState(false)
        // 「AI 发起的检测」同步：记住已经处理过的最新运行，避免反复重放同一条
        const seenRunRef = React.useRef(null)
        const detailRef = React.useRef(null)
        const instancesRef = React.useRef([])
        // 预览：会话 id + 当前帧 + 失败原因，三者一起决定侧栏画什么
        const [previewSession, setPreviewSession] = React.useState(null)
        const previewSessionRef = React.useRef(null)
        // 内置浏览器的 iframe 节点必须由面板持有：点缺陷时要在它里面滚到目标元素。
        const frameElRef = React.useRef(null)
        const [previewFrame, setPreviewFrame] = React.useState(null)
        const [previewState, setPreviewState] = React.useState({ status: 'idle', url: '', theme: 'light', reason: '' })
        const [locating, setLocating] = React.useState(false)
        const [selectedIssue, setSelectedIssue] = React.useState(null)
        // 只能自动消失的轻提示（例如「这条没有坐标」）。
        // 不能复用 error：error 非空会把整个报告区换成错误条，
        // 用户点了条目反而丢掉正在看的报告，比没反应更糟。
        const [notice, setNotice] = React.useState(null)
        const noticeTimerRef = React.useRef(null)
        const previewSeqRef = React.useRef(0)
        /**
         * 记住「当前画面已经属于哪条记录」。
         *
         * 用它去重，避免同一条记录每次渲染都重开 iframe。但去重不能只看 id：
         * 用户把记录收起时画面会被清成 idle，再点开同一条时 id 没变，
         * 只看 id 就会跳过加载 —— 面板打开了却停在空白态。
         * 所以下面的 effect 还要求 previewState 不是 idle。
         */
        const previewedRunRef = React.useRef(null)
        /**
         * 上一次看到的「用户在左侧栏点开的会话」。
         *
         * 用它区分「用户主动切了会话」和「面板自己的状态变化」。见下面的
         * 会话联动 effect。
         */
        const openedSessionRef = React.useRef(null)

        /**
         * 本工作台的专属文件夹。
         *
         * 放在面板根层而不是聊天侧栏里：用户可能已经有会话、聊天侧栏是收起的，
         * 那样写就永远看不到确认卡。这里只要打开工作台就检查一次。
         *
         * null = 还在读；adopted=true = 就绪。
         */
        const [home, setHome] = React.useState(null)
        const [homeBusy, setHomeBusy] = React.useState(false)
        const [homeError, setHomeError] = React.useState('')
        // 用户点过「稍后再说」就不在本轮再弹，留一个顶栏入口随时回来。
        const [homeDismissed, setHomeDismissed] = React.useState(false)
        // 用户用系统选择器自己挑的位置。null = 还没挑，沿用默认建议。
        const [homePicked, setHomePicked] = React.useState(null)

        /**
         * 新手导览。
         *
         * `tourOpen` 是「要不要显示」，`tourIndex` 是在步骤表里的位置。
         * 分开是因为「打开」这件事有多个触发源（首次进入、顶栏 ? 重播），
         * 而每次打开都必须从第 0 步开始 —— 合成一个 state 就得在打开时
         * 同时改两个字段，漏一个就会从上一次的停点接着走。
         *
         * `tourSpot` 是当前锚点在面板坐标系里的矩形（null = 居中步骤），
         * `tourLayout` 是算出来的卡片落点。两者都由 measureTour() 负责，
         * 尺寸一变（拖左右栏、缩放窗口、滚动）就要重算。
         */
        const [tourOpen, setTourOpen] = React.useState(false)
        const [tourIndex, setTourIndex] = React.useState(0)
        const [tourSpot, setTourSpot] = React.useState(null)
        const [tourLayout, setTourLayout] = React.useState(null)
        const tourRootRef = React.useRef(null)
        const tourCardRef = React.useRef(null)

        /**
         * 当前模式：'ux' 体验检测 / 'func' 功能测试。
         *
         * 这不是「筛选项」，是切换整套主区内容。两种测试的数据、工具、
         * 渲染器全部分开 —— 体验有引擎测量记录，功能只有 AI 写的用例报告。
         * 用一个 state 而不是两个面板，是因为用户心智里这就是同一个工作台的
         * 两种用法；但两个模式之间**不共享任何列表**，见下面的渲染分支。
         */
        const [testMode, setTestMode] = React.useState('ux')

        /* 功能测试报告。和 runs / detail 完全独立的一组状态。 */
        const [funcReports, setFuncReports] = React.useState([])
        const [funcDetail, setFuncDetail] = React.useState(null)
        // 只留一个错误位：读列表失败、删报告失败都要说出来
        const [funcError, setFuncError] = React.useState(null)
        // 展开的用例 id：默认全收起，一条用例一个 case
        const [openCases, setOpenCases] = React.useState({})
        // Markdown 兜底正文默认收起
        const [openMarkdown, setOpenMarkdown] = React.useState(false)

        React.useEffect(() => {
          let alive = true
          const read = async () => {
            try {
              // 只读：这一步绝不建目录。
              const response = await fetch(`${API}/home`, { headers: { 'content-type': 'application/json' } })
              const payload = await response.json()
              if (alive && response.ok) setHome(payload)
            } catch { /* 读不到就不显示，工作台其它功能照常 */ }
          }
          read()
          return () => { alive = false }
        }, [])

        // 轻提示的计时器在组件卸掉时收掉，避免卸载后 setState
        React.useEffect(() => () => {
          if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
        }, [])

        const adoptHome = async () => {
          if (homeBusy) return
          setHomeBusy(true)
          setHomeError('')
          try {
            // 用户点了确认才落到磁盘。这是唯一会建目录的调用。
            const response = await fetch(`${API}/home`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              // 优先用用户亲自挑的位置；没挑就用界面上显示的那个。
              body: JSON.stringify({ path: homePicked || (home && home.path) })
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || `创建失败 ${response.status}`)
            setHome((current) => ({
              ...(current || {}), adopted: true, path: payload.path,
              workspaceId: payload.workspaceId, missing: false, needsConfirmation: false
            }))
            setHomePicked(null)
            // 通知对话兜底那边：文件夹已就绪，可以把它当默认工作区了。
            try {
              globalThis.dispatchEvent(new CustomEvent(HOME_READY_EVENT, {
                detail: { workspaceId: payload.workspaceId, path: payload.path }
              }))
            } catch { /* 非浏览器环境忽略 */ }
          } catch (reason) {
            setHomeError(String((reason && reason.message) || reason))
          } finally { setHomeBusy(false) }
        }

        /**
         * 自己选一个文件夹。
         *
         * 确认卡默认只给一个建议位置，但用户可能想把检测产物放到别的盘、
         * 别的目录。这里调宿主系统的目录选择器（和「添加项目」用的是同一条
         * 通路），选完就地更新卡片上显示的路径，再点「创建」才落地。
         */
        const pickHomeFolder = async () => {
          if (homeBusy) return
          setHomeError('')
          try {
            const picked = await pickDirectory()
            if (!picked) return            // 用户取消了，什么都不改
            setHomePicked(String(picked))
          } catch (reason) {
            setHomeError(String((reason && reason.message) || reason))
          }
        }

        /**
         * 左侧栏宽度。存 localStorage：调好的位置是个人偏好，
         * 换个页面又缩回去会让人烦。
         */
        const [sideWidth, setSideWidth] = React.useState(() => {
          const saved = Number(globalThis.localStorage?.getItem('uxw.sideWidth'))
          return Number.isFinite(saved) && saved >= MIN_SIDE && saved <= MAX_SIDE ? saved : 252
        })
        const [resizing, setResizing] = React.useState(false)
        // 左右两侧各用独立状态：它们各自高亮自己的分隔条，
        // 共用一个布尔值会出现「拖左边、右边也亮」的错觉。
        const [leftResizing, setLeftResizing] = React.useState(false)
        const [openFile, setOpenFile] = React.useState(null)
        const [fileError, setFileError] = React.useState(null)
        // 历史记录默认只露 10 条，剩下的折进「展开」。侧栏本来就窄，
        // 几十条记录会把项目和文件树顶到看不见的地方。
        const [runsExpanded, setRunsExpanded] = React.useState(false)

        /**
         * 右侧栏宽度（像素）。和左栏一样存 localStorage，
         * 因为它也是「调好一次就好」的个人偏好。
         */
        const [previewWidth, setPreviewWidth] = React.useState(() => {
          const saved = Number(globalThis.localStorage?.getItem('uxw.previewWidth'))
          return Number.isFinite(saved) && saved >= MIN_PREVIEW && saved <= MAX_PREVIEW ? saved : 460
        })
        React.useEffect(() => {
          try { globalThis.localStorage?.setItem('uxw.previewWidth', String(previewWidth)) } catch {}
        }, [previewWidth])

        /**
         * 拖右侧栏左缘改宽度。
         *
         * 宽度是从右边量的：鼠标往左移，栏变宽，所以用 startWidth - 位移。
         * 拖动期间把 iframe 的指针事件关掉（见 data-resizing），
         * 否则光标一进网页区，mousemove 就被 iframe 吃掉，看起来像卡住。
         */
        const startPreviewResize = React.useCallback((event) => {
          event.preventDefault()
          const startX = event.clientX
          const startWidth = previewWidth
          setResizing(true)
          document.body.style.cursor = 'col-resize'
          const move = (e) => {
            const next = Math.min(MAX_PREVIEW, Math.max(MIN_PREVIEW, startWidth - (e.clientX - startX)))
            setPreviewWidth(next)
          }
          const up = () => {
            setResizing(false)
            document.body.style.cursor = ''
            globalThis.removeEventListener('mousemove', move)
            globalThis.removeEventListener('mouseup', up)
          }
          globalThis.addEventListener('mousemove', move)
          globalThis.addEventListener('mouseup', up)
        }, [previewWidth])

        // 拖到哪儿就停在哪儿：把宽度记住，下次打开还是这个位置
        React.useEffect(() => {
          try { globalThis.localStorage?.setItem('uxw.sideWidth', String(sideWidth)) } catch {}
        }, [sideWidth])

        const active = instances.find((item) => item.id === activeId) || null
        const busy = Boolean(jobId)

        /**
         * 接上「别人发起的检测」。
         *
         * `busy` 的来源一直是 `jobId`，而它只在用户自己点按钮时被写上。
         * AI 调 ux_run_check 时 job 确实存在（服务端照常登记、会跑十几秒），
         * 但面板不知道 —— 于是画面静止、按钮还写着「开始检测」，用户会以为
         * 没在跑，甚至再点一次。
         *
         * 这里主动问「现在有谁在跑」，发现不是自己点的就接管：
         * 转圈、阶段文字、秒数、「停止」按钮全部复用现成的那一套。
         */
        React.useEffect(() => {
          if (jobId) return undefined
          let stopped = false
          let timer = null

          const watch = async () => {
            try {
              const data = await callApi('job-active')
              if (stopped) return
              const jobs = data.jobs || []
              // 只接管刚开跑不久的：一个已经跑了很久的僵尸任务不该在面板上
              // 突然弹出一块「检测中」，那比不显示更让人困惑。
              const fresh = jobs.find((item) => Date.now() - (item.startedAt || 0) < 10 * 60 * 1000)
              if (fresh) {
                // 把目标同步进界面，用户才知道「在测什么」
                if (fresh.url) setUrl(fresh.url)
                if (fresh.instanceId) {
                  setActiveId((current) => {
                    const known = (instancesRef.current || []).some((item) => item.id === fresh.instanceId)
                    return known ? fresh.instanceId : current
                  })
                }
                setJobId(fresh.id)
                return
              }
            } catch {
              // 读不到就算了，下一轮再试
            } finally {
              if (!stopped) timer = setTimeout(watch, 1500)
            }
          }

          watch()
          return () => { stopped = true; if (timer) clearTimeout(timer) }
        }, [jobId])

        const loadAll = React.useCallback(async () => {
          // 两个请求分开处理，不能用 Promise.all 绑在一起。
          //
          // health 会去探测 Playwright 和浏览器，慢且容易失败；早先用 Promise.all，
          // 只要健康探测抛错，连实例列表都不 setInstances —— 用户看到的就是
          // 「刚添加的项目过一会儿自己消失了」，而磁盘上其实一直好好的。
          try {
            const inst = await callApi('instances')
            setInstances(inst.instances || [])
            setActiveId((current) => {
              if (current && (inst.instances || []).some((item) => item.id === current)) return current
              return (inst.instances && inst.instances[0] && inst.instances[0].id) || null
            })
            setError(null)
          } catch (failure) {
            setError(String(failure.message || failure))
          } finally {
            // 健康信息只影响底部的「就绪 / 未找到浏览器」提示，失败就保持原样
            try {
              setMeta(await callApi('health'))
            } catch {
              // 探测不到不是错误，实例列表照常可用
            }
          }
        }, [])

        const loadRuns = React.useCallback(async () => {
          try {
            // 服务端上限是 50。侧栏默认只露 10 条，剩下的折在「展开」里，
            // 所以要一次多取一些 —— 取 15 条的话展开也看不到更多。
            const data = await callApi('runs?limit=50')
            setRuns(data.runs || [])
          } catch {
            // 历史读不到不影响主流程
          }
        }, [])

        /**
         * 结论只由 AI 写、在对话里读。
         *
         * 面板底部原本还有一块「结论」区（列表 + 展开看全文），已按要求去掉：
         * 结论属于对话，塞进面板会和检测结果争同一屏。这里保留服务端的
         * ux_save_report / ux_list_reports 与 /reports 路由 —— 数据仍在，
         * 只是不再在面板上画一份。
         *
         * 注意这是**体验检测**的结论。功能测试报告走下面的 loadFuncReports，
         * 两条链路一个字段都不共用。
         */

        /**
         * 读功能测试报告列表。
         *
         * 只在功能模式下才拉：用户在体验模式里根本看不到这些数据，
         * 白拉一次既浪费请求，也让「两个模式互不干扰」在行为上留下缝隙。
         */
        const loadFuncReports = React.useCallback(async () => {
          try {
            const data = await callApi('functional/reports?limit=50')
            setFuncReports(data.reports || [])
          } catch {
            // 读不到列表不影响主流程；主区会显示空态
          }
        }, [])

        const openFuncReport = React.useCallback(async (id) => {
          if (!id) return
          setFuncError(null)
          try {
            const data = await callApi(`functional/report?id=${encodeURIComponent(id)}`)
            if (data && data.report) {
              setFuncDetail(data.report)
              // 每次打开都收起：上一条展开的用例不该带到这一条上
              setOpenCases({})
              setOpenMarkdown(false)
            }
          } catch (failure) {
            setFuncError(String((failure && failure.message) || failure))
          }
        }, [])

        const removeFuncReport = React.useCallback(async (id) => {
          try {
            await callApi(`functional/reports?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
            if (funcDetail && funcDetail.id === id) setFuncDetail(null)
            await loadFuncReports()
          } catch (failure) {
            setFuncError(String((failure && failure.message) || failure))
          }
        }, [funcDetail, loadFuncReports])

        /*
         * 这里原本有一整套「发起功能测试」的投递逻辑：
         * 生成工单 → conversation.send → setDraft 降级 → 摊出原文。
         * 全删了。功能测试的入口就是右侧对话本身，用户直接说
         * 「测一下 xx 项目的支付流程」比点按钮发出的那段固定工单更准：
         * 工单只能拿「左栏选中的项目」当目标，猜错了你还不一定看得出来。
         * 少一条会随宿主 API 变坏的链路，少一次降级提示。
         */

        React.useEffect(() => { loadAll() }, [loadAll])
        React.useEffect(() => { loadRuns() }, [loadRuns])
        React.useEffect(() => { instancesRef.current = instances }, [instances])

        /**
         * 功能模式下的数据同步。
         *
         * AI 用 ux_save_function_report 写回报告时，面板不会收到任何事件 ——
         * 和体验检测的 ux_run_check 一样是「服务端悄悄多了一条」。所以这里也
         * 轮询，看到新的就选中它，让「AI 写完」和「用户点开」看到同一个界面。
         *
         * 只在功能模式里跑：体验模式下不碰这套数据。
         */
        React.useEffect(() => {
          if (testMode !== 'func') return undefined
          let stopped = false
          let timer = null

          const sync = async () => {
            try {
              const data = await callApi('functional/reports?limit=50')
              if (stopped) return
              const next = data.reports || []
              // 内容没变就别 setState：3 秒一次的轮询每回都写一遍会让整棵树重渲染，
              // 用户正在展开的用例会被打断（滚动位置和展开动画都跟着抖）。
              // 比 id + verdict：同一份报告被覆盖时 verdict 会变，左栏徽标得跟着改。
              setFuncReports((current) => {
                const sig = (list) => list.map((item) => `${item.id}:${item.verdict}`).join('|')
                return sig(current) === sig(next) ? current : next
              })
              const newest = next[0]
              if (!newest) return
              // 自动打开最新的那份，但只在两个条件下：
              //   1. 用户当前没选中任何报告（选中了就别抢画面）；
              //   2. 这份是新写回来的（10 分钟内）—— 打开面板就弹出上周的结论很烦。
              if (funcDetailRef.current) return
              const age = Date.now() - new Date(newest.createdAt || 0).getTime()
              if (!(age >= 0 && age < 10 * 60 * 1000)) return
              const full = await callApi(`functional/report?id=${encodeURIComponent(newest.id)}`)
              if (stopped || !full || !full.report) return
              if (funcDetailRef.current) return
              setFuncDetail(full.report)
              setOpenCases({})
              setOpenMarkdown(false)
            } catch {
              // 轮询失败不打扰用户，下一轮再试
            } finally {
              if (!stopped) timer = setTimeout(sync, 3000)
            }
          }

          sync()
          return () => { stopped = true; if (timer) clearTimeout(timer) }
        }, [testMode])

        // 切到功能模式时先拉一次列表，别等第一个轮询周期
        React.useEffect(() => {
          if (testMode === 'func') loadFuncReports()
        }, [testMode, loadFuncReports])

        React.useEffect(() => { detailRef.current = detail }, [detail])
        /**
         * 功能报告也留一个 ref 给轮询用。
         *
         * 不能直接闭包 funcDetail：轮询的 effect 只依赖 testMode，
         * 闭包里塞的是挂载那一刻的值，永远为 null，于是每次轮询都会把
         * 用户正在读的报告顶掉。ref 拿的是最新值。
         */
        const funcDetailRef = React.useRef(null)
        React.useEffect(() => { funcDetailRef.current = funcDetail }, [funcDetail])

        /**
         * 同步「AI 在工作台会话里发起的检测」。
         *
         * 用户说一句「帮我检测 https://…」时，检测由 ux_run_check 在后台跑完再
         * 写进运行记录 —— 这条路径不经过面板的 startRun，所以面板原本什么都不会
         * 变，用户只看到对话里的一段文字。
         *
         * 这里轮询运行记录，一旦出现比上次更晚的一条，就把它的网址和报告同步进
         * 工作台：网址回填到顶部输入框、左侧选中对应条目、主区直接展示这次报告。
         * 这样「AI 执行」和「手动点测试」看到的是同一个界面。
         */
        React.useEffect(() => {
          if (jobId) return undefined
          let stopped = false
          let timer = null

          const sync = async () => {
            try {
              // 项目列表也要跟着刷：AI 可能刚用 ux_start_project 起了服务，
              // 或者新登记了一个项目。面板不刷新的话，用户会觉得 AI 说的和
              // 界面上的不一致 —— 明明启动了，左侧还是「未启动」。
              try {
                const inst = await callApi('instances')
                if (stopped) return
                const nextInstances = inst.instances || []
                setInstances((current) => {
                  const changed = JSON.stringify(current) !== JSON.stringify(nextInstances)
                  return changed ? nextInstances : current
                })
                setActiveId((current) => {
                  if (current && nextInstances.some((item) => item.id === current)) return current
                  return (nextInstances[0] && nextInstances[0].id) || current
                })
              } catch {
                // 实例列表这次没读到，下面运行记录那步照旧
              }

              const data = await callApi('runs?limit=50')
              if (stopped) return
              const nextRuns = data.runs || []
              setRuns(nextRuns)
              const newest = nextRuns[0]
              if (!newest) return

              // 首次只认下当前最新一条，不把历史记录当成新结果弹出来；
              // 但如果这条刚刚跑完（工作台刚打开就看到 AI 结果），仍然展示出来。
              if (!seenRunRef.current) {
                seenRunRef.current = newest.id
                const age = Date.now() - new Date(newest.startedAt || 0).getTime()
                if (detailRef.current || !(age >= 0 && age < 5 * 60 * 1000)) return
              } else {
                if (newest.id === seenRunRef.current) return
                seenRunRef.current = newest.id
              }

              const full = detailRef.current && detailRef.current.id === newest.id
                ? detailRef.current
                : (await callApi(`run-detail?id=${encodeURIComponent(newest.id)}`)).run
              if (stopped || !full) return

              if (full.url) setUrl(full.url)
              if (full.instanceId) {
                setActiveId((current) => {
                  const known = (instancesRef.current || []).some((item) => item.id === full.instanceId)
                  return known ? full.instanceId : current
                })
              }
              if (!detailRef.current || detailRef.current.id !== full.id) setDetail(full)
              if (full.error) setError(tidyError(full.error))
            } catch {
              // 轮询失败不打扰用户，下一轮再试
            } finally {
              if (!stopped) timer = setTimeout(sync, 2500)
            }
          }

          sync()
          return () => { stopped = true; if (timer) clearTimeout(timer) }
        }, [jobId])

        React.useEffect(() => {
          const current = instances.find((item) => item.id === activeId)
          if (current) setUrl(current.url)
        }, [activeId, instances])

        // 放大态可以用 Esc 退出。挂在 window 上而不是面板上：
        // 放大时焦点多半在 iframe 里，面板自己收不到按键。
        React.useEffect(() => {
          if (!expanded) return undefined
          const onKey = (event) => {
            if (event.key === 'Escape') setExpanded(false)
          }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [expanded])

        React.useEffect(() => {
          if (!jobId) return undefined
          let stopped = false
          let timer = null

          const tick = async () => {
            try {
              const data = await callApi(`job?id=${encodeURIComponent(jobId)}`)
              if (stopped) return
              setElapsed(Math.round((data.elapsedMs || 0) / 100) / 10)
              if (data.status === 'running') {
                setProgress(data.progress || null)
                timer = setTimeout(tick, 600)
                return
              }
              setJobId(null)
              setProgress(null)
              if (data.status === 'done' && data.result) {
                setDetail(data.result)
                if (data.result.error) setError(tidyError(data.result.error))
                loadRuns()
              } else if (data.status === 'aborted') {
                // 停止后这里通常是 stopRun 自己已经处理过的路径（它清了 jobId）。
                // 但如果是从别处触发的停止（比如另一个窗口），也要把结果捡回来，
                // 不能安静地什么都不显示。停止不是错误，所以不设 error。
                if (data.result) setDetail(data.result)
                loadRuns()
              } else if (data.status === 'failed') {
                setError(tidyError(data.error || t('loadFailed')))
              }
            } catch (failure) {
              if (stopped) return
              setJobId(null)
              setProgress(null)
              setError(String(failure.message || failure))
            }
          }

          tick()
          return () => { stopped = true; if (timer) clearTimeout(timer) }
        }, [jobId, loadRuns, t])

        // explicit 是给导览用的：它刚 setUrl('builtin:demo')，但这次渲染的闭包里
        // url 还没更新 —— 不传进来会读到旧值，点「演示」跑的是上一次的网址。
        const startRun = async (explicit) => {
          if (busy) return
          const target = String(typeof explicit === 'string' ? explicit : url).trim()
          if (!target) {
            setError(t('needUrl'))
            return
          }
          setError(null)
          setDetail(null)
          setProgress(null)
          setElapsed(0)
          try {
            // 网址不是项目：直接开跑，不往「项目」栏登记任何东西。
            // 结果只落进历史，下次想再看就从历史里点开。
            if (!active || target !== active.url) {
              const started = await callApi('run', { body: { url: target } })
              setJobId(started.jobId)
              return
            }
            const started = await callApi('run', { body: { instanceId: active.id } })
            setJobId(started.jobId)
          } catch (failure) {
            setError(String(failure.message || failure))
          }
        }

        /* 「添加网址」这个入口已经撤掉：网址不是项目，只进历史记录。 */

        /**
         * 叫停正在跑的检测。
         *
         * 两件事要分开：先让按钮立刻回到可用状态（用户点了就得有反应），
         * 再等服务端把浏览器那边收掉。所以这里不等后端返回就清 jobId ——
         * 否则「点了停止，按钮还转了两秒」会让人以为没点上，又点一次。
         */
        const stopRun = async () => {
          const id = jobId
          if (!id || stopping) return
          setStopping(true)
          setJobId(null)
          setProgress(null)
          try {
            await callApi('job-stop', { body: { id } })
            setError(null)
            // 把已经跑出来的部分拉回来显示，而不是丢掉。
            // 停止不等于「什么都没测到」，已经发现的缺陷仍然有价值。
            try {
              const data = await callApi(`job?id=${encodeURIComponent(id)}`)
              if (data && data.result) setDetail(data.result)
            } catch {
              // 结果还没落盘就算了，不打扰用户
            }
            loadRuns()
          } catch (failure) {
            setError(String(failure.message || failure))
          } finally {
            setStopping(false)
          }
        }

        /**
         * 弹出宿主系统的文件夹选择器。
         *
         * 桌面壳暴露了 __DSH_DIRECTORY_PICKER__；没有它时退回工作区服务的
         * pickDirectory。两条路都拿不到就明确说清楚 —— 猜路径是最糟的兜底。
         */
        const pickDirectory = async () => {
          const desktop = globalThis.__DSH_DIRECTORY_PICKER__
          if (desktop && typeof desktop.pick === 'function') return await desktop.pick()
          const workspace = globalThis.__DSH_WORKSPACE__
          if (workspace && typeof workspace.pickDirectory === 'function') return await workspace.pickDirectory()
          throw new Error('当前环境不支持选择文件夹，请手动填写项目路径。')
        }

        /**
         * 添加项目文件夹：选目录 → 登记成实例 → 立刻把它的页面跑起来。
         *
         * 用户体验上就是「点一下，右边出现我的网页」，中间的起服务过程只显示一个
         * 启动中的状态，不让他填端口、选脚本。
         */
        const addProjectFolder = async () => {
          if (picking) return
          setPicking(true)
          setError(null)
          let created = null
          try {
            const picked = await pickDirectory()
            if (!picked) return

            const folderName = String(picked).split(/[\\/]/).filter(Boolean).pop() || '本地项目'
            const data = await callApi('instances', {
              body: { action: 'create', instance: { name: folderName, url: '', projectPath: picked } }
            })
            created = data.instance
            setInstances(data.instances || [])
            setActiveId(created.id)
            // 刚添加的项目当然要展开：用户加一个文件夹就是想看里面有什么
            setExpandedProject(true)
            setOpenFile(null)
          } catch (failure) {
            setError(String(failure.message || failure))
            return
          } finally {
            // 登记这一步结束就放开按钮，后面的「起服务」不该让加号一直转
            setPicking(false)
          }

          // 起服务是另一件事：它失败不代表项目没加上。
          // 早先这两步同在一个 try 里，起服务一报错用户就只看到红字，
          // 以为项目没添加成功；其实实例已经在磁盘上了，只是没跑起来。
          try {
            const started = await callApi('project-server', {
              body: { path: created.projectPath, action: 'start' }
            })
            if (started && started.url) {
              setChatOpen(false)
              const updated = await callApi('instances', {
                body: {
                  action: 'update',
                  id: created.id,
                  instance: { name: created.name, projectPath: created.projectPath, url: started.url, devServer: started }
                }
              })
              setInstances(updated.instances || [])
              setPreviewState({ status: 'ready', url: started.url, theme: null })
            }
          } catch (failure) {
            // 项目留着，只是没跑起来。把原因说出来，并提示可以稍后手动重试。
            setError(`项目已添加，但本地服务没能启动：${String(failure.message || failure)}`)
          }
        }

        const removeInstance = async () => {
          const target = (modal && modal.item) || active
          if (!target) return
          try {
            const data = await callApi('instances', { body: { action: 'delete', id: target.id } })
            setInstances(data.instances || [])
            if (target.id === activeId) {
              setDetail(null)
              setActiveId((data.instances && data.instances[0] && data.instances[0].id) || null)
              // 换到了另一个项目，它要默认展开，否则删完看着像什么都没了
              setExpandedProject(true)
            }
            setModal(null)
          } catch (failure) {
            setError(String(failure.message || failure))
            setModal(null)
          }
        }

        const deleteRun = async (runId) => {
          try {
            await callApi(`run?id=${encodeURIComponent(runId)}`, { method: 'DELETE' })
            setRuns((current) => current.filter((item) => item.id !== runId))
            setDetail((current) => (current && current.id === runId ? null : current))
          } catch (failure) {
            setError(String(failure.message || failure))
          }
        }

        /**
         * 清空全部历史。
         *
         * 一条条发 DELETE 会很慢（60 条就是 60 次往返），而且中途失败会留下
         * 删了一半的列表。服务端有专门的 runs-clear 接口，一次搞定，
         * 这里拿返回值直接替换本地状态。
         */
        const clearRuns = async () => {
          try {
            // 返回值只用来看有没有失败，不弹提示：清空后列表空了本身就是最直接的反馈
            await callApi('runs-clear', { method: 'POST' })
            setRuns([])
            setDetail(null)
          } catch (failure) {
            setError(String(failure.message || failure))
          }
        }

        /**
         * 打开一条历史记录；再点同一条就收起，回到空白主区。
         *
         * 为什么要有「收起」：历史列表是常驻的，用户点开一条看报告后，
         * 想回到「什么都没选」的状态只能去点别的记录 —— 等于强迫他在
         * 记录之间来回跳。再点一次同一条收起，是列表类界面（手风琴）
         * 最省心的约定。
         *
         * 收起时要一并清掉「跟着这条记录走」的三样东西，否则会留下
         * 指向已看不见的报告的残影：
         *   - 选中的缺陷（它的描框画在预览上）
         *   - 网页预览（还停在那个页面的那个主题/视口）
         *   - 输入框里的网址（那是这条记录的网址，不是用户刚输的）
         */
        /**
         * 切换顶部「网页展示」开关。
         *
         * 三种状态要分清，否则会出现「点了没反应」：
         *   1. 右栏正开着代码文件 —— 用户点「网页展示」是想回到页面，不是要关栏；
         *   2. 右栏正常开着 —— 点一下收起；
         *   3. 右栏已经收起 —— 点一下打开。
         * 收起（以及从文件切回页面）时必须退出放大态：放大态是「网页占满主区」，
         * 网页都收起来了还留在放大态，主区会变成一个只剩问题栏的怪布局。
         */
        const togglePreview = () => {
          setChatOpen(false)
          setExpanded(false)
          if (openFile) {
            setOpenFile(null)
            setPreviewOpen(true)
            return
          }
          setPreviewOpen((current) => !current)
        }

        /**
         * 切换顶部「AI 对话」开关。
         *
         * 对话栏从右侧挤进来，和「网页放大」是两套占满空间的布局，
         * 同时开着会互相盖住。所以打开对话一律先退出放大 ——
         * 用户点了对话，就该看到对话和完整的报告，而不是一个还停在
         * 放大态的网页在下面顶着。
         */
        const toggleChat = () => {
          setExpanded(false)
          setChatOpen((current) => {
            const next = !current
            // 对话和网页展示共用右栏位置，互斥
            if (next) setPreviewOpen(false)
            return next
          })
        }

        /**
         * 折叠一条记录，回到空白主区。
         *
         * 放大态是记录的一种展示方式，记录没了放大态就没有意义；
         * 不一起清掉，退出后主区会留着放大时的布局（没有网页、只剩问题栏）。
         */
        const collapseDetail = () => {
          setDetail(null)
          setSelectedIssue(null)
          setPreviewSession(null)
          setPreviewFrame(null)
          // 回到 idle 而不是 null：BuiltinBrowser 直接读 state.status，
          // 传 null 会在渲染时炸掉。
          setPreviewState({ status: 'idle', url: '', theme: 'light' })
          setExpanded(false)
          setPreviewOpen(false)
          // 收起是「回到什么都没选」，输入框里那条记录的网址和轻提示
          // 都不该留着 —— 否则看起来还开着。
          setUrl('')
          setNotice(null)
          setError(null)
        }

        const openRun = async (runId) => {
          // 已经打开的正是这条：收起。
          if (detail && detail.id === runId) {
            collapseDetail()
            return
          }
          try {
            const data = await callApi(`run-detail?id=${encodeURIComponent(runId)}`)
            setDetail(data.run)
            setSelectedIssue(null)
            if (data.run && data.run.url) setUrl(data.run.url)
            // 点一条记录就是要看那条记录：报告和网页一起出现。
            // 早先这里只换 detail，右栏若正处于收起（或被对话顶掉）就一直是收起的，
            // 用户明明选中了记录，点「网页展示」反而像点开了一块空白。
            // 记录变了也一定要把放大的旧布局退掉，那是上一条记录的展示方式。
            setPreviewOpen(true)
            setChatOpen(false)
            setExpanded(false)
            // 换了记录，画面归属立刻作废：即使两条记录 id 相同走到这里，
            // 也必须重新加载，不能沿用上一条的画面状态。
            previewedRunRef.current = null
          } catch (failure) {
            setError(String(failure.message || failure))
          }
        }

        /**
         * 打开网页画面。
         *
         * 用报告里第一个组合的视口与主题：用户点开的是一条「桌面 · 暗色」的记录，
         * 侧栏就该是那个环境下的页面，而不是默认亮色桌面 —— 否则缺陷对不上。
         */
        const showPreview = React.useCallback(async (run) => {
          if (!run || !run.url) {
            setPreviewState({ status: 'failed', url: '', theme: 'light', reason: '这条记录没有可打开的网址。' })
            setPreviewFrame(null)
            return
          }
          const combo = (run.combinations || [])[0] || {}
          const viewport = combo.viewport
            || (run.plan && run.plan.viewports && run.plan.viewports[0])
            || { width: 1440, height: 900 }
          const theme = combo.theme || (run.plan && run.plan.themes && run.plan.themes[0]) || 'light'
          const seq = previewSeqRef.current + 1
          previewSeqRef.current = seq

          // 本机地址不用再起截图会话：内置浏览器直接加载它，更真也更快。
          if (liveSrcOf(run.url)) {
            // 旧的截图会话要清掉，否则「定位」会拿着一个对不上当前页面的 session。
            previewSessionRef.current = null
            setPreviewSession(null)
            setPreviewFrame(null)
            setPreviewState({ status: 'ready', url: run.url, theme, reason: '' })
            return
          }

          setPreviewState({ status: 'opening', url: run.url, theme, reason: '' })
          setPreviewFrame(null)
          try {
            const opened = await callApi('preview', {
              body: { url: run.url, theme, viewport: { width: viewport.width, height: viewport.height } }
            })
            if (previewSeqRef.current !== seq) return
            if (!opened.ok || !opened.sessionId) throw new Error('预览会话没起来。')
            previewSessionRef.current = opened.sessionId
            setPreviewSession(opened.sessionId)
            const frame = await callApi(`preview-frame?session=${encodeURIComponent(opened.sessionId)}`)
            if (previewSeqRef.current !== seq) return
            setPreviewFrame(frame)
            setPreviewState({ status: 'ready', url: frame.url || run.url, theme, reason: '' })
          } catch (failure) {
            if (previewSeqRef.current !== seq) return
            setPreviewState({ status: 'failed', url: run.url, theme, reason: tidyError(failure.message || failure) })
          }
        }, [])

        const retryPreview = () => {
          if (detail) { showPreview(detail); return }
          // 功能模式下没有「当前记录」，重试就是重开地址栏里那个地址。
          if (previewState.url) navigatePreview(previewState.url)
        }

        /**
         * 在网页展示里就地换地址。
         *
         * 和 showPreview 的区别只在来源：那个是「打开一条检测记录」（要沿用记录
         * 的视口/主题，缺陷坐标才对得上），这个是「用户想看另一个页面」——
         * 没有记录，就按当前主题、默认桌面视口打开。
         *
         * 两种模式都要用：体验模式下想对比同项目的另一个页面，功能模式下
         * 干脆没有记录可点，网页展示全靠这个入口。
         */
        const navigatePreview = React.useCallback(async (raw) => {
          let target = String(raw || '').trim()
          if (!target) return
          // 用户习惯直接打 127.0.0.1:5173 或 localhost:3000，补上协议。
          //
          // 判据不能写成「看起来像有协议就放行」：localhost:3000 里的
          // localhost 会被当成 scheme，于是原样丢给服务端、直接打不开 ——
          // 而本地项目地址里恰恰最常见的就是这一种写法。所以只认真正
          // 能用的几种前缀，其余一律补 http://（builtin:demo 是内置演示场的
          // 特殊地址，不是网址，原样保留）。
          if (target !== 'builtin:demo' && !/^(https?|file):\/\//i.test(target)) {
            target = `http://${target}`
          }

          const seq = previewSeqRef.current + 1
          previewSeqRef.current = seq
          const theme = previewState.theme || 'light'

          if (liveSrcOf(target)) {
            previewSessionRef.current = null
            setPreviewSession(null)
            setPreviewFrame(null)
            setPreviewState({ status: 'ready', url: target, theme, reason: '' })
            return
          }

          setPreviewState({ status: 'opening', url: target, theme, reason: '' })
          setPreviewFrame(null)
          try {
            const opened = await callApi('preview', {
              body: { url: target, theme, viewport: { width: 1440, height: 900 } }
            })
            if (previewSeqRef.current !== seq) return
            if (!opened.ok || !opened.sessionId) throw new Error('预览会话没起来。')
            previewSessionRef.current = opened.sessionId
            setPreviewSession(opened.sessionId)
            const frame = await callApi(`preview-frame?session=${encodeURIComponent(opened.sessionId)}`)
            if (previewSeqRef.current !== seq) return
            setPreviewFrame(frame)
            setPreviewState({ status: 'ready', url: frame.url || target, theme, reason: '' })
          } catch (failure) {
            if (previewSeqRef.current !== seq) return
            setPreviewState({ status: 'failed', url: target, theme, reason: tidyError(failure.message || failure) })
          }
        }, [previewState.theme])

        /**
         * 功能模式下，网页展示默认摆上当前项目的页面。
         *
         * 这个模式没有检测记录可点，网页区原本会一直是空白 —— 用户刚打开
         * 「网页展示」，看到的却是「选中一条检测记录」，而这里根本没有记录。
         * 所以有项目、有地址、画面还空着时，直接把项目页面放进去。
         *
         * 也不能粗暴地「有地址就不动」：用户在左侧点另一个项目，网页区还停在
         * 上一个项目的页面上，那才是真的看错对象。所以记住「这个地址是哪个项目
         * 自动摆上去的」—— 换项目时，只有当前画面仍是上一个项目的自动填充才换页；
         * 用户自己输入过的地址（比如详情页）不覆盖，那是他特意看的。
         */
        const autoFilledRef = React.useRef({ projectId: null, url: '' })
        React.useEffect(() => {
          if (testMode !== 'func') return
          const current = instances.find((item) => item.id === activeId)
          if (!current || !current.url) return
          const filled = autoFilledRef.current
          // 画面里已经有地址、且不是本项目的自动填充 → 用户在别处看过，不打扰
          if (previewState.url && previewState.url !== filled.url) return
          if (previewState.url === current.url) return
          autoFilledRef.current = { projectId: current.id, url: current.url }
          navigatePreview(current.url)
        }, [testMode, activeId, instances, previewState.url, navigatePreview])

        /**
         * 在文件树里点一个文件，就把它读出来显示。
         *
         * 每次点击都带一个序号：用户手快连点两个文件时，先发的请求可能后回来，
         * 不校验序号就会出现「点 A 显示 B」。
         */
        const fileSeqRef = React.useRef(0)

        /**
         * 点项目：展开 / 折叠，和文件夹一样。
         *
         * 三种情况：
         *   - 点别的项目：切过去并展开（一次点击就到位，不用点两下）
         *   - 点当前项目且已展开：折叠
         *   - 点当前项目且已折叠：再展开
         * 折叠时不清 activeId —— 报告还该留在主区，只是文件树收起来了。
         */
        const toggleProject = React.useCallback((id) => {
          if (id !== activeId) {
            setActiveId(id)
            setExpandedProject(true)
            setDetail(null)
            setOpenFile(null)
            setFileError(null)
            return
          }
          setExpandedProject((open) => !open)
        }, [activeId])

        const openProjectFile = React.useCallback(async (path) => {
          if (!active || !active.projectPath) return
          // 点文件一定要看到内容：右栏如果被收起来了，这里顺手打开它，
          // 否则点了没反应，用户会以为文件打不开。
          setPreviewOpen(true)
          setChatOpen(false)
          // 放大态是「网页占满主区」的布局，切到代码就该退出，
          // 否则代码被塞进一个为网页准备的满屏框里。
          setExpanded(false)
          const seq = fileSeqRef.current + 1
          fileSeqRef.current = seq
          setFileError(null)
          setOpenFile({ path, name: path.split('/').pop(), text: '', size: 0, binary: false, loading: true })
          try {
            const file = await callApi(`file?instanceId=${encodeURIComponent(active.id)}&path=${encodeURIComponent(path)}`)
            if (fileSeqRef.current !== seq) return
            setOpenFile(file)
          } catch (failure) {
            if (fileSeqRef.current !== seq) return
            const message = String(failure.message || failure)
            setOpenFile(null)
            setFileError(message)
          }
        }, [active])

        // 换项目就把打开的文件收掉，否则会显示上一个项目的文件内容
        React.useEffect(() => {
          setOpenFile(null)
          setFileError(null)
        }, [activeId])

        /**
         * 拖动左栏右缘来改宽度。
         *
         * 用 window 上的 mousemove 而不是元素上的：鼠标划得比分隔条快时，
         * 光标会离开那个 9px 宽的命中区，只挂元素上就会「拖到一半卡住」。
         */
        const startResize = React.useCallback((event) => {
          event.preventDefault()
          const startX = event.clientX
          const startWidth = sideWidth
          // 左栏用独立的高亮状态，和右栏互不影响
          setLeftResizing(true)
          document.body.style.cursor = 'col-resize'
          const move = (e) => {
            const next = Math.min(MAX_SIDE, Math.max(MIN_SIDE, startWidth + (e.clientX - startX)))
            setSideWidth(next)
          }
          const up = () => {
            setLeftResizing(false)
            document.body.style.cursor = ''
            globalThis.removeEventListener('mousemove', move)
            globalThis.removeEventListener('mouseup', up)
          }
          globalThis.addEventListener('mousemove', move)
          globalThis.addEventListener('mouseup', up)
        }, [sideWidth])

        /**
         * 用户在左侧栏点开会话 → 自动把「AI 对话」栏打开。
         *
         * 为什么不能只靠 service：宿主暴露的 currentSession() 是从会话列表里
         * 算出来的「当前会话」，它只在列表快照变化时才有新值。用户把对话栏
         * 收起后，再点一次**同一条**会话，宿主内部照常执行了一次「打开」，
         * 但 currentSession() 的返回值没变 —— 面板收不到任何信号，看起来就是
         * 「点左侧没反应」。
         *
         * 真正的信号源是 uiWorkspace 的 selection store：宿主每次打开会话都会
         * selection.set({ sessionId }) 写一个**新对象**（即使是同一条会话也照写），
         * 订阅必然被触发。所以这里订阅它，而不是轮询 currentSession()。
         *
         * 只认「换成了一条会话」：宿主在恢复选中、以及我们自己点开记录时也会
         * 写这个 store，那种情况下不该抢用户刚做的开关动作。用 ref 记住上次
         * 处理过的会话 id 来区分。
         */
        React.useEffect(() => {
          const ctx = service && service.ctx
          const ui = ctx && ctx.uiWorkspace
          const selection = ui && ui.selection
          if (!selection || typeof selection.subscribe !== 'function'
            || typeof selection.getSnapshot !== 'function') return undefined
          const read = () => {
            const state = selection.getSnapshot()
            if (!state || !state.sessionId) return
            // 去重看的是「快照对象」而不是会话 id。宿主每打开一次会话就写一个
            // 新对象，即使点的是同一条会话也照写 —— 这正是「收起对话后再点
            // 同一条会话应该有反应」的判据。按 id 去重会把这种情况吞掉。
            if (openedSessionRef.current === state) return
            openedSessionRef.current = state
            // 右侧栏是「网页展示 / AI 对话」二选一的固定位置：
            // 用户点了会话，想看的就是对话；网页展示让位。
            setPreviewOpen(false)
            setChatOpen(true)
            // 对话栏和放大态都是占满主区的布局，不能同时成立。
            setExpanded(false)
          }
          // 首次挂载只记录当前会话，不主动弹对话栏 ——
          // 打开工作台就自己弹出对话，会盖掉用户上次留下的布局。
          openedSessionRef.current = selection.getSnapshot()
          const stop = selection.subscribe(read)
          return () => { if (typeof stop === 'function') stop() }
        }, [service])

        /**
         * 报告变了就跟着换画面。
         *
         * 手动点「开始检测」、点历史记录、以及 AI 在工作台里发起的检测，最后都
         * 落到 detail 上 —— 统一在这里开预览，三条路径就不会各自漏一步。
         *
         * 去重条件里必须带上画面状态：收起一条记录时画面会被清成 idle，
         * 而 previewedRunRef 里还留着那条记录的 id。如果只看 id，再点开同一条
         * 就会被判成「已经画过了」而跳过加载 —— 面板开了、网页区却停在空白态。
         * 这正是「选中了记录，点网页展示却是空白」的来源。
         */
        React.useEffect(() => {
          if (!detail || !detail.url) {
            // 记录没了，画面归属也一起作废，下次点开同一条要重新加载
            previewedRunRef.current = null
            setExpanded(false)
            return
          }
          const painted = previewedRunRef.current === detail.id && previewState.status !== 'idle'
          if (painted) return
          previewedRunRef.current = detail.id
          setSelectedIssue(null)
          // 三条路径（手动开跑、点历史、AI 跑完自动接管）都落到这里，
          // 那就都在这里把右栏打开 —— 否则 AI 跑完只换了报告，
          // 用户还得自己再点一次「网页展示」才看得到页面。
          // 放大态是上一条记录留下的展示方式，换记录就该退出。
          setPreviewOpen(true)
          setExpanded(false)
          showPreview(detail)
        }, [detail, showPreview, previewState.status])

        /**
         * 把 iframe 里的元素滚到可视区正中间，只动 iframe 自己的滚动。
         *
         * 为什么是居中而不是「滚到能看见为止」：最小滚动会让元素停在视口
         * 上沿或下沿 —— 框出来的是紧贴边缘的一条，用户的视线和鼠标都还在
         * 屏幕中央，要自己再把页面往下拨一次。缺陷记录点开就是为了看那个
         * 元素，直接推到正中才符合预期。
         *
         * 这里不能用 element.scrollIntoView()。它会把滚动请求一路传给祖先
         * 浏览上下文：iframe 滚到目标的同时，宿主页面（DSH 工作台）也会被
         * 横向平移几百像素 —— 左侧栏、顶栏按钮全被推出屏幕左边，右边只剩
         * 一片白，用户连「退出工作台」都点不到。iframe 里没有横向可滚空间
         * 时这个泄漏最明显，因为滚不动的那部分被转嫁给父页面。
         *
         * 所以改成：从元素往上逐个滚动容器（含 iframe 文档本身）对准它，
         * 走到 iframe 文档为止，不跨出这个浏览上下文。
         */
        const revealInFrame = (win, target) => {
          const doc = win.document
          const se = doc.scrollingElement || doc.documentElement
          const MARGIN = 12

          // 让某个滚动容器（或窗口）把 target 挪到正中；已经居中返回 false。
          // 每次都现算 boundingClientRect：上一层滚过之后坐标已经变了。
          const nudge = (container) => {
            const asWindow = container === win
            const box = target.getBoundingClientRect()
            const base = asWindow ? { top: 0, left: 0 } : container.getBoundingClientRect()
            const viewW = asWindow ? (se.clientWidth || win.innerWidth || 0) : container.clientWidth
            const viewH = asWindow ? (se.clientHeight || win.innerHeight || 0) : container.clientHeight
            const left = box.left - base.left
            const right = box.right - base.left
            const top = box.top - base.top
            const bottom = box.bottom - base.top

            // 横向：能整块放进视口就居中；比视口还宽就贴齐左边，
            // 否则居中会把元素的头尾同时切掉，反而看不出问题在哪。
            let dx = 0
            if (box.width > viewW - MARGIN * 2) dx = left - MARGIN
            else dx = (left + right) / 2 - viewW / 2
            // 纵向同理：比视口还高时贴齐上边，让用户从元素开头看起
            let dy = 0
            if (box.height > viewH - MARGIN * 2) dy = top - MARGIN
            else dy = (top + bottom) / 2 - viewH / 2
            // 亚像素误差不值得触发一次滚动
            if (Math.abs(dx) < 1) dx = 0
            if (Math.abs(dy) < 1) dy = 0
            if (!dx && !dy) return false

            if (asWindow) {
              const currentX = win.scrollX || se.scrollLeft || 0
              const currentY = win.scrollY || se.scrollTop || 0
              const maxX = Math.max(0, se.scrollWidth - (se.clientWidth || viewW))
              const maxY = Math.max(0, se.scrollHeight - (se.clientHeight || viewH))
              // 先夹到可滚范围内，再看是否真有位移。
              // 少了这一步，元素已经贴在上/下（或左/右）边界、只想再往外挪时，
              // 算出的 dx/dy 非零、夹完却是原地不动，于是白跑一次 scrollTo；
              // 内层容器还会因为反复赋值打断它自己的平滑滚动。
              const nextX = Math.max(0, Math.min(currentX + dx, maxX))
              const nextY = Math.max(0, Math.min(currentY + dy, maxY))
              if (Math.abs(nextX - currentX) < 1 && Math.abs(nextY - currentY) < 1) return false
              win.scrollTo({ left: nextX, top: nextY, behavior: 'smooth' })
            } else {
              // 内层容器（弹层、列表）用直接赋值，避免和祖先的平滑滚动互相打架
              const elMaxX = Math.max(0, container.scrollWidth - container.clientWidth)
              const elMaxY = Math.max(0, container.scrollHeight - container.clientHeight)
              const nextX = Math.max(0, Math.min(container.scrollLeft + dx, elMaxX))
              const nextY = Math.max(0, Math.min(container.scrollTop + dy, elMaxY))
              if (Math.abs(nextX - container.scrollLeft) < 1 && Math.abs(nextY - container.scrollTop) < 1) return false
              container.scrollLeft = nextX
              container.scrollTop = nextY
            }
            return true
          }

          // 由内向外：先把最近的滚动容器对准，再逐层轮到文档
          const chain = []
          let node = target.parentElement
          while (node && node !== doc.documentElement && node !== doc.body) {
            chain.push(node)
            node = node.parentElement
          }
          for (const container of chain) {
            const style = win.getComputedStyle(container)
            const scrollsY = /(auto|scroll|overlay)/.test(style.overflowY) && container.scrollHeight > container.clientHeight + 1
            const scrollsX = /(auto|scroll|overlay)/.test(style.overflowX) && container.scrollWidth > container.clientWidth + 1
            if (scrollsX || scrollsY) nudge(container)
          }
          // 最后一步只滚 iframe 文档，和宿主的滚动彻底隔开
          nudge(win)
        }

        /**
         * 在内置浏览器里定位一条缺陷：滚到元素、画一圈高亮。
         *
         * 能直接操作 iframe 的 DOM，是因为页面经 /live 同源代理加载 ——
         * 同源之后不需要 postMessage，也不需要往页面里注入脚本。
         * 高亮是一层临时浮层，几秒后自己淡出；不改动页面本身的结构或样式。
         */
        const locateInFrame = (bucket) => {
          const el = frameElRef.current
          if (!el) return false
          const win = el.contentWindow
          if (!win) return false
          const selector = bucket.target || ''
          const rect = bucket.rect || null
          try {
            // 同源时可以直接操作；跨域会抛错，由调用方退回服务端截图方案。
            const doc = win.document
            const previous = doc.getElementById('__dsh_ux_locate__')
            if (previous) previous.remove()

            let target = null
            if (selector) {
              try { target = doc.querySelector(selector) } catch { target = null }
            }
            // 选择器可能因为动态类名变化而失效，此时退化成「按坐标找元素」
            if (!target && rect) {
              target = doc.elementFromPoint(
                Math.max(1, Math.min(win.innerWidth - 1, rect.x + rect.w / 2)),
                Math.max(1, Math.min(win.innerHeight - 1, rect.y + rect.h / 2))
              )
            }
            if (!target) return false

            /**
             * 兜底闸门：定位期间把宿主窗口的水平滚动钉在 0。
             *
             * revealInFrame 已经只在 iframe 里滚，正常碰不到宿主。但只要有
             * 任何一条路径把滚动请求漏到父级（浏览器实现差异、页面里别的
             * 脚本），宿主就会横向平移：左侧栏和顶栏按钮被推出屏幕，右边空
             * 出一大片，用户连「退出工作台」都点不到。所以这里监听一下，谁
             * 把宿主滚偏就立刻按回去。平滑滚动跑完就撤掉，不干扰用户自己滚。
             */
            const hostSe = document.scrollingElement || document.documentElement
            const pinHostScroll = () => {
              if (hostSe && hostSe.scrollLeft !== 0) hostSe.scrollLeft = 0
              if (document.body && document.body.scrollLeft !== 0) document.body.scrollLeft = 0
            }
            pinHostScroll()
            window.addEventListener('scroll', pinHostScroll, { passive: true })

            // 只滚 iframe 内部：绝不调用 scrollIntoView，它会把宿主页面一起推偏
            revealInFrame(win, target)
            setTimeout(() => {
              pinHostScroll()
              window.removeEventListener('scroll', pinHostScroll)
            }, 1400)

            const box = doc.createElement('div')
            box.id = '__dsh_ux_locate__'
            const r = target.getBoundingClientRect()
            box.style.cssText = [
              'position:fixed',
              'pointer-events:none',
              'z-index:2147483000',
              'box-sizing:border-box',
              'border-radius:5px',
              'border:2px solid ' + (bucket.severity === 'error' ? '#d9534f' : '#c8860d'),
              'background:' + (bucket.severity === 'error' ? 'rgba(217,83,79,.14)' : 'rgba(200,134,13,.14)'),
              'box-shadow:0 0 0 3px rgba(255,255,255,.55)',
              'transition:opacity .3s ease',
              `left:${Math.round(r.left)}px`,
              `top:${Math.round(r.top)}px`,
              `width:${Math.round(r.width)}px`,
              `height:${Math.round(r.height)}px`
            ].join(';')
            doc.body.appendChild(box)

            // 滚动是平滑的，位置会在一秒多内持续变化，跟着重算；
            // 位置稳定后提前收工，别让空转的 rAF 一直挂着。
            let ticks = 0
            let lastLeft = null
            let lastTop = null
            let steady = 0
            const follow = () => {
              const next = target.getBoundingClientRect()
              box.style.left = `${Math.round(next.left)}px`
              box.style.top = `${Math.round(next.top)}px`
              box.style.width = `${Math.round(next.width)}px`
              box.style.height = `${Math.round(next.height)}px`
              steady = (Math.round(next.left) === lastLeft && Math.round(next.top) === lastTop) ? steady + 1 : 0
              lastLeft = Math.round(next.left)
              lastTop = Math.round(next.top)
              if (++ticks < 110 && steady < 8) win.requestAnimationFrame(follow)
            }
            win.requestAnimationFrame(follow)

            // 3.2 秒后自动淡出，避免高亮框一直挂在那儿像页面 bug
            setTimeout(() => {
              box.style.opacity = '0'
              setTimeout(() => box.remove(), 400)
            }, 3200)
            return true
          } catch {
            return false
          }
        }

        /**
         * 点一条缺陷 → 让预览滚到对应元素、框出来。
         *
         * 有内置浏览器时优先在 iframe 里直接滚（即时、可继续操作）；
         * 内嵌不了（线上站点被 X-Frame-Options 拒绝）才退回服务端截图那条路。
         */
        const locateIssue = async (bucket) => {
          if (!bucket) return
          setSelectedIssue(bucket.key)

          // 没有坐标的条目：给一句解释，不要静默返回。
          // 静默的后果就是用户点了几次都不动，以为是面板卡了。
          // 用轻提示而不是 error：error 会把报告整块换掉。
          const notify = (text) => {
            setNotice(text)
            if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
            noticeTimerRef.current = setTimeout(() => setNotice(null), 6000)
          }

          if (!bucket.rect) {
            notify(`${bucket.title}：这条没有元素坐标，无法在页面上框出来。`
              + (bucket.target === 'html / body' ? '整页横向溢出属于布局层面的问题，看「修复建议」里的排查方向。' : ''))
            return
          }

          if (locateInFrame(bucket)) return

          const session = previewSessionRef.current
          if (!session) {
            notify('右侧网页预览还没有打开，先点右上角的「预览」再点这条缺陷。')
            return
          }
          setLocating(true)
          const rect = bucket.rect
          const markers = (detail && detail.issues ? detail.issues : [])
            .filter((item) => item.rect)
            .slice(0, 60)
            .map((item) => ({
              key: `${item.kind}::${item.target}`,
              color: item.severity === 'error' ? '#d9534f' : '#c8860d',
              rect: item.rect
            }))
          try {
            const focused = await callApi('preview-focus', {
              body: {
                session,
                selector: bucket.target || '',
                rect,
                markers,
                activeKey: bucket.key,
                tag: bucket.title || ''
              }
            })
            if (focused && focused.image) setPreviewFrame(focused)
          } catch (failure) {
            setError(String(failure.message || failure))
          } finally {
            setLocating(false)
          }
        }

        /* -------------------------------------------------------- 渲染 -- */

        /**
         * 「项目」栏里该出现的东西。
         *
         * 只有项目文件夹（以及内置演示场）。网址不是项目 —— 它即测即走，
         * 结果留在历史里。旧版本会把检测过的网址也塞进来，这里一并过滤掉，
         * 免得升级后那些历史条目还赖在项目栏里。
         */
        const projects = instances.filter((item) => item.projectPath || item.builtin)

        const sideBar = () => h('aside', { className: 'uxwSide', style: { width: `${sideWidth}px` } },
          h('div', { className: 'uxwSideScroll' },
            h('div', { className: 'uxwSideHead' },
              h('span', { className: 'uxwSideTitle' }, t('instances')),
              h('div', { className: 'uxwSideActions' },
                h('button', {
                  type: 'button',
                  className: 'uxwBtn',
                  'data-variant': 'quiet',
                  // 导览锚点。挂属性而不是 id/类名：重构布局时标记跟着元素走。
                  'data-tour': 'add-project',
                  'aria-label': t('addFolder'),
                  title: t('addFolder'),
                  disabled: picking,
                  onClick: addProjectFolder
                }, picking ? h('span', { className: 'uxwSpin' }) : icon(ICONS.folder)))),
            projects.length === 0
              ? h('div', { className: 'uxwNote' }, t('emptyTitle'))
              : projects.map((item) => {
                const isOpen = item.id === activeId && expandedProject
                return h('div', { key: item.id, className: 'uxwProj', 'data-open': isOpen },
                  // 项目就是一行文件夹，和文件树里的目录长得一样：
                  // 点一下展开、再点一下折叠。不是卡片按钮，也没有「选中」这回事。
                  h('div', { className: 'uxwProjRow', 'data-active': item.id === activeId },
                    h('button', {
                      type: 'button', className: 'uxwProjMain',
                      title: item.projectPath || item.url,
                      'aria-expanded': isOpen,
                      onClick: () => toggleProject(item.id)
                    },
                    h('span', {
                      className: 'uxwTreeChevron',
                      'data-open': isOpen ? 'true' : 'false',
                      'aria-hidden': 'true'
                    }, icon(ICONS.chevron)),
                    h('span', { className: 'uxwTreeIcon', 'data-kind': 'dir' },
                      icon(isOpen ? ICONS.folderOpen : ICONS.folder)),
                    h('span', { className: 'uxwProjName' }, item.name),
                    item.builtin ? h('span', { className: 'uxwChip' }, t('builtinTag')) : null),
                    h('button', {
                      type: 'button', className: 'uxwItemAction', title: t('remove'),
                      'aria-label': `${t('remove')}: ${item.name}`,
                      onClick: (event) => { event.stopPropagation(); setModal({ kind: 'remove', item }) }
                    }, icon(ICONS.trash))),
                  // 只有展开的项目带文件树；不带文件夹的（内置演示场）没有树可展开。
                  isOpen && item.projectPath
                    ? h(FileTree, {
                      t,
                      instanceId: item.id,
                      activePath: openFile ? openFile.path : null,
                      onOpenFile: openProjectFile
                    })
                    : null)
              }),

            h('div', { className: 'uxwSideHead', style: { marginTop: '16px' }, 'data-tour': 'runs' },
              h('span', { className: 'uxwSideTitle' },
                testMode === 'func' ? t('funcReports') : t('runs')),
              // 「清空」只属于体验检测的测量历史。功能报告是 AI 写的结论，
              // 删一份就真丢了，所以只给逐条删除，不给一键清空。
              testMode === 'ux' && runs.length > 0
                ? h('button', {
                  type: 'button', className: 'uxwBtn', 'data-variant': 'quiet',
                  title: t('confirmClearRuns'),
                  'aria-label': t('clearRuns'),
                  onClick: () => setModal({ kind: 'clearRuns' })
                }, t('clearRuns'))
                : null),
            // 历史列表整体按模式切换：不是同一个列表加过滤。
            // 一个列表里混着「测了 29 处缺陷」和「通过 12 失败 3」，
            // 数字量纲都不一样，用户没法比较也没法信任。
            testMode === 'func'
              ? (funcReports.length === 0
                ? h('div', { className: 'uxwNote' }, t('funcNoReport'))
                : funcReports.map((item) => {
                  const c = item.counts || {}
                  // 徽标写「失败数」而不是通过数：列表是用来找要处理的东西的。
                  const mark = item.verdict === 'failed'
                    ? String(c.fail || 0)
                    : (item.verdict === 'blocked' ? String(c.blocked || 0) : '✓')
                  return h('div', {
                    key: item.id,
                    className: 'uxwFuncRow',
                    'data-active': Boolean(funcDetail && funcDetail.id === item.id)
                  },
                  h('button', {
                    type: 'button',
                    className: 'uxwFuncRowMain',
                    title: `${item.title}${item.summary ? ` · ${item.summary}` : ''}`,
                    onClick: () => openFuncReport(item.id)
                  },
                  h('span', { className: 'uxwFuncRowName' }, item.title),
                  h('span', {
                    className: 'uxwFuncRowNum',
                    'data-verdict': item.verdict || 'passed'
                  }, mark)),
                  h('button', {
                    type: 'button', className: 'uxwRunDel', title: t('funcRemoveReport'),
                    'aria-label': `${t('funcRemoveReport')}: ${item.title}`,
                    onClick: (event) => {
                      event.stopPropagation()
                      setModal({ kind: 'removeFuncReport', item })
                    }
                  }, icon(ICONS.trash)))
                }))
              : (runs.length === 0
                ? h('div', { className: 'uxwNote' }, t('noRuns'))
                : h(React.Fragment, null,
                // 默认只露前 10 条。侧栏本来就窄，几十条历史会把上面的
                // 项目和文件树顶到看不见的地方。
                (runsExpanded ? runs : runs.slice(0, RUNS_PREVIEW)).map((run) => {
                const num = (run.summary && (run.summary.total || 0)) || 0
                // 历史列表里的数字同样是「要修几处」。旧记录存的是测量次数，
                // 这里没有 issues 明细可聚合，所以只在没有新字段时退回旧值。
                const badge = Number.isFinite(run.summary?.places) ? run.summary.places : num
                const took = formatDuration(run.durationMs)
                // 失败的检测绝不能画成 ✓。✓ 的意思是「测过了，没问题」，
                // 而这些记录恰恰是「没测成」—— 页面没打开、服务没起、被手动停止。
                // 把它们显示成绿色对勾，等于把一次没发生的检测说成通过。
                const passed = run.ok === true && badge === 0
                const failed = run.ok === false
                const mark = failed ? '—' : (badge > 0 ? String(badge) : '✓')
                const markTitle = failed ? (run.error || t('runFailed')) : null
                // 两个并列按钮，不能把删除嵌进打开里：按钮不能嵌套，
                // 而且点击会冒泡上去顺带打开这条记录。
                return h('div', {
                  key: run.id,
                  className: 'uxwRunRow',
                  'data-active': Boolean(detail && detail.id === run.id)
                },
                h('button', {
                  type: 'button', className: 'uxwRun',
                  title: `${run.instanceName} · ${new Date(run.startedAt).toLocaleString()}${took ? ` · ${t('took')} ${took}` : ''}${markTitle ? ` · ${markTitle}` : ''}`,
                  onClick: () => openRun(run.id)
                },
                h('span', { className: 'uxwRunName' }, run.instanceName),
                took ? h('span', { className: 'uxwRunTook', title: `${t('took')} ${took}` }, took) : null,
                h('span', {
                  className: 'uxwRunNum',
                  // failed 用独立的 tone：既不是「有问题」的红，也不是「没问题」的绿
                  'data-bad': !failed && badge > 0,
                  'data-ok': passed,
                  'data-failed': failed
                }, mark)),
                h('button', {
                  type: 'button', className: 'uxwRunDel', title: t('removeRun'),
                  'aria-label': `${t('removeRun')}: ${run.instanceName}`,
                  // 先弹确认再删：这按钮只有 13px 图标，紧挨着「打开记录」的
                  // 可点区域，误触一次就直接少了条历史。
                  onClick: (event) => { event.stopPropagation(); setModal({ kind: 'removeRun', run }) }
                }, icon(ICONS.trash)))
              }),
                // 折叠开关：收起时是一行省略号，展开后变成「收起」。
                // 只有真被折叠掉东西时才出现，10 条以内不占位置。
                runs.length > RUNS_PREVIEW
                  ? h('button', {
                    type: 'button',
                    className: 'uxwRunsMore',
                    'data-open': runsExpanded ? 'true' : 'false',
                    'aria-expanded': runsExpanded,
                    title: runsExpanded
                      ? t('runsLess')
                      : `${t('runsMore')} ${runs.length - RUNS_PREVIEW}`,
                    onClick: () => setRunsExpanded((current) => !current)
                  },
                  h('span', { className: 'uxwRunsMoreDots', 'aria-hidden': 'true' }, runsExpanded ? '⌃' : '⋯'),
                  runsExpanded
                    ? h('span', null, t('runsLess'))
                    : h('span', null, t('runsMore'), ' ',
                      h('span', { className: 'uxwRunsMoreNum' }, String(runs.length - RUNS_PREVIEW))))
                  : null))),

          h('div', { className: 'uxwSideFoot' },
            h('span', { className: 'uxwDot', 'data-bad': Boolean(meta && meta.browser === null) }),
            meta && meta.browser === null ? t('noBrowser') : t('ready')))

        const verdict = () => {
          const issues = detail.issues || []
          // 数字要回答「有几个地方要改」，所以这里自己聚合，不直接信 summary.total：
          // 旧记录里存的是按「状态 × 视口 × 主题」摊开的测量次数，会显示成几百条。
          // key 带上检测项：同一元素上「热区偏小」和「焦点不可见」是两处不同的修复。
          const allBuckets = aggregate(issues, (issue) => `${issue.kind}::${issue.target || issue.title}`)
          const total = issues.length ? allBuckets.length : 0
          const errors = allBuckets.filter((b) => b.severity === 'error').length
          const warns = total - errors
          const hits = allBuckets.reduce((sum, b) => sum + (b.hits || 1), 0)

          // 三种结局，不能混成两种：
          //   failed  —— 页面没打开，什么都没测到（缺陷数也是 0，但不是通过）
          //   aborted —— 用户中途停止，结果不完整
          //   ok      —— 真的测完了；这时才允许说「没有发现缺陷」
          const failed = detail.ok === false && !detail.aborted
          const aborted = detail.aborted === true || detail.ok === false && detail.aborted
          const bad = total > 0

          const tone = failed ? 'failed' : (aborted ? 'aborted' : (bad ? 'bad' : 'ok'))
          const iconSrc = failed ? ICONS.alert : (aborted ? ICONS.alert : (bad ? ICONS.alert : ICONS.shield))
          const title = failed ? t('runFailed') : (aborted ? t('runAborted') : (bad ? t('found') : t('clean')))
          const desc = failed ? t('runFailedText') : (aborted ? t('runAbortedText') : (bad ? t('foundDescHits') : t('cleanText')))

          return h('div', { className: 'uxwVerdict', 'data-tone': tone },
            h('div', { className: 'uxwVerdictIcon' }, icon(iconSrc)),
            h('div', { className: 'uxwVerdictText' },
              h('p', { className: 'uxwVerdictTitle' }, title),
              h('p', { className: 'uxwVerdictDesc' },
                desc,
                bad && hits > total ? ` · ${hits} ${t('hits')}` : ''),
              // 失败时把具体原因摊出来：「页面返回 HTTP 404」比「检测没完成」有用得多
              failed && detail.error ? h('p', { className: 'uxwVerdictError' }, detail.error) : null,
              failed ? h('p', { className: 'uxwVerdictError' }, t('runFailedHint')) : null),
            // 没测成就不该有数字：0 会被读成「零缺陷」
            failed ? null : h('div', { className: 'uxwVerdictNums' },
              h('div', { className: 'uxwVerdictNum', 'data-k': 'total' },
                h('b', null, String(total)), h('span', null, t('total'))),
              bad ? h('div', { className: 'uxwVerdictNum', 'data-k': 'error' },
                h('b', null, String(errors)), h('span', null, t('severe'))) : null,
              bad ? h('div', { className: 'uxwVerdictNum', 'data-k': 'warn' },
                h('b', null, String(warns)), h('span', null, t('hints'))) : null))
        }

        const planBar = () => {
          const plan = detail.plan
          if (!plan) return null
          const chips = [
            h('span', {
              key: 'themes',
              className: 'uxwPlanTag',
              'data-hue': true,
              style: { '--hue': plan.supportsDark ? '#4E7CD8' : '#8B8894' }
            }, h('span', { className: 'uxwPlanDot' }), plan.supportsDark ? '亮色 + 暗色' : '仅亮色'),
            h('span', { key: 'vp', className: 'uxwPlanTag' },
              h('span', { className: 'uxwPlanDot' }), `${t('viewports')} ${plan.viewports.length}`),
            h('span', { key: 'det', className: 'uxwPlanTag' },
              h('span', { className: 'uxwPlanDot' }), `${t('detectors')} ${plan.detectors.length}`)
          ]
          if (plan.discoveredStates > 0) {
            chips.push(h('span', { key: 'st', className: 'uxwPlanTag' },
              h('span', { className: 'uxwPlanDot' }), `${t('states')} ${plan.discoveredStates}`))
          }
          // 耗时放在策略条末尾：它是「这次花了多久」的元信息，
          // 和主题/视口/检测项这些「测了什么」并列最自然。
          const took = formatDuration(detail.durationMs)
          if (took) {
            chips.push(h('span', { key: 'took', className: 'uxwPlanTag', title: `${t('took')} ${took}` },
              h('span', { className: 'uxwPlanDot' }), `${t('took')} ${took}`))
          }
          return h('div', { className: 'uxwPlan' },
            h('span', { className: 'uxwPlanLead' }, icon(ICONS.scan), t('plan')),
            h('span', { className: 'uxwPlanSep' }),
            h('span', null, plan.summary),
            h('span', { className: 'uxwPlanSep' }),
            chips)
        }

        const groups = () => {
          const issues = detail.issues || []
          if (issues.length === 0) {
            // 没测成的时候不能画对勾。这里原本无条件显示「本次没有发现缺陷」，
            // 于是一次 404 的检测会得到一个绿勾 + 零缺陷的空状态，
            // 看起来和真的测过且干净一模一样 —— 必须分开。
            const failed = detail.ok === false && !detail.aborted
            const aborted = detail.aborted === true
            if (failed || aborted) {
              return h('div', { className: 'uxwEmpty', 'data-tone': failed ? 'failed' : 'aborted' },
                h('div', { className: 'uxwEmptyArt', 'data-tone': 'failed' },
                  h('svg', { viewBox: '0 0 66 66', 'aria-hidden': 'true' },
                    h('circle', { cx: '33', cy: '33', r: '27', fill: 'none', stroke: 'color-mix(in srgb, #C2413A 28%, transparent)', strokeWidth: '1.4' }),
                    h('circle', { cx: '33', cy: '33', r: '19', fill: 'color-mix(in srgb, #C2413A 10%, transparent)' }),
                    h('path', { d: 'M25 25l16 16M41 25L25 41', fill: 'none', stroke: '#C2413A', strokeWidth: '2.4', strokeLinecap: 'round' }))),
                h('div', { className: 'uxwEmptyTitle' }, failed ? t('runFailed') : t('runAborted')),
                h('p', { className: 'uxwEmptyText' }, failed ? t('runFailedText') : t('runAbortedText')),
                failed && detail.error ? h('p', { className: 'uxwEmptyText' }, detail.error) : null,
                failed ? h('p', { className: 'uxwEmptyText' }, t('runFailedHint')) : null)
            }
            return h('div', { className: 'uxwEmpty' },
              h('div', { className: 'uxwEmptyArt' },
                h('svg', { viewBox: '0 0 66 66', 'aria-hidden': 'true' },
                  h('circle', { cx: '33', cy: '33', r: '27', fill: 'none', stroke: 'color-mix(in srgb, #0F9C87 28%, transparent)', strokeWidth: '1.4' }),
                  h('circle', { cx: '33', cy: '33', r: '19', fill: 'color-mix(in srgb, #0F9C87 10%, transparent)' }),
                  h('path', { d: 'M24.5 33.5l6 6 12-13', fill: 'none', stroke: '#0F9C87', strokeWidth: '2.4', strokeLinecap: 'round', strokeLinejoin: 'round' }))),
              h('div', { className: 'uxwEmptyTitle' }, t('clean')),
              h('p', { className: 'uxwEmptyText' }, t('cleanText')))
          }

          const map = new Map()
          for (const issue of issues) {
            if (!map.has(issue.kind)) map.set(issue.kind, [])
            map.get(issue.kind).push(issue)
          }

          // 缺陷多的类型排前面，让最该修的浮上来
          return Array.from(map.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([kind, list]) => {
              const m = metaOf(kind)
              // 一条原始缺陷 = 一次「视口×主题×状态」命中；聚合后才是元素数
              const buckets = aggregate(list)
              const suggestion = uniformSuggestion(buckets)
              const errors = buckets.filter((b) => b.severity === 'error').length

              // 组头只报「要修几个元素」。命中次数收进 title，想核对覆盖面时悬停即可，
              // 不再把「330 处命中」这种数字摆在标题上吓人。
              const hits = buckets.reduce((sum, b) => sum + (b.hits || 1), 0)
              return h('section', { key: kind, className: 'uxwGroup', style: { '--hue': m.hue } },
                h('div', { className: 'uxwGroupHead' },
                  h('span', { className: 'uxwGroupChip' }, icon(KIND_ICON[kind] || ICONS.info)),
                  h('h3', { className: 'uxwGroupTitle' }, m.label),
                  h('span', {
                    className: 'uxwGroupNote',
                    title: hits > buckets.length ? `${buckets.length} 个元素 · ${hits} ${t('hits')}` : ''
                  }, m.note),
                  errors ? h('span', { className: 'uxwGroupCount', 'data-sev': 'error' }, `严重 ${errors}`) : null,
                  h('span', { className: 'uxwGroupRule' }),
                  h('span', { className: 'uxwGroupCount' }, String(buckets.length))),

                h('article', { className: 'uxwIssue' },
                  h('div', { className: 'uxwRows' },
                    buckets.map((bucket) => h(IssueRow, {
                      key: bucket.key,
                      bucket,
                      t,
                      selected: selectedIssue === bucket.key,
                      onLocate: locateIssue,
                      showSuggestion: !suggestion.shared && suggestion.rest
                    }))),
                  suggestion.shared
                    ? h('div', { className: 'uxwFix' },
                      h('span', { className: 'uxwFixLabel' }, icon(ICONS.check), t('fix')),
                      h('span', null, suggestion.shared))
                    : null))
            })
        }

        /**
         * 功能模式的主区。
         *
         * 和 reportContent() 是两个完全独立的渲染分支：这里绝不读 detail / issues /
         * progress，那边也绝不读 funcDetail。合并成一个函数再 if 分支是灾难的开始 ——
         * 两边状态名差一个字母就会串。
         */
        const funcContent = () => {
          if (funcError) {
            return h('div', { className: 'uxwMainScroll' },
              h('div', { className: 'uxwAlert' },
                icon(ICONS.alert, { style: { marginTop: '2px' } }),
                h('span', { className: 'uxwAlertBody' }, funcError),
                h('button', {
                  type: 'button',
                  className: 'uxwBtn',
                  'data-variant': 'quiet',
                  onClick: () => setFuncError(null)
                }, t('dismiss'))))
          }

          if (!funcDetail) {
            // 空态只做一件事：告诉用户该去哪儿发起。
            //
            // 这里原来有一个「发起功能测试」按钮，会替用户往对话里发一段固定工单。
            // 删掉了 —— 它只是把一句话替你说出去，而那句话本身你打得更准
            // （「测一下 xx 项目的支付流程」比工单里那几行管用）。
            // 它还会猜错目标：拿「左栏选中的项目」当目标，你心里想的可能是另一个。
            // 多一条会坏的链路（宿主 API 一变就得降级、降级就得让你复制文本），
            // 换来的只是省一次打字。不值。
            return h('div', { className: 'uxwMainScroll' },
              h('div', { className: 'uxwFuncEmpty' },
                h('div', { className: 'uxwFuncEmptyArt', 'aria-hidden': 'true' }, icon(ICONS.flask)),
                // 只有一行标题 + 一句指引。原来还有一段灰色小字解释「功能测试是什么、
                // 和体验检测怎么分开」，删了 —— 空态不是讲概念的地方，用户此刻只想知道
                // 「怎么开始」。那句指引就是答案，其余都是噪音。
                h('div', { className: 'uxwFuncEmptyTitle' },
                  funcReports.length ? t('funcPickReport') : t('funcNoReport')),
                funcReports.length
                  ? null
                  : h('p', { className: 'uxwFuncEmptyHint' }, t('funcStartInChat'))))
          }

          return h('div', { className: 'uxwMainScroll' },
            h(FuncReport, {
              t,
              report: funcDetail,
              openCases,
              onToggleCase: (id) => setOpenCases((current) => ({ ...current, [id]: !current[id] })),
              openMarkdown,
              onToggleMarkdown: () => setOpenMarkdown((current) => !current)
            }),
            // 功能报告属于对话式一次性排查：想固化回归要换工作台。
            // 这句话放在报告底部而不是顶部 —— 用户读完结论才需要考虑下一步。
            h('p', { className: 'uxwHint', style: { marginTop: '14px' } }, t('funcRegressionHint')))
        }

        /**
         * 报告区内容（不含右侧栏）。
         *
         * 拆出来是因为右侧栏不该依赖它：没跑过检测时也要能看项目文件。
         */
        const reportContent = () => {
          if (error) {
            return h('div', { className: 'uxwMainScroll' },
              h('div', { className: 'uxwAlert' },
                icon(ICONS.alert, { style: { marginTop: '2px' } }),
                h('span', { className: 'uxwAlertBody' }, error),
                h('button', {
                  type: 'button',
                  className: 'uxwBtn',
                  'data-variant': 'quiet',
                  onClick: () => setError(null)
                }, t('dismiss'))))
          }

          if (busy) {
            return h('div', { className: 'uxwMainScroll' },
              h('div', { className: 'uxwBusy' },
                h('span', { className: 'uxwSpin' }),
                h('div', { className: 'uxwBusyBody' },
                  h('span', { className: 'uxwBusyPhase' }, (progress && progress.phase) || t('testing')),
                  h('span', { className: 'uxwBusyHint' }, t('busyHint'))),
                h('span', { className: 'uxwBusyTime' }, `${elapsed}s`)))
          }

          if (!detail) {
            // 空白主区：没选记录、也没在跑检测。
            //
            // 早先这里还会在有结论时顺带画一块结论区，但那样「再点一次收起」
            // 就收不干净 —— 用户要的是回到什么都没选的样子。
            return h('div', { className: 'uxwEmpty' },
              h(EmptyArt, null),
              h('div', { className: 'uxwEmptyTitle' }, t('emptyRunTitle')),
              h('p', { className: 'uxwEmptyText' }, t('emptyRunText')),
              h('div', { className: 'uxwEmptyHint' }, icon(ICONS.scan), t('urlPlaceholder')))
          }

          return h('div', { className: 'uxwMainScroll' },
            // 轻提示压在报告最上面，不替换报告 —— 用户点条目时最需要的是
            // 报告还在原地，同时知道「为什么这次没框出来」。
            notice
              ? h('div', { className: 'uxwNotice', role: 'status' },
                icon(ICONS.alert, { style: { marginTop: '2px' } }),
                h('span', { className: 'uxwAlertBody' }, notice),
                h('button', {
                  type: 'button',
                  className: 'uxwBtn',
                  'data-variant': 'quiet',
                  onClick: () => setNotice(null)
                }, t('dismiss')))
              : null,
            h('div', { className: 'uxwHead' },
              h('div', { className: 'uxwHeadMain' },
                h('h2', { className: 'uxwHeadTitle' }, detail.instanceName || detail.url),
                h('p', { className: 'uxwHeadUrl' }, detail.url))),
            verdict(),
            planBar(),
            groups())
        }

        /**
         * 右侧栏（网页 / 代码）。
         *
         * 它是主区的浮层，和「有没有报告」无关 —— 早先它长在报告分支里，
         * 于是没跑过检测时点文件毫无反应，看起来像文件打不开。
         * 现在它自己决定显不显示：只要有报告、有网页、或打开了文件，就该在。
         */
        const sidePanel = () => {
          // 打开了文件就必须显示 —— 否则点文件像是没反应
          if (!previewOpen && !openFile) return null

          // 网页模式：整个右栏交给 BuiltinBrowser 画。
          //
          // 它自己就是一个完整的 .uxwPv（带边框、可拖动、有头有脚），
          // 早先这里又在外面包了一层 .uxwPv + 一个头，于是同一块地方出现
          // 两条「网页展示」栏 —— 收起时两层头几乎重叠看不出来，
          // 一放大会错开，就成了明显的两条。
          if (!openFile) {
            return h(BuiltinBrowser, {
              t,
              state: previewState,
              frame: previewFrame,
              locating,
              frameRef: frameElRef,
              expanded,
              onToggleExpand: () => setExpanded((current) => !current),
              onRetry: retryPreview,
              // 地址栏：就地换页。两种模式都给 —— 体验模式想看同项目另一页、
              // 功能模式没有记录可点，都靠它。
              onNavigate: navigatePreview,
              fileError,
              resize: {
                dragging: resizing,
                hint: t('dragHint'),
                onStart: startPreviewResize
              }
            })
          }

          return h('section', {
            className: 'uxwPv',
            'data-mode': 'file',
            'aria-label': t('files')
          },
          // 拖动分隔条：贴在右栏左缘，命中区比视觉宽度宽
          h('div', {
            className: 'uxwPvResize',
            'data-dragging': resizing ? 'true' : 'false',
            title: t('dragHint'),
            onMouseDown: startPreviewResize
          }),
          h('div', { className: 'uxwPvHead' },
            // 这里不放「网页 / 文件」切换：文件是项目的一部分，
            // 点左侧文件树就切到代码，点右上角「网页」再回到页面，不必多一层标签。
            h('span', { className: 'uxwPvTitle' }, t('files')),
            h('span', { className: 'uxwCodeName', title: openFile.path }, openFile.name || openFile.path),
            openFile && openFile.size
              ? h('span', { className: 'uxwCodeSize' }, `${(openFile.size / 1024).toFixed(1)} KB`)
              : null,
            h('button', {
              type: 'button', className: 'uxwPvBtn', title: t('closeFile'),
              onClick: () => setOpenFile(null)
            }, icon(ICONS.close))),
          openFile.loading
            // 读取中给个提示，否则右栏是一片空白，看着像加载失败
            ? h('div', { className: 'uxwPvEmpty' }, h('span', { className: 'uxwSpin' }), t('filesLoading'))
            : h(CodeViewer, { t, file: openFile }))
        }

        /**
         * 主区 = 报告 + 右侧栏（浮层）。
         *
         * 两者是兄弟节点：右栏用绝对定位压在报告上层，报告只用内边距让位，
         * 所以拖动右栏时报告的内容宽度是连续的，不会被一格一格地挤压重排。
         * 这也是 VS Code 侧栏的行为 —— 覆盖，而不是挤压。
         */
        const mainBody = () => h('div', {
          className: 'uxwMainSplit',
          'data-expanded': expanded ? 'true' : 'false',
          'data-preview': (previewOpen || openFile) ? 'true' : 'false',
          // 宽度通过 CSS 变量同时传给浮层和报告的让位内边距，
          // 拖动时只改这一个值，两边同步变化。
          style: { '--uxw-pv-w': `${previewWidth}px` }
        },
        // 主区按模式整体换渲染器，不是在同一份数据上加过滤。
        // 两种模式都有右侧网页展示：功能测试也要看着页面判断行为对不对，
        // 而且它的报告没有元素坐标可跳，网页区就只当「看一眼」的窗口用 ——
        // 定位按钮只在体验模式的缺陷行上出现，所以不会出现点了没反应。
        h('div', { className: 'uxwSplitReport' },
          testMode === 'func' ? funcContent() : reportContent()),
        sidePanel())

        /**
         * 首次打开时的确认卡。
         *
         * 只在用户点「创建」之后才 POST —— 宿主的工作台规范不允许插件在
         * 用户确认前静默建目录。取消就什么都不留下。
         */
        /**
         * 新手导览的运行时。
         *
         * 三条硬规矩，都来自前面设计里定下的取舍：
         *
         * 1. **只演示**：遮罩拦截一切点击，导览期间用户改不了面板状态，
         *    也就不会出现「步骤还在说 A、界面已经切到 B」的错位。
         *    唯一的例外是最后一步的「演示」，那是有意给出的出口。
         * 2. **找不到锚点就跳过**：功能测试模式下网址框和网页开关根本不渲染，
         *    窄屏（<760px）左栏是 display:none。按固定脚本走必然撞上
         *    「高亮一个 0×0 的元素」。所以每一步现量一次，量不到就跳过。
         * 3. **不和文件夹确认卡抢**：工作台第一次打开时还有一张 homeCard，
         *    两个浮层叠在一起会互相遮挡。导览必须等 homeCard 走完。
         */

        /**
         * 量一个锚点在面板坐标系里的位置。
         *
         * 返回 null 只代表「这个元素真的没法指」：不存在、display:none、
         * 或者当前还没布局出尺寸。**不代表它跑到面板外面了** ——
         * 早先这里把「超出面板边界」也当成 null，于是窄窗口下顶栏被挤、
         * 网址框和开关的坐标超出 `.uxwTop` 的 overflow 范围，三个锚点
         * 一起被判成不存在，七步的导览只剩四步。判断标准应当是
         * 「在面板上看得见多少」，而不是「矩形的左上角在哪」。
         *
         * 所以超出边界的部分做**裁剪**而不是丢弃：元素哪怕只露出一半，
         * 也照样高亮露出的那半边，用户仍然知道说的是哪个控件。
         */
        const measureTourAnchor = (anchor) => {
          const root = tourRootRef.current
          if (!root || !anchor) return null
          let el = null
          try {
            el = root.querySelector(`[data-tour="${anchor}"]`)
          } catch {
            return null
          }
          if (!el) return null
          const rect = el.getBoundingClientRect()
          // 宽或高为 0：display:none、被折叠、或者宿主还没布局完。
          // 这种情况连去哪儿都算不出来，只能交给调用方降级。
          if (!(rect.width > 0) || !(rect.height > 0)) return null

          const base = root.getBoundingClientRect()
          const raw = {
            left: rect.left - base.left,
            top: rect.top - base.top,
            width: rect.width,
            height: rect.height
          }
          // 和面板求交集。完全在面板外（交集面积为 0）才算真的没得指。
          const left = Math.max(raw.left, 0)
          const top = Math.max(raw.top, 0)
          const right = Math.min(raw.left + raw.width, base.width)
          const bottom = Math.min(raw.top + raw.height, base.height)
          if (!(right > left) || !(bottom > top)) return null

          return {
            left: left - TOUR_SPOT_PAD,
            top: top - TOUR_SPOT_PAD,
            width: (right - left) + TOUR_SPOT_PAD * 2,
            height: (bottom - top) + TOUR_SPOT_PAD * 2
          }
        }

        /**
         * 重算当前步骤的高亮框和卡片落点。
         *
         * 拖动左右栏、缩放窗口、主区滚动、切换模式都会让锚点挪位，
         * 所以要能被反复调用。所有测量都走 getBoundingClientRect，
         * 不缓存，避免拖完栏还指着旧位置。
         *
         * 锚点量不到（该元素在当前模式下没渲染、左栏被窄屏隐藏、
         * 宿主还没布局完）时 spot 为 null，卡片退化成居中、整屏压暗。
         * 注意这里**不跳过这一步** —— 步骤数固定，见 TOUR_STEPS 的说明。
         */
        const measureTour = React.useCallback(() => {
          const root = tourRootRef.current
          if (!root) return
          const step = TOUR_STEPS[tourIndex] || TOUR_STEPS[0]
          const base = root.getBoundingClientRect()
          const spot = step.anchor ? measureTourAnchor(step.anchor) : null
          // 卡片尺寸要先渲染出来才知道。首帧 cardRef 还没挂上，
          // 用一个接近实际的估计值，下一帧再按真实尺寸校正。
          const card = tourCardRef.current
          const cardRect = card ? card.getBoundingClientRect() : null
          const size = {
            width: cardRect && cardRect.width > 0 ? cardRect.width : 334,
            height: cardRect && cardRect.height > 0 ? cardRect.height : 190
          }
          const layout = placeTourCard(spot, size, { width: base.width, height: base.height }, step.place)
          setTourSpot(spot)
          setTourLayout(layout)
        }, [tourIndex])

        const closeTour = React.useCallback((outcome) => {
          setTourOpen(false)
          setTourIndex(0)
          setTourSpot(null)
          setTourLayout(null)
          // 记下来就不再自动打扰；顶栏的 ? 仍然可以随时重播。
          try {
            globalThis.localStorage?.setItem('uxw.tour.v1', JSON.stringify({
              done: true,
              at: new Date().toISOString(),
              outcome: outcome || 'finished'
            }))
          } catch { /* 隐私模式写不进就算了，最多下次再弹一遍 */ }
        }, [])

        const openTour = React.useCallback(() => {
          setTourIndex(0)
          setTourSpot(null)
          setTourLayout(null)
          setTourOpen(true)
        }, [])

        const tourNext = () => {
          if (tourIndex + 1 >= TOUR_STEPS.length) { closeTour('finished'); return }
          setTourIndex(tourIndex + 1)
        }

        const tourPrev = () => {
          if (tourIndex <= 0) return
          setTourIndex(tourIndex - 1)
        }

        /**
         * 什么时候自动开始。
         *
         * 条件必须同时成立：文件夹已就绪（否则 homeCard 正在显示）、
         * 没有正在跑的检测、不在放大态、本地没记过「已看过」。
         * 一次性 effect 足够 —— 这些状态在首访期间不会反复翻转，
         * 反复监听只会在用户关掉 homeCard 的瞬间把它又弹回来。
         */
        React.useEffect(() => {
          if (!home || home.adopted !== true) return
          let seen = false
          try {
            seen = globalThis.localStorage?.getItem('uxw.tour.v1') != null
          } catch { seen = false }
          if (seen) return
          // 等一帧：让面板和侧栏都完成布局，否则第一次测量拿到的是 0×0。
          const timer = setTimeout(openTour, 320)
          return () => clearTimeout(timer)
          // 只在 home 真正就绪那一刻决定一次；后续 home 对象换引用不再触发。
        }, [home && home.adopted === true])

        // 步骤变了 / 布局变了就重新量。cardRef 挂载后也要补量一次，
        // 否则首帧用的估计尺寸会让卡片第一下对着错误的位置。
        //
        // 量几轮而不是一轮：宿主把面板挂载进来时，iframe / 侧栏 / 顶栏的
        // 布局可能分几帧才稳定。只量一次会把「还没排好版」误判成
        // 「这个锚点不存在」，于是本该高亮的弹窗变成一张居中卡片 ——
        // 用户看到的就是「导览少讲了几步」。多量几次的代价只是几次
        // getBoundingClientRect，很便宜。
        React.useEffect(() => {
          if (!tourOpen) return undefined
          const timers = [0, 90, 260, 700].map((delay) => setTimeout(measureTour, delay))
          return () => timers.forEach(clearTimeout)
        }, [tourOpen, tourIndex, measureTour])

        // 面板尺寸、滚动、窗口变化都跟着重算。
        React.useEffect(() => {
          if (!tourOpen) return undefined
          const root = tourRootRef.current
          const handler = () => measureTour()
          const ro = typeof ResizeObserver === 'function' && root ? new ResizeObserver(handler) : null
          if (ro && root) ro.observe(root)
          globalThis.addEventListener?.('resize', handler)
          // 捕获阶段监听滚动：面板里好几个独立滚动容器（左栏、主区、右栏），
          // 只在 window 上听会漏掉它们。
          root?.addEventListener('scroll', handler, true)
          return () => {
            if (ro) ro.disconnect()
            globalThis.removeEventListener?.('resize', handler)
            root?.removeEventListener('scroll', handler, true)
          }
        }, [tourOpen, measureTour])

        // 键盘：Esc 跳过、左右切换、Tab 锁在卡片里。
        React.useEffect(() => {
          if (!tourOpen) return undefined
          const onKey = (event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeTour('skipped'); return }
            if (event.key === 'ArrowRight') { event.preventDefault(); tourNext(); return }
            if (event.key === 'ArrowLeft') { event.preventDefault(); tourPrev(); return }
            if (event.key === 'Tab') {
              // 焦点环只在卡片内部循环。导览期间面板其余部分是遮罩挡住的，
              // 让 Tab 跑出去会聚焦到看不见的元素上。
              const card = tourCardRef.current
              if (!card) return
              const focusable = card.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
              if (!focusable.length) return
              const first = focusable[0]
              const last = focusable[focusable.length - 1]
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
            }
          }
          document.addEventListener('keydown', onKey)
          // 打开时把焦点送进卡片，键盘用户不用先 Tab 一大圈
          // 打开时把焦点送进卡片。
          // 优先「下一步」而不是卡片里第一个按钮：第一个是「跳过」，
          // 焦点停在取消类按钮上，回车会把导览直接关掉。
          const timer = setTimeout(() => {
            const card = tourCardRef.current
            if (!card) return
            const target = card.querySelector('[data-autofocus]')
              || card.querySelector('[data-variant="primary"]')
              || card.querySelector('button')
            if (target) target.focus()
          }, 80)
          return () => {
            document.removeEventListener('keydown', onKey)
            clearTimeout(timer)
          }
        }, [tourOpen, tourIndex])

        /**
         * 最后一步的出口：真的跑一次内置演示场。
         *
         * 复用现有 startRun 那条路（网址为 builtin:demo 时服务端临时组一个实例），
         * 不另开接口 —— 多一条入口就多一处要维护的失败处理。
         */
        const tourRunDemo = () => {
          closeTour('finished')
          setUrl('builtin:demo')
          setTestMode('ux')
          // 等一帧让 url state 落进去，再起跑；startRun 读的是闭包里的 url。
          setTimeout(() => { startRun('builtin:demo') }, 60)
        }

        /**
         * 导览层。
         *
         * 结构三层：高亮框（打洞，不接事件）→ 拦截层（吃掉点击）→ 卡片。
         * 没有锚点的步骤换成一块整屏压暗，不再画高亮框。
         */
        const tourLayer = () => {
          if (!tourOpen) return null
          const step = TOUR_STEPS[tourIndex]
          if (!step) return null
          const total = TOUR_STEPS.length
          const spot = tourSpot
          const layout = tourLayout || { left: 0, top: 0, dir: 'center', arrow: 50, arrowX: 0, arrowY: 0 }
          // 箭头朝「卡片背离锚点」的那个方向画：卡片在锚点下面，箭头就在卡片上边。
          const arrowTo = layout.dir === 'top' ? 'bottom' : layout.dir === 'bottom' ? 'top'
            : layout.dir === 'left' ? 'right' : layout.dir === 'right' ? 'left' : null

          return h('div', {
            className: 'uxwTour',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'uxwTourTitle',
            'aria-describedby': 'uxwTourBody'
          },
          spot
            ? h('div', {
              className: 'uxwTourSpot',
              'aria-hidden': 'true',
              style: { left: `${spot.left}px`, top: `${spot.top}px`, width: `${spot.width}px`, height: `${spot.height}px` }
            })
            : h('div', { className: 'uxwTourVeil', 'aria-hidden': 'true' }),
          // 拦截层：只演示，点哪儿都不穿透
          h('div', { className: 'uxwTourBlock' }),
          // 箭头画在卡片外面，再靠 z-index 让它的下半截被卡片盖住 ——
          // 卡片有 overflow:auto 装长正文，把它当子元素会被裁掉。
          arrowTo
            ? h('span', {
              key: 'arrow',
              className: 'uxwTourArrow',
              'data-to': arrowTo,
              'aria-hidden': 'true',
              style: { left: `${layout.arrowX}px`, top: `${layout.arrowY}px` }
            })
            : null,
          h('div', {
            ref: tourCardRef,
            className: 'uxwTourCard',
            // 第一帧还没有量过位置（tourLayout 为空），此时画出来会闪在左上角。
            // 用 visibility 而不是不渲染：卡片必须真的在 DOM 里，否则量它的
            // 宽高拿不到，落点就永远算不出来。
            style: {
              left: `${layout.left}px`,
              top: `${layout.top}px`,
              visibility: tourLayout ? 'visible' : 'hidden'
            }
          },
          h('div', { className: 'uxwTourHead' },
            h('span', { className: 'uxwTourStep' }, `${tourIndex + 1} / ${total}`),
            h('h2', { className: 'uxwTourTitle', id: 'uxwTourTitle' }, t(step.title)),
            // 跳过常驻：走到一半没兴趣的人不该被逼着点完
            h('button', {
              type: 'button', className: 'uxwTourSkip',
              onClick: () => closeTour('skipped')
            }, t('tourSkip'))),
          h('p', { className: 'uxwTourBody', id: 'uxwTourBody' }, t(step.body)),
          h('div', { className: 'uxwTourFoot' },
            h('div', { className: 'uxwTourDots', 'aria-hidden': 'true' },
              TOUR_STEPS.map((item, index) => h('span', {
                key: item.id,
                className: 'uxwTourDot',
                'data-on': index === tourIndex ? 'true' : 'false'
              }))),
            h('div', { className: 'uxwTourActions' },
              tourIndex > 0
                ? h('button', {
                  type: 'button', className: 'uxwBtn',
                  onClick: tourPrev
                }, t('tourPrev'))
                : null,
              step.id === 'start'
                ? h('button', {
                  type: 'button', className: 'uxwBtn', 'data-variant': 'primary',
                  onClick: tourRunDemo, disabled: busy
                }, t('tourRunDemo'))
                : null,
              h('button', {
                type: 'button',
                className: 'uxwBtn',
                // 最后一步的「下一步」已经是次要动作（主要动作是跑演示场），
                // 两枚都是主色按钮会把视线拉散。
                'data-variant': step.id === 'start' ? undefined : 'primary',
                onClick: tourNext
              }, tourIndex + 1 >= total ? t('tourDone') : t('tourNext'))))))
        }

        /**
         * 首次使用时的工作台文件夹确认卡。
         *
         * 早先这里手写了一组 .uxwHome* 类名，而样式表里**一条都没有定义** ——
         * 于是它只是个无样式的普通 div，直接排在历史列表下面，把列表挤成一条
         * 半截的滚动区，还和左侧「充值」叠在一起，看着像布局崩了。
         * 现在复用已经齐全的 Modal（遮罩、居中、点外面关闭），不再自造一套类名。
         */
        const homeCard = () => {
          if (!home || home.adopted === true || homeDismissed) return null
          const missing = home.missing === true
          const occupied = home.needsConfirmation === true && !missing
          return h(Modal, {
            title: missing ? '工作台文件夹不见了' : occupied ? '这个文件夹已存在' : '为找茬工作台创建文件夹',
            // 点遮罩或按 Esc 等同于「稍后再说」：本轮不再打扰，顶栏入口仍可回来。
            onClose: () => setHomeDismissed(true),
            actions: [
              h('button', {
                key: 'later', type: 'button', className: 'uxwBtn',
                onClick: () => setHomeDismissed(true), disabled: homeBusy
              }, '稍后再说'),
              h('button', {
                key: 'create', type: 'button', className: 'uxwBtn', 'data-variant': 'primary',
                onClick: adoptHome, disabled: homeBusy || !home.available
              }, homeBusy ? '创建中…' : missing ? '重新创建' : '创建')
            ]
          },
            h('p', { className: 'uxwBody2' }, missing
              ? '之前用的文件夹已经不在了。可以重新创建它，或者换一个位置。'
              : occupied
                ? '这个位置已经有文件夹了。如果里面有你自己放的文件，它们不会被改动。'
                : '找茬工作台需要一个自己的文件夹，检测产物都会放在这里，不会和你别的工作混在一起。'),
            // 路径一行：左边是当前会被使用的目录，右边是「选择文件夹」。
            // 默认建议位置只是建议，用户完全可以放到别的盘、别的目录。
            h('div', { className: 'uxwHomePathRow' },
              h('p', { className: 'uxwHomePath', title: homePicked || home.path || '' },
                homePicked || home.path || '（暂时无法确定默认位置）'),
              // 图标按钮：文案放在 title / aria-label 里，视觉上只占一个方块。
              // 早先写「选择文件夹…」整段文字，把路径挤成一小截，很难看。
              h('button', {
                type: 'button', className: 'uxwBtn', 'data-variant': 'icon',
                onClick: pickHomeFolder, disabled: homeBusy,
                title: '选择文件夹', 'aria-label': '选择文件夹'
              },
                h('svg', {
                  viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none',
                  stroke: 'currentColor', strokeWidth: 1.5,
                  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
                },
                  h('path', { d: 'M1.9 4.2v7.6c0 .5.4.9.9.9h10.4c.5 0 .9-.4.9-.9V6c0-.5-.4-.9-.9-.9H8.1L6.6 3.3H2.8c-.5 0-.9.4-.9.9z' }),
                  h('path', { d: 'M1.9 6.1h12.2' })))),
            homePicked
              ? h('p', { className: 'uxwHint' }, '已选择你自己的位置；点「创建」后才会在这里建文件夹。')
              : null,
            home.oneDrive
              ? h('p', { className: 'uxwHomeWarn' }, '这个位置在云盘同步目录里，检测产物较多，同步可能变慢。')
              : null,
            home.suggestionError ? h('p', { className: 'uxwHomeWarn' }, home.suggestionError) : null,
            !home.available
              ? h('p', { className: 'uxwHint' }, home.reason || '当前版本无法自动创建工作区，请手动选择一个已有文件夹。')
              : h('p', { className: 'uxwHint' }, '点「创建」之后才会真正建这个文件夹；现在关闭不会留下任何东西。'),
            homeError ? h('p', { className: 'uxwHomeErr', role: 'alert' }, homeError) : null)
        }

        return h('div', { className: 'uxw', ref: tourRootRef, 'data-mode': testMode, 'data-resizing': (resizing || leftResizing) ? 'true' : 'false' },
          h('div', { className: 'uxwTop' },
            h('div', { className: 'uxwBrand' },
              // 放大镜 + 裂痕：一眼看出这是「把问题挑出来看」的工具
              h('span', { className: 'uxwMark', 'aria-hidden': 'true' },
                h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                  h('path', { d: 'M15.9 15.9 21 21' }),
                  h('circle', { cx: 10.5, cy: 10.5, r: 6.6 }),
                  h('path', { d: 'M10.5 6.6 9.1 9.6l2.7 1.4-1.4 2.9' }))),
              h('div', { className: 'uxwBrandText' },
                h('div', { className: 'uxwBrandName' }, t('title')),
                h('div', { className: 'uxwBrandSub' }, t('brandSub')))),
            // 文件夹没就绪时留一个入口：用户点了「稍后再说」也能随时回来。
            home && home.adopted !== true
              ? h('button', {
                type: 'button', className: 'uxwBtn', 'data-variant': 'primary',
                onClick: () => setHomeDismissed(false)
              }, '设置工作台文件夹')
              : null,
            h('div', { className: 'uxwDivider' }),
            // 模式开关：整套主区内容的分界线。
            // 放在网址框左边而不是右边，是因为它决定「这个网址接下来会被怎么测」，
            // 顺序上先定模式、再填目标，读起来才顺。
            h('div', { className: 'uxwModes', role: 'tablist', 'aria-label': t('title'), 'data-tour': 'modes' },
              h('button', {
                type: 'button',
                role: 'tab',
                className: 'uxwMode',
                'aria-selected': testMode === 'ux',
                'data-on': testMode === 'ux',
                title: t('modeUxHint'),
                onClick: () => setTestMode('ux')
              }, icon(ICONS.eye), t('modeUx')),
              h('button', {
                type: 'button',
                role: 'tab',
                className: 'uxwMode',
                'aria-selected': testMode === 'func',
                'data-on': testMode === 'func',
                title: t('modeFuncHint'),
                onClick: () => setTestMode('func')
              }, icon(ICONS.bug), t('modeFunc'))),
            // 功能模式没有网址执行器：右侧不摆「开始检测」，只留一个说明。
            // 摆一个灰按钮会让人以为是自己没填对，其实这个模式走的是对话。
            testMode === 'func'
              ? h('div', { className: 'uxwSpacer' })
              : h(React.Fragment, null,
                h('div', { className: 'uxwField', 'data-focused': focused, 'data-busy': busy, 'data-tour': 'url-field' },
                  h('input', {
                    className: 'uxwInput',
                    value: url,
                    placeholder: t('urlPlaceholder'),
                    'aria-label': t('urlLabel'),
                    spellCheck: false,
                    onChange: (event) => setUrl(event.target.value),
                    onFocus: () => setFocused(true),
                    onBlur: () => setFocused(false),
                    onKeyDown: (event) => { if (event.key === 'Enter') startRun() }
                  }),
                  // 检测中这个按钮就变成「停止」。
                  // 不做成第二个按钮：并排放一个灰掉的「检测」和一个红的「停止」，
                  // 位置会跳，而且用户已经盯着这个位置了。
                  h('button', {
                    type: 'button',
                    className: 'uxwGo',
                    'data-mode': busy ? 'stop' : 'run',
                    title: busy ? t('stopHint') : t('testHint'),
                    onClick: busy ? stopRun : startRun,
                    disabled: stopping
                  }, busy ? stopIcon() : icon(detail ? ICONS.redo : ICONS.play),
                  busy ? (stopping ? t('stopping') : t('stop')) : (detail ? t('retest') : t('test')))),
                h('div', { className: 'uxwSpacer' })),
             h('button', {
               type: 'button', className: 'uxwToggle',
               // 导览锚点：贴在这个开关上，而不是「第二个 .uxwToggle」——
               // 相邻的「AI 对话」随时可能换顺序。
               'data-tour': 'preview-toggle',
               // 两种模式都有网页展示：功能测试也要能看着页面做验证，
               // 而且一个项目往往有多个页面，地址栏就在这一侧换。
               'data-on': previewOpen && !openFile,
               title: previewOpen ? t('previewOff') : t('previewOn'),
               'aria-pressed': previewOpen,
               onClick: togglePreview
             }, icon(ICONS.monitor), t('preview')),
            h('button', {
              type: 'button',
              className: 'uxwToggle',
              'data-on': chatOpen,
              title: `${chatOpen ? t('chatClose') : t('chatOpen')} · ${t('chatHint')}`,
              'aria-pressed': chatOpen,
              onClick: toggleChat
            }, icon(ICONS.chat), t('chat')),
            // 导览重播入口。看过一次的人也能自己找回来，
            // 不必去清 localStorage。图标按钮，title/aria 带完整文案。
            h('button', {
              type: 'button',
              className: 'uxwToggle',
              'data-tour': 'tour-replay',
              title: t('tourReplay'),
              'aria-label': t('tourReplay'),
              onClick: openTour
            }, icon(ICONS.help))),

          h('div', { className: 'uxwBody', 'data-chat': chatOpen, 'data-preview': previewOpen, 'data-expanded': expanded ? 'true' : 'false' },
            sideBar(),
            // 左栏拖拽手柄：把宽度调节放在栏与主区之间，
            // 鼠标贴着边界就能找到，不用去翻设置。
            h('div', {
              className: 'uxwGutterHandle',
              'data-dragging': leftResizing ? 'true' : 'false',
              title: t('dragHint'),
              onMouseDown: startResize
            }),
            h('main', { className: 'uxwMain' }, mainBody()),
            // 原生会话：宿主把这个节点 portal 进来，里面就是左侧栏同一套
            // 会话的输入框、消息流、模型选择、审批。放进来就等于「和侧栏打通」，
            // 消息列表不再由我们维护 —— 在侧栏新建/删除/切换会话这里都跟着变。
            chatOpen
              ? h('aside', { className: 'uxwChat', 'aria-label': t('chat') },
                conversation
                  ? h('div', { className: 'uxwNativeConversation' }, conversation)
                  : h(NativeChatFallback, { t, service }))
              : null),

          modal && modal.kind === 'remove'
            ? h(Modal, {
              title: t('remove'),
              onClose: () => setModal(null),
              actions: [
                h('button', { key: 'c', type: 'button', className: 'uxwBtn', onClick: () => setModal(null) }, t('cancel')),
                h('button', { key: 'd', type: 'button', className: 'uxwBtn', 'data-variant': 'danger', onClick: removeInstance }, icon(ICONS.trash), t('remove'))
              ]
            }, h('p', { className: 'uxwBody2' }, t('confirmRemove')))
            : null,

          modal && modal.kind === 'removeRun'
            ? h(Modal, {
              title: t('removeRun'),
              onClose: () => setModal(null),
              actions: [
                h('button', { key: 'c', type: 'button', className: 'uxwBtn', onClick: () => setModal(null) }, t('cancel')),
                h('button', {
                  key: 'd', type: 'button', className: 'uxwBtn', 'data-variant': 'danger',
                  onClick: () => { const id = modal.run.id; setModal(null); deleteRun(id) }
                }, icon(ICONS.trash), t('removeRun'))
              ]
            }, h('p', { className: 'uxwBody2' },
              `${modal.run.instanceName} · ${new Date(modal.run.startedAt).toLocaleString()}`),
              h('p', { className: 'uxwBody2' }, t('confirmRemoveRun')))
            : null,

          modal && modal.kind === 'removeFuncReport'
            ? h(Modal, {
              title: t('funcRemoveReport'),
              onClose: () => setModal(null),
              actions: [
                h('button', { key: 'c', type: 'button', className: 'uxwBtn', onClick: () => setModal(null) }, t('cancel')),
                h('button', {
                  key: 'd', type: 'button', className: 'uxwBtn', 'data-variant': 'danger',
                  onClick: () => { const id = modal.item.id; setModal(null); removeFuncReport(id) }
                }, icon(ICONS.trash), t('funcRemoveReport'))
              ]
            }, h('p', { className: 'uxwBody2' }, modal.item.title),
              h('p', { className: 'uxwBody2' }, t('funcConfirmRemoveReport')))
            : null,

          modal && modal.kind === 'clearRuns'
            ? h(Modal, {
              title: t('clearRuns'),
              onClose: () => setModal(null),
              actions: [
                h('button', { key: 'c', type: 'button', className: 'uxwBtn', onClick: () => setModal(null) }, t('cancel')),
                h('button', {
                  key: 'd', type: 'button', className: 'uxwBtn', 'data-variant': 'danger',
                  onClick: () => { setModal(null); clearRuns() }
                }, icon(ICONS.trash), t('clearRuns'))
              ]
            }, h('p', { className: 'uxwBody2' }, t('confirmClearRuns')))
            : null,

          homeCard(),
          // 导览层压在最上面（z-index:40，高于 Modal 的 30）。
          // 逻辑上它也不可能和 homeCard 同时出现（auto-start 等 adopted），
          // 但层级照旧写清：万一以后有人改触发条件，也不会被确认卡盖住。
          tourLayer())
      }
    }

    /* --------------------------------------------------------------- 装配 -- */

    function apply(ctx) {
      installStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ux-workbench: dictionaries')
      const t = ctx.locale.bind(NS)
      const Panel = createPanel(t)
      ctx.effect(() => ctx.desktopWorkbenches.register({
        title: '找茬工作台',
        titleEn: 'Bug Hunt',
        panelTitle: '找茬工作台',
        description: '添加本地项目文件夹，或直接输入网址检测。右侧是内置浏览器，实时显示你的页面；点一条问题会跳过去并框出对应元素。引擎自动判断主题能力、展开可交互状态，测量文字溢出、对比度、点击热区、焦点、响应延迟与动画掉帧。',
        repository: REPOSITORY,
        category: '质量',
        customFrame: true
      }, Panel), 'dsh-ux-workbench: registration')
    }

    return { apply, inject: ['desktopWorkbenches', 'locale'] }
  }
})