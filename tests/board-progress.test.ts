import { describe, expect, it } from "vitest";
import {
  boardSummary,
  clearBoard,
  markSolved,
  solvedIds,
  type BoardProgress,
} from "../lib/board-progress";

/**
 * 跨会话进度的纯逻辑测试。
 *
 * localStorage 本身在 node 环境没有,所以这里只测纯函数 ——
 * 读写的边界(localStorage 不可用/被手改)只能靠浏览器验证。
 */
describe("markSolved", () => {
  it("第一次记下来", () => {
    expect(markSolved({}, "buffers", "L#0")).toEqual({ buffers: ["L#0"] });
  });

  it("幂等 —— 重复记不会产生重复项", () => {
    // 不幂等的话,做 20 遍同一题会在 localStorage 里堆 20 个
    // 相同 id,而首页仪表盘按 length 算进度,数字会虚高。
    const p1 = markSolved({}, "buffers", "L#0");
    const p2 = markSolved(p1, "buffers", "L#0");
    const p3 = markSolved(p2, "buffers", "L#0");
    expect(solvedIds(p3, "buffers")).toEqual(["L#0"]);
  });

  it("不同板块互不影响", () => {
    let p: BoardProgress = markSolved({}, "buffers", "L#0");
    p = markSolved(p, "tabs", "<Tab>d#0");
    expect(solvedIds(p, "buffers")).toEqual(["L#0"]);
    expect(solvedIds(p, "tabs")).toEqual(["<Tab>d#0"]);
  });

  it("不带入 base 的引用(aliasing)", () => {
    const base: BoardProgress = { tabs: ["x"] };
    const next = markSolved(base, "buffers", "y");
    // base 没被改 —— 否则 React state 更新会静默丢失数据
    expect(base).toEqual({ tabs: ["x"] });
    expect(next.tabs).toEqual(["x"]);
  });
});

describe("solvedIds", () => {
  it("没做过的板块返回空数组", () => {
    expect(solvedIds({}, "nope")).toEqual([]);
  });
});

describe("clearBoard", () => {
  it("清掉指定板块", () => {
    const p: BoardProgress = { buffers: ["a"], tabs: ["b"] };
    expect(clearBoard(p, "buffers")).toEqual({ tabs: ["b"] });
  });

  it("没做过的板块清它不报错", () => {
    expect(clearBoard({ tabs: ["b"] }, "buffers")).toEqual({ tabs: ["b"] });
  });

  it("清最后一个板块得到空对象", () => {
    expect(clearBoard({ buffers: ["a"] }, "buffers")).toEqual({});
  });
});

describe("boardSummary", () => {
  it("没做过:全 0", () => {
    expect(boardSummary({}, "buffers", 11)).toEqual({ done: 0, total: 11, left: 11 });
  });

  it("做过一部分", () => {
    const p = markSolved(markSolved({}, "buffers", "a"), "buffers", "b");
    expect(boardSummary(p, "buffers", 11)).toEqual({ done: 2, total: 11, left: 9 });
  });

  it("全做完:left 是 0", () => {
    let p: BoardProgress = {};
    for (const id of ["a", "b", "c"]) p = markSolved(p, "b", id);
    expect(boardSummary(p, "b", 3)).toEqual({ done: 3, total: 3, left: 0 });
  });

  /**
   * ⚠️ 题库缩短后(比如删掉一道题),存的条数会比总数多。
   * 这时不能报 done=20,total=11,left=-9 —— 负数会让首页进度条画飞。
   */
  it("存的条数超过总数时,左到钳住,left 不为负", () => {
    let p: BoardProgress = {};
    for (const id of ["a", "b", "c", "d", "e"]) p = markSolved(p, "b", id);
    const s = boardSummary(p, "b", 3);
    expect(s.done).toBe(3);
    expect(s.left).toBe(0);
    expect(s.left).toBeGreaterThanOrEqual(0);
  });
});