/**
 * 诊断跳转的状态模型 —— 纯函数，无 React、无 DOM，有单测。
 *
 * ## 为什么单独建模
 *
 * `]d` / `[d` 这一族是**唯一一个「状态明确会变、但一直没被可视化」的大族**。
 * 「按下去什么会变」很清楚：**光标在诊断列表里前后移动**。
 *
 * 所以模型就三样东西：代码行、诊断列表、当前光标行。
 *
 * ## ⚠️⚠️ 行为是**实测**出来的，不是照手册猜的
 *
 * 我第一版按「Vim 手册的直觉」写：`]d` 到末尾**不动**、不绕回。
 * 而且为此写了测试和注释，还声称「这和 `:cnext` 会绕回是两回事」。
 *
 * **实测把这套说法推翻了**（探针见 `.probe/nav-behavior.lua`）：
 *
 * ```
 * 诊断在第 3、7 行，从第 1 行开始连按 ]d：
 *   第 1 次 → 第 3 行
 *   第 2 次 → 第 7 行
 *   第 3 次 → 第 3 行   ← 绕回了！
 * ```
 *
 * | 键 | 行为（实测） |
 * |----|-------------|
 * | `]d` | 下一个诊断，**到末尾绕回开头** |
 * | `[d` | 上一个诊断，**到开头绕回末尾** |
 * | `]D` | 跳到本 buffer **最后一条** |
 * | `[D` | 跳到本 buffer **第一条** |
 *
 * 也就是说 `]d` 和 `:cnext` 的行为是**一样**的（都绕回），
 * 我原来写反了。
 *
 * 之所以能发现：`]d` 在本机的 rhs 是**空的**（Lua 回调），
 * 光看 `nvim_get_keymap` 看不出行为 —— 必须真的按一遍。
 * 这正是 `lib/provenance.ts` 里那条：「探针没验证过 → 结论不成立」。
 *
 * ## 光标初始位置
 *
 * 从**第一行**开始（不是第一条诊断）—— 这样 `]d` 和 `[d` 都有东西可跳，
 * 用户能看出方向差别。如果一开始就在第一条诊断上，`[d` 会「按了没反应」，
 * 那正是最难查的一类体验问题。
 */

import type { Diag } from "./diagnostics";

/** 一条诊断在列表里的位置（0-based，按行号排序后） */
export type DiagRef = {
  /** 在诊断列表里的下标 */
  index: number;
  /** 诊断本身 */
  diag: Diag;
};

export type NavState = {
  /** 当前光标所在行（0-based，和 Vim 一致） */
  cursor: number;
  /** 这个 buffer 的全部诊断，**按行号升序**排好 */
  diags: Diag[];
  /** 本次跳转的反馈文案 */
  note: string;
};

/**
 * 按行号排序诊断。
 *
 * ⚠️ 必须排序：`DIAGS` 里的顺序是**探针写入顺序**，不是行号顺序
 *    （实测：8, 9, 7, 4）。不排序的话「下一个诊断」算出来是乱的。
 *    行号相同时按列号排，保证顺序**稳定**（同样的输入永远同样的输出）。
 */
export function sortDiags(diags: Diag[]): Diag[] {
  return [...diags].sort((a, b) => a.lnum - b.lnum || a.col - b.col);
}

/** 初始状态：光标在第一行，没有反馈 */
export function initial(diags: Diag[]): NavState {
  return { cursor: 0, diags: sortDiags(diags), note: "" };
}

/** 光标是否正落在某条诊断上 */
export function diagAt(s: NavState, line: number = s.cursor): Diag | null {
  return s.diags.find((d) => d.lnum <= line && line <= d.endLnum) ?? null;
}

/** 下一条诊断（**只按起点行算**，不按区间 —— 和 Vim 的 `]d` 一致） */
function nextAfter(diags: Diag[], line: number): Diag | null {
  return diags.find((d) => d.lnum > line) ?? null;
}

/** 上一条诊断 */
function prevBefore(diags: Diag[], line: number): Diag | null {
  const before = diags.filter((d) => d.lnum < line);
  return before.length > 0 ? before[before.length - 1] : null;
}

/**
 * `]d` —— 下一个诊断。
 *
 * ⚠️ **到末尾绕回开头**（实测，见文件头）。我第一版写成「不动」，
 *    是错的 —— 而且错得很隐蔽：界面看着正常，只是用户按到末尾时
 *    发现键「失灵」了，而真实环境里它会跳回开头。
 *
 * @param wrap 允许绕回吗（默认 true，和实测一致）
 */
export function nextDiag(s: NavState, wrap = true): NavState {
  const d = nextAfter(s.diags, s.cursor);
  if (!d) {
    if (!wrap || s.diags.length === 0) {
      return { ...s, note: "已经是最后一个诊断了" };
    }
    // 绕回第一条
    const first = s.diags[0];
    return { ...s, cursor: first.lnum, note: `search hit BOTTOM, continuing at TOP —— 绕回第 ${first.lnum + 1} 行` };
  }
  return { ...s, cursor: d.lnum, note: `→ 第 ${d.lnum + 1} 行` };
}

/** `[d` —— 上一个诊断。⚠️ **到开头绕回末尾**（实测） */
export function prevDiag(s: NavState, wrap = true): NavState {
  const d = prevBefore(s.diags, s.cursor);
  if (!d) {
    if (!wrap || s.diags.length === 0) {
      return { ...s, note: "已经是第一个诊断了" };
    }
    const last = s.diags[s.diags.length - 1];
    return { ...s, cursor: last.lnum, note: `search hit TOP, continuing at BOTTOM —— 绕回第 ${last.lnum + 1} 行` };
  }
  return { ...s, cursor: d.lnum, note: `← 第 ${d.lnum + 1} 行` };
}

/** `]D` —— 直接跳到最后一条 */
export function lastDiag(s: NavState): NavState {
  if (s.diags.length === 0) return { ...s, note: "这个 buffer 没有诊断" };
  const d = s.diags[s.diags.length - 1];
  return { ...s, cursor: d.lnum, note: `⇥ 直接到最后一条（第 ${d.lnum + 1} 行）` };
}

/** `[D` —— 直接跳到第一条 */
export function firstDiag(s: NavState): NavState {
  if (s.diags.length === 0) return { ...s, note: "这个 buffer 没有诊断" };
  const d = s.diags[0];
  return { ...s, cursor: d.lnum, note: `⇤ 直接到第一条（第 ${d.lnum + 1} 行）` };
}

/** 这个键是诊断跳转族的吗 */
export function isNavKey(key: string): boolean {
  return ["]d", "[d", "]D", "[D"].includes(key);
}

/** 执行一次跳转。`wrap=false` 可关掉绕回（用来演示差别） */
export function applyNav(s: NavState, key: string, wrap = true): NavState {
  switch (key) {
    case "]d":
      return nextDiag(s, wrap);
    case "[d":
      return prevDiag(s, wrap);
    case "]D":
      return lastDiag(s);
    case "[D":
      return firstDiag(s);
    default:
      return { ...s, note: `${key} 不在诊断跳转族里` };
  }
}

/** 诊断列表的摘要（UI 顶部显示） */
export function summary(s: NavState): {
  total: number;
  errors: number;
  warns: number;
  /** 当前位置是第几条（1-based）；不在诊断上则为 null */
  pos: number | null;
} {
  const cur = diagAt(s);
  return {
    total: s.diags.length,
    errors: s.diags.filter((d) => d.severity === 1).length,
    warns: s.diags.filter((d) => d.severity === 2).length,
    pos: cur ? s.diags.indexOf(cur) + 1 : null,
  };
}

/* ------------------------------------------------- quickfix 项跳转（另一族） */

/**
 * `]q` / `[q` —— Trouble / quickfix 列表里跳。
 *
 * ## ⚠️⚠️ 它和诊断跳转（`]d`）**行为不一样**
 *
 * 虽然两者都是「在列表里前后走」，但实测（探针 `.probe/qf-behavior.lua`）：
 *
 * | | `]d`（诊断） | `]q`（quickfix） |
 * |---|---|---|
 * | 到头 | **绕回** | **停住**（报 `E553: No more items`） |
 *
 * ```
 * quickfix 在第 2、5、8 行：
 *   连按 ]q → 5, 8, 8, 8, 8    ← 停在第 8 行不动
 *   连按 [q → 5, 2, 2, 2, 2    ← 停在第 2 行不动
 * ```
 *
 * 我差点直接把 `]d` 的模型（会绕回）套到 `]q` 上 —— 那就画错了。
 * 这也解释了为什么用户会觉得 `]q` 和 `]d` 「手感不一样」。
 *
 * ## 报错也是一种反馈
 *
 * 到头时 Vim 会显示 `E553: No more items`。界面上要**明确说出来** ——
 * 否则用户只会觉得「键没反应」（这正是最难查的那类体验问题）。
 */

/** quickfix 跳转的反馈文案（到头时报错的那条） */
export const QF_END_NOTE = "E553: No more items —— 已经是最后一项了（不会绕回）";
export const QF_START_NOTE = "E553: No more items —— 已经是第一项了（不会绕回）";

/**
 * `]q` —— 下一个 quickfix 项。**到头停住，不绕回**。
 *
 * 复用 `nextDiag` 的查找逻辑，但 `wrap=false` —— 这正是两族的差别。
 */
export function nextQf(s: NavState): NavState {
  const r = nextDiag(s, false);
  // 没动 = 到头了 → 换成 quickfix 的报错文案
  if (r.cursor === s.cursor) return { ...s, note: QF_END_NOTE };
  return { ...r, note: `→ 第 ${r.cursor + 1} 行` };
}

/** `[q` —— 上一个 quickfix 项。**到头停住，不绕回** */
export function prevQf(s: NavState): NavState {
  const r = prevDiag(s, false);
  if (r.cursor === s.cursor) return { ...s, note: QF_START_NOTE };
  return { ...r, note: `← 第 ${r.cursor + 1} 行` };
}

/** 这个键是 quickfix 跳转族的吗 */
export function isQfKey(key: string): boolean {
  return key === "]q" || key === "[q";
}

/** 执行一次 quickfix 跳转 */
export function applyQfNav(s: NavState, key: string): NavState {
  if (key === "]q") return nextQf(s);
  if (key === "[q") return prevQf(s);
  return { ...s, note: `${key} 不在 quickfix 跳转族里` };
}
