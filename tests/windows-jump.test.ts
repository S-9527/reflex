import { describe, expect, it } from "vitest";
import { ARENAS, hasNeighbor, move, shortestSteps } from "../lib/arena";
import { windowNavDir } from "../lib/keys";

/**
 * 同化后的 jump 判据验证。
 *
 * ## 这一族和别处根本不同
 *
 * 别处：题目给描述 → 按出键序列 → **比对序列**。
 * 这里：题目给目标窗口 → 走 → **看焦点落在哪**。
 *
 * 因为从 A 到 B 的路径不唯一（先右后下、先下后右都对），
 * 枚举不完。所以用引擎的 `isSolved` 判终态。
 *
 * ## 这个文件守什么
 *
 * 1. 每道题**可解**（不是死题）
 * 2. **路径不唯一** —— 这正是不能用 accept 的原因
 * 3. 裸 hjkl 不被接管（本机没有那些映射）
 * 4. 走不动的方向返回 NO_EFFECT（引擎会明确提示）
 */

/** 复刻 app/windows/jump.tsx 的 apply */
function step(
  ai: number,
  focus: number,
  key: string,
): { focus: number } | "no-effect" {
  const dir = ({ "<C-H>": "h", "<C-J>": "j", "<C-K>": "k", "<C-L>": "l" } as const)[key as never];
  if (!dir) return "no-effect";
  const a = ARENAS[ai];
  if (!hasNeighbor(a, focus, dir as "h" | "j" | "k" | "l")) return "no-effect";
  const next = move(a, focus, dir as "h" | "j" | "k" | "l");
  return next === null ? "no-effect" : { focus: next };
}

/** 复刻题库：每题的目标是 index 1（确定性，见 jump.tsx 的注释） */
const TASKS = ARENAS.map((a, ai) => {
  const to = a.wins.length > 1 ? 1 : 0;
  return { ai, to, opt: shortestSteps(a, a.start, to) };
});

describe("jump 题库", () => {
  it("每道题都可解（最优步数 > 0，不是死题）", () => {
    for (const t of TASKS) {
      expect(t.opt, `${ARENAS[t.ai].name} 起点即目标，是死题`).toBeGreaterThan(0);
    }
  });

  it("初始焦点不等于目标", () => {
    for (const t of TASKS) {
      expect(ARENAS[t.ai].start).not.toBe(t.to);
    }
  });

  /**
   * ⚠️ 路径不唯一 —— 这是不能用 `accept` 枚举的根本原因。
   *
   * 四宫格里从左上去右上（index 0 → 1）：
   *   直接往右一次就到
   * 从左上去右下（0 → 3）：
   *   右→下 或 下→右，两条都对
   */
  it("四宫格里到对角窗口有不止一条最短路径", () => {
    const a = ARENAS[2]; // 四宫格
    // 0 → 3 的两条路径
    const right = step(2, 0, "<C-L>");
    const down = step(2, 0, "<C-J>");
    expect(right).not.toBe("no-effect");
    expect(down).not.toBe("no-effect");
    // 两条都能到 3
    const rd = step(2, (right as { focus: number }).focus, "<C-J>");
    const dr = step(2, (down as { focus: number }).focus, "<C-L>");
    expect((rd as { focus: number }).focus, "右→下").toBe(3);
    expect((dr as { focus: number }).focus, "下→右").toBe(3);
  });
});

describe("走不动的方向要返回 NO_EFFECT（不静默）", () => {
  it("边角往外的方向没有窗口", () => {
    // 四宫格左上角：往上、往左都没有
    expect(step(2, 0, "<C-K>"), "左上角往上").toBe("no-effect");
    expect(step(2, 0, "<C-H>"), "左上角往左").toBe("no-effect");
    // 往右、往下有
    expect(step(2, 0, "<C-L>")).not.toBe("no-effect");
    expect(step(2, 0, "<C-J>")).not.toBe("no-effect");
  });

  it("不在四个方向键里的返回 no-effect", () => {
    for (const k of ["h", "j", "<Space>w", "x"]) {
      expect(step(2, 0, k), `${k} 不该被接管`).toBe("no-effect");
    }
  });
});

describe("接管范围 —— 裸 hjkl 不收", () => {
  /**
   * ⚠️ 本机 Normal 模式**没有裸 hjkl 的窗口映射**
   *    （`j`/`k` 只是 Vim 内建的光标移动）。
   *    收了会练出用不上的肌肉记忆 —— 那是训练器最危险的毛病。
   */
  it("裸 hjkl 不被 windowNavDir 认（只有 Ctrl 才算）", () => {
    const ev = (key: string, ctrl = false) => ({
      key,
      ctrlKey: ctrl,
      altKey: false,
      metaKey: false,
    });
    for (const k of ["h", "j", "k", "l"]) {
      expect(windowNavDir(ev(k)), `裸 ${k} 不该算窗口导航`).toBeNull();
    }
    // Ctrl 系才算
    expect(windowNavDir(ev("h", true))).toBe("h");
    expect(windowNavDir(ev("j", true))).toBe("j");
    expect(windowNavDir(ev("k", true))).toBe("k");
    expect(windowNavDir(ev("l", true))).toBe("l");
  });

  it("方向键也不收（本机没映射）", () => {
    expect(windowNavDir({ key: "ArrowLeft", ctrlKey: false, altKey: false, metaKey: false })).toBeNull();
    expect(windowNavDir({ key: "ArrowDown", ctrlKey: false, altKey: false, metaKey: false })).toBeNull();
  });
});
