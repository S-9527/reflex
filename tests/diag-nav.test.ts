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
 * ## ⚠️ 最重要的一条:`]d` 到头**不绕回**
 *
 * 这和 `:cnext` 会绕回是两回事。训练器画错了比不画更糟 ——
 * 所以这里严格按实测行为建模,并有专门的回归测试盯着。
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
   * ⚠️⚠️ 最关键的一条:到头**不绕回**。
   *
   * 我第一版按「列表循环」写,到头回到第一条 —— 那是 `:cnext` 的行为,
   * 不是 `]d` 的。训练器画错了比不画更糟。
   */
  it("到头停在原地,不绕回开头", () => {
    let s = initial(MESSY);
    for (let i = 0; i < 4; i++) s = nextDiag(s);
    expect(s.cursor).toBe(9);
    const again = nextDiag(s);
    expect(again.cursor, "]d 到头不该绕回").toBe(9);
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

  it("到开头停在原地", () => {
    let s = initial(MESSY);
    s = firstDiag(s);
    expect(s.cursor).toBe(4);
    const again = prevDiag(s);
    expect(again.cursor).toBe(4);
    expect(again.note).toContain("第一个");
  });

  it("从头开始按 [d:没有更早的诊断", () => {
    const s = initial(MESSY); // 光标在第 0 行
    const r = prevDiag(s);
    expect(r.cursor, "第 0 行之前没有诊断,不该动").toBe(0);
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
