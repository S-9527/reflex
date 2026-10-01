/**
 * 进度存储 —— localStorage。
 *
 * ## 存什么
 *
 * 每个绑定一条:`{ seen, correct, streak, lastAt }`。
 * 出题权重由这些算出:连对越多越少出现,错一次立刻回插。
 *
 * ## 为什么不用 IndexedDB
 *
 * 数据量小(300 条 × 4 个数字 ≈ 几 KB),localStorage 同步读写反而更简单,
 * 而且没有"首次打开要等异步加载"的问题。
 */

import type { Binding } from "./matcher";

const KEY = "reflex.progress.v1";

export type Stat = {
  /** 出现过几次 */
  seen: number;
  /** 答对几次 */
  correct: number;
  /** 当前连续答对次数 */
  streak: number;
  /** 上次出现时间戳 */
  lastAt: number;
};

export type Progress = Record<string, Stat>;

const EMPTY: Stat = { seen: 0, correct: 0, streak: 0, lastAt: 0 };

export function load(): Progress {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Progress;
    // 防御:文件被人手改过或版本降级
    return typeof p === "object" && p ? p : {};
  } catch {
    return {};
  }
}

export function save(p: Progress): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 隐私模式 / 配额满 —— 练习不该因此崩,只是这次不落盘
  }
}

export function statFor(p: Progress, id: string): Stat {
  return p[id] ?? EMPTY;
}

export function record(p: Progress, id: string, ok: boolean): Progress {
  const s = statFor(p, id);
  return {
    ...p,
    [id]: {
      seen: s.seen + 1,
      correct: s.correct + (ok ? 1 : 0),
      streak: ok ? s.streak + 1 : 0,
      lastAt: Date.now(),
    },
  };
}

export function reset(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

/**
 * 出题:按权重挑下一个。
 *
 * 权重设计:
 *   - 没见过的        → 权重 5(优先让你都见一遍)
 *   - 刚错过(streak 0)→ 权重 8(立刻回插)
 *   - 连续对 ≥ 3      → 权重 1 / streak 越大越低(几乎不再出现)
 *   - 其余            → 权重 3
 */
export function pickNext(pool: Binding[], p: Progress, excludeIds: string[] = []): Binding | null {
  if (pool.length === 0) return null;
  const excluded = new Set(excludeIds);
  const candidates = pool.filter((b) => !excluded.has(b.id));
  // 全部在排除集里就退回全集
  const usable = candidates.length > 0 ? candidates : pool;

  const weights = usable.map((b) => {
    const s = statFor(p, b.id);
    if (s.seen === 0) return 5;
    if (s.streak === 0) return 8;
    if (s.streak >= 3) return Math.max(1, 4 - s.streak);
    return 3;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < usable.length; i++) {
    r -= weights[i];
    if (r <= 0) return usable[i];
  }
  return usable[usable.length - 1];
}

/** 统计面板用 */
export function summarize(p: Progress, pool: Binding[]) {
  let mastered = 0;
  let shaky = 0;
  let fresh = 0;
  for (const b of pool) {
    const s = statFor(p, b.id);
    if (s.seen === 0) fresh++;
    else if (s.streak >= 3) mastered++;
    else shaky++;
  }
  return { total: pool.length, mastered, shaky, fresh };
}
