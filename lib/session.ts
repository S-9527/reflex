/**
 * 练习会话 —— 纯函数，无 React、无 DOM，有单测。
 *
 * ## 为什么需要「会话」这个概念
 *
 * 旧版所有板块都是 `tasks[taskIndex]` 无限循环：
 *
 * ```
 * 答对 → (i + 1) % length → 下一题 → 答对 → ……
 * ```
 *
 * 于是**没有终点**：练 5 题还是 500 题？不知道。练完对了几个？不知道。
 * 刷新之后回到第 0 题，跨会话只剩「做过哪些」。
 * 用户永远在「下一题、下一题」的无限流里 —— 这是「体验差」最直接的来源。
 *
 * **没有终点，就没有成就感，也没有停下来的理由。**
 *
 * ## 一轮 = 一个板块的全部题目
 *
 * 和 Qwerty Learner「打完一个词库」一致。可视化板块本来就是 6~40 条，
 * 一轮打完正好是一次完整的练习单元。
 *
 * ## 计时怎么算
 *
 * 只算**按键之间**的时间，不算两题之间的停顿 ——
 * 否则用户看两眼解法、喝口水，速度统计就废了。
 * 所以每道题单独计时，从该题第一个键按下到答完为止。
 */

/** 一道题的作答结果 */
export type Result = {
  taskId: string;
  /** 是否答对（首次尝试就答对） */
  ok: boolean;
  /** 这道题的用时（ms）。从第一个键按下到答完 */
  ms: number;
  /** 首次按错的键。答对则为 undefined */
  wrongKey?: string;
  /**
   * 这一题用了提示吗（按过 `?`）。
   *
   * ⚠️ 用了提示的题**不算独立答对** —— 否则「按提示抄一遍」
   *    会污染熟练度数据，复习队列就废了。见 lib/hints.ts 的
   *    `countsForProgress`。
   */
  usedHint?: boolean;
  /** 这一题是在哪个模式下做的 */
  mode?: "drill" | "recall";
};

/** 一轮练习 */
export type Session = {
  boardId: string;
  /** 本轮的题目 id，按出题顺序 */
  queue: string[];
  /** 已作答的结果，按作答顺序 */
  results: Result[];
  /** 本轮开始时间戳 */
  startedAt: number;
};

/** 开一轮新的 */
export function createSession(boardId: string, queue: string[], now = Date.now()): Session {
  return { boardId, queue, results: [], startedAt: now };
}

/** 当前该做第几题（从 0 开始）。等于 queue.length 表示做完了 */
export function cursor(s: Session): number {
  return s.results.length;
}

/** 当前该做的题目 id。做完了返回 null */
export function currentTaskId(s: Session): string | null {
  return s.queue[cursor(s)] ?? null;
}

/** 这一轮做完了吗 */
export function isDone(s: Session): boolean {
  return s.results.length >= s.queue.length;
}

/**
 * 记一道题的结果。
 *
 * ⚠️ 幂等保护：同一题重复记会被忽略。
 * 没有它，快速连按可能把一道题记两次，`cursor` 就跳过了下一题。
 */
export function record(s: Session, r: Result): Session {
  if (isDone(s)) return s;
  if (s.results.some((x) => x.taskId === r.taskId)) return s;
  return { ...s, results: [...s.results, r] };
}

/** 结算数据 */
export type Summary = {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  /**
   * 其中「独立答对」的数量 —— 没用提示、且在默写模式下做的。
   *
   * ⚠️ 和 `correct` 分开：`correct` 是「按键对了」，
   *    `independent` 是「真的记住了」。按提示抄对、或在跟打模式下
   *    照着按对的，算 `correct` 但不算 `independent`。
   */
  independent: number;
  /** 正确率 0~1。没作答时为 0 */
  accuracy: number;
  /** 总用时（只算答题时间，不含题间停顿） */
  elapsedMs: number;
  /** 速度：每分钟按对多少个键 */
  keysPerMin: number;
  /** 答错的题，按错的次数/顺序 */
  mistakes: Result[];
  /** 最快的一道题 */
  fastestMs: number | null;
};

/**
 * 结算。
 *
 * `keyCountOf` 用来把「用时」换算成速度 —— 需要知道每道题几个键，
 * 而 session 本身不存题目内容（保持纯数据），所以由调用方传入。
 */
export function summarize(
  s: Session,
  keyCountOf: (taskId: string) => number,
): Summary {
  const answered = s.results.length;
  const correct = s.results.filter((r) => r.ok).length;
  const wrong = answered - correct;
  const elapsedMs = s.results.reduce((a, r) => a + r.ms, 0);

  /**
   * ⚠️ 速度的分子分母必须**同源**：都只取答对的题。
   *
   * 分子只算答对的按键数（答错重按不算熟练度），
   * 那么分母也只能用答对题的用时 ——
   * 否则「答错一题（耗时很久）+ 答对一题」会把速度压得极低，
   * 但那不是手速慢，是答错了。两者混在一起，速度就没法看了。
   */
  const okResults = s.results.filter((r) => r.ok);
  const okMs = okResults.reduce((a, r) => a + r.ms, 0);
  const keys = okResults.reduce((a, r) => a + keyCountOf(r.taskId), 0);
  const keysPerMin = okMs > 0 ? Math.round((keys / okMs) * 60000) : 0;

  const okTimes = okResults.map((r) => r.ms);

  /**
   * 「独立答对」= 答对 + 没用提示 + 在默写模式下。
   *
   * ⚠️ 这条判据和 lib/hints.ts 的 `countsForProgress` 是同一套语义，
   *    这里内联是为了避免 session（纯数据）反向依赖 hints。
   *    两边都有测试盯着（见 tests/session.test.ts 与 tests/hints.test.ts）。
   */
  const independent = okResults.filter(
    (r) => !r.usedHint && (r.mode ?? "recall") === "recall",
  ).length;

  return {
    total: s.queue.length,
    answered,
    correct,
    wrong,
    independent,
    accuracy: answered === 0 ? 0 : correct / answered,
    elapsedMs,
    keysPerMin,
    mistakes: s.results.filter((r) => !r.ok),
    fastestMs: okTimes.length > 0 ? Math.min(...okTimes) : null,
  };
}

/**
 * 下一轮的题目顺序。
 *
 * 答错的排前面（立刻回插），其余保持原顺序 ——
 * 这是最简单的间隔重复，比「循环播放」有效得多。
 */
export function nextRoundOrder(s: Session): string[] {
  const wrongIds = s.results.filter((r) => !r.ok).map((r) => r.taskId);
  const wrongSet = new Set(wrongIds);
  // 先错的（按错的顺序），再其余（按原顺序）
  return [...wrongIds, ...s.queue.filter((id) => !wrongSet.has(id))];
}

/** 只练错题的队列。没错题时返回空数组 */
export function mistakesOnly(s: Session): string[] {
  return s.results.filter((r) => !r.ok).map((r) => r.taskId);
}

/** 把毫秒格式化成 `1:42` / `0:07` */
export function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
