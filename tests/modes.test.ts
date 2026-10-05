import { describe, expect, it } from "vitest";
import { classify, mergeFirstKeys, shouldTake, type DrillTask } from "../lib/drill";
import { COMMANDS } from "../lib/bindings";
import {
  createSession,
  currentTaskId,
  isDone,
  record,
  summarize,
  type Session,
} from "../lib/session";
import {
  hintedKeys,
  nextHint,
  countsForProgress,
  hintUseful,
  type HintLevel,
  type Mode,
} from "../lib/hints";

/**
 * 双模式（跟打 / 默写）的**集成测试**。
 *
 * 前面 hints.test.ts 测的是提示分级本身，session.test.ts 测的是结算。
 * 这里测的是**两者串起来之后**：提示真的影响显示、真的影响计分。
 *
 * 这一版最容易出的错是「提示显示了但没记账」——
 * 界面上看着对，但熟练度数据被污染了，而且**不报错**。
 * 所以这里重点盯那个。
 */

const TASKS: DrillTask[] = [
  { id: "t1", short: "bd", desc: "关掉当前 buffer", accept: [["<Space>", "b", "d"]] },
  { id: "t2", short: "bo", desc: "只留当前 buffer", accept: [["<Space>", "b", "o"]] },
  { id: "t3", short: "L", desc: "下一个 buffer", accept: [["L"], ["]", "b"]] },
];

/** 模拟 use-drill 的核心：模式 + 提示 + 按键 + 计分 */
function makeEngine(mode: Mode) {
  let session: Session = createSession("test", TASKS.map((t) => t.id));
  let buf: string[] = [];
  let hint: HintLevel = 0;
  let usedHint = false;
  const firstKeys = mergeFirstKeys(...TASKS.flatMap((t) => t.accept));

  const cur = () => TASKS.find((t) => t.id === currentTaskId(session)) ?? null;
  const best = () => cur()?.accept[0] ?? [];

  /** 题目区该显示什么（复刻 useDrill.shownKeys） */
  function shown(): (string | null)[] {
    return mode === "drill" ? best().map((k) => k) : hintedKeys(best(), hint);
  }

  /** 按 ? —— 提示键 */
  function pressHint() {
    usedHint = true;
    hint = nextHint(hint);
  }

  function press(key: string): "prefix" | "hit" | "none" | "ignored" {
    if (isDone(session)) return "ignored";
    const c = cur()!;
    if (!shouldTake(buf, firstKeys, key)) return "ignored";

    const next = [...buf, key];
    const r = classify(c.accept, next);

    if (r.kind === "prefix") {
      buf = next;
      return "prefix";
    }
    if (r.kind === "hit") {
      // ⚠️ 计分带上 usedHint 和 mode（复刻 useDrill.commit）
      session = record(session, {
        taskId: c.id,
        ok: true,
        ms: 100,
        usedHint,
        mode,
      });
      buf = [];
      hint = 0;
      usedHint = false;
      return "hit";
    }
    return "none";
  }

  return {
    press,
    pressHint,
    shown,
    get session() { return session; },
    get hint() { return hint; },
    get usedHint() { return usedHint; },
    get done() { return isDone(session); },
  };
}

describe("跟打模式 —— 显示解法，照着按", () => {
  it("题目区直接显示全部键", () => {
    const e = makeEngine("drill");
    expect(e.shown()).toEqual(["<Space>", "b", "d"]);
  });

  /**
   * ⚠️ 跟打模式**不计入熟练度** —— 照着按不能算「记住了」。
   */
  it("照抄答对 → correct 但 independent 为 0", () => {
    const e = makeEngine("drill");
    for (const k of ["<Space>", "b", "d"]) e.press(k);
    const sum = summarize(e.session, () => 3);
    expect(sum.correct).toBe(1);
    expect(sum.independent).toBe(0);
  });

  it("跟打模式下按提示键也没意义（本来就全显示了）", () => {
    const e = makeEngine("drill");
    e.pressHint();
    expect(e.shown()).toEqual(["<Space>", "b", "d"]); // 不变
  });
});

describe("默写模式 —— 先回忆，渐进给提示", () => {
  it("0 级全是空格子", () => {
    const e = makeEngine("recall");
    expect(e.shown()).toEqual([null, null, null]);
  });

  it("按一次 ? → 给首键", () => {
    const e = makeEngine("recall");
    e.pressHint();
    expect(e.shown()).toEqual(["<Space>", null, null]);
  });

  it("按两次 ? → 给首键 + 键数", () => {
    const e = makeEngine("recall");
    e.pressHint();
    e.pressHint();
    expect(e.shown()).toEqual(["<Space>", "·", "·"]);
  });

  it("按三次 ? → 给全部", () => {
    const e = makeEngine("recall");
    for (let i = 0; i < 3; i++) e.pressHint();
    expect(e.shown()).toEqual(["<Space>", "b", "d"]);
  });

  it("答对后提示归零（下一题重新开始）", () => {
    const e = makeEngine("recall");
    e.pressHint();
    expect(e.hint).toBe(1);
    for (const k of ["<Space>", "b", "d"]) e.press(k);
    expect(e.hint).toBe(0);
    expect(e.usedHint).toBe(false);
  });
});

describe("⚠️ 用过提示的题不能算独立答对", () => {
  it("默写 + 没提示 → independent 计入", () => {
    const e = makeEngine("recall");
    for (const k of ["<Space>", "b", "d"]) e.press(k);
    expect(summarize(e.session, () => 3).independent).toBe(1);
  });

  it("默写 + 按了 ? 才答对 → correct 但 independent 为 0", () => {
    const e = makeEngine("recall");
    e.pressHint(); // 看了一眼首键
    for (const k of ["<Space>", "b", "d"]) e.press(k);
    const sum = summarize(e.session, () => 3);
    expect(sum.correct).toBe(1);
    expect(sum.independent, "看了提示就不算真的记住").toBe(0);
  });

  it("同一轮里，没提示的和有提示的分开算", () => {
    const e = makeEngine("recall");
    // t1：独立答对（<Space>bd）
    for (const k of ["<Space>", "b", "d"]) e.press(k);
    // t2：看了提示才答对（<Space>bo）
    e.pressHint();
    for (const k of ["<Space>", "b", "o"]) e.press(k);
    // t3：独立答对，且走次解 ]b（次解也算对）
    e.press("]");
    e.press("b");

    const sum = summarize(e.session, () => 3);
    expect(sum.total).toBe(3);
    expect(sum.answered).toBe(3);
    expect(sum.correct, "三题都答对了").toBe(3);
    expect(sum.independent, "只有 t1 和 t3 算独立答对").toBe(2);
  });

  it("countsForProgress 和 summarize 的判据一致", () => {
    // 这条防的是「两套判据各算各的」——这个项目最常犯的错
    for (const mode of ["drill", "recall"] as Mode[]) {
      for (const usedHint of [false, true]) {
        const e = makeEngine(mode);
        if (usedHint) e.pressHint();
        for (const k of ["<Space>", "b", "d"]) e.press(k);
        const sum = summarize(e.session, () => 3);
        const expected = countsForProgress(mode, usedHint) ? 1 : 0;
        expect(
          sum.independent,
          `mode=${mode} usedHint=${usedHint} 时两套判据不一致`,
        ).toBe(expected);
      }
    }
  });
});

describe("提示对单键题的处理", () => {
  it("单键题不给提示按钮（给了等于给答案）", () => {
    expect(hintUseful(["L"])).toBe(false);
    expect(hintUseful(["<Space>", "b", "d"])).toBe(true);
  });

  it("单键题即使给了提示级别也显示得对", () => {
    expect(hintedKeys(["L"], 0)).toEqual([null]);
    expect(hintedKeys(["L"], 1)).toEqual(["L"]);
  });
});

/**
 * ⚠️ 回归测试：`/buffers` 的题目匹配。
 *
 * 我写 `commandFor` 时先试 `` `<Space>${t.key}` `` 再试 `t.key`，于是
 * `BUF_TASKS[0].key = "L"`（「下一个 buffer」）匹配到了
 * **`<Space>L`（LazyVim Changelog）** —— 数据集里真的有一个 `<Space>L`。
 *
 * 后果：第 1 题变成练「看更新日志」，而且**不报错**。
 * 这类「匹配到错的但看起来正常」的 bug 最难发现。
 */
describe("buffers 题目匹配（回归）", () => {
  const CMD_BY_DISPLAY = new Map(COMMANDS.map((c) => [c.display, c]));

  function commandFor(t: { key: string; desc: string }) {
    const bare = t.key;
    const led = `<Space>${t.key}`;
    const exact = CMD_BY_DISPLAY.get(bare);
    const l = CMD_BY_DISPLAY.get(led);
    return { exact, led: l };
  }

  it("L 是「下一个 buffer」，不是「LazyVim Changelog」", () => {
    const { exact } = commandFor({ key: "L", desc: "切到下一个 buffer" });
    expect(exact, "数据集里找不到 L").toBeDefined();
    expect(exact!.desc).toBe("Next Buffer");
  });

  it("数据集里确实同时存在 L 和 <Space>L（这就是坑的来源）", () => {
    expect(CMD_BY_DISPLAY.get("L")!.desc).toBe("Next Buffer");
    expect(CMD_BY_DISPLAY.get("<Space>L")!.desc).toBe("LazyVim Changelog");
    // 两者是**不同的命令**，不能混
    expect(CMD_BY_DISPLAY.get("L")!.id).not.toBe(CMD_BY_DISPLAY.get("<Space>L")!.id);
  });

  it("裸键题目不该被加上 leader 前缀去匹配", () => {
    // 这些题目的 key 是裸键，加 <Space> 会匹配到完全不相干的命令
    for (const bare of ["L", "H", "]B"]) {
      const exact = CMD_BY_DISPLAY.get(bare);
      expect(exact, `${bare} 应该能精确匹配到`).toBeDefined();
    }
  });

  it("带面板前缀的题目仍然能匹配（bd → <Space>bd）", () => {
    for (const key of ["bd", "bD", "bi", "bo", "bl", "br", "bP", "bp"]) {
      const led = CMD_BY_DISPLAY.get(`<Space>${key}`);
      expect(led, `<Space>${key} 应该能匹配到`).toBeDefined();
    }
  });
});
