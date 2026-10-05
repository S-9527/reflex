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

/**
 * ⚠️ 终态模式（`isSolved`）—— 给「多步探索」类板块用。
 *
 * ## 为什么需要
 *
 * 引擎原来的模型是「一题 = 一条固定键序列，命中 accept 即结算翻页」。
 * 但 `/windows` 的两族是**另一种形态**：
 *
 * | | 序列匹配 | 终态判定 |
 * |---|---|---|
 * | 一题几步 | 固定 1~3 键 | **不固定** |
 * | 正确答案 | 预先枚举几条 | **取决于当前状态**，路径不唯一 |
 * | 判据 | 键序列相等 | **状态是否达标** |
 *
 * 硬塞进 `accept` 不行：jump 一题有几十条等价路径，枚举不完；
 * 而且枚举了也会「第一步就 hit 结算」，走不了多步。
 *
 * ## 这个测试守什么
 *
 * 复刻 `useDrill` 的**终态分支逻辑**，断言：
 *   1. 中间步骤**不结算**（这是和序列模式的根本差别）
 *   2. 达标才结算
 *   3. 走不动的步骤要明确提示，不静默
 */
describe("终态模式（isSolved）", () => {
  /** 模拟一个「走格子」的状态：从 0 走到 target */
  type Pos = { at: number };
  const TARGET = 3;

  function engine() {
    let state: Pos = { at: 0 };
    let committed = 0;
    let flash: { ok: boolean; text: string } | null = null;
    /**
     * 复刻引擎的终态分支：
     *   apply 推进 → isSolved 判定 → 达标才 commit
     */
    function press(k: "R" | "L"): "stepped" | "solved" | "blocked" {
      // apply：R 往右、L 往左；越界返回 NO_EFFECT
      let out: Pos | null = null;
      if (k === "R" && state.at < TARGET) out = { at: state.at + 1 };
      if (k === "L" && state.at > 0) out = { at: state.at - 1 };
      if (out === null) {
        flash = { ok: false, text: `${k} 这一步走不动` };
        return "blocked";
      }
      state = out;
      if (state.at === TARGET) {
        committed++;
        flash = { ok: true, text: "✓ 到了" };
        return "solved";
      }
      flash = { ok: true, text: `${k} ……继续` };
      return "stepped";
    }
    return {
      press,
      get at() { return state.at; },
      get committed() { return committed; },
      get flash() { return flash; },
    };
  }

  it("中间步骤**不结算**（和序列模式的根本差别）", () => {
    const e = engine();
    expect(e.press("R")).toBe("stepped");
    expect(e.committed, "走了一步就结算了？那是序列模式的行为").toBe(0);
    expect(e.press("R")).toBe("stepped");
    expect(e.committed).toBe(0);
  });

  it("达标才结算", () => {
    const e = engine();
    e.press("R");
    e.press("R");
    expect(e.press("R")).toBe("solved");
    expect(e.committed).toBe(1);
    expect(e.at).toBe(TARGET);
  });

  it("走不动的步骤明确提示，不静默", () => {
    const e = engine();
    expect(e.press("L"), "起点往左走不动").toBe("blocked");
    expect(e.flash!.ok).toBe(false);
    expect(e.flash!.text).toContain("走不动");
    expect(e.committed).toBe(0);
  });

  /** ⚠️ 多步探索：可以绕路，只要终态对 */
  it("允许多走几步再回来（路径不唯一）", () => {
    const e = engine();
    e.press("R"); // 1
    e.press("R"); // 2
    e.press("L"); // 回 1
    e.press("R"); // 2
    e.press("R"); // 3 → 达标
    expect(e.press("R"), "3 已到顶，再往右走不动").toBe("blocked");
    expect(e.committed, "达标只结算一次").toBe(1);
  });

  it("步数不固定（这是 accept 枚举不出来的原因）", () => {
    const a = engine();
    a.press("R"); a.press("R"); a.press("R");
    const b = engine();
    b.press("R"); b.press("R"); b.press("L"); b.press("R"); b.press("R"); b.press("R");
    expect(a.committed).toBe(1);
    expect(b.committed, "绕路也能达标").toBe(1);
  });
});
