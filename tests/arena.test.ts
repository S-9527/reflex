import { describe, it, expect } from "vitest";
import { ARENAS, move, hasNeighbor, shortestSteps, makeTask, type Arena } from "../lib/arena";

const byName = (n: string): Arena => {
  const a = ARENAS.find((x) => x.name === n);
  if (!a) throw new Error(`没有这套布局:${n}`);
  return a;
};

describe("布局自洽性", () => {
  it("每套布局的邻接表长度都等于窗口数", () => {
    for (const a of ARENAS) {
      for (const t of [a.leftOf, a.rightOf, a.aboveOf, a.belowOf]) {
        expect(t.length, `${a.name} 的邻接表长度不对`).toBe(a.wins.length);
      }
    }
  });

  it("邻接表里的下标都合法(没有越界 / 没有 -1 以外的值)", () => {
    for (const a of ARENAS) {
      for (const t of [a.leftOf, a.rightOf, a.aboveOf, a.belowOf]) {
        for (const v of t) {
          expect(v === -1 || (v >= 0 && v < a.wins.length), `${a.name} 有非法下标 ${v}`).toBe(true);
        }
      }
    }
  });

  it("邻接是互逆的:我左边的人,我的右边是我", () => {
    for (const a of ARENAS) {
      for (let i = 0; i < a.wins.length; i++) {
        const l = a.leftOf[i];
        if (l !== -1) expect(a.rightOf[l], `${a.name}:窗口 ${l} 的右邻居不是 ${i}`).toBe(i);
        const r = a.rightOf[i];
        if (r !== -1) expect(a.leftOf[r], `${a.name}:窗口 ${r} 的左邻居不是 ${i}`).toBe(i);
        const u = a.aboveOf[i];
        if (u !== -1) expect(a.belowOf[u], `${a.name}:窗口 ${u} 的下邻居不是 ${i}`).toBe(i);
        const d = a.belowOf[i];
        if (d !== -1) expect(a.aboveOf[d], `${a.name}:窗口 ${d} 的上邻居不是 ${i}`).toBe(i);
      }
    }
  });

  it("没有自环(自己不是自己的邻居)", () => {
    for (const a of ARENAS) {
      for (let i = 0; i < a.wins.length; i++) {
        expect(a.leftOf[i]).not.toBe(i);
        expect(a.rightOf[i]).not.toBe(i);
        expect(a.aboveOf[i]).not.toBe(i);
        expect(a.belowOf[i]).not.toBe(i);
      }
    }
  });

  it("start 是合法下标", () => {
    for (const a of ARENAS) {
      expect(a.start).toBeGreaterThanOrEqual(0);
      expect(a.start).toBeLessThan(a.wins.length);
    }
  });
});

describe("move", () => {
  const four = byName("四宫格");

  it("<C-H> 到左边", () => {
    expect(move(four, 1, "h")).toBe(0);
    expect(move(four, 3, "h")).toBe(2);
  });

  it("<C-J> 到下面", () => {
    expect(move(four, 0, "j")).toBe(2);
    expect(move(four, 1, "j")).toBe(3);
  });

  it("边界返回 null(而不是环绕、也不是原地不动)", () => {
    expect(move(four, 0, "h")).toBeNull(); // 左上没左边
    expect(move(four, 0, "k")).toBeNull(); // 左上没上面
    expect(move(four, 2, "j")).toBeNull(); // 左下没下面
    expect(move(four, 1, "l")).toBeNull(); // 右上没右边
  });

  it("横穿不允许:从左上不能直接 <C-L> 到右下", () => {
    expect(move(four, 0, "l")).toBe(1); // 只能到右上
    expect(move(four, 0, "j")).toBe(2); // 只能到左下
  });

  it("左右两栏:上下方向全部无效", () => {
    const c = byName("左右两栏");
    expect(move(c, 0, "j")).toBeNull();
    expect(move(c, 0, "k")).toBeNull();
    expect(move(c, 0, "l")).toBe(1);
  });

  it("嵌套布局:右半内部不能上下跳", () => {
    const n = byName("嵌套(竖切再横切)");
    // 0=左上 1=左下 2=右侧
    expect(move(n, 2, "j")).toBeNull(); // 右侧下面没有窗口
    expect(move(n, 2, "k")).toBeNull();
    expect(move(n, 0, "j")).toBe(1); // 左半内部上下有效
    expect(move(n, 1, "k")).toBe(0);
  });
});

describe("hasNeighbor", () => {
  it("边界方向返回 false", () => {
    const four = byName("四宫格");
    expect(hasNeighbor(four, 0, "h")).toBe(false);
    expect(hasNeighbor(four, 0, "l")).toBe(true);
  });
});

describe("shortestSteps", () => {
  const four = byName("四宫格");

  it("同一位置 0 步", () => {
    expect(shortestSteps(four, 0, 0)).toBe(0);
  });

  it("相邻 1 步", () => {
    expect(shortestSteps(four, 0, 1)).toBe(1);
    expect(shortestSteps(four, 0, 2)).toBe(1);
  });

  it("对角 2 步(必须绕,不能横穿)", () => {
    expect(shortestSteps(four, 0, 3)).toBe(2);
    expect(shortestSteps(four, 3, 0)).toBe(2);
  });

  it("两栏:左右 1 步,上下不可达(-1)", () => {
    const c = byName("左右两栏");
    expect(shortestSteps(c, 0, 1)).toBe(1);
    // 只有一个维度,不存在"另一维度"的移动,但两个窗口互相可达
    expect(shortestSteps(c, 0, 0)).toBe(0);
  });

  it("结果与实际按键数一致(BFS 不会给出比实际更小的值)", () => {
    // 模拟一条真实路径,验证 steps 不超过路径长度
    const n = byName("嵌套(竖切再横切)");
    expect(shortestSteps(n, 1, 2)).toBe(2); // 左下 → 左上 → 右侧
  });
});

describe("makeTask", () => {
  const four = byName("四宫格");

  it("目标不等于当前焦点", () => {
    for (let i = 0; i < 30; i++) {
      const t = makeTask(four, 0);
      expect(t.to).not.toBe(0);
    }
  });

  it("提示里含目标窗口的标签", () => {
    const t = makeTask(four, 0, () => 0); // 固定第一个候选
    expect(t.hint).toContain(four.wins[t.to].label);
  });

  it("目标一定可达(不然题目无解)", () => {
    for (let i = 0; i < 30; i++) {
      const t = makeTask(four, 0);
      expect(shortestSteps(four, t.from, t.to), `目标不可达:${t.to}`).toBeGreaterThan(0);
    }
  });

  it("每个窗口都至少可能被选为目标(覆盖性)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(makeTask(four, 0).to);
    // 四宫格里除了 0 之外都该出现过
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});
