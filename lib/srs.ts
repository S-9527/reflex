/**
 * 统一进度模型 —— 把两套存储合并成一个。
 *
 * ## ⚠️ 为什么必须合并
 *
 * 原来有两套，量纲完全不同：
 *
 * | 存储 | 形状 | 语义 |
 * |------|------|------|
 * | `reflex.progress.v1` | `{seen, correct, streak, lastAt}` | 「连对 3 次 = 掌握」 |
 * | `reflex.board.v1` | `string[]` 已做过的题号 | 「做过」 |
 *
 * 首页把两者**直接相加**成一个总进度条：
 *
 * ```ts
 * const done = BOARDS.reduce((a, b) => {
 *   if (b.kind === "board") return a + boardSummary(boards, b.id, b.total).done;  // 「做过」
 *   return a + totals.mastered;                                                   // 「连对3次」
 * }, 0);
 * ```
 *
 * 「做过 3 道题」和「连续答对 3 次」被当成同一件事加在一起。
 *
 * 后果不只是数字不准 —— 而是**错题本、间隔重复、跨板块复习都做不了**，
 * 因为它们都需要一个统一的、带时间维度的熟练度模型。
 *
 * 而且 `/seq` 迁到公共引擎后写的是 `reflex.board.v1`，
 * 首页却还在读 `reflex.progress.v1` —— **进度直接断裂**。
 *
 * ## 模型
 *
 * 每条记录回答三个问题：见过几次、连对几次、下次什么时候该复习。
 */

const KEY = "reflex.srs.v1";

/** 旧的两个 key —— 只在迁移时读一次 */
const LEGACY_PROGRESS = "reflex.progress.v1";
const LEGACY_BOARD = "reflex.board.v1";

export type Item = {
  /**
   * 这条记录属于哪个板块（`buffers` / `seq-leader` / …）。
   *
   * ⚠️ 为什么需要它：各板块的 taskId 体系不同
   *    （`/buffers` 是 `L#0`，`/seq` 是 `n|L`），而进度是**全局一张表**。
   *    没有板块标记，首页就没法按板块统计 ——
   *    只能自己再维护一份「哪些 id 属于哪个板块」的映射，那是重复。
   */
  board: string;
  /** 出现过几次 */
  seen: number;
  /** 答对几次 */
  correct: number;
  /**
   * 其中「独立答对」几次 —— 没用提示、且在默写模式下。
   *
   * ⚠️ 这才是判断「学会了没」的依据。跟打模式照抄的、
   *    按提示抄的，算 `correct` 不算 `independent`。
   */
  independent: number;
  /** 当前连续独立答对次数 */
  streak: number;
  /** 累计答错次数 */
  lapses: number;
  /** 上次作答时间戳 */
  lastAt: number;
  /** 下次该复习的时间戳（0 = 没排期） */
  dueAt: number;
  /** 最快用时（ms）。没答对过则为 0 */
  bestMs: number;
};

export type Progress = Record<string, Item>;

const EMPTY: Item = {
  board: "",
  seen: 0,
  correct: 0,
  independent: 0,
  streak: 0,
  lapses: 0,
  lastAt: 0,
  dueAt: 0,
  bestMs: 0,
};

/**
 * 间隔重复的间隔表（天）。
 *
 * 简单版：连对越多，下次复习越远。
 * 第 3 次连对之后进入「长期记忆」区间。
 */
const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];

/**
 * 记一次作答。
 *
 * @param ok          按键对了吗
 * @param independent 算「独立答对」吗（默写 + 没用提示）
 * @param ms          这题用时
 */
export function record(
  p: Progress,
  id: string,
  ok: boolean,
  opts: { board?: string; independent?: boolean; ms?: number; now?: number } = {},
): Progress {
  const now = opts.now ?? Date.now();
  const s = p[id] ?? EMPTY;
  const independent = Boolean(opts.independent) && ok;

  const streak = independent ? s.streak + 1 : ok ? s.streak : 0;

  /**
   * 排期。
   *
   * ⚠️ 只有**独立答对**才往后推 —— 按提示抄对的不该让复习间隔变长，
   *    否则越抄越久不复习，正好反了。
   *    答错则立刻回插（间隔 0 = 现在就该再看一遍）。
   */
  let dueAt = s.dueAt;
  if (independent) {
    const days = INTERVALS_DAYS[Math.min(streak, INTERVALS_DAYS.length - 1)];
    dueAt = now + days * 86400000;
  } else if (!ok) {
    dueAt = now; // 立刻回插
  }

  return {
    ...p,
    [id]: {
      // ⚠️ 板块取**第一次**记录时的值 —— 同一条命令在两个板块都练过时，
      //    归属保持稳定，不会因为后练的板块而漂移。
      board: s.board || opts.board || "",
      seen: s.seen + 1,
      correct: s.correct + (ok ? 1 : 0),
      independent: s.independent + (independent ? 1 : 0),
      streak,
      lapses: s.lapses + (ok ? 0 : 1),
      lastAt: now,
      dueAt,
      bestMs: ok && opts.ms ? (s.bestMs === 0 ? opts.ms : Math.min(s.bestMs, opts.ms)) : s.bestMs,
    },
  };
}

/** 这个 key 现在该复习了吗 */
export function isDue(item: Item, now = Date.now()): boolean {
  return item.dueAt > 0 && item.dueAt <= now;
}

/** 掌握了吗（连对 ≥ 3 次独立答对） */
export function isMastered(item: Item): boolean {
  return item.streak >= 3;
}

/** 统计口径 */
export type Summary = {
  total: number;
  mastered: number;
  shaky: number;
  fresh: number;
  /** 现在该复习的条数 */
  due: number;
};

/**
 * 汇总。
 *
 * @param ids 要统计的 id 全集（不传就统计存储里全部）
 */
export function summarize(p: Progress, ids?: string[], now = Date.now()): Summary {
  const list = ids ?? Object.keys(p);
  let mastered = 0;
  let shaky = 0;
  let fresh = 0;
  let due = 0;
  for (const id of list) {
    const s = p[id];
    if (!s || s.seen === 0) fresh++;
    else if (isMastered(s)) mastered++;
    else shaky++;
    if (s && isDue(s, now)) due++;
  }
  return { total: list.length, mastered, shaky, fresh, due };
}

/** 现在该复习的 id（按到期时间升序 —— 越早该看的排前面） */
export function dueIds(p: Progress, ids?: string[], now = Date.now()): string[] {
  const list = ids ?? Object.keys(p);
  return list
    .filter((id) => p[id] && isDue(p[id], now))
    .sort((a, b) => p[a].dueAt - p[b].dueAt);
}

/** 弱项（答错率最高的前 n 个）。样本太少的排除 */
export function weakest(p: Progress, ids: string[], n = 3): string[] {
  return ids
    /**
     * ⚠️ 两个过滤条件缺一不可：
     *
     * 1. `seen >= 2` —— 只见过一次不算「弱」，那只是还没学
     * 2. `lapses > 0` —— **从没错过的不算弱项**
     *
     * 第 2 条我第一版漏了，于是「连对 3 次已掌握」的题也被选进弱项
     * （因为它 lapses=0，除下来是 0，而排序只看比率，
     *   0 和「有一点错」的相对顺序不稳定）。
     * 界面上会变成「你的弱项：<一个你已经掌握了的键>」，很荒唐。
     */
    .filter((id) => (p[id]?.seen ?? 0) >= 2 && (p[id]?.lapses ?? 0) > 0)
    .sort((a, b) => {
      const ra = p[a].lapses / p[a].seen;
      const rb = p[b].lapses / p[b].seen;
      return rb - ra || p[b].lapses - p[a].lapses;
    })
    .slice(0, n);
}

/* ------------------------------------------------------------------ 存储 */

export function load(): Progress {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object" && !Array.isArray(p)) return sanitize(p);
    }
    // 新 key 没有 → 试迁移
    return migrate();
  } catch {
    return {};
  }
}

/** 每条记录必须是合法对象，坏掉的丢掉那一条而不是整个文件 */
function sanitize(p: Record<string, unknown>): Progress {
  const out: Progress = {};
  for (const [k, v] of Object.entries(p)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Partial<Item>;
    out[k] = {
      board: typeof o.board === "string" ? o.board : "",
      seen: num(o.seen),
      correct: num(o.correct),
      independent: num(o.independent),
      streak: num(o.streak),
      lapses: num(o.lapses),
      lastAt: num(o.lastAt),
      dueAt: num(o.dueAt),
      bestMs: num(o.bestMs),
    };
  }
  return out;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * 从旧的两个 key 迁移。
 *
 * ⚠️ **不删旧数据** —— 迁移出错时用户还能手动找回。
 *    迁移结果会写到新 key，之后就走新 key 了。
 */
function migrate(): Progress {
  const out: Progress = {};
  try {
    // 旧 progress：有 seen/correct/streak 的完整记录
    const oldP = localStorage.getItem(LEGACY_PROGRESS);
    if (oldP) {
      const parsed = JSON.parse(oldP) as Record<
        string,
        { seen?: number; correct?: number; streak?: number; lastAt?: number }
      >;
      for (const [id, s] of Object.entries(parsed)) {
        if (!s || typeof s !== "object") continue;
        const streak = num(s.streak);
        out[id] = {
          // 旧数据没有板块信息 —— 迁移时标成空，首页按 unknown 归类
          board: "",
          seen: num(s.seen),
          correct: num(s.correct),
          // ⚠️ 旧数据没有 independent 概念，保守地按 correct 估 ——
          //    但 streak 只信它自己的值，不编。
          independent: Math.min(num(s.correct), num(s.streak)),
          streak,
          lapses: Math.max(0, num(s.seen) - num(s.correct)),
          lastAt: num(s.lastAt),
          dueAt: 0, // 旧数据没排期，当作「没排期」而不是「现在该复习」
          bestMs: 0,
        };
      }
    }

    // 旧 board：只有「做过哪些题号」，没有任何次数信息
    const oldB = localStorage.getItem(LEGACY_BOARD);
    if (oldB) {
      const parsed = JSON.parse(oldB) as Record<string, string[]>;
      for (const [boardId, ids] of Object.entries(parsed)) {
        if (!Array.isArray(ids)) continue;
        for (const taskId of ids) {
          // ⚠️ 旧 board 的 id 形如 `L#0`（题库下标），新的是 `n|L`（mode|lhs）。
          //    对不上的就跳过 —— 宁可少几条，也不硬塞一个错的映射。
          if (out[taskId]) continue;
          out[taskId] = { ...EMPTY, board: boardId, seen: 1, correct: 1, independent: 1, streak: 1 };
        }
      }
    }

    if (Object.keys(out).length > 0) save(out);
  } catch {
    /* 迁移失败就当空进度 —— 练习不该因此崩 */
  }
  return out;
}

export function save(p: Progress): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 隐私模式 / 配额满 —— 不该因此崩，只是这次不落盘 */
  }
}

/**
 * 按板块统计。
 *
 * 首页用这个 —— 每个板块的「掌握 / 还不熟 / 没见过」。
 */
export function byBoard(p: Progress): Record<string, { mastered: number; shaky: number; fresh: number; total: number }> {
  const out: Record<string, { mastered: number; shaky: number; fresh: number; total: number }> = {};
  for (const item of Object.values(p)) {
    const b = item.board || "(unknown)";
    if (!out[b]) out[b] = { mastered: 0, shaky: 0, fresh: 0, total: 0 };
    out[b].total++;
    if (item.seen === 0) out[b].fresh++;
    else if (isMastered(item)) out[b].mastered++;
    else out[b].shaky++;
  }
  return out;
}

/** 清空（调试用）。不动旧 key，方便反悔 */
export function reset(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}
