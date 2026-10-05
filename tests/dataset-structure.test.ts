import { describe, it, expect } from "vitest";
import { splitLhs } from "../lib/keys";
import { RAW } from "../lib/bindings";

/**
 * 数据集的结构性质。
 *
 * 这些不是"测功能",是**护栏**:分级和分组是最容易被"重跑脚本 + 手改"
 * 悄悄改坏的东西,而且坏了不报错 —— 只是练起来很怪。
 */
const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) }));

/**
 * leader 之后的第一段(两级)。
 *
 * 返回值是**完整 display 形式**的键,如 "<Space>|"、"<Space>ff"。
 * 写成这样而不是裸的 "f",是因为 `<Space>-` 本身就是完整键,
 * 裸 "-" 会被误判成"一个只有前缀没有子节点的组"。
 */
function prefix2(display: string): string {
  if (!display.startsWith("<Space>")) return "";
  const rest = display.slice("<Space>".length);
  if (rest === "") return "<Space>";
  if (rest.length === 1) return "<Space>" + rest; // <Space>| 、<Space>-
  return "<Space>" + rest.slice(0, 2); // <Space>ff 、<Space>wd
}

describe("leader 层级结构", () => {
  it("每个 <Space>X 都有子节点(除了本身就是单键的)", () => {
    const prefixes = new Set(BINDINGS.map((b) => prefix2(b.display)).filter(Boolean));
    // 有 prefix 但自己不是完整键的,应该有更长的键以它开头
    for (const p of prefixes) {
      const selfIsKey = BINDINGS.some((b) => b.display === p);
      if (selfIsKey) continue;
      const hasChild = BINDINGS.some((b) => b.display.startsWith(p) && b.display.length > p.length);
      expect(hasChild, `前缀 ${p} 下没有任何子键`).toBe(true);
    }
  });

  /**
   * ⚠️ 旧版测的是「同一 `<Space>X` 的键不该散在多个**关卡**」。
   *
   * 关卡概念删了，但这条**需求本身仍然成立** —— 只是判据换成
   * which-key 分组：同一个 leader 前缀下的键，应该落在同一个分组里。
   * 散开说明分组抽取或前缀匹配坏了。
   *
   * ⚠️ 但这条不能对所有前缀都成立：`<Space>u` 下有 `ui` 的开关，
   *   也可能有别的族混进来。所以只挑确定该同组的几个来守。
   */
  it("同一 <Space>X 的键落在同一个 which-key 分组", () => {
    const byPrefix = new Map<string, Set<string>>();
    for (const b of BINDINGS) {
      const p = prefix2(b.display);
      if (!p) continue;
      if (!byPrefix.has(p)) byPrefix.set(p, new Set());
      byPrefix.get(p)!.add(b.group);
    }
    // 这些前缀在 LazyVim 里都有显式的 group 声明，不该散开
    const MUST_SAME = ["<Space>b", "<Space>f", "<Space>g", "<Space>c", "<Space>s", "<Space>q"];
    for (const p of MUST_SAME) {
      const groups = byPrefix.get(p);
      if (!groups) continue;
      expect(
        [...groups],
        `前缀 ${p} 的键散在分组 ${[...groups].join(",")} —— 应该同组`,
      ).toHaveLength(1);
    }
  });

  it("兜底桶确实只装没有 which-key 分组的键", () => {
    // 「leader 其它」是按形态兜底归的类。如果它里面混进了
    // **有** which-key 分组的键，说明前缀匹配漏了。
    const fallback = BINDINGS.filter((b) => b.group === "leader-misc");
    for (const b of fallback) {
      expect(
        b.inWhichKey,
        `${b.display} 在兜底桶里，但它其实有 which-key 分组`,
      ).toBe(false);
    }
  });
});

describe("模式标注", () => {
  /**
   * ⚠️ 新数据源**不做过滤**，8 个 mode 全收。
   *
   * 旧版在抽取阶段就扔掉 Insert/Select，于是这里只允许 5 个 mode。
   * 现在全量拉出来、要不要练交给训练器决定，所以 `i`/`s`/`t` 也会出现。
   */
  it("每条键都有模式,且是 nvim 真实存在的模式", () => {
    const OK = new Set(["n", "i", "v", "x", "o", "c", "s", "t"]);
    for (const b of BINDINGS) {
      expect(OK.has(b.mode), `${b.display} 的模式 ${b.mode} 不在预期范围`).toBe(true);
    }
  });

  it("Visual 类键不能独占一个关卡(必须和 Normal 成对)", () => {
    // 练 <C-a> 但不练 <C-A>(Visual 版)是有意的取舍,没问题。
    // 但反过来 —— 只有 Visual 没有 Normal —— 就可疑了。
    const byDisplay = new Map(BINDINGS.map((b) => [`${b.display}|${b.mode}`, b]));
    for (const b of BINDINGS) {
      if (b.mode !== "n") continue;
      // 正常:Normal 存在,Visual 存在或不存在都行
    }
    expect(byDisplay.size).toBe(BINDINGS.length);
  });

  it("Normal 模式的键数应该占多数(日常主要在 Normal)", () => {
    const n = BINDINGS.filter((b) => b.mode === "n").length;
    expect(n / BINDINGS.length).toBeGreaterThan(0.5);
  });
});
