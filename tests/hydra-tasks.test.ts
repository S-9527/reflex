import { describe, it, expect } from "vitest";
import { TASKS, parseSeq, findKey } from "../lib/winkeys";
import {
  initial,
  split,
  close,
  closeOthers,
  moveFocus,
  moveToEdge,
  swapNext,
  resize,
  maxOut,
  equalize,
  zoomIn,
  cycleFocus,
  focusIndex,
  run,
  countWindows,
  shape,
  positions,
  RESIZE_STEP,
  type Layout,
  type Op,
} from "../lib/split";

/**
 * 每道题都必须**可解** —— 这是最容易出、也最难靠人肉发现的 bug。
 *
 * 实测踩到:`l`(跳到右边)那题起始布局是 [{dir:"v"},{dir:"v"}]。
 * 但每次切分后焦点都在**新切出来的窗口**上,切两次之后焦点
 * 已经在最右边,再按 l → moveFocus 返回 null → 页面毫无反应。
 *
 * 用户看到的是「按了键不管用」,要反推好几步才想到是题目本身无解。
 * 所以题库搬到 lib 里,在这里逐题模拟「起始布局 → 按键 → 布局变了」。
 */

/** 和 hydra.tsx 的 applyKey 保持一致 */
function applyKey(key: string, cur: { layout: Layout; focus: number }) {
  switch (key) {
    case "v": { const l = split(cur.layout, cur.focus, "v"); return l ? { layout: l, focus: l.nextId - 1 } : null; }
    case "s": { const l = split(cur.layout, cur.focus, "h"); return l ? { layout: l, focus: l.nextId - 1 } : null; }
    case "h": case "j": case "k": case "l": {
      const n = moveFocus(cur.layout, cur.focus, key);
      return n === null ? null : { layout: cur.layout, focus: n };
    }
    case "H": case "J": case "K": case "L": {
      const d = key.toLowerCase() as "h" | "j" | "k" | "l";
      const l = moveToEdge(cur.layout, cur.focus, d);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "d": { const l = close(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
    case "o": { const l = closeOthers(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
    case "x": { const l = swapNext(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
    case ">": { const l = resize(cur.layout, cur.focus, "v", RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
    case "<": { const l = resize(cur.layout, cur.focus, "v", -RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
    case "+": { const l = resize(cur.layout, cur.focus, "h", -RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
    case "-": { const l = resize(cur.layout, cur.focus, "h", RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
    case "|": { const l = maxOut(cur.layout, cur.focus, "v"); return l ? { layout: l, focus: cur.focus } : null; }
    case "_": { const l = maxOut(cur.layout, cur.focus, "h"); return l ? { layout: l, focus: cur.focus } : null; }
    case "=": { const l = equalize(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
    // ---- 其他组 ----
    // 注意:m 的"退出缩放"要靠 prevRef 记住之前的样子,纯函数测不了,
    // 所以这里只测"进入缩放"这一步(题库也只要求按一次)。
    case "m": { const l = zoomIn(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
    case "W": {
      const n = cycleFocus(cur.layout, cur.focus);
      return n === null ? null : { layout: cur.layout, focus: n };
    }
    case "0": case "1": {
      const n = focusIndex(cur.layout, Number(key));
      return n === null ? null : { layout: cur.layout, focus: n };
    }
    case "q": case "T": {
      const l = close(cur.layout, cur.focus);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    default: return null;
  }
}

/** 用 Op 序列搭出起始状态。返回 run() 的原始结果 {layout, focus} */
function buildStart(ops: Op[]) {
  return run(ops);
}

/** 走一遍「起始 → 按 <Space>w key」,返回按键后的状态或 null */
function playTask(key: string, start: Op[]) {
  const s = buildStart(start);
  const next = applyKey(key, s);
  return { start: s, next };
}

describe("每道题都可解 —— 按下答案键必须改变布局", () => {
  for (const t of TASKS) {
    it(`「${t.key}」(${t.desc})按了必须有可见效果`, () => {
      const { next } = playTask(t.key, t.start);
      expect(next, `按 ${t.key} 返回 null —— 页面不会有任何反应`).not.toBeNull();
    });
  }
});

describe("每道题都可解 —— 起始布局本身要合法", () => {
  for (const t of TASKS) {
    it(`「${t.key}」起始布局至少有一个窗口`, () => {
      const { layout } = buildStart(t.start);
      expect(countWindows(layout.root)).toBeGreaterThan(0);
    });
  }
});

describe("导航键的起始焦点不能在目标位置(否则无解)", () => {
  it("h 题:焦点初始不在最左", () => {
    const t = TASKS.find((x) => x.key === "h")!;
    const { layout, focus } = buildStart(t.start);
    expect(moveFocus(layout, focus, "h")).not.toBeNull();
  });

  it("l 题:焦点初始不在最右", () => {
    const t = TASKS.find((x) => x.key === "l")!;
    const { layout, focus } = buildStart(t.start);
    expect(moveFocus(layout, focus, "l")).not.toBeNull();
  });

  it("⚠️ 这条就是当初 l 题无解的原因 —— 反向断言防回归", () => {
    // 当初的错误起始布局:{dir:"v"}*{2} → 焦点已在最右
    const bad = run([{ dir: "v" }, { dir: "v" }]);
    // 现在这题用的是 [{dir:"v"},{go:"h"}],焦点在左边,所以 l 有解
    const good = run([{ dir: "v" }, { go: "h" }]);
    expect(moveFocus(bad.layout, bad.focus, "l")).toBeNull();
    expect(moveFocus(good.layout, good.focus, "l")).not.toBeNull();
  });
});

describe("调整大小的题:起始比例必须不是已经到头的", () => {
  it("= 题:起始必须偏离对半,否则没东西可恢复", () => {
    const t = TASKS.find((x) => x.key === "=")!;
    const { layout, focus } = buildStart(t.start);
    // equalize 对已经对半的返回 null
    expect(equalize(layout, focus)).not.toBeNull();
  });

  it("⚠️ 反向:对半起始会让 = 题无解 —— 这是实测发现的第二个无解题", () => {
    // 原来的 = 题起始是 [{dir:"v"}],切出来正好对半,
    // equalize 提前返回 null → 页面无反应。已改成先 v+ 拉宽再按 =。
    const half = run([{ dir: "v" }]);
    expect(equalize(half.layout, half.focus)).toBeNull();
    const skewed = run([{ dir: "v" }, { resize: "v+" }]);
    expect(equalize(skewed.layout, skewed.focus)).not.toBeNull();
  });
});

describe("关闭类题:必须有窗口可关", () => {
  it("d 题:起始至少两个窗口", () => {
    const t = TASKS.find((x) => x.key === "d")!;
    const { layout } = buildStart(t.start);
    expect(countWindows(layout.root)).toBeGreaterThanOrEqual(2);
  });

  it("o 题:起始至少两个窗口", () => {
    const t = TASKS.find((x) => x.key === "o")!;
    const { layout } = buildStart(t.start);
    expect(countWindows(layout.root)).toBeGreaterThanOrEqual(2);
  });
});

describe("交换类题:必须真的换了位置", () => {
  it("x 题:至少两个窗口,且焦点窗口的位置真的变了", () => {
    const t = TASKS.find((x) => x.key === "x")!;
    const { start, next } = playTask(t.key, t.start);
    expect(countWindows(start.layout.root)).toBeGreaterThanOrEqual(2);
    expect(next).not.toBeNull();
    // 骨架不变,但焦点窗口的坐标应该变了
    const before = positions(start.layout.root).get(start.focus)!;
    const after = positions(next!.layout.root).get(next!.focus)!;
    expect(`${before.c0},${before.r0}`).not.toBe(`${after.c0},${after.r0}`);
  });
});

describe("移动窗口题:目标方向必须有空间", () => {
  it("H 题:焦点初始不在最左,移动后贴到左边", () => {
    const t = TASKS.find((x) => x.key === "H")!;
    const { start, next } = playTask(t.key, t.start);
    // 起始是三列(切两刀),焦点在最右那列 c 0.75-1.0
    expect(positions(start.layout.root).get(start.focus)!.c0).toBeCloseTo(0.75, 6);
    expect(positions(next!.layout.root).get(next!.focus)!.c0).toBeCloseTo(0, 6);
  });
});

describe("从用户的角度完整走一遍", () => {
  it("每题:三键序列能解析 + 按下后布局变化", () => {
    for (const t of TASKS) {
      // 1. 三键序列解析成功
      let buf: string[] = [];
      for (const k of [" ", "w"]) {
        const r = parseSeq(buf, k);
        expect(r.kind, `<Space>w 不被接受`).toBe("wait");
        buf = (r as { next: string[] }).next;
      }
      const hit = parseSeq(buf, t.key);
      expect(hit.kind, `${t.key} 解析失败`).toBe("hit");

      // 2. 按下后布局变化
      const { next } = playTask(t.key, t.start);
      expect(next, `${t.key} 按了没反应`).not.toBeNull();
    }
  });

  it("题目键都在面板上", () => {
    for (const t of TASKS) {
      expect(findKey(t.key), `${t.key} 不在 WIN_KEYS 里`).toBeDefined();
    }
  });
});