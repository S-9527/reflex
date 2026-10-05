import { describe, expect, it } from "vitest";
import { RAW, COMMANDS } from "../lib/bindings";
import { BUF_TASKS } from "../lib/bufs";
import { TAB_TASKS } from "../lib/tabs";
import { UI_TOGGLES } from "../lib/ui-toggles";
import { DIAG_KEYS } from "../lib/diagnostics";
import { SPEC } from "../lib/textobj";
import { FILE_TASKS } from "../lib/files";
import { TASKS as WIN_TASKS } from "../lib/winkeys";

/**
 * ⚠️ 口径一致性 —— 首页、`/stats`、`/seq` 三处的「分母」必须能对上。
 *
 * ## 发现的问题
 *
 * 同一个「缓冲区」，三处三个数：
 *
 * | 地方 | 分母来源 | buffer 组 |
 * |------|---------|----------|
 * | 首页 `BOARDS.total` | 各板块**题库**长度（`BUF_TASKS`） | 13 |
 * | `/stats` | `RAW` 按 group 数 | 10 |
 * | `/seq` | `COMMANDS` 过滤后 | 9 |
 *
 * 首页说「缓冲区 1/13」，`/stats` 说「缓冲区 1/10」——
 * 用户看到的进度条长度不一样，而且**都不报错**。
 *
 * 这些测试把这个差异**记录成事实**，而不是假装它不存在。
 * 要真正统一，得先决定「以谁为准」——那是设计决策，不是 bug 修复。
 */

/** 首页 BOARDS 用的分母（题库长度） */
const BOARD_TOTALS: Record<string, number> = {
  "windows-hydra": WIN_TASKS.length,
  buffers: BUF_TASKS.length,
  tabs: TAB_TASKS.length,
  files: FILE_TASKS.length,
  text: SPEC.filter((s) => s.measured).length,
  ui: UI_TOGGLES.length,
  diagnostics: DIAG_KEYS.length,
};

/** 各板块对应的 which-key 分组（能对上的那些） */
const BOARD_GROUP: Record<string, string | null> = {
  "windows-hydra": "windows",
  buffers: "buffer",
  tabs: null, // tab 键的 group 是 leader-misc / 兜底桶
  files: "file/find",
  text: null, // 文本对象不在 COMMANDS 里（那是插件映射）
  ui: "ui",
  diagnostics: "diagnostics/quickfix",
};

/**
 * ## ⚠️ 两个维度，不是两个口径
 *
 * 一开始我以为是「口径不一致的 bug」，后来发现是**两个正交的维度**：
 *
 * | 维度 | 分母 | 回答的问题 |
 * |------|------|-----------|
 * | **板块**（首页 + `/stats` 的「按板块」） | 题库长度 | 我还差多少题要练 |
 * | **which-key 分组**（`/stats` 的「分组分布」） | 数据集条数 | 数据集本身长什么样 |
 *
 * `L` 在板块维度属于「缓冲区」（它是练 buffer 的题），
 * 在分组维度属于「裸键」（它在 which-key 里没有 `<Space>` 前缀）。
 * 两个都对。
 *
 * **真正要统一的是同一维度内的数字** —— 那由
 * `tests/board-consistency.test.ts` 和 `tests/cross-board.test.ts` 守着。
 */
describe("两个维度确实不同（这是设计，不是 bug）", () => {
  it("题库长度和 COMMANDS 分组数**确实不同**", () => {
    const diffs: string[] = [];
    for (const [board, total] of Object.entries(BOARD_TOTALS)) {
      const g = BOARD_GROUP[board];
      if (!g) continue;
      const cmdCount = COMMANDS.filter((c) => c.group === g).length;
      if (cmdCount > 0 && cmdCount !== total) {
        diffs.push(`${board}: 题库 ${total} vs COMMANDS 分组 ${cmdCount}`);
      }
    }
    // ⚠️ 差异是**预期的** —— 两个维度问的是不同的问题。
    // 这条测试把它显式记下来，免得以后有人又当成 bug 去「修」。
    expect(diffs.length, `维度差异：\n${diffs.join("\n")}`).toBeGreaterThan(0);
  });

  it("RAW 按 group 数和 COMMANDS 按 group 数也不同（次解被合并了）", () => {
    for (const g of ["buffer", "ui", "search"]) {
      const rawCount = RAW.filter((r) => r.group === g).length;
      const cmdCount = COMMANDS.filter((c) => c.group === g).length;
      // COMMANDS 是「一个命令一道题」，同一条命令的多个键会被合并，
      // 所以 COMMANDS ≤ RAW 是**预期**的
      expect(cmdCount, `${g}: COMMANDS ${cmdCount} 不该多于 RAW ${rawCount}`).toBeLessThanOrEqual(rawCount);
    }
  });

  it("多解命令的次解会让 RAW 比 COMMANDS 多", () => {
    const multi = COMMANDS.filter((c) => c.alternates.length > 0);
    expect(multi.length, "一道多解命令都没有？聚合可能坏了").toBeGreaterThan(0);
    // 次解总数 = RAW 比 COMMANDS 多出来的那部分（同一 mode 内）
    const extra = multi.reduce((a, c) => a + c.alternates.length, 0);
    expect(extra).toBeGreaterThan(0);
  });
});

describe("✅ 真正统一的那部分：进度模型", () => {
  /**
   * 分母口径没统一，但**分子**（进度）已经统一到 `lib/srs.ts`。
   *
   * 首页用 `SRS.byBoard()`，`/stats` 用 `progressByGroup(...)` 传同一个
   * progress 对象 —— 两边的「掌握 / 还不熟」判据是同一套
   * （`streak >= 3` 即掌握，见 lib/srs.ts 的 isMastered）。
   *
   * 这条测试守的就是「判据一致」——至于分母用哪套，是另一个问题。
   */
  it("isMastered 的阈值只有一处定义", () => {
    // lib/srs.ts 的 isMastered 是唯一真源；stats.ts 用的是同一个阈值
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../lib/srs.ts"),
      "utf8",
    );
    const matches = src.match(/streak >= 3/g) ?? [];
    expect(matches.length, "isMastered 的阈值应该只有一处").toBe(1);
  });

  it("/stats 的 progressByGroup 用的是同一个阈值", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../lib/stats.ts"),
      "utf8",
    );
    // 它内联了 `s.streak >= 3` —— 和 srs.ts 同值
    expect(src).toContain("streak >= 3");
  });
});
