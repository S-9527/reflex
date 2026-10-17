import { describe, expect, it } from "vitest";
import {
  buildReport,
  buildCoverageIndex,
  effectiveTotal,
  makeAliasResolver,
  normalizeVimKey,
  type VimIndexEntry,
} from "../lib/coverage-report";
import { VIM_INDEX } from "../lib/vim-index";
import { allDrilled } from "../lib/coverage-pool";

/**
 * 覆盖率对照 —— 「Vim 有什么」× 「reflex 练了没有」。
 *
 * ## ⚠️⚠️ 为什么必须有这个文件
 *
 * 用户问过两次「练全了没有」，我两次都是**写段文字回答**，两次都不对：
 *
 * 1. 第一次说「补完了 90 条核心操作」—— 清单是**我凭印象列的**
 * 2. 第二次说「覆盖率 19%」—— 数字对，但**列不出到底缺哪些**
 *
 * 根因是**没有一张权威的对照表**。现在它同时是页面（`/coverage`）
 * 和这份测试 —— 数字和清单都从同一份数据算出来，不会过期。
 */

/** 造一条 index 条目（测试用） */
const mk = (
  vim: string,
  action: string,
  extra: Partial<VimIndexEntry> = {},
): VimIndexEntry => ({
  section: "normal",
  tag: null,
  helpTag: null,
  char: vim,
  vim,
  action,
  aliasOf: null,
  isNotUsed: false,
  isDup: false,
  isSeeAlso: false,
  ...extra,
});

describe("normalizeVimKey：两边记法必须统一", () => {
  /**
   * ⚠️⚠️ 这是「实测覆盖率算成 2/75」的根因。
   *
   * 同一个键有两套写法：
   *   Vim 官方 index.txt → `<C-W>v`（**大写 W**）
   *   LazyVim / 页面 native → `<C-w>v`（**小写 w**）
   *
   * 只归一化一边，两边永远匹配不上。
   */
  it("修饰键里的字母统一大写（<C-w> → <C-W>）", () => {
    expect(normalizeVimKey("<C-w>v")).toBe("<C-W>v");
    expect(normalizeVimKey("<C-W>v")).toBe("<C-W>v");
    expect(normalizeVimKey("<C-w>c")).toBe("<C-W>c");
  });

  it("CTRL-W 的两种写法都归一", () => {
    expect(normalizeVimKey("CTRL-W c")).toBe("<C-W>c");
    expect(normalizeVimKey("<C-W>c")).toBe("<C-W>c");
    expect(normalizeVimKey("CTRL-W CTRL-D")).toBe("<C-W><C-D>");
  });

  it("普通 CTRL 键", () => {
    expect(normalizeVimKey("CTRL-A")).toBe("<C-A>");
    expect(normalizeVimKey("<C-A>")).toBe("<C-A>");
  });
});

describe("别名解析", () => {
  const entries: VimIndexEntry[] = [
    mk("h", "cursor N chars to the left"),
    mk("<BS>", 'same as "h"', { aliasOf: "h" }),
    mk("<C-H>", 'same as "h"', { aliasOf: "h" }),
    mk("j", "cursor N lines down"),
    mk("<NL>", 'same as "j"', { aliasOf: "j" }),
  ];
  const resolve = makeAliasResolver(entries);

  it("别名链能解析到最终目标", () => {
    expect(resolve("h").final).toBe("h");
    expect(resolve("<BS>").final).toBe("h");
  });

  it("能跟多跳（别名指向别名）", () => {
    const chain: VimIndexEntry[] = [
      mk("a", "target"),
      mk("b", 'same as "a"', { aliasOf: "a" }),
      mk("c", 'same as "b"', { aliasOf: "b" }),
    ];
    const r = makeAliasResolver(chain);
    expect(r("c").final).toBe("a");
    expect(r("c").chain).toEqual(["c", "b", "a"]);
  });

  it("有环也不会死循环", () => {
    const cyc: VimIndexEntry[] = [
      mk("x", 'same as "y"', { aliasOf: "y" }),
      mk("y", 'same as "x"', { aliasOf: "x" }),
    ];
    const r = makeAliasResolver(cyc);
    expect(() => r("x")).not.toThrow();
  });
});

describe("classify：五种状态", () => {
  it("最优解命中 → covered", () => {
    const trained = buildCoverageIndex([
      { display: "h", alternates: [], desc: "左移" } as never,
    ]);
    const resolve = makeAliasResolver([]);
    const r = buildReport([mk("h", "cursor left")], [
      { display: "h", alternates: [], desc: "左移" } as never,
    ]);
    expect(r.byState.covered).toBe(1);
    expect(trained.has("h")).toBe(true);
    expect(resolve("h").final).toBe("h");
  });

  /**
   * ⚠️ 别名指向的目标**有题** → 算 covered 的别名，不是缺口。
   *    实测这类有 100+ 条，全算缺口会让报告失真。
   */
  it("别名指向的目标有题 → alias（不算缺口）", () => {
    const entries = [mk("h", "left"), mk("<BS>", 'same as "h"', { aliasOf: "h" })];
    const r = buildReport(entries, [{ display: "h", alternates: [], desc: "" } as never]);
    expect(r.byState.alias).toBe(1);
    expect(r.byState.missing).toBe(0);
  });

  /**
   * ⚠️⚠️ 但别名指向的目标**没题** → 仍是缺口（缺的是目标）。
   *    这是「别名不等于放过」的关键。
   */
  it("别名指向的目标没题 → 仍算 missing，并指出缺的是谁", () => {
    const entries = [mk("h", "left"), mk("<BS>", 'same as "h"', { aliasOf: "h" })];
    const r = buildReport(entries, []);
    expect(r.byState.missing).toBe(2);
    const bs = r.rows.find((x) => x.entry.vim === "<BS>")!;
    expect(bs.resolvedAlias).toContain("h");
  });

  it("带 {占位符} → needsParam（不算缺口）", () => {
    const r = buildReport([mk("{register}", "use {register} for next op")], []);
    expect(r.byState.needsParam).toBe(1);
    expect(r.byState.missing).toBe(0);
  });

  it("not used → 不算缺口", () => {
    const r = buildReport([mk("<C-K>", "not used", { isNotUsed: true })], []);
    expect(r.byState.notUsed).toBe(1);
    expect(r.byState.missing).toBe(0);
  });

  /**
   * ⚠️ 文本对象（a" / i(）是**组件**，被 `d`+对象 的题覆盖。
   */
  it("文本对象被 operator+对象 的题覆盖", () => {
    const entries = [mk('a"', "double quoted string", { section: "objects" })];
    const r = buildReport(entries, [{ display: 'da"', alternates: [], desc: "" } as never]);
    expect(r.byState.covered).toBe(1);
  });
});

describe("防退化（拿真实数据跑）", () => {
  const report = buildReport(VIM_INDEX, allDrilled());

  it("分母来自 Vim 官方 index，条目数在合理范围", () => {
    expect(VIM_INDEX.length).toBeGreaterThan(400);
    expect(report.total).toBe(VIM_INDEX.length);
  });

  it("每个章节都抽到了命令（防解析脚本坏掉后静默变少）", () => {
    for (const s of ["normal", "objects", "window", "bracket", "g", "z"]) {
      const n = VIM_INDEX.filter((e) => e.section === s).length;
      expect(n, `章节 ${s} 一条都没有 —— 抽取脚本可能坏了`).toBeGreaterThan(10);
    }
  });

  it("解析器不漏表头/图例行（它们是噪声，会淹没真缺口）", () => {
    const noise = VIM_INDEX.filter((e) =>
      /^(CHAR|WORD|Nmove|tag|SECTION|count)$/.test(e.char),
    );
    expect(noise.map((e) => e.char), "表头/占位符名混进来了").toEqual([]);
  });

  it("缺口全部是「非别名、非参数、非 not used」", () => {
    for (const m of report.missing) {
      expect(m.entry.isNotUsed, `${m.entry.vim} 是 not used 却算缺口`).toBe(false);
      expect(/\{[^}]*\}/.test(m.entry.vim), `${m.entry.vim} 带占位符却算缺口`).toBe(false);
    }
  });

  /**
   * ⚠️ 覆盖率是**会变的数字**，所以测试只钉「不能退化」，
   *    不钉具体值（否则每补一批题就得改测试）。
   */
  it("覆盖率不为 0，且窗口/文本对象这些已有页面的章节有覆盖", () => {
    const eff = effectiveTotal(report);
    expect(report.byState.covered).toBeGreaterThan(50);
    expect(eff).toBeGreaterThan(0);
    // 有专门页面的章节必须有覆盖
    for (const s of ["window", "objects"]) {
      const covered = report.rows.filter(
        (x) => x.entry.section === s && x.state === "covered",
      ).length;
      expect(covered, `${s} 章节一条覆盖都没有 —— 匹配逻辑坏了`).toBeGreaterThan(5);
    }
  });

  it("effectiveTotal 把别名/参数/not used 都排除", () => {
    expect(effectiveTotal(report)).toBe(
      report.total - report.byState.alias - report.byState.notUsed - report.byState.needsParam,
    );
  });
});
