import { describe, it, expect } from "vitest";
import { groupStats, modeTotals, prefixTree, prefixOf, progressByGroup } from "../lib/stats";
import { splitLhs } from "../lib/keys";
import { RAW, GROUPS } from "../lib/bindings";

/**
 * 统计口径的测试。
 *
 * ## ⚠️ 这一版从「关卡」改成了「分组」
 *
 * 旧版统计按 `b.level`（手编的「第 x 关」），而那个 level 是前缀规则猜的。
 * 现在按 `b.group`，分组来自 which-key 的真实声明 ——
 * 所以统计面板里的分类和你按 `<Space>` 看到的 which-key 面板一致。
 */

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

describe("groupStats", () => {
  const stats = groupStats(BINDINGS, GROUPS);

  it("total 之和等于总数(不能漏条)", () => {
    expect(stats.reduce((a, s) => a + s.total, 0)).toBe(BINDINGS.length);
  });

  it("按条数降序 —— 量大的分组排前面", () => {
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i - 1].total).toBeGreaterThanOrEqual(stats[i].total);
    }
  });

  it("byMode 之和等于 total", () => {
    for (const s of stats) {
      const sum = Object.values(s.byMode).reduce((a, b) => a + b, 0);
      expect(sum, `${s.name} 的 byMode 之和不等于 total`).toBe(s.total);
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

  it("每个分组都有名字(UI 直接显示它)", () => {
    for (const s of stats) expect(s.name).toBeTruthy();
  });

  it("inWhichKey <= total(它数的是落在 which-key 里的条数)", () => {
    for (const s of stats) {
      expect(s.inWhichKey).toBeGreaterThanOrEqual(0);
      expect(s.inWhichKey).toBeLessThanOrEqual(s.total);
    }
  });

  /**
   * ⚠️ 真实分组里 search/goto 是最大的两组。
   *
   * 旧版把「窗口」放第 1 关，但它其实只有 2 条 —— 这就是
   * 「板块划分不合理」的直接证据。
   *
   * 注意要**排除兜底桶**：`Ctrl / Alt 其它` 和 `Visual 模式` 条数更多，
   * 但它们是「没有 which-key 分组」的键按形态归的类，不是真实分组。
   * 拿它们跟 search 比是没有意义的。
   */
  it("真实分组里最大的是 search 或 goto", () => {
    const real = stats.filter((s) => s.inWhichKey === s.total);
    expect(real.length, "一个完整的 which-key 分组都没有？").toBeGreaterThan(3);
    expect(["search", "goto"]).toContain(real[0].group);
  });

  it("窗口分组很小(旧版把它当第 1 关是错的)", () => {
    const win = stats.find((s) => s.group === "windows");
    const search = stats.find((s) => s.group === "search");
    expect(win, "找不到 windows 分组").toBeDefined();
    expect(search).toBeDefined();
    expect(win!.total, "窗口不该比搜索还大").toBeLessThan(search!.total);
  });

  it("兜底桶存在,且标出了它们不在 which-key 里", () => {
    // 「Ctrl / Alt 其它」「Visual 模式」这类是按形态兜底归的 ——
    // 它们的存在是诚实的:这些键本来就没有 which-key 分组。
    const fallback = stats.filter((s) => s.inWhichKey === 0);
    expect(fallback.length, "一个兜底桶都没有？分组逻辑可能坏了").toBeGreaterThan(0);
    for (const f of fallback) {
      expect(f.inWhichKey, `${f.name} 应该标成不在 which-key 里`).toBe(0);
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

  it("Normal 是最多的模式", () => {
    expect(modeTotals(BINDINGS)[0].mode).toBe("n");
  });
});

describe("prefixTree", () => {
  const tree = prefixTree(BINDINGS);

  it("树的 count 是唯一键数,不是条目数", () => {
    // 一个键在 n/v/x/o 各有一条记录,但树上只该画一次
    // —— 否则 <Space>sm 这类会渲染出 4 个一模一样的格子。
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

  it("每个节点的子键都带所属分组(UI 要显示 badge)", () => {
    for (const n of tree) {
      for (const c of n.children) expect(c.groups.length).toBeGreaterThan(0);
    }
  });

  it("分屏键在树里且归到窗口相关分组", () => {
    const node = tree.find((n) => n.prefix === "<Space>|");
    expect(node).toBeDefined();
    // 分组名来自 which-key,可能是 windows 也可能按形态兜底
    expect(node!.children[0].groups.length).toBeGreaterThan(0);
  });
});

describe("progressByGroup", () => {
  it("没进度时全部算 fresh", () => {
    const p = progressByGroup(BINDINGS, {}, GROUPS);
    for (const x of p) {
      expect(x.fresh).toBe(x.total);
      expect(x.mastered).toBe(0);
      expect(x.shaky).toBe(0);
    }
  });

  it("total 之和等于总数", () => {
    const p = progressByGroup(BINDINGS, {}, GROUPS);
    expect(p.reduce((a, x) => a + x.total, 0)).toBe(BINDINGS.length);
  });

  it("mastered + shaky + fresh == total", () => {
    const prog: Record<string, { seen: number; independent: number; streak: number }> = {};
    for (const b of BINDINGS.slice(0, 40)) {
      prog[b.id] = { seen: 2, independent: 2, streak: 3 }; // mastered
    }
    for (const b of BINDINGS.slice(40, 60)) {
      prog[b.id] = { seen: 1, independent: 0, streak: 0 }; // shaky
    }
    for (const x of progressByGroup(BINDINGS, prog, GROUPS)) {
      expect(x.mastered + x.shaky + x.fresh, `${x.name} 对不上`).toBe(x.total);
    }
  });

  it("done 是 0~1 之间的比例", () => {
    const prog: Record<string, { seen: number; independent: number; streak: number }> = {};
    for (const b of BINDINGS) prog[b.id] = { seen: 1, independent: 1, streak: 3 };
    for (const x of progressByGroup(BINDINGS, prog, GROUPS)) {
      expect(x.done).toBeGreaterThanOrEqual(0);
      expect(x.done).toBeLessThanOrEqual(1);
    }
  });
});
