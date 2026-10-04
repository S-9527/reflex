"use client";

/**
 * 可视化板块的进度 —— localStorage。
 *
 * ## 为什么要单独一个存储
 *
 * lib/progress.ts 存的是「每条绑定 {seen, correct, streak, lastAt}」,
 * 给首页那个出题权重算法用。可视化板块不抽题,是按顺序一道道做,
 * 只需要「哪些做过了」—— 两种形状,硬塞进一个文件只会互相拖累。
 *
 * ## 存什么
 *
 * 每个板块一条:`{ boardId: string[] }`,里面是**已解开的题号**(字符串)。
 *
 * 用字符串存题号而不是数字:题库增删之后下标会漂,用 `key#序号`
 * 这种带语义的 id 更稳(见各页的 TASK_OF 映射)。
 *
 * ⚠️ 别把这套和 lib/progress.ts 的 localStorage key 搞混 —— 两个文件
 * 各写各的 key,不会互相覆盖。
 */

const KEY = "reflex.board.v1";

export type BoardProgress = Record<string, string[]>;

export function loadBoards(): BoardProgress {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as BoardProgress;
    // 防御:文件被人手改过或版本降级
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    // 每条必须是字符串数组,否则丢掉那一条而不是整个文件
    const out: BoardProgress = {};
    for (const [k, v] of Object.entries(p)) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBoards(p: BoardProgress): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 隐私模式 / 配额满 —— 练习不该因此崩,只是这次不落盘
  }
}

/** 这个板块做过的题号 */
export function solvedIds(p: BoardProgress, boardId: string): string[] {
  return p[boardId] ?? [];
}

/** 记下一题做过了(幂等) */
export function markSolved(p: BoardProgress, boardId: string, taskId: string): BoardProgress {
  const cur = p[boardId] ?? [];
  if (cur.includes(taskId)) return p;
  return { ...p, [boardId]: [...cur, taskId] };
}

/** 清掉一个板块的进度 */
export function clearBoard(p: BoardProgress, boardId: string): BoardProgress {
  if (!(boardId in p)) return p;
  const next = { ...p };
  delete next[boardId];
  return next;
}

/** 进度摘要 —— 首页仪表盘用 */
export function boardSummary(
  p: BoardProgress,
  boardId: string,
  total: number,
): { done: number; total: number; left: number } {
  const done = Math.min(solvedIds(p, boardId).length, total);
  return { done, total, left: Math.max(0, total - done) };
}