import { describe, it, expect } from "vitest";
import { toGrid, validate, multiWindowBuffers, type Layout, type Win, type Tab, type Buf } from "../lib/layout";

const win = (id: number, row: number, col: number, rowspan = 1, colspan = 1, buf = id, active = false): Win => ({
  winid: id, buf, name: `/tmp/f${buf}.txt`, row, col, rowspan, colspan, active,
});

const tab = (tabnr: number, wins: Win[], active = false): Tab => ({ tabnr, wins, active });

const layout = (tabs: Tab[], buffers: Buf[], curwin = tabs[0]?.wins[0]?.winid ?? 0): Layout => ({
  tabs, buffers, curwin, columns: 80, lines: 24,
});

const g = (t: Tab) => toGrid(t).grid;

describe("toGrid —— 压缩网格", () => {
  it("单窗口 → 1×1", () => {
    const r = toGrid(tab(1, [win(1, 1, 1, 24, 80)]));
    expect(r.grid.length).toBe(1);
    expect(r.grid[0].length).toBe(1);
    expect(r.grid[0][0]?.winid).toBe(1);
    expect(r.rowHeights).toEqual([24]);
    expect(r.colWidths).toEqual([80]);
  });

  it("左右分屏 → 1 行 2 列(不是 80 列!)", () => {
    const r = toGrid(tab(1, [win(1, 1, 1, 24, 40), win(2, 1, 41, 24, 40)]));
    expect(r.grid.length).toBe(1);
    expect(r.grid[0].length).toBe(2);
    expect(r.colWidths).toEqual([40, 40]);
  });

  it("上下分屏 → 2 行 1 列", () => {
    const r = toGrid(tab(1, [win(1, 1, 1, 12, 80), win(2, 13, 1, 12, 80)]));
    expect(r.grid.length).toBe(2);
    expect(r.grid[0].length).toBe(1);
    expect(r.rowHeights).toEqual([12, 12]);
  });

  it("四宫格 → 2×2", () => {
    const r = toGrid(tab(1, [
      win(1,1,1,12,40), win(2,1,41,12,40),
      win(3,13,1,12,40), win(4,13,41,12,40),
    ]));
    expect(r.grid.length).toBe(2);
    expect(r.grid[0].length).toBe(2);
    expect(r.grid[1][1]?.winid).toBe(4);
  });

  it("不等宽:宽窄比例被保留在 colWidths", () => {
    const r = toGrid(tab(1, [win(1, 1, 1, 24, 20), win(2, 1, 21, 24, 60)]));
    expect(r.grid[0].length).toBe(2);
    expect(r.colWidths).toEqual([20, 60]);
  });

  it("不等高:高矮比例被保留在 rowHeights", () => {
    const r = toGrid(tab(1, [win(1, 1, 1, 5, 80), win(2, 6, 1, 19, 80)]));
    expect(r.rowHeights).toEqual([5, 19]);
  });

  it("嵌套:先竖切再横切 → 2×2,比例各自不同", () => {
    const r = toGrid(tab(1, [
      win(1, 1, 1, 12, 30), win(2, 1, 31, 12, 50),
      win(3, 13, 1, 12, 30), win(4, 13, 31, 12, 50),
    ]));
    expect(r.grid.length).toBe(2);
    expect(r.grid[0][0]?.winid).toBe(1);
    expect(r.grid[0][1]?.winid).toBe(2);
    expect(r.grid[1][0]?.winid).toBe(3);
    expect(r.grid[1][1]?.winid).toBe(4);
    expect(r.colWidths).toEqual([30, 50]);
  });

  it("网格规模是 O(窗口数)而不是 O(终端格子数)", () => {
    // 80×24 的终端、单窗口 —— 绝不能生成 1920 个格子
    const r = toGrid(tab(1, [win(1, 1, 1, 24, 80)]));
    expect(r.grid.length * r.grid[0].length).toBe(1);
  });

  it("空 tab → 空网格,不崩", () => {
    expect(toGrid(tab(1, [])).grid).toEqual([]);
  });
});

describe("validate", () => {
  const buf = (id: number, winids: number[]): Buf => ({
    id, name: `/tmp/f${id}.txt`, listed: true, loaded: true, winids, pinned: false,
  });

  it("合法布局无错误", () => {
    const errs = validate(layout([tab(1, [win(1, 1, 1, 24, 80, 1, true)], true)], [buf(1, [1])], 1));
    expect(errs).toEqual([]);
  });

  it("没有 tab 会报错", () => {
    expect(validate(layout([], []))).toContain("没有任何 tab");
  });

  it("active tab 不唯一会报错", () => {
    const errs = validate(layout([tab(1, [win(1,1,1)], true), tab(2, [win(2,1,1)], true)], [], 1));
    expect(errs.some((e) => e.includes("active 的 tab"))).toBe(true);
  });

  it("同一 tab 里多个 active 窗口 → 报错", () => {
    const errs = validate(layout([tab(1, [win(1,1,1,24,40,1,true), win(2,1,41,24,40,2,true)], true)], [], 1));
    expect(errs.some((e) => e.includes("多个 active"))).toBe(true);
  });

  it("buffer 声称在不存在的窗口里 → 报错(防止画出骗人的图)", () => {
    const errs = validate(layout([tab(1, [win(1, 1, 1, 24, 80, 1, true)], true)], [buf(1, [999])], 1));
    expect(errs.some((e) => e.includes("999"))).toBe(true);
  });

  it("curwin 不在布局里 → 报错", () => {
    const errs = validate(layout([tab(1, [win(1, 1, 1, 24, 80, 1, true)], true)], [buf(1, [1])], 777));
    expect(errs.some((e) => e.includes("curwin"))).toBe(true);
  });
});

describe("multiWindowBuffers", () => {
  it("找出出现在多个窗口的 buffer", () => {
    const b: Buf[] = [
      { id: 1, name: "a", listed: true, loaded: true, winids: [1, 2], pinned: false },
      { id: 2, name: "b", listed: true, loaded: true, winids: [3], pinned: false },
    ];
    const l = layout([tab(1, [win(1,1,1,12,40,1), win(2,1,41,12,40,1), win(3,13,1,12,80,2)], true)], b, 1);
    expect(multiWindowBuffers(l).map((x) => x.id)).toEqual([1]);
  });

  it("同一 buffer 在两个窗口 → 画出来要能看出来(第 9 章的重点)", () => {
    // 这就是「一个文件可以并排看两处」的量化形式
    const l = layout(
      [tab(1, [win(1,1,1,12,40,7), win(2,1,41,12,40,7)], true)],
      [{ id: 7, name: "x", listed: true, loaded: true, winids: [1, 2], pinned: false }],
      1,
    );
    expect(multiWindowBuffers(l)).toHaveLength(1);
    expect(validate(l)).toEqual([]);
  });
});
