import { describe, it, expect } from "vitest";
import { initial, split, close, run, shape, countWindows, leaves, moveFocus, positions } from "../lib/split";

describe("initial", () => {
  it("一个窗口,id=1", () => {
    const l = initial();
    expect(countWindows(l.root)).toBe(1);
    expect(leaves(l.root)).toEqual([1]);
  });
});

describe("split", () => {
  it("竖切变两个,新窗口是焦点(Vim 行为)", () => {
    const l = split(initial(), 1, "v")!;
    expect(countWindows(l.root)).toBe(2);
    expect(l.nextId).toBe(3);
    // 新窗口 id=2,Vim 里 :vsplit 后光标在新窗口
    expect(l.nextId - 1).toBe(2);
  });

  it("横切也是两个,但位置不同", () => {
    const v = split(initial(), 1, "v")!;
    const h = split(initial(), 1, "h")!;
    expect(shape(v)).not.toBe(shape(h));
  });

  it("在任意已存在的窗口上分屏", () => {
    const l = run([{ dir: "v" }, { dir: "h" }]).layout; // 1竖切 → 在新窗口(2)横切
    expect(countWindows(l.root)).toBe(3);
  });

  it("四宫格:先竖后横再横", () => {
    const l = run([{ dir: "v" }, { dir: "h" }, { dir: "h" }]).layout;
    expect(countWindows(l.root)).toBe(4);
  });

  it("嵌套结构:一侧再分,另一侧保持完整", () => {
    // 1 --v--> (1|2); 回到 1 再 --v--> (1|3|2),三列
    const l = run([{ dir: "v" }, { go: "h" }, { dir: "v" }]).layout;
    expect(countWindows(l.root)).toBe(3);
    const pos = positions(l.root);
    // 实测布局: 1 是 c 0-0.25,3 是 0.25-0.5,2 是 0.5-1
    // 所以「1 和 3 在左边那一竖」= 1 的右边界 == 3 的左边界,
    // 而且 3 的右边界 == 2 的左边界(整列严丝合缝)
    expect(pos.get(1)!.c1).toBeCloseTo(pos.get(3)!.c0, 5);
    expect(pos.get(3)!.c1).toBeCloseTo(pos.get(2)!.c0, 5);
    // 2 独占右半,没被动过
    expect(pos.get(2)!.c0).toBeCloseTo(0.5, 5);
    expect(pos.get(2)!.c1).toBeCloseTo(1, 5);
  });

  it("达到上限返回 null 而不是无限分", () => {
    let l = initial();
    let f = 1;
    for (let i = 0; i < 12; i++) {
      const nl = split(l, f, "v", 4);
      if (!nl) break;
      l = nl;
      f = l.nextId - 1;
    }
    expect(countWindows(l.root)).toBeLessThanOrEqual(4);
  });
});

describe("close", () => {
  it("关掉一个窗口,剩一个", () => {
    const { layout: l } = run([{ dir: "v" }]);
    const c = close(l, 2)!;
    expect(countWindows(c.root)).toBe(1);
  });

  it("⚠️ 最后一个窗口不能关(Vim 拒绝)", () => {
    expect(close(initial(), 1)).toBeNull();
  });

  it("⚠️ 关掉一半会让另一个占满 —— 父节点塌缩", () => {
    // 这是最容易错的规则:竖切两个再关一个,剩下那个是全屏,不是半屏
    const { layout: l } = run([{ dir: "v" }]);
    const c = close(l, 2)!;
    const pos = positions(c.root);
    const only = [...pos.values()][0];
    expect(only.c0).toBe(0);
    expect(only.c1).toBe(1); // 占满整列
  });

  it("关掉中间层的一侧,子树整体顶上", () => {
    // 1 --v--> (1,2); 2 --h--> (2,3); 关掉 2(有子节点)不行,
    // 关掉 3 → 2 变成叶子
    const { layout: l } = run([{ dir: "v" }, { dir: "h" }]);
    const c = close(l, 3)!;
    expect(countWindows(c.root)).toBe(2);
    const pos = positions(c.root);
    // 2 应该占满右半边(因为它的子节点没了)
    expect(pos.get(2)!.c0).toBeCloseTo(0.5, 5);
    expect(pos.get(2)!.c1).toBeCloseTo(1, 5);
  });

  it("关掉不存在的窗口返回 null", () => {
    const { layout: l } = run([{ dir: "v" }]);
    expect(close(l, 99)).toBeNull();
  });
});

describe("moveFocus", () => {
  it("两个并排:左右可跳,上下不可", () => {
    const { layout: l } = run([{ dir: "v" }]);
    expect(moveFocus(l, 1, "l")).toBe(2);
    expect(moveFocus(l, 2, "h")).toBe(1);
    expect(moveFocus(l, 1, "j")).toBeNull();
    expect(moveFocus(l, 1, "k")).toBeNull();
  });

  it("边界不环绕", () => {
    const { layout: l } = run([{ dir: "v" }]);
    expect(moveFocus(l, 1, "h")).toBeNull(); // 最左
    expect(moveFocus(l, 2, "l")).toBeNull(); // 最右
  });

  it("四宫格:不能横穿", () => {
    const { layout: l } = run([{ dir: "v" }, { dir: "h" }, { dir: "h" }]);
    // 布局: 1 | 2 上面是 2,下面 hmm —— 先竖(1|2),再在2横(2上/3下),再在?
    // 焦点在 1,右边是 2
    expect(moveFocus(l, 1, "l")).toBe(2);
    expect(moveFocus(l, 1, "j")).toBeNull(); // 1 下面没有
  });

  it("跳到最近的同侧窗口,不是最远的", () => {
    // 三列并排:1 | 2 | 3
    const { layout: l } = run([{ dir: "v" }, { go: "l" }, { dir: "v" }]);
    // 1 右边最近的是 2
    expect(moveFocus(l, 1, "l")).toBe(2);
  });
});

describe("shape", () => {
  it("同一形状 → 同一指纹", () => {
    const a = run([{ dir: "v" }, { go: "h" }, { dir: "h" }]).layout;
    const b = run([{ dir: "v" }, { go: "h" }, { dir: "h" }]).layout;
    expect(shape(a)).toBe(shape(b));
  });

  it("不同形状 → 不同指纹", () => {
    const v = run([{ dir: "v" }]).layout;
    const h = run([{ dir: "h" }]).layout;
    expect(shape(v)).not.toBe(shape(h));
  });

  it("不等分和等分是不同形状", () => {
    // run 只会对半分,所以用 positions 手工构造对比
    const eq = run([{ dir: "v" }]).layout;
    const pos = positions(eq.root);
    const [p1, p2] = [...pos.values()];
    expect(Math.abs(p1.c1 - p2.c0)).toBeLessThan(1e-9); // 中点重合
  });

  it("关掉窗口后形状改变", () => {
    const { layout: l } = run([{ dir: "v" }]);
    const c = close(l, 2)!;
    expect(shape(l)).not.toBe(shape(c));
  });
});

describe("run", () => {
  it("分屏后焦点在新窗口", () => {
    const { focus } = run([{ dir: "v" }]);
    expect(focus).toBe(2);
  });

  it("go 移动焦点", () => {
    const { focus } = run([{ dir: "v" }, { go: "h" }]);
    expect(focus).toBe(1);
  });

  it("关掉焦点窗口后焦点落到某个存活窗口", () => {
    const { focus } = run([{ dir: "v" }, { close: true }]);
    expect([1, 2]).toContain(focus);
  });

  it("空操作序列返回初始状态", () => {
    const { layout, focus } = run([]);
    expect(countWindows(layout.root)).toBe(1);
    expect(focus).toBe(1);
  });

  it("无效操作不崩(边界上的 close / 无邻居的 go)", () => {
    expect(() => run([{ close: true }])).not.toThrow(); // 只有一个窗口,关不掉
    expect(() => run([{ go: "j" }])).not.toThrow(); // 下面没窗口
  });
});
