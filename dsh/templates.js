/**
 * 找茬工作台 · 默认值
 *
 * 这里不再有「模板」这个概念。
 * 用户只提供一个网址，点测试 —— 测什么由引擎根据页面实际能力决定（见 explore.js）。
 * 本文件只保留两样东西：检测项的出厂默认值，和首次启动的示例实例。
 */

export const DETECTOR_DEFAULTS = {
  overflow: { enabled: true, options: {} },
  horizontalScroll: { enabled: true, options: {} },
  tapTarget: { enabled: true, options: {} },
  darkLeak: { enabled: true, options: {} },
  contrast: { enabled: true, options: {} },
  focus: { enabled: true, options: {} },
  feedback: { enabled: true, options: {} },
  jank: { enabled: true, options: {} }
}

/** 新建实例时的满配默认值；引擎跑的时候会按页面能力再收敛一次。 */
export function defaultDetectors() {
  return Object.entries(DETECTOR_DEFAULTS).map(([id, item]) => ({
    id,
    enabled: item.enabled,
    options: { ...item.options }
  }))
}

/** 首次启动写入的示例实例：指向内置演示场，开箱即可跑。 */
export const SAMPLE_INSTANCES = [
  {
    id: 'inst-demo',
    name: '体验缺陷演示场',
    url: 'builtin:demo',
    description: '内置演示页，故意放了七类体验缺陷。第一次用先点它，能直观看到检测在做什么。',
    detectors: null, // null 表示「由引擎自动决定」
    viewports: [],
    themes: null,    // null 表示「由引擎探测」
    builtin: true
  }
]