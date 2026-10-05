import { describe, expect, it } from "vitest";
import {
  drillablePool,
  skippedPool,
  groupOf,
  filterByGroup,
  whyNotDrillable,
  OTHER_ID,
} from "../lib/seq-groups";
import { COMMANDS, GROUPS } from "../lib/bindings";

/**
 * `/seq` 的分组与筛选。
 *
 * ## 两件事
 *
 * 1. **分组按 which-key** —— 原来用「按键形态」（leader/ctrl/brackets/bare），
 *    那只回答「键长什么样」，而用户脑子里是「这键干什么用」。
 * 2. **排掉不能当题干的键** —— 空 desc、help 引用、auto-pairs。
 *    旧版把空 desc 留在题库里，于是出现**题干空白**的题。
 */

describe("whyNotDrillable —— 什么键不能当题干", () => {
  it("空 desc 不能出题（否则题干空白）", () => {
    expect(whyNotDrillable({ desc: "" })).toBe("没有描述（插件没上报 desc）");
    expect(whyNotDrillable({ desc: "   " })).toBe("没有描述（插件没上报 desc）");
  });

  it("help 引用不能出题（题干会是 :help v_@-default）", () => {
    expect(whyNotDrillable({ desc: ":help v_@-default" })).toContain("help 引用");
    expect(whyNotDrillable({ desc: ":help &-default" })).toContain("help 引用");
  });

  it("auto-pairs 不能出题（那是自动配对，不是要背的键）", () => {
    expect(whyNotDrillable({ desc: 'Open action for "()" pair' })).toContain("auto-pairs");
    expect(whyNotDrillable({ desc: 'Close action for "[]" pair' })).toContain("auto-pairs");
    expect(whyNotDrillable({ desc: 'Closeopen action for "``" pair' })).toContain("auto-pairs");
  });

  it("MiniPairs 内部行为不能出题", () => {
    expect(whyNotDrillable({ desc: "MiniPairs <BS>" })).toContain("MiniPairs");
  });

  it("正常人话描述可以出题", () => {
    for (const d of ["Next Buffer", "Toggle Line Numbers", ":bdelete", "Git Log"]) {
      expect(whyNotDrillable({ desc: d }), `${d} 该能出题`).toBeNull();
    }
  });
});

describe("drillablePool —— 筛选后的池子", () => {
  const pool = drillablePool();

  it("池子里没有不能出题的", () => {
    for (const c of pool) {
      expect(whyNotDrillable(c), `${c.display} (${c.desc}) 不该在池子里`).toBeNull();
    }
  });

  it("窗口键不在池子里", () => {
    for (const c of pool) {
      expect(c.desc, `${c.display} 是窗口键`).not.toMatch(/^(Go to .* Window|Split Window)/);
    }
  });

  it("已被专门页面覆盖的不在池子里", () => {
    // `]d` 属于 /diag，不该在 /seq 重复出题
    expect(pool.some((c) => c.display === "]d")).toBe(false);
    // `<Space>ua` 属于 /ui
    expect(pool.some((c) => c.display === "<Space>ua")).toBe(false);
  });

  it("量级合理（不增不减太多）", () => {
    expect(pool.length).toBeGreaterThan(100);
    expect(pool.length).toBeLessThan(200);
  });

  it("池子没有重复 id", () => {
    const ids = pool.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("skippedPool —— 被排掉的要有地方看", () => {
  const skipped = skippedPool();

  it("排掉的都有明确原因", () => {
    for (const s of skipped) {
      expect(s.reason, `${s.command.display} 缺原因`).toBeTruthy();
    }
  });

  it("排掉 + 可练 = 去重后的全量", () => {
    const pool = drillablePool();
    expect(pool.length + skipped.length).toBeGreaterThan(0);
    // 两个池子不重叠
    const poolIds = new Set(pool.map((c) => c.id));
    for (const s of skipped) {
      expect(poolIds.has(s.command.id), `${s.command.display} 同时在两个池子里`).toBe(false);
    }
  });

  it("四类原因都能对上（不是只有一个桶）", () => {
    const reasons = new Set(skipped.map((s) => s.reason));
    expect(reasons.size, "只出现了一种原因？判据可能写窄了").toBeGreaterThan(1);
  });

  it("排掉的条数在预期内", () => {
    expect(skipped.length).toBeGreaterThan(20);
    expect(skipped.length).toBeLessThan(60);
  });
});

describe("groupOf —— 按 which-key 分组", () => {
  const pool = drillablePool();
  const groups = groupOf(pool);

  it("真分组用的是 which-key 的分组名", () => {
    const ids = groups.map((g) => g.id).filter((id) => id !== OTHER_ID);
    for (const id of ids) {
      expect(GROUPS[id], `${id} 不在 GROUPS 里`).toBeDefined();
    }
  });

  it("真分组有多个（不是全挤在一个里）", () => {
    const real = groups.filter((g) => g.id !== OTHER_ID);
    expect(real.length).toBeGreaterThan(5);
  });

  it("兜底键合成一个「其它」，且排最后", () => {
    const other = groups.find((g) => g.id === OTHER_ID);
    if (other) {
      expect(groups[groups.length - 1].id, "「其它」该排最后").toBe(OTHER_ID);
      expect(other.name).toBe("其它");
    }
  });

  it("各组条数之和 = 池子大小（不漏不重）", () => {
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(pool.length);
  });

  it("真分组按题量降序", () => {
    const real = groups.filter((g) => g.id !== OTHER_ID);
    for (let i = 1; i < real.length; i++) {
      expect(real[i - 1].count).toBeGreaterThanOrEqual(real[i].count);
    }
  });

  it("每个分组都有名字", () => {
    for (const g of groups) expect(g.name, `${g.id} 缺名字`).toBeTruthy();
  });
});

describe("filterByGroup —— 取分组下的命令", () => {
  const pool = drillablePool();

  it("每个分组取出来的条数和 count 对得上", () => {
    for (const g of groupOf(pool)) {
      expect(filterByGroup(pool, g.id).length, `${g.id} 对不上`).toBe(g.count);
    }
  });

  it("各分组取出来的合起来 = 池子（不重不漏）", () => {
    const all = groupOf(pool).flatMap((g) => filterByGroup(pool, g.id));
    expect(all.length).toBe(pool.length);
    expect(new Set(all.map((c) => c.id)).size).toBe(pool.length);
  });

  it("「其它」取出来的是没有 which-key 分组的", () => {
    for (const c of filterByGroup(pool, OTHER_ID)) {
      expect(c.inWhichKey, `${c.display} 有 which-key 分组，不该在「其它」里`).toBe(false);
    }
  });

  it("真分组取出来的是有 which-key 分组的", () => {
    for (const g of groupOf(pool).filter((x) => x.id !== OTHER_ID)) {
      for (const c of filterByGroup(pool, g.id)) {
        expect(c.inWhichKey).toBe(true);
        expect(c.group).toBe(g.id);
      }
    }
  });
});

describe("which-key 分组字段", () => {
  /**
   * ⚠️ 回归测试。
   *
   * 我建 COMMANDS 时漏了 `inWhichKey` 字段，于是 `/seq` 想按 which-key
   * 分类时读到的永远是 undefined —— 168 条真分组**全被判成兜底桶**。
   */
  it("COMMANDS 上真的有 inWhichKey（而不是 undefined）", () => {
    const withField = COMMANDS.filter((c) => typeof c.inWhichKey === "boolean");
    expect(withField.length, "COMMANDS 缺 inWhichKey 字段").toBe(COMMANDS.length);
    expect(COMMANDS.filter((c) => c.inWhichKey).length, "一条真分组都没有？").toBeGreaterThan(100);
  });
});
