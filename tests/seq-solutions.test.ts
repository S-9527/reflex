import { describe, expect, it } from "vitest";
import { COMMANDS } from "../lib/bindings";
import {
  allSolutions,
  commandOf,
  descOfKey,
  equivalentsOf,
  judge,
  multiKeyDescs,
  solutionsFor,
} from "../lib/seq-solutions";

/**
 * 「全部解法」的可信度测试。
 *
 * ## ⚠️ 这一版测的和旧版完全不同
 *
 * 旧版测的是**手写表**（`NATIVE_VERIFIED` + 按 desc 聚合），
 * 而那张表实测既多又少 —— 它把 `<Space>bb` 当成 `L` 的等价解，
 * 但两者的 rhs 不同（`<Cmd>e #<CR>` vs `<Cmd>BufferLineCycleNext<CR>`），
 * 是两条不同的命令。
 *
 * 现在数据只有**一个来源**：`COMMANDS`（build 阶段按 rhs 聚合）。
 * 所以这里测的是那个聚合的正确性，以及查询适配层的行为。
 */

describe("等价解的判定依据", () => {
  it("有 rhs 的命令按 rhs 判（严格）", () => {
    const byRhs = COMMANDS.filter((c) => c.equivBy === "rhs" && c.total > 1);
    expect(byRhs.length, "按 rhs 聚合出的多解一道都没有，判据可能坏了").toBeGreaterThan(0);
  });

  /**
   * ⚠️ 回归测试：旧手写表在这里错过。
   *
   * `L` 和 `<Space>bb` 的 rhs 不同，不是同一条命令。
   */
  it("L 的等价解是 ]b，不是 <Space>bb", () => {
    const L = commandOf("L")!;
    expect(L).toBeDefined();
    expect(L.alternates).toContain("]b");
    expect(L.alternates).not.toContain("<Space>bb");
  });

  it("H 的等价解是 [b", () => {
    const H = commandOf("H")!;
    expect(H.alternates).toContain("[b");
  });

  it("旧手写表完全漏掉的 j/<Down>、k/<Up> 现在被认出来了", () => {
    const j = commandOf("j")!;
    const k = commandOf("k")!;
    expect([j.display, ...j.alternates]).toContain("<Down>");
    expect([k.display, ...k.alternates]).toContain("<Up>");
  });

  it("每条命令的 keys 含最优解自己", () => {
    for (const c of COMMANDS) {
      const s = solutionsFor(c.display);
      expect(s, `${c.display} 查不到解法`).not.toBeNull();
      expect(s!.keys).toContain(c.display);
    }
  });

  it("次解也能反查到同一条命令", () => {
    const withAlt = COMMANDS.filter((c) => c.alternates.length > 0);
    expect(withAlt.length).toBeGreaterThan(0);
    for (const c of withAlt) {
      for (const a of c.alternates) {
        const back = commandOf(a);
        expect(back?.id, `次解 ${a} 反查不回 ${c.display} 所属的命令`).toBe(c.id);
      }
    }
  });
});

describe("judge —— 判分不能比真实环境挑剔", () => {
  const mk = (display: string) => ({ id: display, display, desc: descOfKey(display) ?? "" });

  it("同一个键 → exact", () => {
    expect(judge(mk("L"), mk("L"))).toBe("exact");
  });

  it("等价键 → equivalent（按 [b 答 H 那题）", () => {
    expect(judge(mk("H"), mk("[b"))).toBe("equivalent");
  });

  it("不同命令 → wrong", () => {
    // L 是「下一个 buffer」，<Space>bb 是「切到另一个 buffer」—— 两件事
    expect(judge(mk("L"), mk("<Space>bb"))).toBe("wrong");
  });

  it("等价时列出其它键，且不含自己", () => {
    const eq = equivalentsOf("H");
    expect(eq).toContain("[b");
    expect(eq).not.toContain("H");
  });

  it("不存在的键不炸，返回空", () => {
    expect(equivalentsOf("<NotARealKey>")).toEqual([]);
    expect(solutionsFor("<NotARealKey>")).toBeNull();
  });
});

describe("原生 Ex 等价", () => {
  it("标了已核实的都有具体 Ex 命令", () => {
    for (const c of COMMANDS) {
      if (c.nativeVerified === true) {
        expect(c.native, `${c.display} 标了已核实却没有命令`).toBeTruthy();
      }
    }
  });

  it("实测抓出来的两个错命令不在表里", () => {
    const all = COMMANDS.map((c) => c.native).filter(Boolean);
    // `:bPrev` 不存在（真命令 :bprevious）；`:b#` 不存在（# 是参数，应写 :buffer #）
    expect(all, "`:bPrev` 不存在，真命令是 :bprevious").not.toContain(":bPrev");
    expect(all, "`:b#` 不存在，应写 `:buffer #`").not.toContain(":b#");
  });

  it("有原生等价的命令占一定比例（表没被清空）", () => {
    const withNative = COMMANDS.filter((c) => c.native);
    expect(withNative.length).toBeGreaterThan(50);
  });
});

describe("多解统计", () => {
  it("multiKeyDescs 只返回真的多解，且按解数降序", () => {
    const multi = multiKeyDescs();
    for (const s of multi) expect(s.keys.length).toBeGreaterThan(1);
    for (let i = 1; i < multi.length; i++) {
      expect(multi[i - 1].keys.length).toBeGreaterThanOrEqual(multi[i].keys.length);
    }
  });

  it("allSolutions 覆盖全部命令", () => {
    expect(allSolutions().length).toBe(COMMANDS.length);
  });
});
