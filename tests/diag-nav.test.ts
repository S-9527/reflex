import { describe, expect, it } from "vitest";
import {
  initial,
  diagAt,
  nextDiag,
  prevDiag,
  lastDiag,
  firstDiag,
  applyNav,
  isNavKey,
  sortDiags,
  summary,
  nextQf,
  prevQf,
  applyQfNav,
  isQfKey,
} from "../lib/diag-nav";
import type { Diag } from "../lib/diagnostics";

/**
 * 诊断跳转的测试。
 *
 * ## 为什么这一族值得可视化
 *
 * 它是唯一一个「状态明确会变、但一直没被画出来」的大族。
 * 按下去什么会变很清楚:**光标在诊断列表里前后移动**。
 *
 * ## ⚠️⚠️ 最重要的一条:`]d` 到头**会绕回**
 *
 * 我第一版按手册直觉写成「不绕回」,而且为它写了测试和注释 ——
 * **实测推翻了**(探针 .probe/nav-behavior.lua):
 *
 * ```
 * 诊断在第 3、7 行,从第 1 行连按 ]d:
 *   第 3 次 → 第 3 行   ← 绕回了
 * ```
 *
 * 所以 `]d` 和 `:cnext` 的行为是**一样**的,我原来写反了。
 * 这几条测试现在盯的是**实测行为**。
 */

const D = (lnum: number, endLnum = lnum, severity: 1 | 2 | 3 | 4 = 1): Diag => ({
  lnum,
  endLnum,
  col: 0,
  endCol: 10,
  severity,
  message: `diag@${lnum}`,
});

/** 故意用**乱序**输入 —— 真实数据就是乱序的 */
const MESSY = [D(8), D(9), D(7, 8, 3), D(4)];

describe("sortDiags —— 必须排序", () => {
  /**
   * ⚠️ 真实数据是**探针写入顺序**,不是行号顺序。
   *    不排序的话「下一个诊断」算出来是乱的。
   */
  it("按行号升序(实测数据是乱序的)", () => {
    expect(sortDiags(MESSY).map((d) => d.lnum)).toEqual([4, 7, 8, 9]);
  });

  it("行号相同时按列号排(顺序稳定)", () => {
    const same = [{ ...D(5), col: 9 }, { ...D(5), col: 2 }, { ...D(5), col: 5 }];
    expect(sortDiags(same).map((d) => d.col)).toEqual([2, 5, 9]);
    // 同样输入两次,结果一样
    expect(sortDiags(same)).toEqual(sortDiags(same));
  });

  it("不改原数组(纯函数)", () => {
    const input = [...MESSY];
    sortDiags(input);
    expect(input.map((d) => d.lnum)).toEqual([8, 9, 7, 4]);
  });
});

describe("initial", () => {
  it("光标在第一行(不是第一条诊断)", () => {
    // ⚠️ 从第一行开始,`]d` 和 `[d` 才都有东西可跳 ——
    //    用户能看出方向差别。若一开始就在第一条诊断上,
    //    `[d` 会「按了没反应」,那正是最难查的体验问题。
    const s = initial(MESSY);
    expect(s.cursor).toBe(0);
    expect(diagAt(s), "第一行不该有诊断").toBeNull();
  });

  it("诊断已排好序", () => {
    expect(initial(MESSY).diags.map((d) => d.lnum)).toEqual([4, 7, 8, 9]);
  });

  it("空诊断列表不崩", () => {
    const s = initial([]);
    expect(s.cursor).toBe(0);
    expect(diagAt(s)).toBeNull();
    expect(summary(s).total).toBe(0);
  });
});

describe("]d —— 下一个诊断", () => {
  it("逐个往后跳", () => {
    let s = initial(MESSY);
    s = nextDiag(s);
    expect(s.cursor).toBe(4);
    s = nextDiag(s);
    expect(s.cursor).toBe(7);
    s = nextDiag(s);
    expect(s.cursor).toBe(8);
    s = nextDiag(s);
    expect(s.cursor).toBe(9);
  });

  /**
   * ⚠️⚠️ 最关键的一条:**到头绕回开头**（实测）。
   *
   * 我第一版写成「到头不动」,还专门写了测试证明它「不绕回」——
   * 那条测试把**错的**行为锁住了。实测才发现的。
   */
  it("到头绕回开头（实测行为）", () => {
    let s = initial(MESSY);
    for (let i = 0; i < 4; i++) s = nextDiag(s);
    expect(s.cursor).toBe(9);
    const again = nextDiag(s);
    expect(again.cursor, "]d 到头该绕回第一条（4）").toBe(4);
    expect(again.note).toContain("BOTTOM");
    expect(again.note).toContain("绕回");
  });

  it("wrap=false 时停在原地（用来演示差别）", () => {
    let s = initial(MESSY);
    for (let i = 0; i < 4; i++) s = nextDiag(s);
    const again = nextDiag(s, false);
    expect(again.cursor).toBe(9);
    expect(again.note).toContain("最后一个");
  });

  it("每一步都给反馈文案(用户要看得见动了)", () => {
    const s = nextDiag(initial(MESSY));
    expect(s.note).toBeTruthy();
    expect(s.note).toContain("5"); // 0-based 4 → 显示第 5 行
  });
});

describe("[d —— 上一个诊断", () => {
  it("从末尾逐个往前跳", () => {
    let s = initial(MESSY);
    s = lastDiag(s); // 先到最后
    expect(s.cursor).toBe(9);
    s = prevDiag(s);
    expect(s.cursor).toBe(8);
    s = prevDiag(s);
    expect(s.cursor).toBe(7);
    s = prevDiag(s);
    expect(s.cursor).toBe(4);
  });

  it("到开头绕回末尾（实测行为）", () => {
    let s = initial(MESSY);
    s = firstDiag(s);
    expect(s.cursor).toBe(4);
    const again = prevDiag(s);
    expect(again.cursor, "[d 到头该绕回最后一条（9）").toBe(9);
    expect(again.note).toContain("TOP");
  });

  it("从头按 [d 绕回末尾（实测）", () => {
    const s = initial(MESSY); // 光标在第 0 行，前面没有诊断
    const r = prevDiag(s);
    expect(r.cursor, "[d 在第一条之前会绕回末尾").toBe(9);
    expect(r.note).toContain("绕回");
  });

  it("wrap=false 时停在原地", () => {
    const s = { ...initial(MESSY), cursor: 4 };
    const r = prevDiag(s, false);
    expect(r.cursor).toBe(4);
    expect(r.note).toContain("第一个");
  });
});

describe("]D / [D —— 直接跳首尾", () => {
  it("]D 到最后一个", () => {
    const s = lastDiag(initial(MESSY));
    expect(s.cursor).toBe(9);
    expect(s.note).toContain("最后");
  });

  it("[D 到第一个", () => {
    const s = firstDiag(initial(MESSY));
    expect(s.cursor).toBe(4);
    expect(s.note).toContain("第一");
  });

  it("空列表时给明确提示,不静默", () => {
    for (const f of [lastDiag, firstDiag]) {
      const s = f(initial([]));
      expect(s.note).toContain("没有诊断");
      expect(s.cursor).toBe(0);
    }
  });
});

describe("diagAt —— 光标落在哪条诊断上", () => {
  it("命中单行诊断", () => {
    const s = { ...initial(MESSY), cursor: 4 };
    expect(diagAt(s)?.lnum).toBe(4);
  });

  /** ⚠️ 多行诊断(lua 那种跨行的)要整个区间都算命中 */
  it("命中多行诊断的区间内任意一行", () => {
    const s = { ...initial(MESSY), cursor: 7 };
    expect(diagAt(s)?.lnum).toBe(7, );
    const s2 = { ...s, cursor: 8 };
    expect(diagAt(s2), "第 8 行落在 7-8 这条的区间里").toBeTruthy();
  });

  it("不在任何诊断上返回 null", () => {
    const s = { ...initial(MESSY), cursor: 0 };
    expect(diagAt(s)).toBeNull();
  });
});

describe("applyNav —— 按键分发", () => {
  it("四个键都认识", () => {
    for (const k of ["]d", "[d", "]D", "[D"]) {
      expect(isNavKey(k), `${k} 该被认出来`).toBe(true);
    }
  });

  it("不相干的键给提示而不是静默", () => {
    const s = applyNav(initial(MESSY), "]x");
    expect(s.note).toContain("不在诊断跳转族");
    expect(s.cursor).toBe(0);
  });

  it("空列表时每个键都不崩", () => {
    for (const k of ["]d", "[d", "]D", "[D"]) {
      const s = applyNav(initial([]), k);
      expect(s.cursor).toBe(0);
      expect(s.note).toBeTruthy();
    }
  });
});

describe("summary", () => {
  it("统计总数和错误/警告数", () => {
    const s = initial([D(1, 1, 1), D(2, 2, 1), D(3, 3, 2), D(4, 4, 3)]);
    const sum = summary(s);
    expect(sum.total).toBe(4);
    expect(sum.errors).toBe(2);
    expect(sum.warns).toBe(1);
  });

  it("pos 是当前位置的序数(1-based)", () => {
    let s = initial(MESSY);
    expect(summary(s).pos, "不在诊断上时是 null").toBeNull();
    s = nextDiag(s); // 到第 4 行 = 第 1 条
    expect(summary(s).pos).toBe(1);
    s = nextDiag(s); // 第 7 行 = 第 2 条
    expect(summary(s).pos).toBe(2);
  });
});

/**
 * quickfix 项跳转（`]q` / `[q`）—— **和诊断跳转行为不一样**。
 *
 * 实测（`.probe/qf-behavior.lua`）:
 *
 * ```
 * quickfix 在第 2、5、8 行:
 *   连按 ]q → 5, 8, 8, 8, 8    ← 停住不绕回
 *   连按 [q → 5, 2, 2, 2, 2    ← 停住不绕回
 * ```
 *
 * 而 `]d` 到头会绕回。两族手感不同,不能共用一套模型 ——
 * 我差点就把 `]d` 的（会绕回）套到 `]q` 上了。
 */
describe("]q / [q —— quickfix 跳转", () => {
  const QF = [D(2), D(5), D(8)];
  const init = () => initial(QF);

  it("]q 逐个往后", () => {
    let s = init();
    s = nextQf(s);
    expect(s.cursor).toBe(2);
    s = nextQf(s);
    expect(s.cursor).toBe(5);
    s = nextQf(s);
    expect(s.cursor).toBe(8);
  });

  /** ⚠️ 和 ]d 的关键差别 */
  it("]q 到头**停住**，不绕回（和 ]d 不同）", () => {
    let s = init();
    for (let i = 0; i < 3; i++) s = nextQf(s);
    expect(s.cursor).toBe(8);
    const again = nextQf(s);
    expect(again.cursor, "]q 不该绕回，该停住").toBe(8);
    expect(again.note).toContain("E553");
    expect(again.note).toContain("不会绕回");
  });

  it("[q 到头也停住", () => {
    let s = { ...init(), cursor: 2 };
    const r = prevQf(s);
    expect(r.cursor).toBe(2);
    expect(r.note).toContain("E553");
  });

  it("[q 逐个往前", () => {
    let s = { ...init(), cursor: 8 };
    s = prevQf(s);
    expect(s.cursor).toBe(5);
    s = prevQf(s);
    expect(s.cursor).toBe(2);
  });

  it("isQfKey 只认这两个键", () => {
    expect(isQfKey("]q")).toBe(true);
    expect(isQfKey("[q")).toBe(true);
    expect(isQfKey("]d")).toBe(false);
  });

  it("applyQfNav 分发正确，未知键给提示", () => {
    expect(applyQfNav(init(), "]q").cursor).toBe(2);
    expect(applyQfNav(init(), "]d").note).toContain("不在 quickfix");
  });

  it("空列表不崩", () => {
    for (const k of ["]q", "[q"]) {
      const s = applyQfNav(initial([]), k);
      expect(s.cursor).toBe(0);
      expect(s.note).toBeTruthy();
    }
  });

  /**
   * ⚠️ 两族的差别必须被测试锁住 —— 这正是「凭印象写」最容易出错的地方。
   */
  it("同一份列表上，]d 绕回而 ]q 停住", () => {
    const atEnd = { ...initial(QF), cursor: 8 };
    // 诊断：绕回
    expect(nextDiag(atEnd).cursor, "]d 会绕回").toBe(2);
    // quickfix：停住
    expect(nextQf(atEnd).cursor, "]q 不绕回").toBe(8);
  });
});
