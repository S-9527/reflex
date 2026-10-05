import { describe, expect, it } from "vitest";
import { ARENAS, gridCoords, gridSize } from "../lib/arena";

/**
 * 布局推导 —— 从**邻接表**推出网格坐标。
 *
 * ## ⚠️ 这个文件是因为一个真实 bug 才有的
 *
 * 我第一版渲染时写的是 `cols = 窗口数量`，于是四宫格（4 个窗口）
 * 被画成 **4 列**，而它是 2×2。而且我还加了 `Math.min(cols, 3)` 兜底，
 * 把它压成 3 列 —— 截图里就是「3 列 + 1 个孤行」，布局整个乱掉。
 *
 * 根因：`Arena` 只存邻接表（`leftOf` / `aboveOf` …），**没有行列信息**。
 * 猜是猜不出来的，必须从邻接关系推。
 */

describe("gridSize —— 每套布局的行列数", () => {
  const expectSize = (name: string, rows: number, cols: number) => {
    const a = ARENAS.find((x) => x.name === name);
    expect(a, `找不到布局「${name}」`).toBeDefined();
    expect(gridSize(a!), `「${name}」的行列数不对`).toEqual({ rows, cols });
  };

  it("左右两栏 → 1 行 2 列", () => expectSize("左右两栏", 1, 2));
  it("上下两栏 → 2 行 1 列", () => expectSize("上下两栏", 2, 1));
  /** ⚠️ 就是这条出过 bug：4 个窗口被画成 4 列 */
  it("四宫格 → 2 行 2 列（不是 1 行 4 列）", () => expectSize("四宫格", 2, 2));
  it("不等宽 → 1 行 2 列", () => expectSize("不等宽", 1, 2));
  it("嵌套 → 2 行 2 列", () => expectSize("嵌套(竖切再横切)", 2, 2));
});

describe("gridCoords —— 坐标和邻接关系一致", () => {
  it("每套布局：往右的邻居列号一定更大", () => {
    for (const a of ARENAS) {
      const cs = gridCoords(a);
      a.rightOf.forEach((r, i) => {
        if (r === -1) return;
        expect(cs[r].col, `${a.name}: ${i} 的右邻 ${r} 列号该更大`).toBeGreaterThan(cs[i].col);
        expect(cs[r].row, `${a.name}: ${i} 和右邻 ${r} 该同一行`).toBe(cs[i].row);
      });
    }
  });

  it("每套布局：往下的邻居行号一定更大", () => {
    for (const a of ARENAS) {
      const cs = gridCoords(a);
      a.belowOf.forEach((b, i) => {
        if (b === -1) return;
        expect(cs[b].row, `${a.name}: ${i} 的下邻 ${b} 行号该更大`).toBeGreaterThan(cs[i].row);
        expect(cs[b].col, `${a.name}: ${i} 和下邻 ${b} 该同一列`).toBe(cs[i].col);
      });
    }
  });

  it("坐标从 0 开始（不留负号或空行）", () => {
    for (const a of ARENAS) {
      const cs = gridCoords(a);
      expect(Math.min(...cs.map((c) => c.row)), `${a.name} 行号该从 0 起`).toBe(0);
      expect(Math.min(...cs.map((c) => c.col)), `${a.name} 列号该从 0 起`).toBe(0);
    }
  });

  it("坐标不重复（两个窗口不能落在同一格）", () => {
    for (const a of ARENAS) {
      const cs = gridCoords(a);
      // ⚠️ 跨行/跨列的窗口允许「起点」不同但覆盖范围重叠，
      //    这里只查**起点**不重复 —— 起点撞了才是真的画错。
      const keys = cs.map((c) => `${c.row},${c.col}`);
      expect(new Set(keys).size, `${a.name} 有窗口起点重叠`).toBe(keys.length);
    }
  });

  it("四宫格的坐标是标准的 2×2", () => {
    const a = ARENAS.find((x) => x.name === "四宫格")!;
    const cs = gridCoords(a);
    // 左上(0,0) 右上(0,1) 左下(1,0) 右下(1,1)
    expect(cs[0]).toEqual({ row: 0, col: 0 });
    expect(cs[1]).toEqual({ row: 0, col: 1 });
    expect(cs[2]).toEqual({ row: 1, col: 0 });
    expect(cs[3]).toEqual({ row: 1, col: 1 });
  });

  it("嵌套布局：右侧窗口在第 1 列，左半两个在第 0 列", () => {
    const a = ARENAS.find((x) => x.name === "嵌套(竖切再横切)")!;
    const cs = gridCoords(a);
    expect(cs[0].col, "左上在第 0 列").toBe(0);
    expect(cs[1].col, "左下在第 0 列").toBe(0);
    expect(cs[2].col, "右侧在第 1 列").toBe(1);
    expect(cs[0].row).not.toBe(cs[1].row); // 左上在左下上面
  });
});

describe("推导对全部布局都成立（回归护栏）", () => {
  it("每套布局的窗口数 = 坐标数", () => {
    for (const a of ARENAS) {
      expect(gridCoords(a).length).toBe(a.wins.length);
    }
  });

  it("行列数 ≥ 1（空布局不崩）", () => {
    for (const a of ARENAS) {
      const s = gridSize(a);
      expect(s.rows).toBeGreaterThanOrEqual(1);
      expect(s.cols).toBeGreaterThanOrEqual(1);
    }
  });

  it("推导是纯函数（同样输入同样输出）", () => {
    for (const a of ARENAS) {
      expect(gridCoords(a)).toEqual(gridCoords(a));
    }
  });
});

/**
 * 跨行/跨列的窗口。
 *
 * ## ⚠️ 这里的判据用**邻接表**，不是纯几何
 *
 * 「嵌套(竖切再横切)」那套布局是**有意简化**的模型：
 * 右侧窗口在物理上贯穿两行，但它的 `belowOf` 是 `NONE`
 * （它下面确实没有**可跳的**窗口 —— `<C-J>` 到右半就断了）。
 *
 * 所以「占几行」要结合邻接表判，不能只看坐标。
 * 我第一版两个方向共用一套逻辑，结果左下的窗口算出了 `col span = 2`。
 */
describe("跨行窗口的 span", () => {
  /** 复刻 app/windows/jump.tsx 的 countSpan */
  function countSpan(a: (typeof ARENAS)[number], i: number, axis: "row" | "col"): number {
    const cs = gridCoords(a);
    const { rows } = gridSize(a);
    const self = cs[i];
    if (axis === "row") {
      if (a.belowOf[i] !== -1) return 1;
      const othersBelow = cs.some((c, j) => j !== i && c.col === self.col && c.row > self.row);
      return othersBelow ? 1 : rows - self.row;
    }
    return 1;
  }

  it("嵌套布局：右侧窗口跨 2 行", () => {
    const a = ARENAS.find((x) => x.name === "嵌套(竖切再横切)")!;
    // wins = [左上, 左下, 右侧]，右侧是下标 2
    expect(countSpan(a, 2, "row"), "右侧该贯穿两行").toBe(2);
  });

  it("嵌套布局：左半两个各占 1 行", () => {
    const a = ARENAS.find((x) => x.name === "嵌套(竖切再横切)")!;
    expect(countSpan(a, 0, "row")).toBe(1); // 左上
    expect(countSpan(a, 1, "row")).toBe(1); // 左下
  });

  it("⚠️ 左下窗口不该跨列（我第一版在这错了）", () => {
    const a = ARENAS.find((x) => x.name === "嵌套(竖切再横切)")!;
    // 左下是下标 1。它那一行没有别的窗口，第一版就一路占到底 → span 2
    expect(countSpan(a, 1, "col"), "左下该只占 1 列").toBe(1);
  });

  it("四宫格：每个窗口都只占 1×1", () => {
    const a = ARENAS.find((x) => x.name === "四宫格")!;
    for (let i = 0; i < 4; i++) {
      expect(countSpan(a, i, "row"), `窗口 ${i} 行 span`).toBe(1);
      expect(countSpan(a, i, "col"), `窗口 ${i} 列 span`).toBe(1);
    }
  });

  it("两栏/两行布局：没有跨行跨列", () => {
    for (const name of ["左右两栏", "上下两栏", "不等宽"]) {
      const a = ARENAS.find((x) => x.name === name)!;
      for (let i = 0; i < a.wins.length; i++) {
        expect(countSpan(a, i, "row"), `${name} 窗口 ${i}`).toBe(1);
        expect(countSpan(a, i, "col"), `${name} 窗口 ${i}`).toBe(1);
      }
    }
  });
});
