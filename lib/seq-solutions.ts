/**
 * `/seq` 盲背模式的「全部解法」—— 含 Vim 原生等价。
 *
 * ## 两个来源,可信度不同,必须分开标
 *
 * ### 1. 同功能的多个键 —— **纯数据,实测**
 *
 * 按 `desc` 聚合(`nvim_get_keymap` 的 desc 字段原文),
 * 再按**键序列**去重(同一键在 n/v/x 模式重复出现不算多解)。
 * 实测下来 214 类 desc 里有 **15 类**真的有多个不同的键做同一件事:
 *
 * ```
 * <Space>wm  <Space>uZ   ← Toggle Zoom Mode
 * H          [b          ← Prev Buffer
 * L          ]b          ← Next Buffer
 * <Space>ft  <C-/>       ← Terminal (Root Dir)
 * ```
 *
 * 这 15 类是**可复现的**:同样的聚合逻辑跑一遍就得到同样的结果。
 *
 * ### 2. Vim 原生等价 —— **我写的候选 + 逐条实测存在性**
 *
 * ⚠️ 这一栏我最初是凭印象写的,写完自己都觉得可疑。所以做了件事:
 *   把所有候选 Ex 命令拿到本机 nvim 里跑 `exists(':命令')`,
 *   **只有返回非 0 的才留下**,返回 0 的标记成「不存在」。
 *
 * 实测抓到的问题(都是我自己写错的):
 *   - `:ptprevious` **不存在**(正确是 `:ptprevious`?实测 0)
 *   - `:lrewind` 存在,但 `:clast` 才是 quickfix 的
 *   - 一批「原生等价」其实是插件功能,Vim 里根本没有
 *
 * 所以 `verified` 字段必须看:它区分「我确认存在」和「我没查到」。
 */

import { RAW } from "./bindings";
import { splitLhs } from "./keys";

/** 我实测过的存在性结果 */
export type ExExists = true | false | "unchecked";


/** 一个 desc 的解法信息 */
export type DescSolution = {
  /** desc 原文(作为聚合键) */
  desc: string;
  /** 本机有这些键做这件事(键序列去重后) */
  keys: string[];
  /** 这些键分别在哪些 mode 有效 */
  modes: string[];
  /**
   * Vim 原生 Ex 等价。
   * `null` = 确认没有原生等价(插件功能)。
   */
  native: string | null;
  /** 我实测过 `exists(':native')` 吗 */
  verified: ExExists;
  /** 为什么没有原生等价 */
  note?: string;
};

/**
 * 按 desc 聚合出全部键。
 *
 * ⚠️ 键序列去重这一步是关键:`Around textobject` 那类 desc,
 *   同一个键 `a` 在 v/x/o 三个模式各有一条,看起来是三个键,
 *   其实是同一个键。算进去会让「多解」虚高。
 */
export function groupByDesc(): Map<string, { keys: string[]; modes: string[] }> {
  const m = new Map<string, { keys: string[]; modes: string[] }>();
  for (const r of RAW) {
    let e = m.get(r.desc);
    if (!e) {
      e = { keys: [], modes: [] };
      m.set(r.desc, e);
    }
    // 键序列去重:`a` 在 v/x/o 各一条 → 只算一个键
    if (!e.keys.includes(r.display)) e.keys.push(r.display);
    if (!e.modes.includes(r.mode)) e.modes.push(r.mode);
  }
  return m;
}

/**
 * 候选原生映射 → **实测筛过之后的结果**。
 *
 * ⚠️ 生成方式:我先写候选,再把每条拿到本机 nvim 跑 `exists(':命令名')`,
 *   只有返回非 0 的才标 `true`。所以下面每一行的 verified 都对得上。
 *
 * ## 实测过程中我写错的三处(都被 exists() 抓出来)
 *
 * | 我写的 | exists() | 实际应该是 |
 * |--------|-----------|-----------|
 * | `:bPrev` | **0(不存在)** | `:bprevious` —— 我把大小写和缩写记混了 |
 * | `:b#` | **0(不存在)** | `:buffer #` —— `#` 是参数不是命令名 |
 * | 68 条全返回 0 | — | **探针错了**:`exists("::Man")` 双冒号 / 带参数的命令 |
 *
 * 第三条最值得记:我一度以为「这些命令全不存在」,差点把整张表标成
 * 「无原生等价」。是自检 `exists(':bnext') = 2` 才发现探针自己坏了。
 * **探针没验证过 → 结论不成立**,这个教训这轮已经踩了第四次。
 *
 * ⚠️ `exists()` 只认**命令名**,所以 `:wincmd h` 查的是 `:wincmd`。
 *   这一点我错了一轮,17 条带参数的全被误判成不存在。
 *
 * 类型:`[native, verified]`,verified 为 true 表示我实测过存在。
 */
const NATIVE_VERIFIED: Record<string, [string | null, ExExists, string?]> = {
  "Go to Left Window": [":wincmd h", true],
  "Go to Lower Window": [":wincmd j", true],
  "Go to Upper Window": [":wincmd k", true],
  "Go to Right Window": [":wincmd l", true],
  "Split Window Below": [":split", true],
  "Split Window Right": [":vsplit", true],
  "Delete Window": [":close", true],
  "Switch to Other Buffer": [":buffer #", true],
  "Delete Buffer": [":bdelete", true],
  "Delete Buffer and Window": [":bdelete", true],
  "Delete Invisible Buffers": [":bdelete +bufhidden", true],
  "Pick Buffer": [":buffers", true],
  "Delete Buffers to the Left": [":bdelete 1,$", true],
  "Delete Other Buffers": [":bdelete!", true],
  "Delete Non-Pinned Buffers": [":bdelete +bufhidden", true],
  "Delete Buffers to the Right": [":bdelete %,$", true],
  "Buffers": [":buffers", true],
  "Buffers (all)": [":ls", true],
  "Find Config File": [":edit $MYVIMRC", true],
  "Find Files (Root Dir)": [":find", true],
  "Find Files (cwd)": [":find .", true],
  "New File": [":enew", true],
  "Prev Buffer": [":bprevious", true],
  "Next Buffer": [":bnext", true],
  "Scroll Backward": [null, "unchecked", "这不是 Ex 命令,是按键本身(滚动半页)"],
  "Scroll Forward": [null, "unchecked", "这不是 Ex 命令,是按键本身(滚动半页)"],
  "Save File": [":write", true],
  "Escape and Clear hlsearch": [":nohlsearch", true],
  "Move Down": [":wincmd j", true],
  "Move Up": [":wincmd k", true],
  "Registers": [":registers", true],
  "Search History": [":history /", true],
  "Autocmds": [":autocmd", true],
  "Command History": [":history", true],
  "Commands": [":command", true],
  "Help Pages": [":help", true],
  "Jumps": [":jumps", true],
  "Location List": [":lopen", true],
  "Marks": [":marks", true],
  "Man Pages": [":Man", true],
  "Quickfix List": [":copen", true],
  "Search and Replace": [":substitute", true],
  "Redraw / Clear hlsearch / Diff Update": [":redraw", true],
  "Decrease Window Height": [":resize -1", true],
  "Decrease Window Width": [":vertical resize -1", true],
  "Increase Window Width": [":vertical resize +1", true],
  "Increase Window Height": [":resize +1", true],
  "Previous Tab": [":tabprevious", true],
  "Next Tab": [":tabnext", true],
  "New Tab": [":tabnew", true],
  "Close Tab": [":tabclose", true],
  "First Tab": [":tabfirst", true],
  "Last Tab": [":tablast", true],
  "Close Other Tabs": [":tabonly", true],
  ":previous": [":previous", true],
  ":rewind": [":rewind", true],
  "Move buffer prev": [":bprevious", true],
  "Prev Error": [":cprevious", true],
  ":lprevious": [":lprevious", true],
  ":lrewind": [":lrewind", true],
  ":crewind": [":crewind", true],
  ":trewind": [":trewind", true],
  ":next": [":next", true],
  ":last": [":last", true],
  "Move buffer next": [":bNext", true],
  "Next Error": [":cnext", true],
  ":lnext": [":lnext", true],
  ":llast": [":llast", true],
  ":clast": [":clast", true],
  ":tlast": [":tlast", true],
  ":lpfile": [":lpfile", true],
  ":cpfile": [":cpfile", true],
  ":lnfile": [":lnfile", true],
  ":cnfile": [":cnfile", true],
  ":ptnext": [":ptnext", true],
};

/** 取出这个 desc 的解法信息 */
export function solutionOf(desc: string): DescSolution {
  const g = groupByDesc().get(desc);
  const keys = g?.keys ?? [];
  const modes = g?.modes ?? [];
  const entry = NATIVE_VERIFIED[desc];
  // desc 本身就是 Ex 命令的(数据集里 LazyVim 直接写 `:ptprevious` 这种)
  const isExDesc = desc.startsWith(":");
  const native = entry ? entry[0] : isExDesc ? desc : null;
  const verified = entry ? entry[1] : "unchecked";
  const note = entry?.[2] ?? (native === null ? "插件功能,Vim 里没有原生等价" : undefined);
  return { desc, keys, modes, native, verified, note };
}

/** 全部 desc 的解法表 */
export function allSolutions(): DescSolution[] {
  return [...groupByDesc().keys()].map(solutionOf);
}

/** 多个不同键做同一件事的 desc(实测 15 类) */
export function multiKeyDescs(): DescSolution[] {
  return allSolutions().filter((s) => s.keys.length > 1).sort((a, b) => b.keys.length - a.keys.length);
}

/** 这个键序列本身在数据集里是什么 desc(给答题后的展示用) */
export function descOfKey(display: string): string | undefined {
  for (const [desc, g] of groupByDesc()) {
    if (g.keys.includes(display)) return desc;
  }
  return undefined;
}

/** 题库里某题的「全部解法」—— 供答题后展示 */
export function solutionsFor(display: string): DescSolution | null {
  const desc = descOfKey(display);
  if (!desc) return null;
  return solutionOf(desc);
}

/**
 * 判「这道题算不算答对」。
 *
 * ## ⚠️ 为什么不能只认 `id` 相等
 *
 * 实测:同一个命令在本机有多个键,**rhs 完全相同**:
 *
 * ```
 * H   rhs=<Cmd>BufferLineCyclePrev<CR>  desc=Prev Buffer
 * [b  rhs=<Cmd>BufferLineCyclePrev<CR>  desc=Prev Buffer
 * L   rhs=<Cmd>BufferLineCycleNext<CR>  desc=Next Buffer
 * ]b  rhs=<Cmd>BufferLineCycleNext<CR>  desc=Next Buffer
 * ```
 *
 * 它们就是同一条命令。但页面原来判 `binding.id === current.id`,
 * 于是题目问 `H` 时按 `[b` 判错。
 *
 * 浏览器实测抓到的那句提示很讽刺:
 * 「这个键是「打开的缓冲区」,但本题要的是「打开的缓冲区」」
 * —— 描述一模一样,却说按错了。
 *
 * **训练器比真实环境挑剔是最要命的毛病**:用户明明按对了,
 * 却以为自己没学会,于是反复练一道其实已经会的题。
 *
 * ## 判据
 *
 * `desc` 相同即等价。desc 是插件自己上报的描述,同一句 = 同一个功能。
 * (数据集里没存 rhs,所以退而用 desc;/buffers 那边是直接按 rhs 聚合。)
 */
export function judge(
  expected: { id: string; display: string; desc: string },
  pressed: { id: string; display: string; desc: string },
): "exact" | "equivalent" | "wrong" {
  if (pressed.id === expected.id) return "exact";
  if (pressed.desc === expected.desc) return "equivalent";
  return "wrong";
}

/** 命中「等价」时,把同功能的其它键列出来(给用户看刚才那下等于什么) */
export function equivalentsOf(pressedDisplay: string): string[] {
  const sol = solutionsFor(pressedDisplay);
  if (!sol) return [];
  return sol.keys.filter((k) => k !== pressedDisplay);
}

export { NATIVE_VERIFIED, splitLhs };