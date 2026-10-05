import { describe, expect, it } from "vitest";
import * as SRS from "../lib/srs";
import { BOARDS } from "../lib/boards";

/**
 * ⚠️ 首页与 `/stats` 的**口径一致性**。
 *
 * ## 修之前的问题
 *
 * ```
 * 首页      「缓冲区 1/13」   ← 按板块，分母是题库长度
 * /stats    「缓冲区 1/10」   ← 按 which-key 分组
 * ```
 *
 * 同一个「缓冲区」两处两个数，而且都不报错。
 * 根因是两套分类法：`L` 在首页算「缓冲区」，在 `/stats` 算「裸键」。
 *
 * ## 修法
 *
 * 板块定义抽到 `lib/boards.ts`（唯一一份），
 * 两处都用 `SRS.byBoard()` 统计 —— 同一个函数，数字必然一致。
 */

const T = 1_700_000_000_000;

describe("板块注册表", () => {
  it("id 唯一（它是进度记录里的 board 标记）", () => {
    const ids = BOARDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个板块都有 href / name / total", () => {
    for (const b of BOARDS) {
      expect(b.href, `${b.id} 缺 href`).toBeTruthy();
      expect(b.name, `${b.id} 缺 name`).toBeTruthy();
      expect(b.total, `${b.id} 的 total 应该 > 0`).toBeGreaterThan(0);
    }
  });

  it("板块 id 和各页 useDrill 的 boardId 对得上", () => {
    /**
     * ⚠️ 这条很关键：`Item.board` 存的就是 `useDrill` 的 `boardId`。
     *    如果注册表里的 id 和页面上写的不一致，
     *    首页统计就会**永远显示 0**（记录落在别的 key 下）。
     */
    const expected = [
      "windows-hydra",
      "buffers",
      "tabs",
      "files",
      "text",
      "ui",
      "diagnostics",
      "search",
      "seq",
    ];
    expect(BOARDS.map((b) => b.id).sort()).toEqual(expected.sort());
  });
});

describe("首页口径（SRS.byBoard）", () => {
  it("按 board 分组统计，掌握/还不熟/没见过 三档之和 = total", () => {
    let p: SRS.Progress = {};
    // buffers：L 连对 3 次 → 掌握
    for (let i = 0; i < 3; i++) {
      p = SRS.record(p, "n|L", true, { board: "buffers", independent: true, now: T });
    }
    // buffers：bd 答错 → 还不熟
    p = SRS.record(p, "n|<Space>bd", false, { board: "buffers", now: T });
    // ui：ul 连对 1 次 → 还不熟
    p = SRS.record(p, "n|<Space>ul", true, { board: "ui", independent: true, now: T });

    const byBoard = SRS.byBoard(p);
    expect(byBoard.buffers).toMatchObject({ mastered: 1, shaky: 1, total: 2 });
    expect(byBoard.ui).toMatchObject({ mastered: 0, shaky: 1, total: 1 });
    for (const [board, st] of Object.entries(byBoard)) {
      expect(st.mastered + st.shaky + st.fresh, `${board} 三档之和对不上`).toBe(st.total);
    }
  });

  it("没有记录的板块不出现在 byBoard 里（首页按 0 处理）", () => {
    const byBoard = SRS.byBoard({});
    expect(Object.keys(byBoard)).toHaveLength(0);
    // 首页读的是 `byBoard[id]?.mastered ?? 0`
    for (const b of BOARDS) {
      expect(byBoard[b.id]?.mastered ?? 0).toBe(0);
    }
  });

  /**
   * ⚠️ 核心断言：**同一个函数**给两处用。
   *
   * 这条测的不是「数字相等」（那要靠同一个 progress 对象），
   * 而是「首页和 /stats 读的是同一个统计入口」。
   */
  it("首页和 /stats 都走 SRS.byBoard（同一个入口）", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const page = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
    const stats = fs.readFileSync(path.join(__dirname, "../components/stats-view.tsx"), "utf8");
    expect(page, "首页该用 SRS.byBoard").toContain("SRS.byBoard");
    expect(stats, "/stats 该用 SRS.byBoard").toContain("SRS.byBoard");
  });

  it("两处都从 lib/boards.ts 读板块清单（不再各自硬编码）", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const page = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
    const stats = fs.readFileSync(path.join(__dirname, "../components/stats-view.tsx"), "utf8");
    expect(page).toContain("@/lib/boards");
    expect(stats).toContain("@/lib/boards");
    // 首页不该再自己定义一份 BOARDS 数组
    expect(page, "首页不该再硬编码板块清单").not.toMatch(/^const BOARDS: /m);
  });
});

describe("进度记录带 board 标记", () => {
  it("record 会把 board 写进去", () => {
    let p: SRS.Progress = {};
    p = SRS.record(p, "n|L", true, { board: "buffers", independent: true, now: T });
    expect(p["n|L"].board).toBe("buffers");
  });

  /**
   * ⚠️ 同一条命令在两个板块都练时，归属保持**第一次**的值。
   *
   * 否则后练的板块会把记录「抢」过去，首页统计会莫名其妙地跳动。
   */
  it("同一条命令在两个板块练，board 不漂移", () => {
    let p: SRS.Progress = {};
    p = SRS.record(p, "n|L", true, { board: "buffers", independent: true, now: T });
    p = SRS.record(p, "n|L", true, { board: "seq", independent: true, now: T });
    expect(p["n|L"].board, "归属该保持第一次的").toBe("buffers");
    // 但计数照常累加（它确实是练了两次）
    expect(p["n|L"].seen).toBe(2);
  });

  it("没有 board 的旧记录归到 (unknown)，不崩", () => {
    let p: SRS.Progress = {};
    p = SRS.record(p, "x", true, { independent: true, now: T }); // 不传 board
    const byBoard = SRS.byBoard(p);
    expect(byBoard["(unknown)"]).toBeDefined();
  });
});
