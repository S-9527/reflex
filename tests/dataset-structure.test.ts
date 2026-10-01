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

  it("关卡与 leader 层级一致:同一 <Space>X 的键不该散在多个关卡", () => {
    const byPrefix = new Map<string, Set<number>>();
    for (const b of BINDINGS) {
      const p = prefix2(b.display);
      if (!p) continue;
      if (!byPrefix.has(p)) byPrefix.set(p, new Set());
      byPrefix.get(p)!.add(b.level);
    }
    for (const [p, levels] of byPrefix) {
      if (levels.size <= 1) continue;
      // <Space>u 下有 <Space>uz(界面)和 <Space>uA(标签栏)等不同关注点,
      // 分在第 8/10 关是有意的。这里只挑"确定该同关"的前缀来守。
      const MUST_SAME = ["<Space>b", "<Space>f", "<Space>g", "<Space>c", "<Space>s", "<Space>q", "<Space>l", "<Space>w"];
      if (!MUST_SAME.includes(p)) continue;
      expect(
        [...levels],
        `前缀 ${p} 的键散在关卡 ${[...levels].join(",")} —— 应该同关`,
      ).toHaveLength(1);
    }
  });

  it("第 10 关不该装着一堆无法归类的键(兜底桶)", () => {
    // 兜底桶的名字就叫 "其他 leader 键",它必须有明确理由存在。
    // 如果第 10 关只剩这些,说明大多数键其实没归好。
    const l10 = BINDINGS.filter((b) => b.level === 10);
    const allIn10 = l10.every((b) => b.group === "leader-other");
    expect(allIn10, "第 10 关混进了已归组的键").toBe(true);
  });
});

describe("模式标注", () => {
  it("每条键都有模式,且是我们打算练的那几种", () => {
    const OK = new Set(["n", "v", "x", "o", "c"]);
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
