import { describe, it, expect } from "vitest";
import {
  initial,
  count,
  current,
  switchNext,
  switchPrev,
  deleteCurrent,
  deleteInvisible,
  deleteOthers,
  deleteLeft,
  deleteRight,
  deleteNonPinned,
  togglePin,
  moveBufferNext,
  moveBufferPrev,
  stateFrom,
  applyBufKey,
  BUF_TASKS,
  type BufState,
} from "../lib/bufs";

const s3 = () => stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua", "c.lua"], curIndex: 1 });
const names = (s: BufState) => s.bufs.map((b) => b.name);

describe("initial", () => {
  it("一个 buffer,且是当前的", () => {
    const s = initial();
    expect(count(s)).toBe(1);
    expect(current(s)!.name).toBe("init.lua");
  });
});

describe("switchNext —— 按带子顺序轮换,不是按窗口位置", () => {
  it("切到下一个", () => {
    expect(current(switchNext(s3())!)!.name).toBe("c.lua");
  });

  it("末尾回到开头(和 <C-w>W 同一个心智)", () => {
    const s = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua", "c.lua"], curIndex: 2 });
    expect(current(switchNext(s)!)!.name).toBe("a.lua");
  });

  it("往回切", () => {
    expect(current(switchPrev(s3())!)!.name).toBe("a.lua");
  });

  it("只有一个 buffer 时不动", () => {
    expect(switchNext(initial())).toBeNull();
  });
});

describe("deleteCurrent", () => {
  it("删掉当前的,当前落到**右边**那个", () => {
    const s = deleteCurrent(s3())!;
    expect(names(s)).toEqual(["a.lua", "c.lua"]);
    expect(current(s)!.name).toBe("c.lua");
  });

  it("⚠️ 当前在末尾时落到左边 —— 不能越界", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua", "c.lua"], curIndex: 2 });
    const s = deleteCurrent(st)!;
    expect(names(s)).toEqual(["a.lua", "b.lua"]);
    expect(current(s)!.name).toBe("b.lua");
  });

  it("全删光会留一个 [No Name],不是空白", () => {
    const one = stateFrom({ key: "bb", desc: "", start: ["a.lua"], curIndex: 0 });
    const s = deleteCurrent(one)!;
    expect(count(s)).toBe(1);
    expect(current(s)!.name).toBe("[No Name]");
  });

  it("删除不存在的(一个都没删到)返回 null", () => {
    // bl 在最左时无事可做
    const st = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua"], curIndex: 0 });
    expect(deleteLeft(st)).toBeNull();
  });
});

describe("deleteLeft / deleteRight", () => {
  it("删左边:当前在中间,左边的全没", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua", "c.lua"], curIndex: 2 });
    expect(names(deleteLeft(st)!)).toEqual(["c.lua"]);
  });

  it("删右边", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua", "c.lua"], curIndex: 0 });
    expect(names(deleteRight(st)!)).toEqual(["a.lua"]);
  });

  it("⚠️ 当前已在最左 → 删左边无事可做,返回 null", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua"], curIndex: 0 });
    expect(deleteLeft(st)).toBeNull();
  });

  it("⚠️ 当前已在最右 → 删右边无事可做,返回 null", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a.lua", "b.lua"], curIndex: 1 });
    expect(deleteRight(st)).toBeNull();
  });
});

describe("deleteInvisible", () => {
  it("删掉所有没显示在任何窗口里的", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a", "b", "c", "d"], curIndex: 0 });
    // 只有 index 0 是 visible
    const s = deleteInvisible(st)!;
    expect(names(s)).toEqual(["a"]);
  });

  it("pinned 的不可见 buffer 不会被删", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a", "b"], curIndex: 0, pinned: [1] });
    // 唯一不可见的是 b,但它 pinned → 一个都删不掉 → null
    expect(deleteInvisible(st)).toBeNull();

    // 三个 buffer:两个不可见,其中一个 pinned → 只删掉没 pinned 的那个
    const st2 = stateFrom({ key: "bb", desc: "", start: ["a", "b", "c"], curIndex: 0, pinned: [1] });
    const s = deleteInvisible(st2)!;
    expect(names(s)).toEqual(["a", "b"]);
  });

  it("没有不可见的 buffer 时返回 null", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a"], curIndex: 0 });
    expect(deleteInvisible(st)).toBeNull();
  });
});

describe("deleteOthers / deleteNonPinned", () => {
  it("只留当前", () => {
    expect(names(deleteOthers(s3())!)).toEqual(["b.lua"]);
  });

  it("删掉所有未固定的,保留 pinned", () => {
    const st = stateFrom({ key: "bb", desc: "", start: ["a", "b", "c"], curIndex: 0, pinned: [0] });
    expect(names(deleteNonPinned(st)!)).toEqual(["a"]);
  });
});

describe("moveBufferNext / moveBufferPrev —— 挪位置,不是切换", () => {
  it("]B 把当前往后挪一格,当前还是当前", () => {
    const st = stateFrom({ key: "x", desc: "", start: ["a", "b", "c"], curIndex: 0 });
    const s = moveBufferNext(st)!;
    expect(names(s)).toEqual(["b", "a", "c"]);
    expect(current(s)!.name).toBe("a"); // 当前没变
  });

  it("[B 把当前往前挪一格", () => {
    const st = stateFrom({ key: "x", desc: "", start: ["a", "b", "c"], curIndex: 2 });
    expect(names(moveBufferPrev(st)!)).toEqual(["a", "c", "b"]);
  });

  it("⚠️ 到边界不动(不像 L/H 那样绕回)", () => {
    const last = stateFrom({ key: "x", desc: "", start: ["a", "b"], curIndex: 1 });
    expect(moveBufferNext(last)).toBeNull();
    const first = stateFrom({ key: "x", desc: "", start: ["a", "b"], curIndex: 0 });
    expect(moveBufferPrev(first)).toBeNull();
  });
});

describe("togglePin", () => {
  it("切换 pinned 标志", () => {
    const s = togglePin(s3())!;
    expect(s.bufs.find((b) => b.id === 2)!.pinned).toBe(true);
    expect(togglePin(s)!.bufs.find((b) => b.id === 2)!.pinned).toBe(false);
  });
});

describe("每道题都可解", () => {
  for (const t of BUF_TASKS) {
    it(`「${t.key}」(${t.desc})按了必须有效果`, () => {
      const before = stateFrom(t);
      const after = applyBufKey(t.key, before);
      expect(after, `按 ${t.key} 返回 null —— 页面无反应`).not.toBeNull();

      // 必须真的**变了**,不能是同一个对象或等价状态
      const changed =
        names(after!) .join() !== names(before).join() ||
        after!.bufs.some((b, i) => b.pinned !== before.bufs[i]?.pinned) ||
        after!.cur !== before.cur;
      expect(changed, `${t.key} 按了但状态没变`).toBe(true);
    });
  }
});

describe("题库前提合法性", () => {
  it("每题至少两个 buffer(否则切/删都没有意义)", () => {
    for (const t of BUF_TASKS) {
      if (t.key === "bi") continue; // bi 可以只有一个可见的
      expect(t.start.length, `${t.key} 起始 buffer 太少`).toBeGreaterThanOrEqual(2);
    }
  });

  it("每题都指定了合法的 curIndex", () => {
    for (const t of BUF_TASKS) {
      expect(t.curIndex).toBeGreaterThanOrEqual(0);
      expect(t.curIndex).toBeLessThan(t.start.length);
    }
  });

  it("bl 的起始当前不在最左", () => {
    const t = BUF_TASKS.find((x) => x.key === "bl")!;
    expect(t.curIndex).toBeGreaterThan(0);
  });

  it("br 的起始当前不在最右", () => {
    const t = BUF_TASKS.find((x) => x.key === "br")!;
    expect(t.curIndex).toBeLessThan(t.start.length - 1);
  });
});