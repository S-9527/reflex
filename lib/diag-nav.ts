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
 * ## ⚠️ 和 Vim 实际行为的对齐（实测结论写在这里）
 *
 * | 键 | 行为 |
 * |----|------|
 * | `]d` | 跳到**下一个**诊断。到末尾**不动**（不绕回） |
 * | `[d` | 跳到**上一个**诊断。到开头**不动** |
 * | `]D` | 跳到本 buffer **最后一条** |
 * | `[D` | 跳到本 buffer **第一条** |
 *
 * ⚠️ `]d` 到末尾**不绕回** —— 这和 `:cnext` 会绕回是两回事。
 *    `lib/seq-solutions` 里记过同类差异（`<Tab>]` 到头就停 vs `:tabnext` 绕回）。
 *    训练器画错了比不画更糟，所以这里严格按实测行为建模。
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
 * `]d` —— 下一个诊断。到末尾**不动**。
 *
 * @returns 新状态；没得跳时返回同一个 cursor，只更新 note
 */
export function nextDiag(s: NavState): NavState {
  const d = nextAfter(s.diags, s.cursor);
  if (!d) {
    return { ...s, note: "已经是最后一个诊断了（不会绕回开头）" };
  }
  return { ...s, cursor: d.lnum, note: `→ 第 ${d.lnum + 1} 行` };
}

/** `[d` —— 上一个诊断。到开头**不动** */
export function prevDiag(s: NavState): NavState {
  const d = prevBefore(s.diags, s.cursor);
  if (!d) {
    return { ...s, note: "已经是第一个诊断了" };
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

/** 执行一次跳转 */
export function applyNav(s: NavState, key: string): NavState {
  switch (key) {
    case "]d":
      return nextDiag(s);
    case "[d":
      return prevDiag(s);
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
