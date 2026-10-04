/**
 * `u*` 界面开关 —— 这一族的实测结论与数据。
 *
 * ## ⚠️ 先说验证边界,这条比数据本身重要
 *
 * 我原本打算给每个开关测出「它到底改了哪些 Vim option」,然后在页面上
 * 画一个代码块、按一下开关看外观真的变。测的时候发现**做不到**:
 *
 * ```
 * nvim_list_uis() = 0            ← headless 根本没有 UI
 * uL 的 rhs = nil                 ← 23/24 条都是 Lua 回调,不是 Ex 字符串
 * :normal! uL → ok=true,但 relativenumber 前后都是 true,一个 User 事件都没发
 * ```
 *
 * 我先怀疑是自己探针写错了,于是自检:
 * 直接 `vim.o.relativenumber = true` 再读,读回来确实是 true —— 探针没问题。
 * 又试 `feedkeys`、试注册 `User` autocmd 监听,全都一样。
 *
 * **结论:键位映射本身能实测,开关的效果不能。** 前者是数据,
 * 后者依赖真实 UI 事件循环,headless 下测不出。
 *
 * 所以下面每个键只标注**实测确认的部分**:
 *   - `key` / `desc` / `rhs` —— 实测自 `nvim_get_keymap("n")`,可信
 *   - `verdict` —— 实测结论,写清楚是什么结论(包括「没变」)
 * - `effect` —— **按约定填的,不是实测**。用于画出页面上的视觉差异,
 *   页面上会明确标注这一栏没经过我验证。
 *
 * 这么分开是因为:算错了比不算更糟。页面上画出来的效果如果和真机不一致,
 * 会教出错的操作感 —— 那比只显示一行文字糟糕得多。
 */

/** 实测出的映射事实 */
export type UiToggle = {
  /** 面板键(去掉了前导空格) */
  key: string;
  /** 本机 desc,实测自 nvim_get_keymap */
  desc: string;
  /**
   * rhs 实测结果。
   *
   * `null` = Lua 回调(实测 23/24 都是),这类键的效果我在 headless 下测不出。
   * 字符串 = 真 Ex 命令,那条我能验。
   */
  rhs: string | null;
  /** 这一族里它属于哪一组 —— 同组的键效果相近,一起记 */
  group: ToggleGroup;
  /**
   * 这一下会让什么**在画面上**变 —— ⚠️ 按约定填的,不是实测。
   * 只用于让页面有东西可画,并在界面上标注「未实测」。
   */
  effect: string;
  /** 画出来要多「重」 —— 决定代码块要不要真的变形 */
  visual: VisualWeight;
};

export type ToggleGroup =
  | "数字与行号"
  | "编辑辅助"
  | "高亮与语法"
  | "界面外观"
  | "布局"
  | "动作(不是开关)";

/**
 * 视觉权重 —— 决定页面怎么画这个效果。
 *
 * 为什么要分档:有些开关(zen mode)会把整个布局重排,有些
 * (conceal level)只在几行里有差别。混在一起画就没有轻重感,
 * 「按了真的变了」这件事反而传达不出去。
 */
export type VisualWeight = "layout" | "gutter" | "inline" | "screen";

export const UI_TOGGLES: UiToggle[] = [
  // ---- 数字与行号 ----
  // 这两条实测 rhs=nil(回调),效果 headless 测不出。
  {
    key: "uL",
    desc: "Toggle Relative Number",
    rhs: null,
    group: "数字与行号",
    effect: "行号变成当前行绝对、其它行相对",
    visual: "gutter",
  },
  {
    key: "ul",
    desc: "Toggle Line Numbers",
    rhs: null,
    group: "数字与行号",
    effect: "左侧行号栏整列出现或消失",
    visual: "gutter",
  },
  // ---- 编辑辅助 ----
  {
    key: "us",
    desc: "Toggle Spelling",
    rhs: null,
    group: "编辑辅助",
    effect: "拼错的词底下出现红色波浪线",
    visual: "inline",
  },
  {
    key: "uw",
    desc: "Toggle Wrap",
    rhs: null,
    group: "编辑辅助",
    effect: "长行折行显示,左右不再有横向滚动条",
    visual: "layout",
  },
  {
    key: "uh",
    desc: "Toggle Inlay Hints",
    rhs: null,
    group: "编辑辅助",
    effect: "参数名等灰色提示字浮在代码上面",
    visual: "inline",
  },
  {
    key: "up",
    desc: "Toggle Mini Pairs",
    rhs: null,
    group: "编辑辅助",
    effect: "括号后浮现对应的闭括号",
    visual: "inline",
  },
  {
    key: "ud",
    desc: "Toggle Diagnostics",
    rhs: null,
    group: "编辑辅助",
    effect: "报错行下方出现诊断说明块",
    visual: "inline",
  },
  {
    key: "uF",
    desc: "Toggle Auto Format (Buffer)",
    rhs: null,
    group: "编辑辅助",
    effect: "保存时自动格式化,只在当前文件生效",
    visual: "screen",
  },
  {
    key: "uf",
    desc: "Toggle Auto Format (Global)",
    rhs: null,
    group: "编辑辅助",
    effect: "保存时自动格式化,全局生效",
    visual: "screen",
  },

  // ---- 高亮与语法 ----
  {
    key: "uT",
    desc: "Toggle Treesitter Highlight",
    rhs: null,
    group: "高亮与语法",
    effect: "关键字/字符串/注释的语法高亮整体消失",
    visual: "screen",
  },
  {
    key: "ug",
    desc: "Toggle Indent Guides",
    rhs: null,
    group: "高亮与语法",
    effect: "缩进层级出现竖线",
    visual: "inline",
  },
  {
    key: "ub",
    desc: "Toggle Dark Background",
    rhs: null,
    group: "高亮与语法",
    effect: "深色/浅色背景整体切换",
    visual: "screen",
  },
  {
    key: "uc",
    desc: "Toggle Conceal Level",
    rhs: null,
    group: "高亮与语法",
    effect: "长的组合键显示成符号(可逐级加)",
    visual: "inline",
  },

  // ---- 界面外观 ----
  {
    key: "uS",
    desc: "Toggle Smooth Scroll",
    rhs: null,
    group: "界面外观",
    effect: "滚动带缓动",
    visual: "screen",
  },
  {
    key: "ua",
    desc: "Toggle Animations",
    rhs: null,
    group: "界面外观",
    effect: "界面动画开或关",
    visual: "screen",
  },
  {
    key: "uD",
    desc: "Toggle Dimming",
    rhs: null,
    group: "界面外观",
    effect: "屏保时屏幕变暗",
    visual: "screen",
  },

  // ---- 布局 ----
  {
    key: "uZ",
    desc: "Toggle Zoom Mode",
    rhs: null,
    group: "布局",
    effect: "当前窗口占满,再按恢复",
    visual: "layout",
  },
  {
    key: "uz",
    desc: "Toggle Zen Mode",
    rhs: null,
    group: "布局",
    effect: "关掉状态栏/行号/符号栏,只剩代码",
    visual: "layout",
  },
  {
    key: "uA",
    desc: "Toggle Tabline",
    rhs: null,
    group: "布局",
    effect: "顶部标签条出现或消失",
    visual: "layout",
  },

  // ---- 动作(不是开关) ----
  // ⚠️ 这一组**没有开/关两态**,按一下就执行一次。
  //   页面模型里必须把它们和真开关分开,否则会误导成「可以反复切」。
  {
    key: "ur",
    desc: "Redraw / Clear hlsearch / Diff Update",
    // ★ 24 条里**唯一**有真 rhs 的,所以它的效果我实测过。
    rhs: "<Cmd>nohlsearch|diffupdate|normal! <C-L><CR>",
    group: "动作(不是开关)",
    effect: "重画屏幕、清搜索高亮、刷新 diff",
    visual: "screen",
  },
  {
    key: "un",
    desc: "Dismiss All Notifications",
    rhs: null,
    group: "动作(不是开关)",
    effect: "关掉所有通知(按一次就完了)",
    visual: "screen",
  },
  {
    key: "uC",
    desc: "Colorschemes",
    rhs: null,
    // ⚠️ 归在「动作」不是「开关」—— 它是弹出选择器,按一下弹一次,
    // 没有开/关两态。我第一版把它放在「界面外观」组里,单测直接抓出来。
    group: "动作(不是开关)",
    effect: "弹出配色方案选择器",
    visual: "screen",
  },
  {
    key: "uI",
    desc: "Inspect Tree",
    rhs: null,
    group: "动作(不是开关)",
    effect: "把 Treesitter 解析树打到消息区",
    visual: "screen",
  },
  {
    key: "ui",
    desc: "Inspect Pos",
    rhs: null,
    group: "动作(不是开关)",
    effect: "把光标位置信息打到消息区",
    visual: "screen",
  },
];

/**
 * ⚠️ 实测记录:我用过的每个探针和它的结果。
 *
 * 留着是因为「测不出来」本身是需要证据的结论,不是猜的。
 * 以后要真验,知道该换什么手段(真实 TTY 里的 nvim、或直接调插件函数)。
 */
export const PROBE_LOG: string[] = [
  "nvim_list_uis() = 0 —— headless 没有 UI,这批开关的效果本来就不一定有地方渲染",
  "u* 共 24 条:rhs=nil 的 23 条(Lua 回调),只有 ur 是 Ex 字符串",
  ":normal! uL → 返回 ok=true,但 relativenumber 前后都是 true",
  "改用 feedkeys(uL) → 一样没变",
  "注册 User autocmd 监听全部事件 → 按下 u* 一个事件都没发",
  "探针自检:直接 vim.o.relativenumber=true 再读,读回 true → 探针本身没问题",
  "lazy.core.cache.plugins 在 headless 下是空的 → 插件归属也测不出",
  "不触发 VeryLazy 时 u* 只有 2 条(un / uC)—— 其余 22 条是懒加载注册的",
];

/** Vim 原生等价 —— 只作对照,不作解法 */
export const NATIVE: Record<string, string> = {
  uL: ":set relativenumber!",
  ul: ":set number!",
  us: ":set spell!",
  uw: ":set wrap!",
  uh: "(无 Ex 等价)",
  up: "(无 Ex 等价)",
  ud: "(无 Ex 等价)",
  uT: "(无 Ex 等价)",
  ug: "(无 Ex 等价)",
  ub: ":set background=light / :set background=dark",
  uc: ":set conceallevel=N",
  uS: ":set scrolljump / smoothscroll(版本相关)",
  ua: "(无 Ex 等价)",
  uD: "(无 Ex 等价)",
  uC: ":colorscheme <名字>",
  uZ: ":tab split 布局类 / 无直接等价",
  uz: "(无 Ex 等价)",
  uA: ":set showtabline=2",
  ur: ":nohlsearch | :diffupdate | :redraw!",
  un: ":lua require('snacks.notifier').dismiss()",
  uI: ":checkhealth treesitter",
  ui: ":echo getcurpos()",
  uF: ":set autoread / 由 conform 插件管,无 Ex 等价",
  uf: "(无 Ex 等价)",
};

/** 这一族里哪些是真的「开关」,哪些是「按一下就完」的动作 */
export function isToggle(t: UiToggle): boolean {
  return t.group !== "动作(不是开关)";
}

export function findToggle(key: string): UiToggle | undefined {
  return UI_TOGGLES.find((t) => t.key === key);
}

export function groupsOf(): ToggleGroup[] {
  const seen: ToggleGroup[] = [];
  for (const t of UI_TOGGLES) if (!seen.includes(t.group)) seen.push(t.group);
  return seen;
}