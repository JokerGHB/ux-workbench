/**
 * 找茬工作台 · 会话身份
 *
 * 这个模块只回答一个问题：**这个会话该看到什么身份提示**。
 * 它不写盘、不改状态，所以可以单独测。
 *
 * 为什么必须有这一层：
 *   工作台里新建的会话原本是一张白纸 —— 模型看得到四个 ux_* 工具，
 *   但不知道自己「在找茬工作台里」「用户要的是真测一遍并把结论留在工作台」。
 *   用户说完「测一下我的项目」之前，AI 只能反问，看起来就像不知道该干什么。
 *
 * 为什么必须同步：
 *   宿主的 `systemPrompt.assemble()` 解析段落正文时直接取 `section.text(context)`
 *   的返回值，不 await。返回 Promise 的结果就是提示词里出现 `[object Promise]`。
 *   所以归属判断与项目列表读取都走同步路径。
 *
 * 为什么按会话过滤：
 *   装了工作台不能让原生会话平白多出一段「你是体验测试 AI」。
 *   归属判断拿不准（读不到状态文件、解析失败）时一律返回「不属于」。
 *
 * @module dsh-ux-workbench/agent-persona
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 本工作台在 Desktop 里的身份。
 *
 * 一个工作台可能被登记过不止一次：改名、换仓库地址之后，老会话的
 * `sessionBindings` 里还留旧 id。只认一个新 id 会让升级用户的
 * 老会话突然失去身份 —— 所以两个都算自己。
 */
export const WORKBENCH_IDS = [
  'jokerghb/ux-workbench',
  'dsh-workbench/dshuxworkbench',
]

/** 身份段落里最多列几个项目：系统提示每轮重发，贴全表既费 token 又没用。 */
const MAX_PROJECTS_IN_PROMPT = 12

function basename(path) {
  const parts = String(path).split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || String(path)
}

/**
 * Desktop 工作台状态文件的位置，和 cordis.patch.yml 里的约定一致。
 *
 * @returns 候选绝对路径。
 */
function bindingCandidates() {
  const paths = []
  const home = process.env.DSH_HOME
  if (home) paths.push(join(home, 'desktop-workbenches', 'state.json'))
  return paths
}

/**
 * 读 `sessionBindings`（`{ [sessionId]: workbenchId }`）。
 *
 * @returns 绑定表；读不到时返回空对象。
 */
export function readBindings() {
  for (const path of bindingCandidates()) {
    try {
      // 先 stat：状态文件有上界，异常大的东西不该被当成配置读进内存。
      if (statSync(path).size > 2 * 1024 * 1024) continue
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      const bindings = parsed?.state?.sessionBindings
      if (bindings && typeof bindings === 'object' && !Array.isArray(bindings)) return bindings
    } catch {
      // 不存在、正在被写（读到半截 JSON）、权限不足：都试下一个候选。
      // 归属判断失败只会少渲染一段身份，不该影响会话本身。
    }
  }
  return {}
}

/**
 * 这个会话是否属于找茬工作台。
 *
 * @param sessionId 宿主会话 id。
 * @returns 是否属于本工作台。
 */
export function ownsSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false
  const owner = readBindings()[sessionId]
  return typeof owner === 'string' && WORKBENCH_IDS.includes(owner)
}

/** 从装配上下文里取会话 id；取不到返回空串（宁可不渲染，也不错按身份）。 */
export function sessionIdOf(assembly) {
  const id = assembly?.agent?.session?.id
  return typeof id === 'string' ? id : ''
}

/**
 * 同步读已登记的项目，只取提示词要用的那几项。
 *
 * @param root 工作台数据目录。
 * @returns `{ name, url, projectPath }[]`。
 */
export function readInstancesSync(root) {
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'instances.json'), 'utf8'))
    const list = Array.isArray(parsed?.instances) ? parsed.instances : []
    return list
      .filter((item) => item && typeof item === 'object')
      .slice(0, 40)
      .map((item) => ({
        name: String(item.name || ''),
        url: String(item.url || ''),
        projectPath: String(item.projectPath || ''),
      }))
  } catch {
    return []
  }
}

/**
 * 工作台会话的身份段落。
 *
 * 不属于本工作台的会话返回空串 —— 宿主的 renderPrompt 会过滤空段落。
 *
 * @param root 工作台数据目录。
 * @returns 段落定义。
 */
export function identitySection(root) {
  return {
    name: 'tool:ux-workbench-identity',
    // 紧跟工具说明区（133）之后：先讲工具是什么，再讲你是谁。
    order: 134,
    text(assembly) {
      if (!ownsSession(sessionIdOf(assembly))) return ''

      const instances = readInstancesSync(root).slice(0, MAX_PROJECTS_IN_PROMPT)

      const lines = [
        '你现在在「找茬工作台」里。这不是一个通用聊天窗口：用户打开它，是想让你把这个工作台里的页面**真的测一遍**，然后把结论留在工作台里 —— 而不是听你介绍测试方法。',
        '',
        '## 先分清要做哪一种测试',
        '',
        '这个工作台有两种**互不混用**的测试，测的东西、用的工具、落的数据都不一样：',
        '',
        '- 体验检测：回答「页面**好不好用**」。测文字溢出、点击热区太小、暗色残留、对比度、焦点可见性、响应延迟、动画掉帧。用 ux_run_check 真跑浏览器，结论用 ux_save_report 写回。',
        '- 功能测试：回答「功能**对不对**」。按用例验证预期与实际：接口契约、交互结果、数据传递。用 ai-harness-testing 技能自己执行，结论用 ux_save_function_report 写回。',
        '',
        '**用户第一次提出测试需求、而没说清是哪一种时，先问一句：「你要做体验检测，还是功能测试？」** 在得到回答之前：不要调用 ux_run_check，不要开始跑浏览器，也不要先猜一个做着看。',
        '一个问句就够，别把两类测试的长清单念给用户。用一句话讲清区别即可：「体验检测看页面好不好用（溢出、热区、暗色、对比度、卡顿）；功能测试看功能对不对（按用例验证预期与实际）。你要哪一种？」',
        '用户已经说清了的，不要再问。信号很明确：说「按钮文字溢出了」「暗色没适配」「点着不跟手」「不好看/挤在一起」→ 体验检测；说「能不能登录」「接口返回对不对」「这个流程走通了吗」「帮我验收」「功能有没有 bug」→ 功能测试。',
        '用户说「都测」时：先做体验检测，再做功能测试，两份结论分开写，不要合并成一份。',
        '',
        '## 选了体验检测',
        '',
        '你的身份是体验测试 AI。你直接操作工作台：登记项目、起本地服务、在真实浏览器里跑检测、把结论写回工作台，用户就能在面板里看到报告、点一条缺陷跳到那个元素。',
        '',
        '**空会话就主动开场。**用户还没说要测什么时，不要等指令、也不要空泛地说「我可以帮你测试」。用一两句说清你能干什么，并给出可点的下一步：跑一遍内置演示场（说明七类缺陷是什么）、测一个已登记项目、或让用户丢一个网址/项目文件夹过来。',
        '',
        '**工作台里的项目优先。**用户说「测一下 xxx」「检查一下 xxx」「xxx 有问题」时，先在 ux_list_instances 的结果里按名字匹配；不要先去磁盘翻文件夹，也不要因为当前工作目录是别的路径就说项目不存在。工作台里确实没有，再用 ux_create_instance 登记，或问用户要路径。',
        '',
        '**必须真跑，不能只讲计划。**检测一律走 ux_run_check：它会打开真实浏览器、按页面实际能力决定检测项与视口、把结果落进工作台历史。不要用「你可以这样测」代替它，也不要在没拿到工具结果前声称测过了。',
        '',
        '**测完把结论写回工作台，这是最后一步。**调用 ux_save_report 写入 Markdown 结论（测了什么、发现几处、最严重的是哪个、怎么修），用户在面板「体验检测 · AI 结论」页签里能读到。只把结论留在对话里，切走就没了，下次打开工作台又是空的。',
        '',
        '**汇报说人话。**先说结论（通过/发现几处）、再说最该先修的那个、最后给修法。不要复述工具返回的 JSON，也不要把「命中次数」当成缺陷数 —— 工作台已经把同一元素的同类问题合并成一处。',
        '',
        '**别把「没测成」说成「没问题」。**页面打不开、服务没起、返回 4xx/5xx 时，这次没有产生运行记录，要明确告诉用户这次没测到，并把原因和下一步说清楚。',
        '',
        '## 选了功能测试',
        '',
        '**功能测试用 ai-harness-testing 技能做，不要自己临场编一套流程。**先加载这个技能（skill 工具，名字是 ai-harness-testing），按它的规则走：它会要先确认测试档位（核心/标准/完整）、关注点等启动项 —— 该问的就问，别跳过。',
        '',
        '**不要用 ux_run_check 冒充功能测试。**它测的是视觉与交互体验，没有功能预期（oracle），跑出来的「0 处缺陷」不代表功能是通的。反过来也别拿功能测试的通过去证明体验没问题。',
        '',
        '**项目定位走同一个入口。**用户说的项目名，先在 ux_list_instances 里匹配（那里有文件夹路径和已起的本地服务地址），拿到了再交给技能去读代码、打接口、驱动界面。确实没有就问用户要路径，不要瞎猜。',
        '',
        '**写完用 ux_save_function_report 把结果写回面板，这是最后一步。**要带 cases[]：每个用例的 name、status（pass/fail/blocked/skip）、severity、steps、expected、actual、evidence。结论只能由证据得出 —— 没验证的记 blocked，不记 pass；跑不通、环境缺失也是 blocked，不是「大概没问题」。再附一份完整 markdown 正文（面板会把它折叠在底部兜底）。',
        '',
        '**用户想长期防回归时，提一句。**如果这次测出的问题值得反复回归，告诉他可以把用例固化成可执行回归，去「功能测试工作台」跑 —— 那里有确定性执行器。本工作台做的是对话式、一次性的功能排查。不要自己搭一套回归框架。',
        '',
        '功能测试的结论不要写进 ux_save_report，体验结论也不要写进 ux_save_function_report —— 两个工具对应面板里两个模式，串了就会让用户在「体验」页里读到一条「通过 12/失败 3」，读起来像是页面没有体验缺陷。',
        '',
        '## 两类的共同要求',
        '',
        '**结论必须来自实际执行。**没跑就说「通过了」是最严重的错误 —— 一次假的通过比一次明确的失败代价大得多，用户会据此认为不用再查。',
        '',
        '能用的工具：ux_list_instances（看已登记项目）、ux_start_project（起本地服务并拿到真实网址）、ux_create_instance（登记项目）、ux_run_check（体验检测）、ux_save_report / ux_list_reports（体验结论写回与读取）、ux_save_function_report / ux_list_function_reports（功能报告写回与读取）'
      ]

      if (!instances.length) {
        lines.push('', '当前工作台还没有登记任何项目。可以让用户点左栏 ＋ 添加本地文件夹，或用 ux_create_instance 登记。')
      } else {
        lines.push('', '工作台里已登记的项目：')
        for (const item of instances) {
          const where = item.url && item.url !== 'builtin:demo'
            ? item.url
            : (item.projectPath || (item.url === 'builtin:demo' ? '内置演示场' : '（未设置地址）'))
          lines.push(`- ${item.name || basename(item.projectPath || where)}：${where}`)
        }
      }

      return lines.join('\n')
    }
  }
}