import { describe, expect, it } from "vitest";
import {
  findMatches,
  initial,
  resolveDir,
  press,
  setDir,
  clearHighlight,
  current,
  summary,
} from "../lib/search-nav";

/**
 * 搜索跳转的测试。
 *
 * ## 这一族最容易记错的两件事
 *
 * 1. **`n` 不总是「往后」** —— 本机映射是 `'Nn'[v:searchforward]`，
 *    方向感知。用 `?` 倒着搜之后，`n` 反而往前。
 * 2. **`<Esc>` 只清高亮，不清搜索寄存器** —— 清完再按 `n` 还能跳。
 *
 * 这两条光看文字看不出来，所以模型里显式建模 + 测试盯着。
 */

const SRC = [
  "local total = 0",
  "for i = 1, 10 do",
  "  total = total + i",
  "end",
  "print(total)",
];
const PAT = "total";

describe("findMatches", () => {
  it("找出所有匹配（行、列都对）", () => {
    const m = findMatches(SRC, PAT);
    expect(m.length).toBe(4);
    expect(m[0]).toEqual({ line: 0, col: 6, endCol: 11 });
    expect(m[1].line).toBe(2);
  });

  it("一行里多个匹配都找出来", () => {
    const m = findMatches(["aXbXc"], "X");
    expect(m.map((x) => x.col)).toEqual([1, 3]);
  });

  it("空 pattern 返回空（不炸）", () => {
    expect(findMatches(SRC, "")).toEqual([]);
  });

  /** 用户搜的是字面量 —— 正则元字符要转义 */
  it("正则元字符当字面量处理", () => {
    expect(findMatches(["a.b"], ".").length).toBe(1);
    expect(findMatches(["a(b"], "(").length).toBe(1);
  });

  it("没有匹配返回空", () => {
    expect(findMatches(SRC, "zzz")).toEqual([]);
  });
});

describe("initial", () => {
  it("光标停在第一个匹配上", () => {
    const s = initial(SRC, PAT);
    expect(s.index).toBe(0);
    expect(current(s)!.line).toBe(0);
  });

  it("默认高亮是开的", () => {
    expect(initial(SRC, PAT).hl).toBe(true);
  });

  it("默认方向是正向", () => {
    expect(initial(SRC, PAT).dir).toBe("forward");
  });
});

describe("resolveDir —— ⚠️ n 不总是往后", () => {
  /**
   * 本机实测映射：
   *   n → 'Nn'[v:searchforward]
   *   N → 'nN'[v:searchforward]
   */
  it("正向搜索：n 往后，N 往前", () => {
    expect(resolveDir("n", "forward")).toBe("next");
    expect(resolveDir("N", "forward")).toBe("prev");
  });

  /** ⚠️ 这是这一族最反直觉的一条 */
  it("反向搜索（?）：n 和 N 的角色互换", () => {
    expect(resolveDir("n", "backward"), "用 ? 搜完后 n 反而往前").toBe("prev");
    expect(resolveDir("N", "backward")).toBe("next");
  });
});

describe("press", () => {
  it("正向：n 逐个往后", () => {
    let s = initial(SRC, PAT);
    s = press(s, "n");
    expect(s.index).toBe(1);
    s = press(s, "n");
    expect(s.index).toBe(2);
  });

  it("正向：N 逐个往前", () => {
    let s = initial(SRC, PAT);
    s = press(s, "n");
    s = press(s, "n");
    expect(s.index).toBe(2);
    s = press(s, "N");
    expect(s.index).toBe(1);
  });

  /** ⚠️ 反向搜索时 n 往前 —— 光看文字看不出来 */
  it("反向搜索：n 往前，N 往后", () => {
    let s = { ...initial(SRC, PAT), index: 2 };
    s = setDir(s, "backward");
    s = press(s, "n");
    expect(s.index, "反向搜完后 n 应该往前").toBe(1);
    s = press(s, "N");
    expect(s.index, "N 应该往后").toBe(2);
  });

  /**
   * ⚠️ 到头绕回（Vim 默认 wrapscan 开着），且**必须明说**。
   *    「悄悄绕回去」是最让人困惑的行为。
   */
  it("末尾按 n 绕回开头，并明确提示", () => {
    let s = initial(SRC, PAT);
    const n = s.matches.length;
    for (let i = 0; i < n; i++) s = press(s, "n");
    expect(s.index, "绕回第一个").toBe(0);
    expect(s.note).toContain("BOTTOM");
    expect(s.note).toContain("绕回");
  });

  it("开头按 N 绕回末尾", () => {
    let s = initial(SRC, PAT);
    s = press(s, "N");
    expect(s.index).toBe(s.matches.length - 1);
    expect(s.note).toContain("TOP");
  });

  it("绕回时高亮重新出现（Vim 行为）", () => {
    let s = initial(SRC, PAT);
    s = clearHighlight(s);
    expect(s.hl).toBe(false);
    s = press(s, "n");
    expect(s.hl, "跳转会让高亮回来").toBe(true);
  });

  it("没有匹配时给提示，不崩", () => {
    const s = press(initial(SRC, "zzz"), "n");
    expect(s.note).toContain("没有匹配");
    expect(s.index).toBe(0);
  });

  it("反向搜索的提示会说明为什么 n 往前", () => {
    let s = { ...initial(SRC, PAT), index: 2 };
    s = setDir(s, "backward");
    s = press(s, "n");
    expect(s.note).toContain("倒着搜");
  });
});

describe("setDir", () => {
  it("切换方向时说明角色互换", () => {
    const s = setDir(initial(SRC, PAT), "backward");
    expect(s.dir).toBe("backward");
    expect(s.note).toContain("互换");
  });
});

describe("clearHighlight —— Esc 只清高亮", () => {
  /**
   * ⚠️ LazyVim 的 `<Esc>` 映射是 `:nohlsearch` ——
   *    清高亮但**不清搜索寄存器**。很多人以为 Esc 把搜索也清了。
   */
  it("清掉高亮但保留匹配（还能继续跳）", () => {
    let s = initial(SRC, PAT);
    s = clearHighlight(s);
    expect(s.hl).toBe(false);
    expect(s.matches.length, "匹配还在").toBe(4);
    // 继续跳得动
    s = press(s, "n");
    expect(s.index).toBe(1);
  });

  it("提示里说清楚「寄存器还在」", () => {
    expect(clearHighlight(initial(SRC, PAT)).note).toContain("寄存器还在");
  });
});

describe("summary", () => {
  it("位置是 1-based 的序数", () => {
    let s = initial(SRC, PAT);
    expect(summary(s).pos).toBe(1);
    s = press(s, "n");
    expect(summary(s).pos).toBe(2);
  });

  it("标出是否在首尾（画布上可以给提示）", () => {
    let s = initial(SRC, PAT);
    expect(summary(s).atFirst).toBe(true);
    expect(summary(s).atLast).toBe(false);
    s = { ...s, index: s.matches.length - 1 };
    expect(summary(s).atLast).toBe(true);
  });

  it("没有匹配时 pos 是 null", () => {
    expect(summary(initial(SRC, "zzz")).pos).toBeNull();
  });
});
