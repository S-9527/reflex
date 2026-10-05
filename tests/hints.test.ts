import { describe, expect, it } from "vitest";
import {
  MAX_HINT,
  HINT_LABEL,
  hintedKeys,
  nextHint,
  hintUseful,
  MODE_LABEL,
  MODE_HINT,
  countsForProgress,
  type HintLevel,
} from "../lib/hints";

/**
 * 提示分级 + 练习模式的测试。
 *
 * ## 这一版要守住的两件事
 *
 * 1. **提示是渐进的** —— 不能一按 `?` 就把答案全给出来，
 *    那等于把「默写」变回「跟打」。
 * 2. **用过提示的题不能算独立答对** —— 否则按提示抄一遍会污染
 *    熟练度数据，复习队列就废了。
 */

const BEST = ["<Space>", "b", "d"];

describe("hintedKeys —— 渐进给提示", () => {
  it("0 级什么都不给", () => {
    expect(hintedKeys(BEST, 0)).toEqual([null, null, null]);
  });

  /**
   * 首键往往是最难回忆的一步（尤其 leader 系的键），
   * 所以第 1 级只给首键。
   */
  it("1 级只给首键，其余留空", () => {
    expect(hintedKeys(BEST, 1)).toEqual(["<Space>", null, null]);
  });

  it("2 级给首键 + 键数（其余是占位符）", () => {
    expect(hintedKeys(BEST, 2)).toEqual(["<Space>", "·", "·"]);
  });

  it("3 级给全部", () => {
    expect(hintedKeys(BEST, 3)).toEqual(BEST);
  });

  it("每一级的长度都和最解法一致（格子数不能变）", () => {
    for (const lv of [0, 1, 2, 3] as HintLevel[]) {
      expect(hintedKeys(BEST, lv)).toHaveLength(BEST.length);
    }
  });

  it("单键的题也给得对（不越界）", () => {
    expect(hintedKeys(["L"], 0)).toEqual([null]);
    expect(hintedKeys(["L"], 1)).toEqual(["L"]);
    expect(hintedKeys(["L"], 2)).toEqual(["L"]);
    expect(hintedKeys(["L"], 3)).toEqual(["L"]);
  });

  it("空解法不崩", () => {
    for (const lv of [0, 1, 2, 3] as HintLevel[]) {
      expect(hintedKeys([], lv)).toEqual([]);
    }
  });

  it("提示是单调递增的（后一级不会比前一级少给）", () => {
    const count = (lv: HintLevel) => hintedKeys(BEST, lv).filter((x) => x !== null).length;
    expect(count(0)).toBeLessThanOrEqual(count(1));
    expect(count(1)).toBeLessThanOrEqual(count(2));
    expect(count(2)).toBeLessThanOrEqual(count(3));
  });
});

describe("nextHint —— 到顶就停", () => {
  it("逐级上升", () => {
    expect(nextHint(0)).toBe(1);
    expect(nextHint(1)).toBe(2);
    expect(nextHint(2)).toBe(3);
  });

  /**
   * ⚠️ 到顶不循环。
   *
   * 循环会让用户分不清「按到第几级了」，而且到顶之后再按一次
   * 突然变回「什么都没有」，像是把帮助收回去了。
   */
  it("到顶之后停在顶，不循环回 0", () => {
    expect(nextHint(3)).toBe(3);
    expect(nextHint(nextHint(3))).toBe(3);
  });

  it("最多按 3 次就到顶", () => {
    let lv: HintLevel = 0;
    for (let i = 0; i < 10; i++) lv = nextHint(lv);
    expect(lv).toBe(MAX_HINT);
  });
});

describe("hintUseful", () => {
  it("多键的题值得给提示", () => {
    expect(hintUseful(BEST)).toBe(true);
    expect(hintUseful(["g", "d"])).toBe(true);
  });

  /**
   * ⚠️ 单键的题给首键等于直接给答案 —— 提示没有意义。
   *    这条让 UI 可以隐藏提示按钮，而不是给一个骗人的「提示」。
   */
  it("单键的题给提示等于给答案，不算有用", () => {
    expect(hintUseful(["L"])).toBe(false);
    expect(hintUseful([])).toBe(false);
  });
});

describe("countsForProgress —— 用过提示的不算独立答对", () => {
  it("默写 + 没用提示 → 计入", () => {
    expect(countsForProgress("recall", false)).toBe(true);
  });

  it("默写 + 用了提示 → 不计入", () => {
    expect(countsForProgress("recall", true)).toBe(false);
  });

  it("跟打模式一律不计入（照抄不算熟练度）", () => {
    expect(countsForProgress("drill", false)).toBe(false);
    expect(countsForProgress("drill", true)).toBe(false);
  });
});

describe("文案完整性", () => {
  it("每一级提示都有说明", () => {
    for (const lv of [0, 1, 2, 3] as HintLevel[]) {
      expect(HINT_LABEL[lv], `${lv} 级缺文案`).toBeTruthy();
    }
  });

  it("两种模式都有名字和说明", () => {
    for (const m of ["drill", "recall"] as const) {
      expect(MODE_LABEL[m], `${m} 缺名字`).toBeTruthy();
      expect(MODE_HINT[m], `${m} 缺说明`).toBeTruthy();
    }
  });
});
