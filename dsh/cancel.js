/**
 * 一次检测的「可中断」语义。
 *
 * 为什么要单独一个文件：中断这件事散落在执行器、自动展开、任务调度三处，
 * 写错任何一处都会出现「点了停止但还在跑」或者「停了却没结果」。把它收在
 * 一个没有宿主依赖的小模块里，就能单独把行为测出来，而不是靠 grep 源码。
 *
 * 三条规则：
 *   1. 停止不是失败。跑了一半被用户叫停，和页面打不开是两回事。
 *   2. 停止要留住已经发现的东西。用户叫停不等于那些缺陷不存在。
 *   3. 停止要快。每个会耗时的地方开头都过一遍检查点，而不是等整轮跑完。
 */

/** 用户主动停止时抛出。上层据此显示「已停止」，而不是报错。 */
export class RunAborted extends Error {
  constructor(message = '已停止') {
    super(message)
    this.name = 'RunAborted'
  }
}

/**
 * 造一个检查点函数。
 *
 * 调用方拿到之后，在每个耗时的环节开头调一次；已停止会立刻抛 RunAborted，
 * 让调用栈一路 unwind 回执行器的收尾逻辑。
 *
 * @param {AbortSignal|null|undefined} signal
 * @returns {() => void}
 */
export function createCheckpoint(signal) {
  return () => {
    if (signal && signal.aborted) throw new RunAborted()
  }
}

/** 只问「该不该停」，不抛异常 —— 给循环用，让它可以干净地 break 并保留已有结果。 */
export function createShouldStop(signal) {
  return () => Boolean(signal && signal.aborted)
}