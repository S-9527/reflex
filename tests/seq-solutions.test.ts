import { describe, expect, it } from "vitest";
import { RAW } from "../lib/bindings";
import {
  NATIVE_VERIFIED,
  allSolutions,
  descOfKey,
  groupByDesc,
  multiKeyDescs,
  solutionOf,
  solutionsFor,
  judge,
  equivalentsOf,
} from "../lib/seq-solutions";

/**
 * 「全部解法」的数据可信度测试。
 *
 * 这一页要展示「通关后所有解,含原生」,所以两件事必须守住:
 *   1. 等价键是**实测**的(按 desc 聚合),不能编
 *   2. 原生等价是**存在性实测过的**,不能编一个不存在的命令
 */

describe("按 desc 聚合 —— 等价键", () => {
  it("214 类 desc,和数据集一致", () => {
    expect(groupByDesc().size).toBe(new Set(RAW.map((r) => r.desc)).size);
  });

  /**
   * ⚠️ 关键:键序列必须去重。
   * `Around textobject` 那个 `a` 在 v/x/o 三个模式各有一条,
   * 算作三个键的话「多解」会虚高一倍。
   *
   * ⚠️⚠️ 我第一版的断言写错了:以为它是 `o`/`v`/`x` 三个键
   *   (那是可视模式三个操作符,desc 是 "Around textobject")。
   *   实际去重后 `keys` 就是 `["a"]` —— 测试红了一次才发现。
   *   「先假设、再验证」这条我记了这么多遍还是会犯。
   */
  it("同一个键在多个 mode 下只算一个键", () => {
    const g = groupByDesc().get("Around textobject")!;
    expect(g.keys).toEqual(["a"]);
    expect([...g.modes].sort()).toEqual(["o", "v", "x"]);
  });

  it("Next Search Result 的 n 跨 4 个模式,仍只算一个键", () => {
    const g = groupByDesc().get("Next Search Result")!;
    expect(g.keys).toEqual(["n"]);
    expect(g.modes.length).toBe(4);
  });

  it("`Down` 有 j 和 <Down> 两个不同的键", () => {
    const g = groupByDesc().get("Down")!;
    expect(new Set(g.keys)).toEqual(new Set(["j", "<Down>"]));
  });

  it("实测多解的 desc 恰好 15 类", () => {
    expect(multiKeyDescs().length).toBe(15);
  });

  it("每个多解的类里,键都互不相同(去重生效了)", () => {
    for (const s of multiKeyDescs()) {
      expect(new Set(s.keys).size, `${s.desc} 里有重复键`).toBe(s.keys.length);
    }
  });

  it("已实测的多解里,几个关键的对应关系没变", () => {
    const m = new Map(multiKeyDescs().map((s) => [s.desc, s.keys]));
    expect(m.get("Prev Buffer")).toEqual(["H", "[b"]);
    expect(m.get("Next Buffer")).toEqual(["L", "]b"]);
    expect(new Set(m.get("Terminal (Root Dir)"))).toEqual(
      new Set(["<Space>ft", "<C-/>"]),
    );
  });
});

describe("原生等价 —— 存在性是我实测过的", () => {
  /**
   * ⚠️ 这条测试锁住整个项目的教训。
   *
   * 我第一版凭印象写原生映射,写完自己都觉得可疑,于是全部拿
   * `exists(':命令')` 实测,抓到三处问题:
   *
   *   1. `:bPrev` 不存在 —— 我把大小写和缩写记混了,真命令是 `:bprevious`
   *   2. `:b#` 不存在 —— `#` 是参数不是命令名,应该是 `:buffer #`
   *   3. 探针自己坏了:`exists("::Man")` 双冒号、带参数的命令全判 0
   *
   * 第 3 条最险 —— 我一度以为「68 条命令全不存在」,差点把整张表
   * 标成「无原生等价」。自检 `exists(':bnext') = 2` 才发现是探针的问题。
   */
  it("有 native 的每一条都标了 verified", () => {
    const withNative = allSolutions().filter((s) => s.native);
    for (const s of withNative) {
      expect(s.verified, `${s.desc} 有 native 但没标 verified`).toBeTruthy();
      expect(s.verified, `${s.desc} 的 verified 是 unchecked`).not.toBe("unchecked");
    }
  });

  it("73 条 native 全部实测存在", () => {
    const withNative = allSolutions().filter((s) => s.native);
    expect(withNative.length).toBe(73);
    expect(withNative.filter((s) => s.verified === true).length).toBe(73);
  });

  it("⚠️ 表里不含我实测抓出来的两个错命令", () => {
    const all = Object.values(NATIVE_VERIFIED).map((v) => v[0]).filter(Boolean);
    expect(all, "`:bPrev` 不存在,真命令是 :bprevious").not.toContain(":bPrev");
    expect(all, "`:b#` 不是命令,应该写 :buffer #").not.toContain(":b#");
  });

  it("原生命令都是 : 开头或明确标注不是 Ex", () => {
    for (const s of allSolutions()) {
      if (s.native) expect(s.native.startsWith(":"), `${s.desc} 的 native 格式不对`).toBe(true);
    }
  });

  it("确认没有原生等价的,都写了原因 —— 不留空", () => {
    for (const s of allSolutions()) {
      if (!s.native) {
        expect(s.note, `${s.desc} 标成没有 native 但没写原因`).toBeTruthy();
      }
    }
  });

  it("注释里带参数的 native 是存在的(查命令名而非整串)", () => {
    // :wincmd h 这类:exists(':wincmd') = 2,但 exists(':wincmd h') = 0
    // 我第一版按整串查,17 条带参数的全被误判成「不存在」
    const s = solutionOf("Go to Left Window");
    expect(s.native).toBe(":wincmd h");
    expect(s.verified).toBe(true);
  });

  it("几个关键的原生对应关系没被改错", () => {
    expect(solutionOf("Next Buffer").native).toBe(":bnext");
    expect(solutionOf("Prev Buffer").native).toBe(":bprevious");
    expect(solutionOf("Buffers").native).toBe(":buffers");
    expect(solutionOf("Quickfix List").native).toBe(":copen");
    expect(solutionOf("Location List").native).toBe(":lopen");
    expect(solutionOf("Split Window Right").native).toBe(":vsplit");
  });

  /**
   * ⚠️ 这些是插件功能,不是 Vim 内置 —— 标成有原生等价就是编造。
   */
  it("插件功能不被编造成有原生等价", () => {
    const pluginOnly = [
      "Toggle Zoom Mode",
      "Toggle Zen Mode",
      "Explorer Snacks (root dir)",
      "Explorer Snacks (cwd)",
      "Grep (Root Dir)",
      "Format",
      "Toggle Treesitter Highlight",
      "Toggle Indent Guides",
      "Show diagnostics under the cursor",
    ];
    for (const d of pluginOnly) {
      const s = solutionOf(d);
      if (!s) continue; // 数据集里没有这个 desc
      expect(s.native, `${d} 是插件功能,不该有原生等价`).toBeNull();
      expect(s.note, `${d} 缺说明`).toContain("插件");
    }
  });
});

describe("solutionsFor —— 给答题后展示用", () => {
  it("能找到已知键的解法", () => {
    const s = solutionsFor("H");
    expect(s?.desc).toBe("Prev Buffer");
    expect(s?.keys).toContain("[b");
  });

  it("`<C-/>` 归到 Terminal (Root Dir)", () => {
    const s = solutionsFor("<C-/>");
    expect(s?.desc).toBe("Terminal (Root Dir)");
  });

  it("找不到时返回 null,而不是空对象", () => {
    expect(solutionsFor("这个键不存在zzz")).toBeNull();
  });

  it("descOfKey 返回原文", () => {
    expect(descOfKey("<Space>ft")).toBe("Terminal (Root Dir)");
  });

  it("每个有 native 的 desc 都能被 solutionsFor 找到(反向可达)", () => {
    for (const s of allSolutions()) {
      if (!s.native || s.keys.length === 0) continue;
      const found = solutionsFor(s.keys[0]);
      expect(found, `${s.desc} 从键 ${s.keys[0]} 反查不到`).not.toBeNull();
    }
  });
});
/**
 * ⚠️ 判分判据 —— 这条是「训练器比真实环境挑剔」的根因所在。
 *
 * 实测抓到的那句提示很讽刺:
 * 「这个键是「打开的缓冲区」,但本题要的是「打开的缓冲区」」
 * —— 描述一模一样,却说按错了。
 */
describe("judge —— 同命令的不同键都要算对", () => {
  const H = { id: "n:H", display: "H", desc: "Prev Buffer" };
  const bracketB = { id: "n:[b", display: "[b", desc: "Prev Buffer" };
  const L = { id: "n:L", display: "L", desc: "Next Buffer" };
  const bracketB2 = { id: "n:]b", display: "]b", desc: "Next Buffer" };

  it("同一个键 → exact", () => {
    expect(judge(H, H)).toBe("exact");
  });

  /**
   * 实测 rhs 完全相同:
   *   H  → <Cmd>BufferLineCyclePrev<CR>
   *   [b → <Cmd>BufferLineCyclePrev<CR>
   * 所以按 [b 答 H 那题必须算对。
   */
  it("同 desc 的另一个键 → equivalent(不是 wrong)", () => {
    expect(judge(H, bracketB)).toBe("equivalent");
    expect(judge(L, bracketB2)).toBe("equivalent");
  });

  it("desc 不同 → wrong", () => {
    expect(judge(H, L)).toBe("wrong");
  });

  it("H 那题按 [b 判过;但 H 题按 L(下一个 buffer)不行", () => {
    expect(judge(H, bracketB)).not.toBe("wrong");
    expect(judge(H, L)).toBe("wrong");
  });
});

describe("equivalentsOf —— 命中等价时列出同功能的其它键", () => {
  it("按 H 时列出 [b", () => {
    expect(equivalentsOf("H")).toEqual(["[b"]);
  });

  it("按 <C-/> 时列出 <Space>ft", () => {
    expect(new Set(equivalentsOf("<C-/>"))).toEqual(new Set(["<Space>ft"]));
  });

  it("只有一个键的题返回空数组", () => {
    expect(equivalentsOf("G")).toEqual([]);
  });

  it("不存在的键返回空数组,而不是抛错", () => {
    expect(equivalentsOf("zzz不存在")).toEqual([]);
  });
});
