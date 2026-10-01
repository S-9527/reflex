import { describe, it, expect } from "vitest";
import { levelStats, modeTotals, prefixTree, prefixOf, progressByLevel } from "../lib/stats";
import { splitLhs } from "../lib/keys";
import { RAW, LEVEL_NAMES } from "../lib/bindings";

const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) }));

describe("prefixOf", () => {
  it("三键序列归到同一级(ff/fg/fb 都属 <Space>f)", () => {
    // 之前写成两级(slice(0,2)),ff 和 fg 就被当成不同分组,
    // 建树时对不上(142 vs 156)。语义应该是「一级」。
    expect(prefixOf("<Space>ff")).toBe("<Space>f");
    expect(prefixOf("<Space>fg")).toBe("<Space>f");
    expect(prefixOf("<Space>fb")).toBe("<Space>f");
  });

  it("两键序列取第一位", () => {
    expect(prefixOf("<Space>wd")).toBe("<Space>w");
  });

  it("单键 leader 返回完整键(不是裸字符)", () => {
    expect(prefixOf("<Space>|")).toBe("<Space>|");
    expect(prefixOf("<Space>-")).toBe("<Space>-");
  });

  it("裸键返回空", () => {
    expect(prefixOf("gd")).toBe("");
    expect(prefixOf("<C-H>")).toBe("");
  });

  it("只有 leader 一个键时返回 <Space>", () => {
    expect(prefixOf("<Space>")).toBe("<Space>");
  });
});

describe("levelStats", () => {
  const stats = levelStats(BINDINGS, LEVEL_NAMES);

  it("每个关卡一条统计,按 level 升序", () => {
    const levels = stats.map((s) => s.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it("total 之和等于总数(不能漏条)", () => {
    expect(stats.reduce((a, s) => a + s.total, 0)).toBe(BINDINGS.length);
  });

  it("byMode 之和等于 total", () => {
    for (const s of stats) {
      const sum = Object.values(s.byMode).reduce((a, b) => a + b, 0);
      expect(sum, `第 ${s.level} 关的 byMode 之和不等于 total`).toBe(s.total);
    }
  });

  it("uniqueKeys <= total(模式重复会合并)", () => {
    for (const s of stats) expect(s.uniqueKeys).toBeLessThanOrEqual(s.total);
  });

  it("avgKeys 在合理范围,longest >= avgKeys", () => {
    for (const s of stats) {
      expect(s.avgKeys).toBeGreaterThan(0);
      expect(s.avgKeys).toBeLessThanOrEqual(6);
      expect(s.longest).toBeGreaterThanOrEqual(s.avgKeys);
    }
  });

  it("每关都有名字(UI 直接显示它)", () => {
    for (const s of stats) expect(s.name).toBeTruthy();
  });

  it("没有超过 40 条的关卡(练不完的关卡是设计失败)", () => {
    for (const s of stats) {
      expect(s.total, `第 ${s.level} 关 ${s.total} 条,太多`).toBeLessThanOrEqual(40);
    }
  });
});

describe("modeTotals", () => {
  it("总和等于总数,按数量降序", () => {
    const m = modeTotals(BINDINGS);
    expect(m.reduce((a, x) => a + x.count, 0)).toBe(BINDINGS.length);
    for (let i = 1; i < m.length; i++) expect(m[i - 1].count).toBeGreaterThanOrEqual(m[i].count);
  });

  it("每个 mode 都有可读名", () => {
    for (const m of modeTotals(BINDINGS)) expect(m.label).toBeTruthy();
  });
});

describe("prefixTree", () => {
  const tree = prefixTree(BINDINGS);

  it("树的 count 是唯一键数,不是条目数", () => {
    // 一个键在 n/v/x/o 四个模式各有一条记录,但树上只该画一次
    // —— 否则 <Space>sm 这类会渲染出 4 个一模一样的格子。
    // 所以 count 比条目数小,差的正好是「同键多模式」的重复条数。
    const treeTotal = tree.reduce((a, n) => a + n.count, 0);
    const entries = BINDINGS.filter((b) => prefixOf(b.display));
    const unique = new Set(entries.map((b) => b.display)).size;
    expect(treeTotal).toBe(unique);
    expect(treeTotal).toBeLessThanOrEqual(entries.length);
  });

  it("每个唯一键恰好出现在一个分组里", () => {
    const seen = new Set<string>();
    for (const n of tree) {
      for (const c of n.children) {
        expect(seen.has(c.key), `${c.key} 出现在多个分组`).toBe(false);
        seen.add(c.key);
      }
    }
    expect(seen.size).toBe(tree.reduce((a, n) => a + n.count, 0));
  });

  it("按 count 降序", () => {
    for (let i = 1; i < tree.length; i++) {
      expect(tree[i - 1].count).toBeGreaterThanOrEqual(tree[i].count);
    }
  });

  it("每个节点的子键都带所属关卡(UI 要显示 badge)", () => {
    for (const n of tree) {
      for (const c of n.children) expect(c.levels.length).toBeGreaterThan(0);
    }
  });

  it("分屏键在树里且带第 1 关标记", () => {
    const node = tree.find((n) => n.prefix === "<Space>|");
    expect(node).toBeDefined();
    expect(node!.children[0].levels).toContain(1);
  });
});

describe("progressByLevel", () => {
  it("没进度时全部算 fresh", () => {
    const p = progressByLevel(BINDINGS, {});
    for (const x of p) {
      expect(x.fresh).toBe(x.total);
      expect(x.mastered).toBe(0);
      expect(x.shaky).toBe(0);
    }
  });

  it("total 之和等于总数", () => {
    const p = progressByLevel(BINDINGS, {});
    expect(p.reduce((a, x) => a + x.total, 0)).toBe(BINDINGS.length);
  });

  it("mastered + shaky + fresh == total", () => {
    const prog: Record<string, { seen: number; correct: number; streak: number; lastAt: number }> = {};
    for (const b of BINDINGS.slice(0, 40)) {
      prog[b.id] = { seen: 2, correct: 2, streak: 3, lastAt: 1 }; // mastered
    }
    for (const b of BINDINGS.slice(40, 60)) {
      prog[b.id] = { seen: 1, correct: 0, streak: 0, lastAt: 1 }; // shaky
    }
    for (const x of progressByLevel(BINDINGS, prog)) {
      expect(x.mastered + x.shaky + x.fresh, `第 ${x.level} 关对不上`).toBe(x.total);
    }
  });

  it("done 是 0~1 之间的比例", () => {
    const prog: Record<string, { seen: number; correct: number; streak: number; lastAt: number }> = {};
    for (const b of BINDINGS) prog[b.id] = { seen: 1, correct: 1, streak: 3, lastAt: 1 };
    for (const x of progressByLevel(BINDINGS, prog)) {
      expect(x.done).toBeGreaterThanOrEqual(0);
      expect(x.done).toBeLessThanOrEqual(1);
    }
  });
});
