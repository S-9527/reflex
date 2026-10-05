import { describe, expect, it } from "vitest";
import {
  record,
  isDue,
  isMastered,
  summarize,
  dueIds,
  weakest,
  type Progress,
  type Item,
} from "../lib/srs";

/**
 * 统一进度模型的测试。
 *
 * ## 这一版要守住的三件事
 *
 * 1. **「独立答对」才是学会的依据** —— 跟打照抄、按提示抄的不算
 * 2. **答错立刻回插** —— 而不是等下一个周期
 * 3. **只有独立答对才推后复习间隔** —— 否则越抄越久不复习，正好反了
 */

const T = 1_700_000_000_000; // 固定时间戳，避免测试受当前时间影响
const DAY = 86_400_000;

describe("record —— 基本计数", () => {
  it("答对累加 correct 和 independent", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, ms: 500, now: T });
    expect(p.a).toMatchObject({ seen: 1, correct: 1, independent: 1, streak: 1, lapses: 0 });
  });

  it("答错累加 lapses，streak 归零", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, now: T });
    p = record(p, "a", true, { independent: true, now: T });
    p = record(p, "a", false, { now: T });
    expect(p.a).toMatchObject({ seen: 3, correct: 2, streak: 0, lapses: 1 });
  });

  /**
   * ⚠️ 跟打模式照抄的、按提示抄的：算 correct 不算 independent。
   */
  it("非独立答对：correct 加但 independent 不加", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: false, now: T });
    expect(p.a).toMatchObject({ correct: 1, independent: 0 });
  });

  it("非独立答对不推进 streak（照抄不算连续记住）", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: false, now: T });
    expect(p.a.streak).toBe(0);
  });

  it("非独立答对也不清 streak（抄一遍不算忘掉）", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, now: T });
    p = record(p, "a", true, { independent: true, now: T });
    p = record(p, "a", true, { independent: false, now: T }); // 跟打看了一眼
    expect(p.a.streak, "看了答案但没答错，不该归零").toBe(2);
  });

  it("bestMs 只记答对里的最快", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, ms: 900, now: T });
    p = record(p, "a", true, { independent: true, ms: 400, now: T });
    p = record(p, "a", false, { ms: 50, now: T }); // 答错再快也不算
    expect(p.a.bestMs).toBe(400);
  });

  it("不改原对象（纯函数）", () => {
    const p: Progress = {};
    const q = record(p, "a", true, { now: T });
    expect(Object.keys(p)).toHaveLength(0);
    expect(Object.keys(q)).toHaveLength(1);
  });

  it("不同 id 互不影响", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, now: T });
    p = record(p, "b", false, { now: T });
    expect(p.a.streak).toBe(1);
    expect(p.b.lapses).toBe(1);
  });
});

describe("间隔重复的排期", () => {
  it("答错 → 立刻回插（dueAt = now）", () => {
    let p: Progress = {};
    p = record(p, "a", false, { now: T });
    expect(p.a.dueAt).toBe(T);
    expect(isDue(p.a, T)).toBe(true);
  });

  /**
   * ⚠️ 只有**独立答对**才推后间隔。
   *    按提示抄对的不该让复习变远 —— 否则越抄越久不复习，正好反了。
   */
  it("非独立答对不推后间隔", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: false, now: T });
    expect(p.a.dueAt, "抄的不该排期").toBe(0);
  });

  it("独立答对 → 按 streak 推后", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, now: T }); // streak 1 → 1 天
    expect(p.a.dueAt).toBe(T + 1 * DAY);
    p = record(p, "a", true, { independent: true, now: T }); // streak 2 → 3 天
    expect(p.a.dueAt).toBe(T + 3 * DAY);
    p = record(p, "a", true, { independent: true, now: T }); // streak 3 → 7 天
    expect(p.a.dueAt).toBe(T + 7 * DAY);
  });

  it("间隔单调递增，到顶后不再涨", () => {
    let p: Progress = {};
    const dues: number[] = [];
    for (let i = 0; i < 10; i++) {
      p = record(p, "a", true, { independent: true, now: T });
      dues.push(p.a.dueAt - T);
    }
    for (let i = 1; i < dues.length; i++) {
      expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1]);
    }
    // 到顶之后不再变
    expect(dues[dues.length - 1]).toBe(dues[dues.length - 2]);
  });

  it("答错之后重新开始爬（streak 归零 → 间隔回到 1 天）", () => {
    let p: Progress = {};
    for (let i = 0; i < 4; i++) p = record(p, "a", true, { independent: true, now: T });
    p = record(p, "a", false, { now: T }); // 错了
    expect(p.a.dueAt).toBe(T); // 立刻回插
    p = record(p, "a", true, { independent: true, now: T });
    expect(p.a.dueAt).toBe(T + 1 * DAY); // 从 1 天重新爬
  });

  it("isDue 的边界", () => {
    const item: Item = { ...({} as Item), seen: 1, dueAt: T };
    expect(isDue(item, T - 1)).toBe(false);
    expect(isDue(item, T)).toBe(true);
    expect(isDue(item, T + 1)).toBe(true);
  });

  it("没排期（dueAt=0）的永远不算到期", () => {
    const item = { dueAt: 0 } as Item;
    expect(isDue(item, T)).toBe(false);
    expect(isDue(item, T + 999 * DAY)).toBe(false);
  });
});

describe("isMastered", () => {
  it("连对 3 次独立答对 = 掌握", () => {
    expect(isMastered({ streak: 2 } as Item)).toBe(false);
    expect(isMastered({ streak: 3 } as Item)).toBe(true);
    expect(isMastered({ streak: 9 } as Item)).toBe(true);
  });
});

describe("summarize", () => {
  it("三档分类：没见过 / 还不熟 / 已掌握", () => {
    let p: Progress = {};
    for (let i = 0; i < 3; i++) p = record(p, "mastered", true, { independent: true, now: T });
    p = record(p, "shaky", true, { independent: true, now: T });
    // "fresh" 完全没记录
    const s = summarize(p, ["mastered", "shaky", "fresh"], T);
    expect(s).toMatchObject({ total: 3, mastered: 1, shaky: 1, fresh: 1 });
  });

  it("统计的 total 是传入的 id 数，不是存储里的条数", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, now: T });
    expect(summarize(p, ["a", "b", "c"], T).total).toBe(3);
    expect(summarize(p, undefined, T).total).toBe(1);
  });

  it("due 数出该复习的条数", () => {
    let p: Progress = {};
    p = record(p, "a", false, { now: T }); // 立刻回插
    p = record(p, "b", true, { independent: true, now: T }); // 1 天后
    expect(summarize(p, ["a", "b"], T).due).toBe(1);
    expect(summarize(p, ["a", "b"], T + 2 * DAY).due).toBe(2);
  });
});

describe("dueIds", () => {
  it("只返回到期的，按到期时间升序", () => {
    let p: Progress = {};
    p = record(p, "later", false, { now: T + 5000 });
    p = record(p, "sooner", false, { now: T });
    p = record(p, "notyet", true, { independent: true, now: T }); // 1 天后
    const due = dueIds(p, ["later", "sooner", "notyet"], T + 10000);
    expect(due).toEqual(["sooner", "later"]);
  });

  it("没有到期的返回空", () => {
    let p: Progress = {};
    p = record(p, "a", true, { independent: true, now: T });
    expect(dueIds(p, ["a"], T)).toEqual([]);
  });
});

describe("weakest", () => {
  it("按答错率排序，样本太少的排除", () => {
    let p: Progress = {};
    // bad：3 次错 2 次（67%）
    p = record(p, "bad", false, { now: T });
    p = record(p, "bad", false, { now: T });
    p = record(p, "bad", true, { independent: true, now: T });
    // good：3 次错 1 次（33%）
    p = record(p, "good", true, { independent: true, now: T });
    p = record(p, "good", true, { independent: true, now: T });
    p = record(p, "good", false, { now: T });
    // tiny：只见过 1 次，样本太少
    p = record(p, "tiny", false, { now: T });

    const w = weakest(p, ["bad", "good", "tiny"], 3);
    expect(w).toContain("bad");
    expect(w).toContain("good");
    expect(w, "只见过 1 次的不该算弱项").not.toContain("tiny");
    expect(w[0], "错得最多的排前面").toBe("bad");
  });

  it("没有足够样本时返回空", () => {
    const p: Progress = {};
    expect(weakest(p, ["a", "b"], 3)).toEqual([]);
  });
});

describe("weakest —— 只挑真的弱项", () => {
  /**
   * ⚠️ 回归测试。
   *
   * 我第一版只按「错率」排序，没排除零错误的题 ——
   * 于是「连对 3 次已掌握」的题也会被选进弱项
   * （lapses=0，比率是 0，但排序在只有一条候选时照样返回它）。
   * 界面上会变成「你的弱项：<一个你已经掌握了的键>」。
   */
  it("从没答错的不算弱项（哪怕样本很多）", () => {
    let p: Progress = {};
    for (let i = 0; i < 5; i++) p = record(p, "perfect", true, { independent: true, now: T });
    expect(weakest(p, ["perfect"], 3), "全对的题不该是弱项").toEqual([]);
  });

  it("有错的才进候选", () => {
    let p: Progress = {};
    p = record(p, "perfect", true, { independent: true, now: T });
    p = record(p, "perfect", true, { independent: true, now: T });
    p = record(p, "flawed", false, { now: T });
    p = record(p, "flawed", true, { independent: true, now: T });
    const w = weakest(p, ["perfect", "flawed"], 3);
    expect(w).toEqual(["flawed"]);
  });
});
