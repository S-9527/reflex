import { describe, it, expect } from "vitest";
import { buildIndex, match } from "../lib/matcher";
import { splitLhs } from "../lib/keys";
import { RAW } from "../lib/bindings";
import { translate } from "../lib/i18n";

/**
 * 端到端验分屏键:从数据集到 UI 的那条链。
 *
 * ## 为什么单独写这个测试
 *
 * 之前分屏键掉到第 10 关,是因为前缀规则没覆盖 `<Space>|` / `<Space>-`
 * (LazyVim 16 的键,不是书里的 `<Space>wv` / `<Space>ws`)。
 * 这类 bug 单测抓不到 —— 只有把「数据集 → 前缀树 → 匹配」整条链跑一遍
 * 才看得见键到底在不在索引里。
 */
const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) }));

describe("分屏键的完整链路", () => {
  const index = buildIndex(BINDINGS);

  it("数据集里确实有这两个分屏键,且在第 1 关", () => {
    const right = RAW.find((b) => b.display === "<Space>|");
    const below = RAW.find((b) => b.display === "<Space>-");
    expect(right, "缺 <Space>|").toBeDefined();
    expect(below, "缺 <Space>-").toBeDefined();
    expect(right!.level).toBe(1);
    expect(below!.level).toBe(1);
    expect(right!.group).toBe("window");
    expect(below!.group).toBe("window");
  });

  it("<Space>| 能被前缀树匹配到", () => {
    const r = match(index, ["<Space>", "|"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.binding.display).toBe("<Space>|");
  });

  it("<Space>- 能被前缀树匹配到", () => {
    const r = match(index, ["<Space>", "-"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.binding.display).toBe("<Space>-");
  });

  it("按 <Space> 后两个分屏键都出现在候选里", () => {
    const r = match(index, ["<Space>"]);
    expect(r.kind).toBe("partial");
    if (r.kind === "partial") {
      const d = r.candidates.map((c) => c.display);
      expect(d).toContain("<Space>|");
      expect(d).toContain("<Space>-");
    }
  });

  it("分屏键能翻成中文描述", () => {
    // ⚠️ 数据集里的 desc 是英文(那是插件的原文,不该改)。
    //    中文是运行时经 translate() 生成的 —— 所以这条要验 i18n,
    //    不能在数据集层断言"desc 里有中文",那必然失败。
    const right = RAW.find((b) => b.display === "<Space>|")!;
    expect(right.desc).toBe("Split Window Right");
    const zh = translate(right.display, right.mode, right.desc);
    expect(/[一-鿿]/.test(zh), `翻译结果 "${zh}" 里没有中文`).toBe(true);
  });

  it("第 1 关的 8 条键都能被前缀树命中(UI 不会把它们卡住)", () => {
    const l1 = BINDINGS.filter((b) => b.level === 1);
    expect(l1.length).toBe(8);
    for (const b of l1) {
      const r = match(index, b.keys);
      expect(r.kind, `${b.display} 匹配不到(得到 ${r.kind})`).toBe("hit");
      if (r.kind === "hit") expect(r.binding.id).toBe(b.id);
    }
  });
});
