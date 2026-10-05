import { describe, expect, it } from "vitest";
import { RAW } from "../lib/bindings";
import { SEQ_GROUPS, SHAPE_NAME, shapeOf } from "../lib/seq-groups";

/**
 * 分组判据的测试。
 *
 * ⚠️ 用户报「盲背的第 x 关这种分类,看起来很不清晰」。
 * 原来的 15 关是抽取脚本按 group 硬编号排的,彼此没有逻辑:
 * 第 9 关(4 条)排在第 4 关(5 条)后面,第 15 关只有 2 条。
 * 现在改成按**键的形态**分四类,所以每条都必须能归进去。
 */

describe("shapeOf", () => {
  it("leader 前缀", () => {
    expect(shapeOf('<Space>s"')).toBe("leader");
    expect(shapeOf("<Space>gb")).toBe("leader");
    expect(shapeOf("<Space><Tab>d")).toBe("leader");
  });

  it("Ctrl 系列", () => {
    expect(shapeOf("<C-H>")).toBe("ctrl");
    expect(shapeOf("<C-w>d")).toBe("ctrl");
    expect(shapeOf("<C-/>")).toBe("ctrl");
  });

  it("方括号跳转", () => {
    expect(shapeOf("[d")).toBe("brackets");
    expect(shapeOf("]q")).toBe("brackets");
    expect(shapeOf("[a")).toBe("brackets");
  });

  it("裸键", () => {
    expect(shapeOf("L")).toBe("bare");
    expect(shapeOf("H")).toBe("bare");
    expect(shapeOf("j")).toBe("bare");
  });

  /**
   * ⚠️ 顺序有讲究的那几条。
   * `<Space><Tab>x` 既是 leader 又含特殊键,但按「先按什么」归 leader。
   */
  it("混合写法按前缀判定,不按后面那部分", () => {
    expect(shapeOf("<Space><Tab>d")).toBe("leader");
    expect(shapeOf("<C-w>d")).toBe("ctrl");
  });

  it("真实数据集里每条都能归进四类之一", () => {
    // ⚠️ 比的是 SHAPE_NAME 的**键**(形态 id),不是它的值(中文名)。
    //   我第一遍写成 values,于是「没有一项等于 'leader'」全红。
    const shapes = new Set(Object.keys(SHAPE_NAME));
    for (const r of RAW) {
      expect(shapes.has(shapeOf(r.display)), `${r.display} 没归进任何一类`).toBe(true);
    }
  });

  it("四条示例都判对了(防写反)", () => {
    expect(shapeOf('<Space>s"')).toBe("leader");
    expect(shapeOf("<C-H>")).toBe("ctrl");
    expect(shapeOf("[d")).toBe("brackets");
    expect(shapeOf("L")).toBe("bare");
  });
});

describe("分组定义", () => {
  it("四个组 id 唯一", () => {
    expect(new Set(SEQ_GROUPS.map((g) => g.id)).size).toBe(SEQ_GROUPS.length);
  });

  it("每组都有名字和说明 —— 不能只写「第 x 关」", () => {
    for (const g of SEQ_GROUPS) {
      expect(g.name, `${g.id} 没名字`).toBeTruthy();
      expect(g.what.length, `${g.id} 的说明太短`).toBeGreaterThan(10);
      // 这正是用户报的问题:光秃秃一个编号
      expect(g.name, `${g.id} 的名字不该是编号形式`).not.toMatch(/^第\s*\d+\s*关/);
    }
  });

  it("每组都有唯一形态,四种都用到", () => {
    const shapes = SEQ_GROUPS.map((g) => g.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(new Set(shapes).size).toBe(4);
  });

  it("SHAPE_NAME 覆盖所有形态", () => {
    for (const g of SEQ_GROUPS) expect(SHAPE_NAME[g.shape], `${g.shape} 没名字`).toBeTruthy();
  });
});

describe("分组能覆盖全数据集,而且没有空组", () => {
  /** 和页面一致的计数 */
  function countBy() {
    const m: Record<string, number> = {};
    for (const r of RAW) {
      const s = shapeOf(r.display);
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }

  const counts = countBy();

  it("每种形态都有条目 —— 不能有按钮点进去是空的", () => {
    for (const g of SEQ_GROUPS) {
      expect(counts[g.shape] ?? 0, `${g.name} 一条都没有`).toBeGreaterThan(0);
    }
  });

  it("四组合计等于全数据集(没有漏网的)", () => {
    const sum = SEQ_GROUPS.reduce((a, g) => a + (counts[g.shape] ?? 0), 0);
    expect(sum).toBe(RAW.length);
  });

  it("每组条数都够练(少于 3 条就没必要单开一个按钮)", () => {
    for (const g of SEQ_GROUPS) {
      expect(counts[g.shape], `${g.name} 只有 ${counts[g.shape]} 条,不值得单开`).toBeGreaterThanOrEqual(3);
    }
  });
});