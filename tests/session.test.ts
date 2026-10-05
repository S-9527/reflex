import { describe, expect, it } from "vitest";
import {
  createSession,
  cursor,
  currentTaskId,
  isDone,
  record,
  summarize,
  nextRoundOrder,
  mistakesOnly,
  formatMs,
} from "../lib/session";

/**
 * 会话模型的测试。
 *
 * 这个文件存在的理由：旧版**没有会话概念**，所有板块都是
 * `tasks[i]` 无限循环 —— 没有终点、没有结算、刷新回第 0 题。
 * 所以这里要守住的是「有开始、有结束、有结算」这件事本身。
 */

const Q = ["a", "b", "c"];
const keyCount = () => 2; // 每题 2 个键

describe("createSession / 游标", () => {
  it("新会话从第 0 题开始", () => {
    const s = createSession("board", Q, 1000);
    expect(cursor(s)).toBe(0);
    expect(currentTaskId(s)).toBe("a");
    expect(isDone(s)).toBe(false);
  });

  it("做完最后一题才算 done", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    s = record(s, { taskId: "b", ok: true, ms: 100 });
    expect(isDone(s)).toBe(false);
    s = record(s, { taskId: "c", ok: true, ms: 100 });
    expect(isDone(s)).toBe(true);
    expect(currentTaskId(s)).toBeNull();
  });

  it("空队列直接算 done（不能崩）", () => {
    const s = createSession("board", [], 1000);
    expect(isDone(s)).toBe(true);
    expect(currentTaskId(s)).toBeNull();
    expect(summarize(s, keyCount).accuracy).toBe(0);
  });
});

describe("record", () => {
  it("按顺序推进游标", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    expect(cursor(s)).toBe(1);
    expect(currentTaskId(s)).toBe("b");
  });

  /**
   * ⚠️ 幂等保护。
   *
   * 没有它，快速连按可能把一道题记两次 —— 游标会跳过下一题，
   * 用户会看到「题目莫名其妙少了一道」。
   */
  it("同一题重复记会被忽略（防止连按跳过题目）", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    s = record(s, { taskId: "a", ok: false, ms: 999 });
    expect(s.results).toHaveLength(1);
    expect(s.results[0].ok).toBe(true); // 保留第一次的结果
    expect(cursor(s)).toBe(1);
  });

  it("做完了再记会被忽略（不会超出队列）", () => {
    let s = createSession("board", ["a"], 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    const before = s.results.length;
    s = record(s, { taskId: "zzz", ok: true, ms: 100 });
    expect(s.results).toHaveLength(before);
  });

  it("不改原对象（纯函数）", () => {
    const s = createSession("board", Q, 1000);
    const s2 = record(s, { taskId: "a", ok: true, ms: 100 });
    expect(s.results).toHaveLength(0);
    expect(s2.results).toHaveLength(1);
  });
});

describe("summarize", () => {
  it("正确率 = 答对数 / 已作答数", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    s = record(s, { taskId: "b", ok: false, ms: 100 });
    s = record(s, { taskId: "c", ok: true, ms: 100 });
    const sum = summarize(s, keyCount);
    expect(sum.correct).toBe(2);
    expect(sum.wrong).toBe(1);
    expect(sum.accuracy).toBeCloseTo(2 / 3);
  });

  it("用时是各题之和（不含题间停顿）", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 300 });
    s = record(s, { taskId: "b", ok: true, ms: 700 });
    expect(summarize(s, keyCount).elapsedMs).toBe(1000);
  });

  /**
   * ⚠️ 速度只算**答对**的题的按键数。
   *
   * 答错重按的那些不算熟练度 —— 否则按得越多、速度看着越高，
   * 方向完全反了。
   */
  it("速度只统计答对的题（答错不算熟练度）", () => {
    let s = createSession("board", Q, 1000);
    // 一道对（2 键 / 60000ms → 2 键/分）
    s = record(s, { taskId: "a", ok: true, ms: 60000 });
    s = record(s, { taskId: "b", ok: false, ms: 60000 });
    const sum = summarize(s, keyCount);
    // 只有 a 计入：2 键 / 60000ms = 2 键/分
    expect(sum.keysPerMin).toBe(2);
  });

  /**
   * ⚠️ 分子分母同源。
   *
   * 我第一版分子只算答对的按键数，分母却用**全部**题目的用时 ——
   * 于是「答错一题（耗时很久）+ 答对一题」把速度压得极低。
   * 但手速并不慢，是答错了。两者混在一起速度就没法看。
   */
  it("答错的题不参与速度计算（分子分母都只取答对的）", () => {
    // 答对：2 键 / 60s。答错：2 键 / 600s（耗时很久）
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 60000 });
    s = record(s, { taskId: "b", ok: false, ms: 600000 });
    // 如果分母混入答错题的用时，会算出 (2/660000)*60000 ≈ 0
    expect(summarize(s, keyCount).keysPerMin).toBe(2);
  });

  it("elapsedMs 仍然统计全部用时（那是「本轮花了多久」）", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 300 });
    s = record(s, { taskId: "b", ok: false, ms: 700 });
    expect(summarize(s, keyCount).elapsedMs).toBe(1000);
  });

  it("mistakes 只含答错的，且保留顺序", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: false, ms: 100, wrongKey: "x" });
    s = record(s, { taskId: "b", ok: true, ms: 100 });
    s = record(s, { taskId: "c", ok: false, ms: 100, wrongKey: "y" });
    const sum = summarize(s, keyCount);
    expect(sum.mistakes.map((m) => m.taskId)).toEqual(["a", "c"]);
    expect(sum.mistakes[0].wrongKey).toBe("x");
  });

  it("fastestMs 是答对的题里最快的", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 900 });
    s = record(s, { taskId: "b", ok: true, ms: 200 });
    s = record(s, { taskId: "c", ok: false, ms: 10 }); // 答错再快也不算
    expect(summarize(s, keyCount).fastestMs).toBe(200);
  });

  it("一题没答时 fastestMs 是 null，不崩", () => {
    const s = createSession("board", Q, 1000);
    const sum = summarize(s, keyCount);
    expect(sum.fastestMs).toBeNull();
    expect(sum.keysPerMin).toBe(0);
    expect(sum.answered).toBe(0);
  });

  /**
   * ⚠️ `correct` 和 `independent` 是两件事。
   *
   * `correct` = 按键对了；`independent` = 真的记住了。
   * 按提示抄对、或在跟打模式下照着按对的，算前者不算后者 ——
   * 否则「按提示抄一遍」会污染熟练度，复习队列就废了。
   */
  describe("independent（独立答对）", () => {
    it("默写 + 没用提示 → 算独立答对", () => {
      let s = createSession("board", Q, 1000);
      s = record(s, { taskId: "a", ok: true, ms: 100, mode: "recall", usedHint: false });
      const sum = summarize(s, keyCount);
      expect(sum.correct).toBe(1);
      expect(sum.independent).toBe(1);
    });

    it("用了提示 → 算 correct 但不算 independent", () => {
      let s = createSession("board", Q, 1000);
      s = record(s, { taskId: "a", ok: true, ms: 100, mode: "recall", usedHint: true });
      const sum = summarize(s, keyCount);
      expect(sum.correct).toBe(1);
      expect(sum.independent).toBe(0);
    });

    it("跟打模式 → 算 correct 但不算 independent", () => {
      let s = createSession("board", Q, 1000);
      s = record(s, { taskId: "a", ok: true, ms: 100, mode: "drill", usedHint: false });
      const sum = summarize(s, keyCount);
      expect(sum.correct).toBe(1);
      expect(sum.independent).toBe(0);
    });

    it("答错的一律不算（哪怕在默写模式且没用提示）", () => {
      let s = createSession("board", Q, 1000);
      s = record(s, { taskId: "a", ok: false, ms: 100, mode: "recall", usedHint: false });
      expect(summarize(s, keyCount).independent).toBe(0);
    });

    it("没标 mode 的旧结果按默写算（向后兼容）", () => {
      let s = createSession("board", Q, 1000);
      s = record(s, { taskId: "a", ok: true, ms: 100 }); // 不传 mode / usedHint
      expect(summarize(s, keyCount).independent).toBe(1);
    });

    it("independent <= correct 恒成立", () => {
      let s = createSession("board", Q, 1000);
      s = record(s, { taskId: "a", ok: true, ms: 100, mode: "recall", usedHint: true });
      s = record(s, { taskId: "b", ok: true, ms: 100, mode: "recall", usedHint: false });
      s = record(s, { taskId: "c", ok: false, ms: 100, mode: "drill" });
      const sum = summarize(s, keyCount);
      expect(sum.independent).toBeLessThanOrEqual(sum.correct);
      expect(sum.independent).toBe(1);
      expect(sum.correct).toBe(2);
    });
  });

  it("total 是队列长度，不是已作答数", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    const sum = summarize(s, keyCount);
    expect(sum.total).toBe(3);
    expect(sum.answered).toBe(1);
  });
});

describe("nextRoundOrder / mistakesOnly", () => {
  it("答错的排到最前面（立刻回插）", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: true, ms: 100 });
    s = record(s, { taskId: "b", ok: false, ms: 100 });
    s = record(s, { taskId: "c", ok: true, ms: 100 });
    expect(nextRoundOrder(s)).toEqual(["b", "a", "c"]);
  });

  it("全对时顺序不变", () => {
    let s = createSession("board", Q, 1000);
    for (const id of Q) s = record(s, { taskId: id, ok: true, ms: 100 });
    expect(nextRoundOrder(s)).toEqual(Q);
  });

  it("顺序里不重复、不丢题", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: false, ms: 100 });
    s = record(s, { taskId: "b", ok: false, ms: 100 });
    s = record(s, { taskId: "c", ok: true, ms: 100 });
    const order = nextRoundOrder(s);
    expect(new Set(order).size).toBe(Q.length);
    expect(order).toHaveLength(Q.length);
  });

  it("mistakesOnly 只给错题，全对时为空", () => {
    let s = createSession("board", Q, 1000);
    s = record(s, { taskId: "a", ok: false, ms: 100 });
    s = record(s, { taskId: "b", ok: true, ms: 100 });
    expect(mistakesOnly(s)).toEqual(["a"]);

    let s2 = createSession("board", Q, 1000);
    for (const id of Q) s2 = record(s2, { taskId: id, ok: true, ms: 100 });
    expect(mistakesOnly(s2)).toEqual([]);
  });
});

describe("formatMs", () => {
  it("秒数补零", () => {
    expect(formatMs(7000)).toBe("0:07");
    expect(formatMs(102000)).toBe("1:42");
    expect(formatMs(600000)).toBe("10:00");
  });

  it("0 和负数不崩", () => {
    expect(formatMs(0)).toBe("0:00");
    expect(formatMs(-5)).toBe("0:00");
  });
});
