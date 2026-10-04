/**
 * `<C-w>*` 家族 —— 键 → 操作 的映射表。
 *
 * ## 一键两解
 *
 * 用户要求:每个键都有两条路,前缀都保留:
 *
 *   原生   `<C-w>v`   任何 Vim 都有
 *   LazyVim `<Space>w` + 键   本机的 leader 系映射
 *
 * 为什么不省前缀:`<Space>w` 和 `<C-w>` 在真机上都是"进一个窗口面板",
 * 肌肉记忆要记的是**完整路径**。省掉前缀会练出错误的肌肉记忆,
 * 而且用户明确要求不省。
 *
 * ## 实测依据(本机 LazyVim 16.0.1 / Neovim 0.11.6)
 *
 * `nvim_get_keymap("n")` 里 `w` 前缀的原始 lhs 原文(**带前导空格**,
 * 因为 leader 是 `<Space>`):
 *
 *   " wd"        -> <C-W>c   Delete Window
 *   " wm"        -> (nil)    Toggle Zoom Mode
 *   "<C-W> "    -> (nil)    Window Hydra Mode (which-key)   ← hydra 入口
 *
 * ⚠️ probe 踩过的坑:一开始用 `lhs:sub(1,1) == "w"` 过滤,
 * 结果一个都没匹配到 —— 因为实际字符串是 `" wm"`,第一个字符是空格。
 * **探针本身没验证对,基于它的"键不存在"结论全部作废。**
 * 教训:过滤字符串前先 `vim.inspect()` 打出来看一眼。
 *
 * ## 验证边界(必须说清)
 *
 * headless + `feedkeys` 进不去 which-key 面板 —— 面板要真实 UI 才弹。
 * 所以下面 `hydraOnly` 的键:
 *   - 我**能**确认 `<C-w>X` 直接按是生效的(实测)
 *   - 我**不能**确认 `<Space>w` + X 在真机上是否走通
 * 用户说他手动按是能用的,所以训练时两条都收,但这属于
 * 「用户实测 + 我未验证」,不写进 verified。
 */

import type { Op } from "./split";

/** 一键两解 */
export type WinKey = {
  /** hydra 面板上显示的键 */
  key: string;
  /** 原生 Vim 写法,任何 Vim 都可用 */
  native: string;
  /** 本机 leader 写法 */
  lazy: string;
  /**
   * 本机还有**更短的等价键**(实测自 nvim_get_keymap)。
   *
   * 这些是真正值得优先记的 —— 少按一个键,或者干脆不用进面板。
   * 例:`s` 横切有 `<Space>-`,两键就能按完,不用 `<Space>ws` 三键。
   */
  alt?: string;
  /** 中文说明 */
  desc: string;
  /** 分组 */
  group: "切分" | "移动" | "关闭" | "尺寸" | "其他";
  /** 这一页是否建模了效果 */
  modeled: boolean;
  /**
   * 只在 hydra 内部有效、Normal 模式没有顶层映射的键。
   *
   * 注意这不代表"用不了" —— hydra 面板里能按,
   * 只是不能直接 `<C-w>X` 那样裸按。
   */
  hydraOnly?: boolean;
  /**
   * 这页不练它,并说明理由。
   *
   * `^D` 属于这一类:它出现在窗口面板里,但根本不是窗口操作
   * (是显示光标处的 LSP 诊断),放进窗口训练只会干扰。
   */
  skip?: string;
};

export const WIN_KEYS: WinKey[] = [
  // ---- 切分 ----
  { key: "v", native: "<C-w>v", lazy: "<Space>wv", alt: "<Space>|", desc: "竖着切一刀", group: "切分", modeled: true },
  { key: "s", native: "<C-w>s", lazy: "<Space>ws", alt: "<Space>-", desc: "横着切一刀", group: "切分", modeled: true },

  // ---- 移动焦点 ----
  // 实测:本机把导航挪到了 <C-H/J/K/L>,比 <C-w>h/j/k/l 少一个键
  { key: "h", native: "<C-w>h", lazy: "<Space>wh", alt: "<C-H>", desc: "跳到左边的窗口", group: "移动", modeled: true },
  { key: "j", native: "<C-w>j", lazy: "<Space>wj", alt: "<C-J>", desc: "跳到下边的窗口", group: "移动", modeled: true },
  { key: "k", native: "<C-w>k", lazy: "<Space>wk", alt: "<C-K>", desc: "跳到上边的窗口", group: "移动", modeled: true },
  { key: "l", native: "<C-w>l", lazy: "<Space>wl", alt: "<C-L>", desc: "跳到右边的窗口", group: "移动", modeled: true },

  // ---- 移动窗口 ----
  { key: "H", native: "<C-w>H", lazy: "<Space>wH", desc: "把窗口移到最左", group: "移动", modeled: true, hydraOnly: true },
  { key: "J", native: "<C-w>J", lazy: "<Space>wJ", desc: "把窗口移到最后", group: "移动", modeled: true, hydraOnly: true },
  { key: "K", native: "<C-w>K", lazy: "<Space>wK", desc: "把窗口移到最上", group: "移动", modeled: true, hydraOnly: true },
  { key: "L", native: "<C-w>L", lazy: "<Space>wL", desc: "把窗口移到最右", group: "移动", modeled: true, hydraOnly: true },

  // ---- 关闭 / 交换 ----
  { key: "d", native: "<C-w>d", lazy: "<Space>wd", desc: "关掉当前窗口", group: "关闭", modeled: true },
  { key: "o", native: "<C-w>o", lazy: "<Space>wo", desc: "只留当前窗口,其他全关", group: "关闭", modeled: true, hydraOnly: true },
  { key: "x", native: "<C-w>x", lazy: "<Space>wx", desc: "和下一个窗口换位置", group: "关闭", modeled: true, hydraOnly: true },

  // ---- 调整大小 ----
  // 实测:本机用 <C-方向键> 调大小,单键就能按,不用进面板
  { key: ">", native: "<C-w>>", lazy: "<Space>w>", alt: "<C-Right>", desc: "窗口变宽", group: "尺寸", modeled: true, hydraOnly: true },
  { key: "<", native: "<C-w><", lazy: "<Space>w<", alt: "<C-Left>", desc: "窗口变窄", group: "尺寸", modeled: true, hydraOnly: true },
  { key: "+", native: "<C-w>+", lazy: "<Space>w+", alt: "<C-Up>", desc: "窗口变高", group: "尺寸", modeled: true, hydraOnly: true },
  { key: "-", native: "<C-w>-", lazy: "<Space>w-", alt: "<C-Down>", desc: "窗口变矮", group: "尺寸", modeled: true, hydraOnly: true },
  { key: "|", native: "<C-w>|", lazy: "<Space>w|", desc: "宽度拉满", group: "尺寸", modeled: true, hydraOnly: true },
  { key: "_", native: "<C-w>_", lazy: "<Space>w_", desc: "高度拉满", group: "尺寸", modeled: true, hydraOnly: true },
  { key: "=", native: "<C-w>=", lazy: "<Space>w=", desc: "等高等宽", group: "尺寸", modeled: true, hydraOnly: true },

  // ---- 其他 ----
  // 实测:<Space>wm 存在,而且比 <Space>wm 省一个键的是 <leader>uZ
  { key: "m", native: "<C-w>m", lazy: "<Space>wm", alt: "<Space>uZ", desc: "缩放:只留当前窗口,再按恢复", group: "其他", modeled: true },
  { key: "W", native: "<C-w>W", lazy: "<Space>wW", desc: "按顺序轮换焦点(不是几何邻居)", group: "其他", modeled: true, hydraOnly: true },
  { key: "q", native: "<C-w>q", lazy: "<Space>wq", desc: "关掉当前窗口(顺带跳 Alternate File)", group: "其他", modeled: true, hydraOnly: true },
  { key: "T", native: "<C-w>T", lazy: "<Space>wT", desc: "把当前窗口挪到新标签页", group: "其他", modeled: true, hydraOnly: true },
  { key: "0", native: "<C-w>0", lazy: "<Space>w0", desc: "跳到第 0 个窗口", group: "其他", modeled: true, hydraOnly: true },
  { key: "1", native: "<C-w>1", lazy: "<Space>w1", desc: "跳到第 1 个窗口", group: "其他", modeled: true, hydraOnly: true },
  {
    key: "^D",
    native: "<C-w>^D",
    lazy: "<Space>w^D",
    desc: "显示光标处的 LSP 诊断",
    group: "其他",
    modeled: false,
    skip: "不是窗口操作,是 LSP 诊断 —— 放窗口训练里只会干扰",
  },
];

export const GROUPS: WinKey["group"][] = ["切分", "移动", "关闭", "尺寸", "其他"];

export function findKey(key: string): WinKey | undefined {
  return WIN_KEYS.find((k) => k.key === key);
}

/* ---------------------------------------------------------------- 题库 */

/**
 * 一道题。`start` 是起始布局的操作序列,按顺序执行后得到起始状态。
 *
 * ## 放在 lib 里而不是组件里
 *
 * 因为「每道题都可解」是一条必须被测试守住的不变量。
 * 题库留在组件里就只能靠人肉点,而人肉点不出这类问题 ——
 * 实测踩到:`l` 那题起始焦点已经在最右,按 l 永远没效果,
 * 表现是「按了键不管用」,得反推好几步才想到是题目本身无解。
 */
export type Task = {
  /** 面板上的键 */
  key: string;
  /** 中文提示 */
  desc: string;
  /** 起始布局 */
  start: Op[];
};

export const TASKS: Task[] = [
  { key: "v", desc: "竖着切一刀", start: [] },
  { key: "s", desc: "横着切一刀", start: [] },

  // 导航:每次切分后焦点都在**新切出来的窗口**上,所以
  //   切一刀后焦点在右窗 → 练 h;
  //   再跳回左窗 → 练 l。
  // ⚠️ 反过来给起始布局会导致该键无解(焦点已在目标位置)。
  { key: "h", desc: "从右窗跳到左窗", start: [{ dir: "v" }] },
  { key: "l", desc: "从左窗跳到右窗", start: [{ dir: "v" }, { go: "h" }] },

  { key: ">", desc: "把右边那个窗口变宽", start: [{ dir: "v" }] },
  { key: "<", desc: "把左边那个窗口变窄", start: [{ dir: "v" }, { go: "h" }] },
  { key: "_", desc: "高度拉满(下面那个)", start: [{ dir: "h" }] },
  // ⚠️ 起始必须**已经偏离对半**,否则 = 无从恢复。
  // 原来这里只写 [{dir:"v"}],切出来正好 50/50,
  // equalize 直接返回 null —— 又一题按了没反应。
  { key: "=", desc: "把偏宽的窗口恢复对半", start: [{ dir: "v" }, { resize: "v+" }] },
  { key: "d", desc: "关掉当前窗口", start: [{ dir: "v" }, { dir: "h" }] },
  { key: "o", desc: "只留当前窗口", start: [{ dir: "v" }, { dir: "h" }] },
  { key: "x", desc: "和下一个窗口换位置", start: [{ dir: "v" }, { dir: "v" }] },
  { key: "H", desc: "把当前窗口贴到最左", start: [{ dir: "v" }, { dir: "v" }, { go: "l" }] },

  // ---- 其他组 ----
  // 起始焦点都在「序列里排第 0 位以外」,保证按下真的会动
  { key: "W", desc: "按顺序轮换到下一个窗口", start: [{ dir: "v" }, { dir: "v" }] },
  { key: "0", desc: "跳到第 0 个窗口", start: [{ dir: "v" }, { dir: "v" }, { go: "l" }] },
  { key: "1", desc: "跳到第 1 个窗口", start: [{ dir: "v" }, { dir: "v" }, { go: "l" }] },
  { key: "m", desc: "缩放:只留当前窗口", start: [{ dir: "v" }, { dir: "h" }] },
  { key: "q", desc: "关掉当前窗口", start: [{ dir: "v" }, { dir: "h" }] },
  { key: "T", desc: "把当前窗口挪走(本标签页只剩其余窗口)", start: [{ dir: "v" }, { dir: "h" }] },
];

/* ------------------------------------------------------------------ 解析 */

/**
 * 一条 `<Space>w` 序列的解析结果。
 *
 * `wait` 一定要**带回下一个缓冲状态**,否则调用方无处存放中间态。
 */
export type ParseResult =
  /** 还要等下一个键。`next` 是应该存起来的缓冲 */
  | { kind: "wait"; next: string[]; shown: string }
  /** 命中面板上的键 */
  | { kind: "hit"; key: string; full: string }
  /** 不属于这个面板,放行给浏览器 */
  | { kind: "other" };

/**
 * 把一个键接到序列缓冲上,判断是「还要等」还是「命中」。
 *
 * ## 只认 LazyVim 的 `<Space>wX`
 *
 * 原生 `<C-w>X` 不再作为解法 —— 用户只想练本机的键,
 * 原生写法保留在键表里作对照就行。
 * 这也让序列长度统一成 3 键(`<Space>` `w` `X`),少一条分支少一类 bug。
 *
 * ## ⚠️ 为什么 wait 必须带回 next
 *
 * 实测踩过的 bug:这个函数原本只返回「等/中/否」,调用方在「等」的
 * 情况下**没把中间态写回缓冲**。于是:
 *
 *   按 <Space>  →  缓冲 = [" "]
 *   按 w       →  算出 [" ", "w"],判定「等下一个」,但缓冲仍是 [" "]
 *   按 v       →  拿到 [" "],拼成 [" ", "v"]
 *               →  第二键不是 "w" → 判定「不认识」→ 序列作废
 *
 * 表现为:**三键组合永远按不出来,两键的却正常** ——
 * 因为两键路径不需要中间态,直接把 key 消费掉了。
 * 用户报「按了键不管用」,是这个 bug,不是没绑对键。
 */
export function parseSeq(buf: string[], k: string): ParseResult {
  const s = [...buf, k];

  if (s[0] !== " ") return { kind: "other" };
  if (s.length === 1) return { kind: "wait", next: s, shown: "<Space>" };
  if (s[1] !== "w") return { kind: "other" };
  // ⚠️ 这一行就是修 bug 的地方:必须把 [" ", "w"] 交回去
  if (s.length === 2) return { kind: "wait", next: s, shown: "<Space>w" };

  if (!findKey(s[2])) return { kind: "other" };
  return { kind: "hit", key: s[2], full: "<Space>w" + s[2] };
}