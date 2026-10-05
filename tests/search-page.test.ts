import { describe, expect, it } from "vitest";
import { initial, press, setDir, clearHighlight, summary } from "../lib/search-nav";

/**
 * ⚠️ `/search` 题库的**关键路径**验证。
 *
 * 这些测试复刻 `app/search/drill.tsx` 的题库配置，断言每一题的
 * 「起始状态 + 按一下」确实产生**预期的移动方向**。
 *
 * 为什么值得单独测：这一族的题目是**方向感知**的 ——
 * 同一道「按 n」在正向和反向下的结果相反。如果题库配错了
 * （比如反向题忘了改 dir），页面照跑、不报错，只是练的东西是错的。
 */

const SRC = ["local total = 0", "for i = 1, 10 do", "  total = total + i", "end", "print(total)"];
const PAT = "total";

/** 复刻 app/search/drill.tsx 的 QUESTIONS */
const QUESTIONS = [
  { key: "n", dir: "forward", startAt: 0 },
  { key: "n", dir: "forward", startAt: 1 },
  { key: "N", dir: "forward", startAt: 2 },
  { key: "N", dir: "backward", startAt: 1 },
  { key: "n", dir: "backward", startAt: 2 },
  { key: "n", dir: "forward", startAt: 3 },
  { key: "N", dir: "forward", startAt: 0 },
  { key: "<Esc>", dir: "forward", startAt: 1 },
] as const;

function setup(q: (typeof QUESTIONS)[number]) {
  const s = initial(SRC, PAT, q.dir);
  return { ...s, index: q.startAt };
}

describe("/search 题库", () => {
  it("所有起始下标都合法", () => {
    const n = initial(SRC, PAT).matches.length;
    for (const q of QUESTIONS) {
      expect(q.startAt, `${q.key} 的起始下标越界`).toBeLessThan(n);
      expect(q.startAt).toBeGreaterThanOrEqual(0);
    }
  });

  it("正向的 n 往后", () => {
    const s = press(setup(QUESTIONS[0]), "n");
    expect(s.index).toBe(1);
  });

  it("正向的 N 往前", () => {
    const s = press(setup(QUESTIONS[2]), "N");
    expect(s.index).toBe(1);
  });

  /** ⚠️ 这一族最容易记错的两条 */
  it("反向的 N 往后", () => {
    const s = press(setup(QUESTIONS[3]), "N");
    expect(s.index, "反向搜索后 N 该往后").toBe(2);
  });

  it("反向的 n 往前", () => {
    const s = press(setup(QUESTIONS[4]), "n");
    expect(s.index, "反向搜索后 n 该往前").toBe(1);
  });

  it("在最后一个按 n 会绕回", () => {
    const s = press(setup(QUESTIONS[5]), "n");
    expect(s.index).toBe(0);
    expect(s.note).toContain("绕回");
  });

  it("在第一个按 N 会绕回末尾", () => {
    const s = press(setup(QUESTIONS[6]), "N");
    expect(s.index).toBe(s.matches.length - 1);
    expect(s.note).toContain("绕回");
  });

  it("<Esc> 只清高亮，不动光标", () => {
    const before = setup(QUESTIONS[7]);
    const after = clearHighlight(before);
    expect(after.index, "光标不该动").toBe(before.index);
    expect(after.hl).toBe(false);
    expect(after.matches.length).toBe(before.matches.length);
  });

  it("每一题的「按一下」都真的改变了状态（没有死题）", () => {
    for (const q of QUESTIONS) {
      const before = setup(q);
      const after = q.key === "<Esc>" ? clearHighlight(before) : press(before, q.key as "n" | "N");
      const changed =
        after.index !== before.index || after.hl !== before.hl;
      expect(changed, `${q.key}@${q.startAt} (${q.dir}) 按了没变化 —— 这是死题`).toBe(true);
    }
  });
});
