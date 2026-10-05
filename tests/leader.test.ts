import { describe, it, expect } from "vitest";
import { shouldTake, push, reset, idle } from "../lib/leader";
import { firstKeySet } from "../lib/keys";
import { RAW } from "../lib/bindings";
import { splitLhs } from "../lib/keys";

const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) }));
const FIRST = firstKeySet(BINDINGS);

describe("shouldTake —— 续键必须收(实测踩过的真 bug)", () => {
  it("idle 时只收第一键集合里的键", () => {
    expect(shouldTake("<Space>", idle, FIRST)).toBe(true);
    expect(shouldTake("<C-H>", idle, FIRST)).toBe(true);
    expect(shouldTake("F5", idle, FIRST)).toBe(false);
  });

  it("⚠️ pending 时无条件收 —— 这条就是之前漏掉的", () => {
    const st = push(idle, "<Space>", { isTerminal: false, extendable: true });
    expect(st.pending).toBe(true);
    // `|` / `-` / `w` 都不在 firstKeySet 里,但 pending 时必须收
    expect(FIRST.has("|")).toBe(false);
    expect(shouldTake("|", st, FIRST)).toBe(true);
    expect(shouldTake("-", st, FIRST)).toBe(true);
    expect(shouldTake("w", st, FIRST)).toBe(true);
  });

  it("pending 时连 F5 也收(此时不可能是浏览器快捷键)", () => {
    const st = push(idle, "<Space>", { isTerminal: false, extendable: true });
    expect(shouldTake("F5", st, FIRST)).toBe(true);
  });

  it("idle 时浏览器快捷键放行", () => {
    for (const k of ["F5", "F12", "F1", "Escape", "Tab", "ArrowLeft"]) {
      expect(shouldTake(k, idle, FIRST)).toBe(false);
    }
  });

  it("真实数据集:每个多键序列的每一键都能走完", () => {
    // 遍历每条绑定的完整按键序列,模拟用户一次一次按
    // 断言:只要前缀还没到终点,下一键就一定会被接管。
    const missed: string[] = [];
    for (const b of BINDINGS) {
      let st = idle;
      for (let i = 0; i < b.keys.length; i++) {
        if (!shouldTake(b.keys[i], st, FIRST)) {
          missed.push(`${b.display} 在第 ${i + 1} 键「${b.keys[i]}」被放行`);
          break;
        }
        const last = i === b.keys.length - 1;
        st = push(st, b.keys[i], { isTerminal: last, extendable: !last });
      }
    }
    // 这条断言以前会列出 206 条
    expect(missed).toEqual([]);
  });

  /**
   * 反向验证：如果判据退回「只看 firstKeySet」，会漏掉多少条。
   *
   * ⚠️ 断言用**比例**不用绝对数 —— 数据集会变（旧版 290 条，
   * 现在全量 368 条），绝对数一改数据就得跟着改，那是假护栏。
   * 真正要守住的性质是「漏掉的是**大多数**多键序列」。
   */
  it("修复前会漏掉大多数多键序列 —— 留个比例对照,防止回归", () => {
    let missedCount = 0;
    let multiKey = 0;
    for (const b of BINDINGS) {
      if (b.keys.length < 2) continue;
      multiKey++;
      for (let i = 0; i < b.keys.length; i++) {
        if (!FIRST.has(b.keys[i])) {
          missedCount++;
          break;
        }
      }
    }
    expect(multiKey, "数据集里没有多键序列？抽取可能坏了").toBeGreaterThan(50);
    expect(
      missedCount / multiKey,
      `只看 firstKeySet 漏了 ${missedCount}/${multiKey} 条多键序列`,
    ).toBeGreaterThan(0.5);
  });
});

describe("push", () => {
  it("不到终点 → pending", () => {
    const st = push(idle, "<Space>", { isTerminal: false, extendable: true });
    expect(st).toEqual({ typed: ["<Space>"], pending: true });
  });

  it("到终点且不可延长 → 序列结束", () => {
    const st = push(idle, "j", { isTerminal: true, extendable: false });
    expect(st).toEqual({ typed: ["j"], pending: false });
  });

  it("⚠️ 到终点但仍可延长 → 保持 pending(前缀歧义)", () => {
    // 例如 g 既是终点(goto?)又有子节点,按完 g 不能立刻判死
    const st = push(idle, "g", { isTerminal: true, extendable: true });
    expect(st.pending).toBe(true);
  });

  it("累加键序列", () => {
    let st = push(idle, "<Space>", { isTerminal: false, extendable: true });
    st = push(st, "w", { isTerminal: false, extendable: true });
    st = push(st, "d", { isTerminal: true, extendable: false });
    expect(st.typed).toEqual(["<Space>", "w", "d"]);
  });

  it("不改动传入的 state(不可变)", () => {
    const st = idle;
    push(st, "j", { isTerminal: true, extendable: false });
    expect(st.typed).toEqual([]);
  });
});

describe("reset", () => {
  it("回到起点", () => {
    expect(reset()).toEqual({ typed: [], pending: false });
  });
});