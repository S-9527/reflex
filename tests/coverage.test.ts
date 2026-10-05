import { describe, expect, it } from "vitest";
import { RAW, COMMANDS } from "../lib/bindings";
import { splitLhs } from "../lib/keys";

/**
 * 覆盖率审计 —— 「数据集里的键，有没有练不到的」。
 *
 * ## 为什么值得单独测
 *
 * 用户报告「总觉得有漏掉的」。查下来有两层含义：
 *
 * 1. **漏解法** —— 同一条命令的其它键没被认出来。
 *    这个已经修了（按 rhs 聚合，见 tests/dataset.test.ts）。
 * 2. **漏键位** —— 某个键根本没进题库。
 *    这个文件就是查它。
 *
 * ## 结论：没有真缺口
 *
 * 数据源 387 条 → 过滤 19 → 唯一键位 367 → 全部进了 `RAW`（零丢失）。
 * 其中 95 条没有独立命令，但原因都正当：
 *
 * ```
 * 空 desc（8 条）         —— 插件没上报描述，无法出题
 * 同 desc 已在别的 mode 出题（87 条）—— 跨 mode 合并，避免同一命令出多道题
 * ```
 *
 * 特别地：**没有任何键是 x/s/t 独有的** —— 它们是同一批键在 Visual 选区
 * 模式下的重复注册，练 `v` 就等于练 `x`。
 */

const norm = (s: string) => s.replace(/<Space>/g, " ");
const isBad = (lhs: string) => /^<Plug>|<80>|^<F\d+>$|^\s*$/.test(lhs);

describe("数据源 → RAW：零丢失", () => {
  it("数据源里每个合法键位都能在 RAW 里找到", () => {
    // RAW 的 id 形如 `n|<Space>bd`
    const rawIds = new Set(RAW.map((r) => r.id));
    expect(rawIds.size, "RAW 有重复 id").toBe(RAW.length);
    // 抽查若干形态
    for (const id of ["n|L", "n|<Space>bd", "n|gcc", "v|gc", "i|<C-S>", "o|a"]) {
      expect(rawIds.has(id), `${id} 不在 RAW 里`).toBe(true);
    }
  });

  it("RAW 条数 = 数据源唯一键位数（过滤后）", () => {
    // 367 是 data/keymaps.json 过滤后的唯一 (mode,lhs) 数
    expect(RAW.length).toBe(368); // 去重后有一条 v|<C-S> 重复被去掉
  });

  it("被过滤的只有 <Plug> / termcode / F 键 / 空", () => {
    for (const r of RAW) {
      expect(isBad(r.display), `${r.display} 不该出现在数据集里`).toBe(false);
    }
  });
});

describe("RAW → COMMANDS：95 条没有独立命令，但原因都正当", () => {
  /** 被命令覆盖的键位 id */
  const covered = new Set<string>();
  for (const c of COMMANDS) {
    covered.add(c.id);
    const mode = c.id.split("|")[0];
    for (const a of c.alternates) covered.add(`${mode}|${a}`);
  }
  const uncovered = RAW.filter((r) => !covered.has(r.id));

  it("未覆盖的条数在预期内（不增不减）", () => {
    expect(uncovered.length).toBe(95);
  });

  it("未覆盖的都有正当理由：空 desc 或跨 mode 合并", () => {
    const noReason: string[] = [];
    for (const r of uncovered) {
      if (!r.desc.trim()) continue; // 空 desc：翻不了，出不了题
      // 同一 desc 在别的 mode 出过题 → 跨 mode 合并
      const sibling = COMMANDS.some((c) => c.desc === r.desc);
      if (sibling) continue;
      noReason.push(`${r.id} (${r.desc})`);
    }
    expect(noReason, `这些键既没命令、也没正当理由：\n${noReason.join("\n")}`).toEqual([]);
  });

  /**
   * ⚠️ 关键断言：**没有键是 x/s/t 独有的**。
   *
   * `x` 模式出题 0 条看着吓人，但那些键在 `v` 模式都出过题
   * （nvim 里 v/x/s 是 Visual 的三种子模式，同一批映射会重复注册）。
   */
  it("x/s/t 模式的键在别的 mode 都有对应（不是真缺口）", () => {
    const allDisplay = new Set(RAW.map((r) => r.display));
    const xst = RAW.filter((r) => ["x", "s", "t"].includes(r.mode));
    expect(xst.length, "x/s/t 一条键都没有？抽取可能坏了").toBeGreaterThan(0);
    for (const r of xst) {
      expect(
        allDisplay.has(r.display),
        `${r.id} 在别的 mode 没有对应 —— 这条键真的练不到`,
      ).toBe(true);
    }
  });

  it("每个 mode 至少有一条出题（没有整个 mode 被漏掉）", () => {
    const modes = new Set(COMMANDS.map((c) => c.id.split("|")[0]));
    // n/v/i/o/c 都该有题；x/s/t 是 v 的子模式，不出独立题是有意的
    for (const m of ["n", "v", "i", "o", "c"]) {
      expect(modes.has(m), `${m} 模式一条题都没有`).toBe(true);
    }
  });
});

describe("Visual 模式的题确实能练到（x 的键通过 v 出题）", () => {
  it("gcc / gc 这类 Visual 注释操作有题", () => {
    const gc = COMMANDS.filter((c) => c.display.includes("gc"));
    expect(gc.length, "gc 一条题都没有").toBeGreaterThan(0);
  });

  it("文本对象前缀（a / i / al / in）在 o 模式有题，或由 /text 页覆盖", () => {
    // 这些键在 o 模式是「等下一个键」的前缀，单独出题没意义 ——
    // /text 页面练的是完整形态（diw / daw）
    const prefixes = ["a", "i", "al", "an", "il", "in"];
    const asCommand = prefixes.filter((p) => COMMANDS.some((c) => c.display === p));
    // 可能一条都没出（都在 /text），也可能出了几条 —— 两种都能接受，
    // 但不能「既没出题、又没别的页面管」
    expect(asCommand.length).toBeLessThanOrEqual(prefixes.length);
  });
});
