import { describe, expect, it } from "vitest";
import { initial, split, close, moveFocus, shape, run, countWindows, type Layout } from "../lib/split";

/**
 * 同化后的 build 判据验证。
 *
 * ## 判据：最终形状，不看你按了什么
 *
 * `shape(layout) === target` —— 所以同一道题**有多条解法**，
 * 枚举不完 → 用引擎的 `isSolved` 判终态。
 *
 * ## 这个文件守什么
 *
 * 1. 每道题**可解**（示范解法真能搭出目标形状）
 * 2. 形状比较**含比例**（先竖后横 vs 先横后竖形状不同）
 * 3. 走不动的操作返回 null（引擎转成 NO_EFFECT）
 */

const TASKS = [
  { id: "两栏", target: shape(run([{ dir: "v" }]).layout), solution: [{ dir: "v" as const }] },
  { id: "上下", target: shape(run([{ dir: "h" }]).layout), solution: [{ dir: "h" as const }] },
  { id: "三列", target: shape(run([{ dir: "v" }, { dir: "v" }]).layout), solution: [{ dir: "v" as const }, { dir: "v" as const }] },
  // ⚠️ 示范解法是 `| -`（页面语义），不是 `run()` 那条带 go 的
  { id: "四宫格", target: shape(run([{ dir: "v" }, { go: "l" }, { dir: "h" }]).layout), solution: [{ dir: "v" as const }, { dir: "h" as const }] },
];

/** 复刻 app/windows/build.tsx 的 apply */
function step(
  s: { layout: Layout; focus: number },
  seq: string[],
): { layout: Layout; focus: number } | "no-effect" {
  const joined = seq.join("");
  if (seq.length === 1) {
    const dir = ({ "<C-H>": "h", "<C-J>": "j", "<C-K>": "k", "<C-L>": "l" } as const)[seq[0] as never];
    if (dir) {
      const n = moveFocus(s.layout, s.focus, dir);
      return n === null ? "no-effect" : { layout: s.layout, focus: n };
    }
  }
  if (joined === "<Space>|") {
    const l = split(s.layout, s.focus, "v");
    return l ? { layout: l, focus: l.nextId - 1 } : "no-effect";
  }
  if (joined === "<Space>-") {
    const l = split(s.layout, s.focus, "h");
    return l ? { layout: l, focus: l.nextId - 1 } : "no-effect";
  }
  if (joined === "<Space>wd") {
    const l = close(s.layout, s.focus);
    return l ? { layout: l, focus: s.focus } : "no-effect";
  }
  /**
   * ⚠️ `<Space>w` 是**中间态**，返回原状态表示「收到了，继续等」。
   *
   * 返回 no-effect 的话引擎会当「这一键走不动」报错并**清空缓冲**，
   * 紧接着的 `d` 到达时序列已经没了 —— `<Space>wd` 永远按不出来。
   */
  if (joined === "<Space>w") return s;
  return "no-effect";
}

/**
 * 复刻示范解法 —— **用页面的 apply 语义**，不是 `lib/split.ts` 的 `run()`。
 *
 * ⚠️ 两者有一处关键差别，我第一版没注意：
 *
 * | | `run()`（图书馆） | 页面 `apply()` |
 * |---|---|---|
 * | 分屏后焦点 | 保持原焦点 | **跟到新窗口**（`nextId - 1`） |
 * | `go` 走不动时 | 忽略，继续 | 返回 no-effect |
 *
 * 页面跟到新窗口是**对的**（和原 `split.tsx` 实现一致）：
 * 刚切出来的窗口就是你想继续操作的那个，不跟过去反而别扭。
 *
 * 所以我第一版照 `run()` 的语义写测试助手，导致
 * 「竖切之后往右跳」永远失败 —— 因为焦点已经在新窗口上了。
 */
function solve(solution: { dir?: "v" | "h"; go?: "h" | "j" | "k" | "l" }[]) {
  let s: { layout: Layout; focus: number } = { layout: initial(), focus: 1 };
  for (const op of solution) {
    const seq = op.dir ? ["<Space>", op.dir === "v" ? "|" : "-"] : [`<C-${op.go!.toUpperCase()}>`];
    const r = step(s, seq);
    if (r === "no-effect") {
      throw new Error(`${seq.join("")} 失败（focus=${s.focus}）`);
    }
    s = r;
  }
  return s;
}

describe("build 题库", () => {
  it("每道题的示范解法真能搭出目标形状（不是死题）", () => {
    for (const t of TASKS) {
      const s = solve(t.solution);
      expect(shape(s.layout), `${t.id} 的示范解法搭不出目标`).toBe(t.target);
    }
  });

  it("每题都从「一个窗口」开始", () => {
    expect(countWindows(initial().root)).toBe(1);
  });

  it("目标形状的窗口数合理", () => {
    for (const t of TASKS) {
      const n = solve(t.solution);
      expect(countWindows(n.layout.root)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("形状比较含比例 —— 顺序真的影响结果", () => {
  /**
   * ⚠️ 这是 build 这一族最核心的实测结论：
   *    「先竖后横」和「先横后竖」得到的**不是**同一个形状。
   */
  it("先竖后横 ≠ 先横后竖", () => {
    const vh = run([{ dir: "v" }, { go: "l" }, { dir: "h" }]);
    const hv = run([{ dir: "h" }, { go: "j" }, { dir: "v" }]);
    expect(shape(vh.layout)).not.toBe(shape(hv.layout));
  });

  it("同样的操作序列得到同样的形状（确定性）", () => {
    const a = run([{ dir: "v" }, { dir: "v" }]);
    const b = run([{ dir: "v" }, { dir: "v" }]);
    expect(shape(a.layout)).toBe(shape(b.layout));
  });
});

describe("走不动的操作返回 no-effect（不静默）", () => {
  it("单个窗口时跳焦点走不动", () => {
    const s = { layout: initial(), focus: 1 };
    expect(step(s, ["<C-L>"]), "只有一个窗口，往右跳不动").toBe("no-effect");
  });

  it("裸 | 不是分屏键（训练器不能比真实环境宽松）", () => {
    const s = { layout: initial(), focus: 1 };
    expect(step(s, ["|"]), "裸 | 不该分屏").toBe("no-effect");
    expect(step(s, ["-"]), "裸 - 不该分屏").toBe("no-effect");
  });

  it("不认识的组合返回 no-effect", () => {
    const s = { layout: initial(), focus: 1 };
    // ⚠️ `<Space>w` **不在**这个列表里 —— 它是中间态，有效果（见上面那条）
    for (const seq of [["x"], ["<Space>", "x"], ["<Space>", "z"]]) {
      expect(step(s, seq), `${seq.join("")} 不该有效果`).toBe("no-effect");
    }
  });

  /**
   * ⚠️ 回归测试：`<Space>w` 是中间态，不能被当成「走不动」。
   *
   * 我第一版让 `apply(["<Space>","w"])` 返回 NO_EFFECT，结果引擎
   * 报错并清空缓冲 → 紧接着的 `d` 到不了 → `<Space>wd` 按不出来。
   * 而我自己的测试也没覆盖三键序列，所以没抓到。
   */
  it("<Space>w 是中间态（不能返回 no-effect）", () => {
    const s = { layout: initial(), focus: 1 };
    const mid = step(s, ["<Space>", "w"]);
    expect(mid, "<Space>w 该被收下等下一键").not.toBe("no-effect");
  });

  it("<Space>wd 能关掉窗口", () => {
    const two = step({ layout: initial(), focus: 1 }, ["<Space>", "|"]);
    expect(two).not.toBe("no-effect");
    const t = two as { layout: Layout; focus: number };
    const closed = step(t, ["<Space>", "w", "d"]);
    expect(closed).not.toBe("no-effect");
    expect(countWindows((closed as { layout: Layout }).layout.root)).toBe(1);
  });
});
