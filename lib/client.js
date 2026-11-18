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

/* ═══ 原生会话（宿主注入，不再自建聊天界面） ═══
   这里只负责给宿主那个被 portal 进来的 span 撑出空间。
   消息流、输入框、模型选择、审批都归宿主，样式也归宿主 ——
   我们改它们的样式会在下一次 Desktop 更新后错位。 */
.uxwChat{display:flex;flex-direction:column;flex:0 0 auto;width:392px;min-width:0;min-height:0;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.uxwNativeConversation{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0;height:100%;overflow:hidden}
.uxwNativeConversation>span{display:flex !important;flex:1 1 auto;min-height:0;min-width:0}
.uxwChatEmpty{display:flex;flex-direction:column;align-items:center;gap:9px;margin:auto;padding:22px 18px;text-align:center;font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.uxwChatEmpty b{display:block;margin:0 0 2px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.uxwChatFail{max-width:100%;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#d9534f)}
@media(max-width:1180px){.uxwChat{width:330px}}
@media(max-width:900px){.uxwChat{width:100%}}

@media(max-width:980px){.uxwSide{width:184px}.uxwMainScroll{padding:18px 18px 36px}.uxwVerdictNums{gap:12px}}
@media(max-width:760px){.uxwSide{display:none}.uxwBrandSub{display:none}.uxwVerdict{flex-wrap:wrap}.uxwVerdictNums{width:100%;justify-content:flex-start}}
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
      retest: '重新检测',
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
      chatNewTitle: '这个工作台还没有会话',
      chatNewText: '新建一个会话就能开始对话。会话会出现在左侧栏，可以随时切换、重命名或删除。',
      chatPickWorkspace: '选择工作区',
      chatNewHere: '在此工作区新建会话',
      chatNewWorkspace: '新建工作区并开始对话',
      chatStarting: '正在创建…'
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
      retest: 'Run again',
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
      chatNewTitle: 'This workbench has no session yet',
      chatNewText: 'Start a session to chat. It shows up in the left sidebar and can be switched, renamed or deleted at any time.',
      chatPickWorkspace: 'Choose a workspace',
      chatNewHere: 'New session in this workspace',
      chatNewWorkspace: 'New workspace and start chatting',
      chatStarting: 'Creating…'
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
    function BuiltinBrowser({ t, state, frame, onRetry, locating, frameRef, expanded, onToggleExpand, fileError, resize }) {
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
        // 读文件失败时右栏要说清楚，而不是留一片空白
        fileError ? h('div', { className: 'uxwPvEmpty' }, fileError) : h('div', { className: 'uxwPvStage' }, stage()),
        // 底栏只用来显示当前网址；没有网址时不占一行空白
        url
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
        fetch(`${API}/home`, { headers: { 'content-type': 'application/json' } })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => { if (alive && payload) setHome(payload) })
          .catch(() => {})
        return () => { alive = false }
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
              body: JSON.stringify({ path: home && home.path })
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || `创建失败 ${response.status}`)
            setHome((current) => ({
              ...(current || {}), adopted: true, path: payload.path,
              workspaceId: payload.workspaceId, missing: false, needsConfirmation: false
            }))
          } catch (reason) {
            setHomeError(String((reason && reason.message) || reason))
          } finally { setHomeBusy(false) }
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



        React.useEffect(() => { loadAll() }, [loadAll])
        React.useEffect(() => { loadRuns() }, [loadRuns])
        React.useEffect(() => { instancesRef.current = instances }, [instances])

        React.useEffect(() => { detailRef.current = detail }, [detail])

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

        const startRun = async () => {
          if (busy) return
          const target = url.trim()
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

        const openRun = async (runId) => {
          try {
            const data = await callApi(`run-detail?id=${encodeURIComponent(runId)}`)
            setDetail(data.run)
            setSelectedIssue(null)
            if (data.run && data.run.url) setUrl(data.run.url)
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

        const retryPreview = () => { if (detail) showPreview(detail) }

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
         * 报告变了就跟着换画面。
         *
         * 手动点「开始检测」、点历史记录、以及 AI 在工作台里发起的检测，最后都
         * 落到 detail 上 —— 统一在这里开预览，三条路径就不会各自漏一步。
         */
        const previewedRunRef = React.useRef(null)
        React.useEffect(() => {
          if (!detail || !detail.url) return
          if (previewedRunRef.current === detail.id) return
          previewedRunRef.current = detail.id
          setSelectedIssue(null)
          showPreview(detail)
        }, [detail, showPreview])

        /**
         * 把 iframe 里的元素滚进可视区，只动 iframe 自己的滚动。
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

          // 让某个滚动容器（或窗口）朝 target 挪一点；挪不动返回 false。
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

            let dx = 0
            if (left < MARGIN) dx = left - MARGIN
            else if (right > viewW - MARGIN) dx = right - viewW + MARGIN
            let dy = 0
            if (top < MARGIN) dy = top - MARGIN
            else if (bottom > viewH - MARGIN) dy = bottom - viewH + MARGIN
            // 元素比视口还高时贴齐上边，别为了露出下边把它顶出屏幕
            if (box.height > viewH - MARGIN * 2) dy = top - MARGIN
            if (!dx && !dy) return false

            if (asWindow) {
              const currentX = win.scrollX || se.scrollLeft || 0
              const currentY = win.scrollY || se.scrollTop || 0
              const maxX = Math.max(0, se.scrollWidth - (se.clientWidth || viewW))
              const maxY = Math.max(0, se.scrollHeight - (se.clientHeight || viewH))
              win.scrollTo({
                left: Math.max(0, Math.min(currentX + dx, maxX)),
                top: Math.max(0, Math.min(currentY + dy, maxY)),
                behavior: 'smooth'
              })
            } else {
              // 内层容器（弹层、列表）用直接赋值，避免和祖先的平滑滚动互相打架
              container.scrollLeft = Math.max(0, Math.min(container.scrollLeft + dx, container.scrollWidth - container.clientWidth))
              container.scrollTop = Math.max(0, Math.min(container.scrollTop + dy, container.scrollHeight - container.clientHeight))
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

            h('div', { className: 'uxwSideHead', style: { marginTop: '16px' } },
              h('span', { className: 'uxwSideTitle' }, t('runs')),
              // 记录攒到上限就自动淘汰最旧的，但用户想主动清掉时也得有个入口。
              // 没记录时不显示，避免一个点了没反应的按钮占着位置。
              runs.length > 0
                ? h('button', {
                  type: 'button', className: 'uxwBtn', 'data-variant': 'quiet',
                  title: t('confirmClearRuns'),
                  'aria-label': t('clearRuns'),
                  onClick: () => setModal({ kind: 'clearRuns' })
                }, t('clearRuns'))
                : null),
            runs.length === 0
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
                  : null)),

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
        h('div', { className: 'uxwSplitReport' }, reportContent()),
        sidePanel())

        /**
         * 首次打开时的确认卡。
         *
         * 只在用户点「创建」之后才 POST —— 宿主的工作台规范不允许插件在
         * 用户确认前静默建目录。取消就什么都不留下。
         */
        const homeCard = () => {
          if (!home || home.adopted === true || homeDismissed) return null
          const missing = home.missing === true
          const occupied = home.needsConfirmation === true && !missing
          return h('div', { className: 'uxwHome', role: 'dialog', 'aria-modal': 'true' },
            h('div', { className: 'uxwHomeBox' },
              h('div', { className: 'uxwHomeHead' },
                h('h2', null, missing ? '工作台文件夹不见了' : occupied ? '这个文件夹已存在' : '为找茬工作台创建文件夹')),
              h('div', { className: 'uxwHomeBody' },
                h('p', null, missing
                  ? '之前用的文件夹已经不在了。可以重新创建它，或者换一个位置。'
                  : occupied
                    ? '这个位置已经有文件夹了。如果里面有你自己放的文件，它们不会被改动。'
                    : '找茬工作台需要一个自己的文件夹，检测产物都会放在这里，不会和你别的工作混在一起。'),
                h('p', { className: 'uxwHomePath' }, home.path || '（暂时无法确定默认位置）'),
                home.oneDrive
                  ? h('p', { className: 'uxwHomeWarn' }, '这个位置在云盘同步目录里，检测产物较多，同步可能变慢。')
                  : null,
                home.suggestionError ? h('p', { className: 'uxwHomeWarn' }, home.suggestionError) : null,
                !home.available
                  ? h('p', { className: 'uxwHomeNote' }, home.reason || '当前版本无法自动创建工作区，请手动选择一个已有文件夹。')
                  : h('p', { className: 'uxwHomeNote' }, '点「创建」之后才会真正建这个文件夹；现在关闭不会留下任何东西。'),
                homeError ? h('p', { className: 'uxwHomeErr', role: 'alert' }, homeError) : null),
              h('div', { className: 'uxwHomeFoot' },
                h('button', {
                  type: 'button', className: 'uxwBtn',
                  onClick: () => setHomeDismissed(true), disabled: homeBusy
                }, '稍后再说'),
                h('button', {
                  type: 'button', className: 'uxwBtn', 'data-variant': 'primary',
                  onClick: adoptHome, disabled: homeBusy || !home.available
                }, homeBusy ? '创建中…' : missing ? '重新创建' : '创建'))))
        }

        return h('div', { className: 'uxw', 'data-resizing': (resizing || leftResizing) ? 'true' : 'false' },
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
            h('div', { className: 'uxwField', 'data-focused': focused, 'data-busy': busy },
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
            h('div', { className: 'uxwSpacer' }),
             h('button', { type: 'button', className: 'uxwToggle', 'data-on': previewOpen, title: previewOpen ? t('previewOff') : t('previewOn'), 'aria-pressed': previewOpen, onClick: () => { setPreviewOpen((current) => !current); setChatOpen(false) } }, icon(ICONS.monitor), t('preview')),
            h('button', {
              type: 'button',
              className: 'uxwToggle',
              'data-on': chatOpen,
              title: `${chatOpen ? t('chatClose') : t('chatOpen')} · ${t('chatHint')}`,
              'aria-pressed': chatOpen,
              onClick: () => { setChatOpen((current) => !current); setPreviewOpen(false) }
            }, icon(ICONS.chat), t('chat'))),

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

          homeCard())
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