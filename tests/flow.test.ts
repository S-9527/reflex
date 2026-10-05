import { describe, expect, it } from "vitest";
import { classify, mergeFirstKeys, shouldTake, type DrillTask } from "../lib/drill";
import { pushFeed, type KeyFeedback } from "../lib/drill";
import {
  createSession,
  cursor,
  currentTaskId,
  isDone,
  record,
  summarize,
  nextRoundOrder,
  mistakesOnly,
} from "../lib/session";

/**
 * 「qwerty 式打字流」的**集成测试** —— 不用浏览器，直接驱动引擎。
 *
 * ## 为什么要有这个文件
 *
 * 前面 session.test.ts 测的是会话模型本身，drill.test.ts 测的是三态判据。
 * 但这一版真正的改动是**两者串起来之后的行为**：
 *
 * 1. 逐键反馈：每按一键都能算出「这一键对不对」
 * 2. 无缝推进：命中即下一题，没有 advanceMs 定时器
 * 3. 一轮有终点：打完整个板块 → 结算
 *
 * 这三条是「体验差」的修复本身，所以必须被守住。
 * 没有浏览器的情况下，这是最接近真实验证的测试。
 */

/** 模拟一个板块：4 道题，各有最优解和次解 */
const TASKS: DrillTask[] = [
  { id: "t1", short: "L", desc: "下一个 buffer", accept: [["L"], ["]", "b"]] },
  { id: "t2", short: "H", desc: "上一个 buffer", accept: [["H"], ["[", "b"]] },
  { id: "t3", short: "bd", desc: "关掉当前 buffer", accept: [["<Space>", "b", "d"]] },
  { id: "t4", short: "bo", desc: "只留当前 buffer", accept: [["<Space>", "b", "o"]] },
];

/** 模拟 use-drill 的 keydown handler 核心（不含 React 状态） */
function makeEngine(tasks: DrillTask[]) {
  let session = createSession("test", tasks.map((t) => t.id));
  let buf: string[] = [];
  let feed: { index: number; key: string; ok: boolean }[] = [];
  const firstKeys = mergeFirstKeys(...tasks.flatMap((t) => t.accept));

  /** 按一个键。返回这一键的判定结果 */
  function press(key: string): "prefix" | "hit" | "none" | "ignored" {
    if (isDone(session)) return "ignored";
    const cur = tasks.find((t) => t.id === currentTaskId(session))!;
    if (!shouldTake(buf, firstKeys, key)) return "ignored";

    const next = [...buf, key];
    const r = classify(cur.accept, next);

    if (r.kind === "prefix") {
      buf = next;
      feed.push({ index: next.length - 1, key, ok: true });
      return "prefix";
    }
    if (r.kind === "hit") {
      const idx = next.length - 1;
      feed.push({ index: idx, key, ok: true });
      // ⚠️ 命中即推进 —— 这就是「无缝」
      session = record(session, { taskId: cur.id, ok: true, ms: 100 });
      buf = [];
      feed = [];
      return "hit";
    }
    // none：保留已按对的前缀，只标红这一键（停住纠错）
    feed.push({ index: next.length - 1, key, ok: false });
    return "none";
  }

  return {
    press,
    get session() { return session; },
    get buf() { return buf; },
    get feed() { return feed; },
    get current() {
      const id = currentTaskId(session);
      return id ? tasks.find((t) => t.id === id)! : null;
    },
    get done() { return isDone(session); },
    get cursor() { return cursor(session); },
  };
}

describe("逐键反馈 —— 每按一键都要能上色", () => {
  it("按对第一键 → 绿", () => {
    const e = makeEngine(TASKS);
    expect(e.press("L")).toBe("hit");
    expect(e.feed).toHaveLength(0); // 命中后清空（换题了）
  });

  it("多键序列：前缀按键逐个变绿", () => {
    const e = makeEngine(TASKS);
    e.press("L"); // t1 完成
    e.press("H"); // t2 完成
    // t3 是 <Space>bd
    expect(e.press("<Space>")).toBe("prefix");
    expect(e.feed).toEqual([{ index: 0, key: "<Space>", ok: true }]);
    expect(e.press("b")).toBe("prefix");
    expect(e.feed[1]).toEqual({ index: 1, key: "b", ok: true });
    expect(e.press("d")).toBe("hit");
  });

  /**
   * ⚠️ 这是相对旧版最关键的改动。
   *
   * 旧版 `none` 分支会 `setBuf([])` —— 按错一个键整串就没了。
   * 新版**保留已按对的前缀**，只把错的那一键标红，等用户接着按。
   */
  it("按错时不重置整串，保留已按对的前缀（停住纠错）", () => {
    const e = makeEngine(TASKS);
    e.press("L");
    e.press("H");
    e.press("<Space>"); // t3 的前缀
    e.press("b"); // 还是前缀
    expect(e.press("x")).toBe("none"); // 错了
    // 已按对的两个键还在
    expect(e.buf).toEqual(["<Space>", "b"]);
    // 错的那一键标红
    expect(e.feed[2]).toEqual({ index: 2, key: "x", ok: false });
    // 接着按对的，还能完成
    expect(e.press("d")).toBe("hit");
  });

  it("次解也算对，且逐键同样上色", () => {
    const e = makeEngine(TASKS);
    e.press("L");
    // t2 的次解是 [b
    expect(e.press("[")).toBe("prefix");
    expect(e.press("b")).toBe("hit");
    expect(e.session.results[1].ok).toBe(true);
  });

  it("不属于任何解法的键不接管", () => {
    const e = makeEngine(TASKS);
    expect(e.press("Z")).toBe("ignored");
    expect(e.buf).toEqual([]);
  });
});

describe("无缝推进 —— 没有 advanceMs 定时器", () => {
  it("命中后游标立刻前进（同一帧，不等 1.5 秒）", () => {
    const e = makeEngine(TASKS);
    expect(e.cursor).toBe(0);
    e.press("L");
    expect(e.cursor).toBe(1); // 立刻，不是等定时器
    expect(e.current?.id).toBe("t2");
  });

  it("连续按完整个板块，中间没有等待", () => {
    const e = makeEngine(TASKS);
    e.press("L");
    e.press("H");
    e.press("<Space>");
    e.press("b");
    e.press("d");
    e.press("<Space>");
    e.press("b");
    e.press("o");
    expect(e.done).toBe(true);
    expect(e.session.results).toHaveLength(4);
  });
});

describe("一轮有终点 + 结算", () => {
  it("打完整个板块 → done", () => {
    const e = makeEngine(TASKS);
    for (const k of ["L", "H", "<Space>", "b", "d", "<Space>", "b", "o"]) e.press(k);
    expect(e.done).toBe(true);
    expect(e.current).toBeNull();
  });

  it("全对时结算正确率 100%", () => {
    const e = makeEngine(TASKS);
    for (const k of ["L", "H", "<Space>", "b", "d", "<Space>", "b", "o"]) e.press(k);
    const sum = summarize(e.session, () => 1);
    expect(sum.correct).toBe(4);
    expect(sum.wrong).toBe(0);
    expect(sum.accuracy).toBe(1);
    expect(sum.total).toBe(4);
  });

  it("有错题时，错题排在下一轮最前面", () => {
    let s = createSession("test", ["t1", "t2", "t3"]);
    s = record(s, { taskId: "t1", ok: true, ms: 100 });
    s = record(s, { taskId: "t2", ok: false, ms: 100, wrongKey: "x" });
    s = record(s, { taskId: "t3", ok: true, ms: 100 });
    expect(nextRoundOrder(s)).toEqual(["t2", "t1", "t3"]);
    expect(mistakesOnly(s)).toEqual(["t2"]);
  });

  it("做完之后再按键盘不会被接管（不会越界）", () => {
    const e = makeEngine(TASKS);
    for (const k of ["L", "H", "<Space>", "b", "d", "<Space>", "b", "o"]) e.press(k);
    const before = e.session.results.length;
    expect(e.press("L")).toBe("ignored");
    expect(e.session.results).toHaveLength(before);
  });
});

/**
 * ⚠️ 逐键反馈的**过期记录** bug。
 *
 * 「停住纠错」的交互下，同一个位置会被按多次：
 *
 * ```
 * 按 <Space>  → feed = [{0, "<Space>", true}]
 * 按 x（错）   → feed = [..., {1, "x", false}]       buf 还是 ["<Space>"]
 * 按 b（对）   → feed = [..., {1, "x", false}, {1, "b", true}]
 *                                          ↑ 同一位置两条
 * ```
 *
 * UI 用 `find()` 取第一条，于是显示**过期的** `x`（红色）——
 * 用户明明改对了，界面还在报错。而且**不抛异常**，只是颜色不对，
 * 肉眼很容易漏掉。
 *
 * `pushFeed` 的修法：在位置 N 按键意味着 N 及之后都要重走，
 * 所以先删掉 `index >= N` 的旧记录。
 */
describe("pushFeed —— 同一位置只留最新一条", () => {
  it("正常前进：逐条累积", () => {
    let f = pushFeed([], 0, "<Space>", true);
    f = pushFeed(f, 1, "b", true);
    expect(f).toEqual([
      { index: 0, key: "<Space>", ok: true },
      { index: 1, key: "b", ok: true },
    ]);
  });

  it("同一位置重新按：旧的被替换掉（不留下过期记录）", () => {
    let f = pushFeed([], 0, "<Space>", true);
    f = pushFeed(f, 1, "x", false); // 按错
    f = pushFeed(f, 1, "b", true); // 原位改对
    expect(f).toHaveLength(2);
    expect(f[1]).toEqual({ index: 1, key: "b", ok: true });
    // ⚠️ 关键：不该还有 {1, "x", false}
    expect(f.filter((x) => x.index === 1)).toHaveLength(1);
  });

  it("回退到更早的位置：之后的记录全部作废", () => {
    let f = pushFeed([], 0, "a", true);
    f = pushFeed(f, 1, "b", true);
    f = pushFeed(f, 2, "c", true);
    // 回到位置 1 重按
    f = pushFeed(f, 1, "x", false);
    expect(f.map((x) => x.index)).toEqual([0, 1]);
    expect(f[1]).toEqual({ index: 1, key: "x", ok: false });
  });

  it("任何时刻每个位置最多一条（find() 因此是安全的）", () => {
    let f: KeyFeedback[] = [];
    const presses: [number, string, boolean][] = [
      [0, "<Space>", true],
      [1, "x", false],
      [1, "b", true],
      [2, "d", true],
      [2, "o", false],
      [2, "o", true],
    ];
    for (const [i, k, ok] of presses) f = pushFeed(f, i, k, ok);
    const idx = f.map((x) => x.index);
    expect(new Set(idx).size).toBe(idx.length);
    // 每个位置都是最后一次按的那个
    expect(f.find((x) => x.index === 1)!.key).toBe("b");
    expect(f.find((x) => x.index === 2)!.key).toBe("o");
    expect(f.find((x) => x.index === 2)!.ok).toBe(true);
  });

  it("不改原数组（纯函数）", () => {
    const a = pushFeed([], 0, "a", true);
    const b = pushFeed(a, 1, "b", true);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });
});
