import { describe, it, expect, beforeEach } from "vitest";
import { record, pickNext, summarize, type Progress } from "../lib/progress";
import type { Binding } from "../lib/matcher";

const b = (id: string, level = 1): Binding => ({
  id,
  keys: [id],
  display: id,
  label: id,
  desc: "",
  mode: "n",
  group: "g",
  groupLabel: "测试组",
  level,
  status: "verified",
});

const POOL = [b("a"), b("b"), b("c")];

describe("record", () => {
  it("答对累加 streak", () => {
    let p: Progress = {};
    p = record(p, "a", true);
    p = record(p, "a", true);
    expect(p.a).toMatchObject({ seen: 2, correct: 2, streak: 2 });
  });

  it("答错清零 streak 但累计正确数", () => {
    let p: Progress = {};
    p = record(p, "a", true);
    p = record(p, "a", true);
    p = record(p, "a", false);
    expect(p.a).toMatchObject({ seen: 3, correct: 2, streak: 0 });
  });

  it("不改动传入的对象(纯函数)", () => {
    const p: Progress = {};
    const next = record(p, "a", true);
    expect(p).toEqual({});
    expect(next).not.toBe(p);
  });
});

describe("pickNext", () => {
  it("空池返回 null", () => {
    expect(pickNext([], {})).toBeNull();
  });

  it("排除集用尽时退回全集(不会卡死)", () => {
    const p: Progress = { a: { seen: 1, correct: 1, streak: 1, lastAt: 0 } };
    const r = pickNext(POOL, p, ["a", "b", "c"]);
    expect(r).not.toBeNull();
  });

  it("倾向出没见过的", () => {
    // 跑 300 次,统计各条出现次数
    const hits: Record<string, number> = { a: 0, b: 0, c: 0 };
    let p: Progress = {};
    for (let i = 0; i < 300; i++) {
      const r = pickNext(POOL, p, [r0()]);
      if (r) hits[r.id]++;
    }
    function r0() {
      return "__none__";
    }
    // 三个都是 seen=0 时应该大致均匀
    const total = Object.values(hits).reduce((x, y) => x + y, 0);
    expect(total).toBe(300);
    for (const v of Object.values(hits)) {
      expect(v).toBeGreaterThan(60);
      expect(v).toBeLessThan(140);
    }
  });

  it("刚答错的下一题立刻回插(高权重)", () => {
    // a 刚错,其余没见过权重 5,a 权重 8 → a 应占多数
    const p: Progress = { a: { seen: 1, correct: 0, streak: 0, lastAt: Date.now() } };
    let aCount = 0;
    for (let i = 0; i < 200; i++) {
      const r = pickNext(POOL, p, ["__none__"]);
      if (r?.id === "a") aCount++;
    }
    // 8 / (8+5+5) ≈ 0.44 → 200 次约 88 次。放宽区间防偶发抖动
    expect(aCount).toBeGreaterThan(55);
  });

  it("连对 3 次以上几乎不再出", () => {
    const p: Progress = {
      a: { seen: 3, correct: 3, streak: 3, lastAt: Date.now() },
      b: { seen: 1, correct: 0, streak: 0, lastAt: Date.now() },
    };
    let aCount = 0;
    for (let i = 0; i < 200; i++) {
      const r = pickNext(POOL, p, ["__none__"]);
      if (r?.id === "a") aCount++;
    }
    // a 权重 1,c 权重 5,b 权重 8 → 1/14 ≈ 7% → 约 14 次
    expect(aCount).toBeLessThan(40);
  });
});

describe("summarize", () => {
  it("三态计数正确", () => {
    const p: Progress = {
      a: { seen: 3, correct: 3, streak: 3, lastAt: 1 }, // mastered
      b: { seen: 1, correct: 0, streak: 0, lastAt: 1 }, // shaky
      // c 未出现 → fresh
    };
    const s = summarize(p, POOL);
    expect(s).toEqual({ total: 3, mastered: 1, shaky: 1, fresh: 1 });
  });
});
