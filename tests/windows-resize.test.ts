import { describe, expect, it } from "vitest";
import {
  initial,
  split,
  resize,
  resizeByCells,
  canResize,
  countWindows,
  positions,
  type Layout,
} from "../lib/split";
import { COMMANDS } from "../lib/bindings";

/**
 * 窗口缩放 —— 按**实测行为**建模。
 *
 * ## ⚠️ 又一次推翻了书面结论
 *
 * `lib/keys.ts` 早先写过（后来清理时删了）：
 * 「书 9.3.5 说裸按 `<C-Up>` 只挪一行，真实场景要 `20<C-Up>`」。
 *
 * 实测（`scripts/probe-resize.lua`）**两条都不对**：
 *
 * ```
 * <C-Right> 的 rhs = <Cmd>vertical resize +2<CR>   ← 每次挪 2 列
 * 按 10<C-Right> → 也只挪 2 列                      ← 计数被忽略
 * ```
 *
 * 因为步长**硬编码在 rhs 里**，不像 Vim 内建的 `<C-w>>` 那样吃计数。
 *
 * ⚠️ 这是这个项目第六次「凭印象写 → 实测推翻」。
 */

/** 这一侧有多少列 */
function colsOf(l: Layout, id: number, total = 80): number {
  const p = positions(l.root).get(id)!;
  return Math.round((p.c1 - p.c0) * total);
}

const TOTAL = 80;

/**
 * ⚠️ `resizeByCells` 的 `dir` 语义是「**a 侧**变大/变小」，
 * 不是「焦点窗口变大」—— 和 `lib/split.ts` 的 `resize` 一致。
 *
 * 所以焦点在 b 侧（右边窗口）时，`dir=+1` 让 a 侧（左）变宽、
 * 焦点自己**变窄**。我第一版测试把这个方向写反了。
 */
describe("按列缩放（和实测的 2 列一致）", () => {
  it("竖切后 dir=+1：b 侧（右）变宽 2 列", () => {
    const l = split(initial(), 1, "v")!;
    const before = colsOf(l, 2, TOTAL);
    const n = resizeByCells(l, 2, "v", 1, TOTAL);
    expect(n, "该能缩").not.toBeNull();
    expect(colsOf(n!, 2, TOTAL), "右边多 2 列").toBe(before + 2);
  });

  it("dir=-1 是反方向", () => {
    const l = split(initial(), 1, "v")!;
    const before = colsOf(l, 2, TOTAL);
    const n = resizeByCells(l, 2, "v", -1, TOTAL);
    expect(colsOf(n!, 2, TOTAL)).toBe(before - 2);
  });

  /** ⚠️ 核心断言：步长是固定的 2 列，和屏宽无关 */
  it("连续缩 3 次 = 精确挪 6 列（固定步长）", () => {
    let l: Layout | null = split(initial(), 1, "v")!;
    const before = colsOf(l, 2, TOTAL);
    for (let i = 0; i < 3; i++) {
      l = resizeByCells(l!, 2, "v", 1, TOTAL);
      expect(l, `第 ${i + 1} 次缩失败`).not.toBeNull();
    }
    expect(colsOf(l!, 2, TOTAL), "3 次 × 2 列 = 6 列").toBe(before + 6);
  });

  /**
   * ⚠️ 固定步长的意义：**不同屏宽下挪的列数一样**。
   *
   * 这正是「不能用 ratio 0.1 步进」的理由 —— 那个在 120 列屏上
   * 一步会挪 12 列，和本机的固定 +2 完全不是一回事。
   */
  it("不同屏宽下挪的列数一样", () => {
    for (const total of [60, 80, 120, 200]) {
      const l = split(initial(), 1, "v")!;
      const before = colsOf(l, 2, total);
      const n = resizeByCells(l, 2, "v", 1, total);
      expect(colsOf(n!, 2, total), `${total} 列屏上该也挪 2`).toBe(before + 2);
    }
  });
});

describe("canResize —— 什么时候缩得动", () => {
  it("单窗口时缩不动（没有分割点）", () => {
    expect(canResize(initial(), 1, "v")).toBe(false);
    expect(canResize(initial(), 1, "h")).toBe(false);
  });

  it("竖切后能横向缩，纵向缩不动（方向不匹配）", () => {
    const l = split(initial(), 1, "v")!;
    expect(canResize(l, 2, "v"), "竖切 → 能横缩").toBe(true);
    expect(canResize(l, 2, "h"), "竖切 → 竖着缩不动").toBe(false);
  });

  it("横切后能纵向缩，横向缩不动", () => {
    const l = split(initial(), 1, "h")!;
    expect(canResize(l, 2, "h")).toBe(true);
    expect(canResize(l, 2, "v")).toBe(false);
  });

  it("缩到极限后缩不动（ratio 被 clamp）", () => {
    let l: Layout | null = split(initial(), 1, "v")!;
    let steps = 0;
    // 一直缩到走不动
    for (let i = 0; i < 200; i++) {
      const n = resizeByCells(l!, 2, "v", 1, TOTAL);
      if (!n) break;
      l = n;
      steps++;
    }
    // 缩到极限后再缩一定失败
    expect(resizeByCells(l!, 2, "v", 1, TOTAL), "顶到头了该返回 null").toBeNull();
    expect(steps, "应该缩了很多次才到极限").toBeGreaterThan(10);
  });

  it("窗口还在（缩放不删窗口）", () => {
    let l: Layout | null = split(initial(), 1, "v")!;
    for (let i = 0; i < 5; i++) l = resizeByCells(l!, 2, "v", 1, TOTAL);
    expect(countWindows(l!.root)).toBe(2);
  });
});

describe("原生 Ex 等价是 ±2 不是 ±1", () => {
  /**
   * ⚠️ 回归测试：我原来在 `scripts/build-dataset.mjs` 里写的是 `±1`（凭印象）。
   *
   * 实测发现 `<C-Right>` 的 rhs 就是 `<Cmd>vertical resize +2<CR>` ——
   * 数据集里的字节码不会骗人。
   */
  it("数据集里的四个缩放键都写 ±2", () => {
    for (const [desc, want] of [
      ["Increase Window Width", "+2"],
      ["Decrease Window Width", "-2"],
      ["Increase Window Height", "+2"],
      ["Decrease Window Height", "-2"],
    ] as const) {
      const c = COMMANDS.find((x) => x.desc === desc);
      expect(c, `找不到 ${desc}`).toBeDefined();
      expect(c!.native, `${desc} 的原生等价该含 ${want}`).toContain(want);
    }
  });

  it("窗口缩放那四条都在数据集里（没被别处去重掉）", () => {
    for (const d of [
      "Increase Window Width",
      "Decrease Window Width",
      "Increase Window Height",
      "Decrease Window Height",
    ]) {
      expect(COMMANDS.some((c) => c.desc === d), `${d} 不在 COMMANDS 里`).toBe(true);
    }
  });
});
