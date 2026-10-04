import { describe, it, expect } from "vitest";
import {
  initial,
  split,
  close,
  closeOthers,
  run,
  shape,
  topology,
  countWindows,
  leaves,
  moveFocus,
  positions,
  resize,
  maxOut,
  equalize,
  moveToEdge,
  swapNext,
  RESIZE_STEP,
} from "../lib/split";

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
    expect(l.nextId - 1).toBe(2);
  });

  it("横切也是两个,但位置不同", () => {
    expect(shape(split(initial(), 1, "v")!)).not.toBe(shape(split(initial(), 1, "h")!));
  });

  it("四宫格:先竖后横再横", () => {
    expect(countWindows(run([{ dir: "v" }, { dir: "h" }, { dir: "h" }]).layout.root)).toBe(4);
  });

  it("⚠️ 分割永远从 0.5 起 —— 真实 Vim 的 :vsplit 也是对半", () => {
    // 这条决定了一道题能不能"一次切出不等宽":不能。
    // 想要不等宽必须先切再 resize。
    const l = run([{ dir: "v" }]).layout;
    const pos = positions(l.root);
    const vals = [...pos.values()];
    expect(vals[0].c1).toBeCloseTo(vals[1].c0, 10);
  });

  it("达到上限返回 null", () => {
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
  it("⚠️ 最后一个窗口不能关(Vim 拒绝)", () => {
    expect(close(initial(), 1)).toBeNull();
  });

  it("⚠️ 关掉一半会让另一个占满 —— 父节点塌缩", () => {
    const { layout: l } = run([{ dir: "v" }]);
    const c = close(l, 2)!;
    const only = [...positions(c.root).values()][0];
    expect(only.c0).toBe(0);
    expect(only.c1).toBe(1);
  });

  it("关掉不存在的窗口返回 null(不是静默成功)", () => {
    const { layout: l } = run([{ dir: "v" }]);
    expect(close(l, 99)).toBeNull();
  });
});

describe("closeOthers", () => {
  it("<C-w>o 只留当前窗口", () => {
    const { layout: l, focus } = run([{ dir: "v" }, { dir: "h" }]);
    expect(countWindows(l.root)).toBe(3);
    const c = closeOthers(l, focus)!;
    expect(countWindows(c.root)).toBe(1);
    expect(leaves(c.root)).toEqual([focus]);
  });
});

describe("resize", () => {
  it("改宽度:焦点在 b 侧(右边)时按 + 会让分割点左移", () => {
    const { layout: l, focus } = run([{ dir: "v" }]);
    // focus=2 是 b 侧,c 0.5-1
    const r = resize(l, focus, "v", RESIZE_STEP)!;
    const pos = positions(r.root);
    expect(pos.get(2)!.c0).toBeCloseTo(0.5 - RESIZE_STEP, 10);
    expect(pos.get(1)!.c1).toBeCloseTo(pos.get(2)!.c0, 10);
  });

  it("改高度:焦点在下半,缩小后**上边界**下移,下边界仍在底边", () => {
    const { layout: l, focus } = run([{ dir: "h" }]); // focus=2 在下半 r 0.5-1
    const before = positions(l.root).get(focus)!;
    expect(before.r0).toBeCloseTo(0.5, 10);
    expect(before.r1).toBeCloseTo(1, 10);

    const r = resize(l, focus, "h", -RESIZE_STEP)!;
    const after = positions(r.root).get(focus)!;
    // 贴底的那个窗口缩小,收的是它和邻居之间的那条界线
    expect(after.r0).toBeCloseTo(0.5 + RESIZE_STEP, 10);
    expect(after.r1).toBeCloseTo(1, 10); // 仍然贴底 —— 别断言成 0.9
    // 高度确实变小了
    expect(after.r1 - after.r0).toBeCloseTo(0.5 - RESIZE_STEP, 10);
  });

  it("⚠️ 轴对不上就不动(横切出来的窗口按 > 无效)", () => {
    const { layout: l, focus } = run([{ dir: "h" }]); // 上下切
    expect(resize(l, focus, "v", RESIZE_STEP)).toBeNull();
  });

  it("只有一个窗口没有可调的分割点", () => {
    expect(resize(initial(), 1, "v", RESIZE_STEP)).toBeNull();
  });

  it("⚠️ 顶到边界就停,不越界", () => {
    let l = run([{ dir: "v" }]).layout;
    let f = 2;
    for (let i = 0; i < 30; i++) {
      const nl = resize(l, f, "v", RESIZE_STEP);
      if (!nl) break;
      l = nl;
    }
    const pos = positions(l.root);
    expect(pos.get(1)!.c0).toBeCloseTo(0, 6);
    expect(pos.get(1)!.c1).toBeGreaterThan(0); // 还留了一条,没被压没
  });
});

describe("maxOut", () => {
  it("把焦点窗口拉到最大(留 10% 给邻居)", () => {
    const { layout: l, focus } = run([{ dir: "v" }]);
    const m = maxOut(l, focus, "v")!;
    const pos = positions(m.root);
    expect(pos.get(focus)!.c1).toBeCloseTo(1, 6);
    expect(pos.get(1)!.c0).toBeCloseTo(0, 6);
  });
});

describe("equalize", () => {
  it("<C-w>= 把那层恢复对半", () => {
    const { layout: l, focus } = run([{ dir: "v" }]);
    const w = resize(l, focus, "v", RESIZE_STEP)!;
    const e = equalize(w, focus)!;
    const pos = positions(e.root);
    expect(pos.get(1)!.c1).toBeCloseTo(pos.get(2)!.c0, 10);
    expect(pos.get(1)!.c1).toBeCloseTo(0.5, 10);
  });

  it("已经对半时返回 null", () => {
    const { layout: l, focus } = run([{ dir: "v" }]);
    expect(equalize(l, focus)).toBeNull();
  });
});

describe("moveToEdge", () => {
  it("移到最左:焦点窗口贴左边", () => {
    const l = run([{ dir: "v" }, { dir: "v" }]).layout; // 1|3|2, focus=3
    const m = moveToEdge(l, 3, "h")!;
    const pos = positions(m.root);
    expect(pos.get(3)!.c0).toBeCloseTo(0, 6);
  });

  it("移到最上:焦点窗口贴顶边", () => {
    const l = run([{ dir: "h" }, { dir: "h" }]).layout;
    const m = moveToEdge(l, 3, "k")!;
    const pos = positions(m.root);
    expect(pos.get(3)!.r0).toBeCloseTo(0, 6);
  });

  it("窗口数量不变(移动不是复制)", () => {
    const l = run([{ dir: "v" }, { dir: "h" }]).layout;
    const m = moveToEdge(l, 3, "l")!;
    expect(countWindows(m.root)).toBe(3);
    expect(leaves(m.root).sort()).toEqual([1, 2, 3]);
  });

  it("只有一个窗口不动", () => {
    expect(moveToEdge(initial(), 1, "h")).toBeNull();
  });
});

describe("swapNext", () => {
  it("和下一个交换位置:骨架不变,两个窗口换地方", () => {
    const l = run([{ dir: "v" }, { dir: "v" }]).layout; // 1|3|2
    const s = swapNext(l, 1)!;
    const pos = positions(s.root);
    // 1 原本 c 0-0.25,交换后跑到 3 原来的位置
    const wasNext = positions(l.root).get(2)!;
    expect(pos.get(1)!.c0).toBeCloseTo(wasNext.c0, 10);
  });

  it("拓扑不变 —— 这正是 x 的语义", () => {
    const l = run([{ dir: "v" }, { dir: "h" }]).layout;
    expect(topology(swapNext(l, 1)!)).toBe(topology(l));
  });

  it("窗口数量和 id 集合不变", () => {
    const l = run([{ dir: "v" }, { dir: "h" }]).layout;
    const s = swapNext(l, 2)!;
    expect(countWindows(s.root)).toBe(countWindows(l.root));
    expect(leaves(s.root).sort()).toEqual(leaves(l.root).sort());
  });

  it("只有一个窗口返回 null", () => {
    expect(swapNext(initial(), 1)).toBeNull();
  });
});

describe("topology vs shape", () => {
  it("拉宽过之后:shape 变了但 topology 没变", () => {
    const l = run([{ dir: "v" }]).layout;
    const w = resize(l, 2, "v", RESIZE_STEP)!;
    expect(shape(w)).not.toBe(shape(l));
    expect(topology(w)).toBe(topology(l));
  });

  it("⚠️ 四宫格的两种切法是**不同的树**,不是同一个形状", () => {
    // 我一开始以为这两种切法会得到同一个布局,实测打脸:
    //   先竖后横 → 根 = v(1, h(2,3))  → 1 占左整列,2/3 在右侧上下
    //   先横后竖 → 根 = h(1, v(2,3))  → 1 占上整行,2/3 在下侧左右
    // 网格上看都是「三块」,但哪一块占整列/整行不同 —— 手指的位置完全不同。
    // 所以这两道题是**不同的考点**,不能当成同一题。
    const a = run([{ dir: "v" }, { go: "l" }, { dir: "h" }]).layout;
    const b = run([{ dir: "h" }, { go: "j" }, { dir: "v" }]).layout;
    expect(topology(a)).toBe("(Lv(LhL))");
    expect(topology(b)).toBe("(Lh(LvL))");
    expect(topology(a)).not.toBe(topology(b));
    // 位置也确认:1 在 A 里占满整列,在 B 里只占上半
    expect(positions(a.root).get(1)!.r1).toBeCloseTo(1, 10);
    expect(positions(b.root).get(1)!.r1).toBeCloseTo(0.5, 10);
  });
});

describe("moveFocus", () => {
  it("两个并排:左右可跳,上下不可", () => {
    const { layout: l } = run([{ dir: "v" }]);
    expect(moveFocus(l, 1, "l")).toBe(2);
    expect(moveFocus(l, 2, "h")).toBe(1);
    expect(moveFocus(l, 1, "j")).toBeNull();
  });

  it("边界不环绕", () => {
    const { layout: l } = run([{ dir: "v" }]);
    expect(moveFocus(l, 1, "h")).toBeNull();
    expect(moveFocus(l, 2, "l")).toBeNull();
  });

  it("四宫格:不能横穿", () => {
    const { layout: l } = run([{ dir: "v" }, { dir: "h" }, { dir: "h" }]);
    expect(moveFocus(l, 1, "l")).toBe(2);
    expect(moveFocus(l, 1, "j")).toBeNull();
  });

  it("取最近的同侧窗口", () => {
    const { layout: l } = run([{ dir: "v" }, { go: "l" }, { dir: "v" }]);
    expect(moveFocus(l, 1, "l")).toBe(2);
  });
});

describe("run", () => {
  it("分屏后焦点在新窗口", () => {
    expect(run([{ dir: "v" }]).focus).toBe(2);
  });

  it("无效操作不崩", () => {
    expect(() => run([{ close: true }])).not.toThrow();
    expect(() => run([{ go: "j" }])).not.toThrow();
    expect(() => run([{ resize: "v+" }])).not.toThrow();
  });
});