import { describe, expect, it } from "vitest";
import { BOARDS, boardCards, BOARD_BY_ID, WINDOWS_CARD } from "../lib/boards";
import { drillablePool } from "../lib/seq-groups";
import { CORE_TASKS } from "../lib/core-vim";
import { QUESTIONS as TEXT_QUESTIONS } from "../lib/textobj";
import { TASKS as WIN_TASKS } from "../lib/winkeys";
import { BUF_TASKS } from "../lib/bufs";
import { TAB_TASKS } from "../lib/tabs";
import { FILE_TASKS } from "../lib/files";
import { UI_TOGGLES } from "../lib/ui-toggles";
import { DIAG_KEYS } from "../lib/diagnostics";
import { ARENAS } from "../lib/arena";
import * as SRS from "../lib/srs";

/**
 * 首页分母 = 页面实际题数。
 *
 * ## ⚠️⚠️ 为什么值得单独一个文件
 *
 * 这个项目原来有**四个**板块的分母是手写估的，全都对不上实际题数，
 * 而且**全都不报错**：
 *
 * | 板块 | 首页写的 | 页面实际 | 错因 |
 * |------|---------|---------|------|
 * | `/seq`  | 235 | 135 | 只减了窗口键，没减「已被专门页面覆盖」+「不能当题干」 |
 * | `/text` | 16  | 11  | 数的是 `SPEC.filter(measured)`，题目其实是 (对象,位置) 组合 |
 * | `/windows` jump/build/resize | 根本没注册 | 5/4/4 | 四个模式只注册了 hydra 一个 |
 *
 * 分母虚高的后果不是「数字难看」，是**进度条永远到不了 100%** ——
 * 用户以为还有题没练，其实全练完了。
 *
 * `board-consistency.test.ts` 当时没抓到，因为它检查的是
 * 「清单里的 id 在代码里存在」，而不是「分母等于页面真实题数」。
 * 这个文件补的就是后者。
 *
 * ## 怎么保证不退化
 *
 * 每一条都把「注册表的 total」和「题库数组的真实长度」**直接比**。
 * 题库数组是页面真正 map 成 `DrillTask` 的那一份，所以只要页面改了题库
 * 而没改注册表，这里就会红。
 */

/** 每个板块 → 页面真实用的题库长度 */
const ACTUAL: Record<string, number> = {
  "windows-jump": ARENAS.length,
  "windows-build": 4, // app/windows/build.tsx 的 TASKS（终态判定，4 道布局题）
  "windows-resize": 4, // app/windows/resize.tsx 的 TASKS（4 个方向）
  "windows-hydra": WIN_TASKS.length,
  buffers: BUF_TASKS.length,
  tabs: TAB_TASKS.length,
  files: FILE_TASKS.length,
  text: TEXT_QUESTIONS.length,
  core: CORE_TASKS.length,
  ui: UI_TOGGLES.length,
  diagnostics: DIAG_KEYS.length,
  search: 8, // app/search/drill.tsx 的 QUESTIONS
  seq: drillablePool().length,
};

describe("首页分母 = 页面实际题数", () => {
  it("每个板块的 total 都等于它页面的真实题数", () => {
    const bad: string[] = [];
    for (const b of BOARDS) {
      const actual = ACTUAL[b.id];
      expect(actual, `${b.id} 没有登记真实题数 —— 新增板块要在这里补上`).toBeDefined();
      if (b.total !== actual) {
        bad.push(`${b.id}: 首页写 ${b.total}，页面实际 ${actual}`);
      }
    }
    expect(bad, `这些板块的分母和页面题数对不上：\n${bad.join("\n")}`).toEqual([]);
  });

  /**
   * ⚠️ `/seq` 是原来错得最狠的一个（235 vs 135）。
   *
   * 单独再钉一条，因为它的分母算法最绕（要减去「已被专门页面覆盖」
   * 和「不能当题干」两批），以后很容易又写回估算值。
   */
  it("/seq 的分母用的是 drillablePool()，不是估算", () => {
    const seq = BOARD_BY_ID.get("seq")!;
    expect(seq.total).toBe(drillablePool().length);
    // 而且它**不该**等于「COMMANDS 减去窗口键」那个旧估算
    expect(seq.total).not.toBe(235);
  });

  it("/text 的分母用的是 QUESTIONS（题目），不是 SPEC（对象规格表）", () => {
    const text = BOARD_BY_ID.get("text")!;
    expect(text.total).toBe(TEXT_QUESTIONS.length);
    // SPEC 有 18 条，measured 的 16 条 —— 都不是题目数
    expect(text.total).toBe(11);
  });

  it("/core 的分母等于 CORE_TASKS 的长度", () => {
    expect(BOARD_BY_ID.get("core")!.total).toBe(CORE_TASKS.length);
    expect(CORE_TASKS.length).toBeGreaterThan(90);
  });
});

describe("首页卡片的进度求和", () => {
  /**
   * ⚠️⚠️ 这条钉的是「`/windows` 的 jump/build/resize 进度永远不显示」。
   *
   * 原来 `BOARDS` 里只有 `windows-hydra`，而页面用 `windows-jump` 等
   * 四个 boardId —— 记录落在后者，首页只读前者。
   * 实测：练满 3 次，首页仍显示 0。
   */
  it("窗口四模式合成一张卡，且进度求和", () => {
    const cards = boardCards();
    const win = cards.find((c) => c.id === WINDOWS_CARD);
    expect(win, "窗口卡片不见了").toBeDefined();
    expect(win!.ids.sort()).toEqual(
      ["windows-jump", "windows-build", "windows-resize", "windows-hydra"].sort(),
    );
    expect(win!.total).toBe(
      WIN_TASKS.length + ARENAS.length + 4 + 4,
    );
  });

  it("窗口四模式的进度都会被算进首页", () => {
    // 在 jump 模式练一道（不是 hydra）
    let p: SRS.Progress = {};
    for (let i = 0; i < 3; i++) {
      p = SRS.record(p, "jump:四宫格", true, {
        board: "windows-jump",
        independent: true,
        now: 1000 + i,
      });
    }
    const byBoard = SRS.byBoard(p);
    // 首页的口径：卡片下所有板块求和
    const win = boardCards().find((c) => c.id === WINDOWS_CARD)!;
    const done = win.ids.reduce((s, id) => s + (byBoard[id]?.mastered ?? 0), 0);
    expect(done, "jump 模式的进度没被算进首页").toBe(1);
  });

  it("卡片覆盖的板块并集 = 全部板块，没有板块被漏掉", () => {
    const inCards = new Set(boardCards().flatMap((c) => c.ids));
    const missing = BOARDS.map((b) => b.id).filter((id) => !inCards.has(id));
    expect(missing, `这些板块没出现在任何卡片里，进度不会显示：\n${missing.join("\n")}`).toEqual([]);
  });

  it("卡片总题数之和 = 各板块题数之和", () => {
    const cardSum = boardCards().reduce((a, c) => a + c.total, 0);
    const boardSum = BOARDS.reduce((a, b) => a + b.total, 0);
    expect(cardSum).toBe(boardSum);
  });
});

describe("进度归属：boardId 必须落在注册表里", () => {
  /**
   * ⚠️⚠️ 这条钉的是「`/seq` 练多少题首页都不动」。
   *
   * 原来 `/seq` 用 `boardId: \`seq-${groupId}\``，记录落在 `seq-search` /
   * `seq-other` 下，而注册表里是 `seq` —— 首页读 `byBoard["seq"]` 永远 0。
   */
  it("/seq 的记录归到 seq 板块（不是 seq-<分组>）", () => {
    let p: SRS.Progress = {};
    for (let i = 0; i < 3; i++) {
      p = SRS.record(p, "n|<Space>ff", true, { board: "seq", independent: true, now: 1000 + i });
    }
    const byBoard = SRS.byBoard(p);
    expect(byBoard["seq"]?.mastered, "seq 板块的进度没被记上").toBe(1);
    // 不该再出现 seq-* 这种幽灵板块
    const ghosts = Object.keys(byBoard).filter((k) => k.startsWith("seq-"));
    expect(ghosts, `出现了幽灵板块：${ghosts.join(",")}`).toEqual([]);
  });

  it("源码里没有 `seq-${` 这种模板 boardId", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.join(__dirname, "../app/seq/page.tsx"), "utf8");
    expect(src, "boardId 又变回模板串了").not.toMatch(/boardId:\s*`seq-/);
    expect(src, "boardId 该是常量 seq").toMatch(/boardId:\s*"seq"/);
  });
});
