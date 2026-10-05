/**
 * 提示分级 —— 纯函数，无 React、无 DOM，有单测。
 *
 * ## 为什么提示要分级
 *
 * 「默写模式」的目标是让用户**先回忆再按**。但硬憋着不给提示会让人卡死，
 * 卡死的人不会继续练，只会关掉页面。所以要有一个「渐进求助」的阶梯：
 *
 * ```
 * 第 0 级  什么都没有          ← 默认，先自己回忆
 * 第 1 级  首键                ← 给个起点（往往是最难的那一步）
 * 第 2 级  首键 + 键数         ← 知道要走几步
 * 第 3 级  全部解法            ← 放弃回忆，看答案
 * ```
 *
 * ## ⚠️ 为什么按「键数」而不是按「第几键」分
 *
 * 键数本身就是一条有意义的提示（三键还是两键），
 * 而「第几键」在给首键之前是没有信息量的 —— 用户不知道有几个格子，
 * 只知道「还有下一个」，帮不上忙。
 *
 * ## ⚠️ 提示过的题要记下来
 *
 * 用了提示的题不能和独立答对的题一样计入熟练度 ——
 * 否则「按提示抄一遍」会污染进度数据，复习队列就废了。
 * 所以 `usedHint` 要一路传到会话结果里（见 `Result.usedHint`）。
 */

/** 提示级别。数字越大给得越多 */
export type HintLevel = 0 | 1 | 2 | 3;

export const MAX_HINT: HintLevel = 3;

/** 每一级给什么，用一句话说清楚（UI 上显示） */
export const HINT_LABEL: Record<HintLevel, string> = {
  0: "按 ? 看提示",
  1: "已给首键 · 再按 ? 给键数",
  2: "已给键数 · 再按 ? 看全部解法",
  3: "已给全部解法",
};

/**
 * 这一级该显示哪些键。
 *
 * - 0 级：空数组（什么都不显示）
 * - 1 级：只给首键，其余留空
 * - 2 级：首键 + 其余位置显示成占位符（键数可见）
 * - 3 级：全部给出来
 *
 * ⚠️ 返回值是**逐键**数组，和 `task.accept[0]` 等长。
 *    `null` 表示这一位要显示成空格子（用户还没按到那里）。
 */
export function hintedKeys(best: string[], level: HintLevel): (string | null)[] {
  if (level <= 0) return best.map(() => null);
  if (level === 1) return best.map((k, i) => (i === 0 ? k : null));
  if (level === 2) return best.map((k, i) => (i === 0 ? k : k === "" ? null : "·"));
  return [...best];
}

/**
 * 下一级提示。到顶了就停在顶（不循环）。
 *
 * ⚠️ 不循环是有意的：循环会让用户分不清「我按到第几级了」，
 *    而且到顶之后再按一次突然变回「什么都没有」，像是把帮助收回去了。
 */
export function nextHint(level: HintLevel): HintLevel {
  return Math.min(MAX_HINT, level + 1) as HintLevel;
}

/** 这个键数能不能给提示（单键的题给首键等于给答案） */
export function hintUseful(best: string[]): boolean {
  return best.length > 1;
}

/**
 * 练习模式。
 *
 * - `drill`（跟打）：显示解法，照着按，练手指走位 —— **不计入熟练度**
 * - `recall`（默写）：只给题面，先回忆再按 —— 计入
 *
 * 名字用 `drill` / `recall` 而不是「学习/测试」，因为
 * 「学习模式」听起来像「正式模式」，而它其实是不计分的热身。
 */
export type Mode = "drill" | "recall";

export const MODE_LABEL: Record<Mode, string> = {
  drill: "跟打",
  recall: "默写",
};

export const MODE_HINT: Record<Mode, string> = {
  drill: "显示键位，照着按 —— 练手指走位，不计入熟练度",
  recall: "只给题面，先回忆再按 —— 计入熟练度",
};

/**
 * 这一轮要不要计入进度。
 *
 * ⚠️ 判据是「有没有靠提示」，不只是「哪个模式」。
 *    默写模式下按了 ? 看答案的题，也不该算独立答对。
 */
export function countsForProgress(mode: Mode, usedHint: boolean): boolean {
  return mode === "recall" && !usedHint;
}

/** 记住模式（跨会话）。默认默写 —— 因为它计入进度 */
const MODE_KEY = "reflex.mode.v1";

export function loadMode(): Mode {
  if (typeof localStorage === "undefined") return "recall";
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "drill" || v === "recall" ? v : "recall";
  } catch {
    return "recall";
  }
}

export function saveMode(m: Mode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* 隐私模式 —— 不该因此崩 */
  }
}
