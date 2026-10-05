import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ 终态判定的板块**必须自己说清楚按什么键**。
 *
 * ## 为什么单独立一条
 *
 * 序列匹配的板块（buffers / tabs / …）用 `accept` 出题，
 * `KeySequence` 会自动把解法格子画出来 —— 用户一眼知道按什么。
 *
 * 但终态判定的三个模式（jump / build / resize）用 `accept: []`，
 * 于是 `d.shownKeys` 是**空的**，`KeySequence` 什么都不显示。
 *
 * 你报的问题就是：「缩放那里不知道要练什么键」——
 * 整页只有底部一行小字提了句「按 <C-方向键>」。
 *
 * 这条测试守住：这三个板块都得**明确写出按键**。
 */

const TERMINAL_MODE_BOARDS = [
  { file: "app/windows/jump.tsx", name: "jump" },
  { file: "app/windows/build.tsx", name: "build" },
  { file: "app/windows/resize.tsx", name: "resize" },
];

describe("终态判定的板块要写清按键", () => {
  for (const { file, name } of TERMINAL_MODE_BOARDS) {
    it(`${name}：题目区里有按键提示`, () => {
      const src = readFileSync(join(__dirname, "..", file), "utf8");
      // 必须用 kbd 标出要按的键（不是只有底部一行小字）
      const hasKbdHint = /<kbd[\s\S]{0,200}?<\/kbd>/.test(src);
      expect(hasKbdHint, `${name} 没有用 <kbd> 标出按键`).toBe(true);
      // 且不能只依赖 shownKeys（终态模式下它是空的）
      const reliesOnShownKeys = /KeySequence keys=\{d\.shownKeys\}/.test(src);
      const hasOwnHint = /data-hint-key|<kbd/.test(src);
      expect(
        hasOwnHint || !reliesOnShownKeys,
        `${name} 只靠 shownKeys —— 终态模式下那是空的`,
      ).toBe(true);
    });
  }

  it("resize 明确列出了四个方向键", () => {
    const src = readFileSync(join(__dirname, "../app/windows/resize.tsx"), "utf8");
    for (const k of ["<C-Right>", "<C-Left>", "<C-Down>", "<C-Up>"]) {
      expect(src, `resize 没提到 ${k}`).toContain(k);
    }
    // 有 keysFor 之类的助手把「这题按哪个」算出来
    expect(src, "缺 keysFor 助手").toMatch(/function keysFor/);
  });

  it("resize 显示「还差多少」（用户要能看出进度）", () => {
    const src = readFileSync(join(__dirname, "../app/windows/resize.tsx"), "utf8");
    expect(src, "没显示还差多少").toContain("还差");
  });
});

/**
 * ⚠️ 另一条：终态判定的板块**起始状态不能已满足目标**。
 *
 * 引擎只在**按键之后**检查 `isSolved`，所以起始就满足时，
 * 用户按一下任意键就立刻过关 —— 看起来像「没反应」或「乱跳」。
 */
describe("终态板块的起始状态不能已完成", () => {
  it("resize 用显式 dir 判方向，不靠数值大小猜", () => {
    const raw = readFileSync(join(__dirname, "../app/windows/resize.tsx"), "utf8");
    /**
     * ⚠️ 要**去掉注释**再检查 —— 我在注释里解释这个 bug 时
     *    写了 `cells >= 40` 这个错误写法，不去注释会误报。
     */
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "") // 块注释
      .replace(/\/\/.*/g, ""); // 行注释

    expect(code, "又用数值大小猜方向了").not.toMatch(/cells\s*>=\s*40/);
    expect(code, "该用显式的 dir 判").toMatch(/goal\.dir\s*===\s*"grow"/);
  });

  it("jump 的每道题起始焦点不等于目标", () => {
    // jump 的目标是固定 index 1（见 app/windows/jump.tsx 的注释）
    const src = readFileSync(join(__dirname, "../app/windows/jump.tsx"), "utf8");
    expect(src, "jump 该有确定性的首题（不能随机，会 hydration mismatch）").toContain("FIRST_ARENA");
  });

  it("build 的每道题起始布局不等于目标", () => {
    const src = readFileSync(join(__dirname, "../app/windows/build.tsx"), "utf8");
    // 每题都从 initial() 起（一个窗口），目标都是 2+ 个窗口
    expect(src, "build 该从 initial() 起").toContain("initial()");
  });
});
