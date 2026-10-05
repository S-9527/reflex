import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSession, cursor, currentTaskId, record, isDone } from "../lib/session";

/**
 * `holdOnSolve` —— 答对后**停住等确认**，不自动翻页。
 *
 * ## 为什么需要
 *
 * qwerty 式打字流的核心是「命中即翻页」。但有一类板块的
 * **反馈本身就是要看的东西**：`/windows` 的键位模式（hydra）——
 * 按下去布局会变，用户得看清「这个键让窗口怎么动了」。
 *
 * 立刻翻页的话，效果还没看见就被下一题重置了。
 *
 * 旧版用 `advanceMs: 1600` 延迟翻页顶这个需求，但那是「等固定时长」：
 * 看不清的人来不及，看清的人白等。
 *
 * ## 这个文件守什么
 *
 * 1. 暂存结果时**游标不动**（题目不换 → 布局不重置）
 * 2. 确认后**补记一次**，游标才推进
 * 3. 记账（SRS）不受影响 —— 推迟的只是翻页
 */

const SRC = readFileSync(join(__dirname, "../lib/use-drill.ts"), "utf8");

describe("引擎侧：holdOnSolve 的实现", () => {
  it("有这个选项", () => {
    expect(SRC).toContain("holdOnSolve");
    expect(SRC, "该在 opts 类型里声明").toMatch(/holdOnSolve\?:\s*boolean/);
  });

  it("暂存的是**结果**，不是布尔标记", () => {
    /**
     * ⚠️ 游标推进就是 `sessionRecord(session, r)` ——
     *    推迟翻页 = 推迟这次 record。
     *    所以必须存结果本身，确认时补记。
     *    存布尔的话「补记什么」就丢了。
     */
    expect(SRC, "该暂存 Result").toMatch(/pendingResult.*Result \| null/);
  });

  it("hold 模式下 commit **不**立刻 record", () => {
    // commit 里该有一个提前 return 的分支
    const commitBody = SRC.match(/const commit = useCallback\([\s\S]*?\n  \);/);
    expect(commitBody, "找不到 commit").not.toBeNull();
    expect(commitBody![0], "该有 holdOnSolve 分支").toContain("if (holdOnSolve && ok)");
    // 那个分支里该暂存 + return（不走到 sessionRecord）
    expect(commitBody![0]).toMatch(/pendingResultRef\.current = r;[\s\S]{0,80}?return;/);
  });

  it("确认时补记 —— 游标才推进", () => {
    // keydown handler 里该有补记
    const confirm = SRC.match(/if \(pendingResultRef\.current\)[\s\S]{0,400}?\}/);
    expect(confirm, "找不到确认分支").not.toBeNull();
    expect(confirm![0], "该补记 sessionRecord").toContain("sessionRecord(prev, r)");
  });

  it("确认分支在**所有其它判断之前**（否则键会被下一题吃掉）", () => {
    const handler = SRC.match(/const onKey = \(e: KeyboardEvent\) => \{[\s\S]*?\n    \};/);
    expect(handler, "找不到 keydown handler").not.toBeNull();
    const body = handler![0];
    const confirmIdx = body.indexOf("pendingResultRef.current");
    const shouldTakeIdx = body.indexOf("shouldTake(");
    const classifyIdx = body.indexOf("classify(");
    expect(confirmIdx, "确认分支该存在").toBeGreaterThan(-1);
    expect(confirmIdx, "确认分支该在 shouldTake 之前").toBeLessThan(shouldTakeIdx);
    expect(confirmIdx, "确认分支该在 classify 之前").toBeLessThan(classifyIdx);
  });

  it("换题时清掉等确认状态（防止残留）", () => {
    const reset = SRC.match(/const resetTaskState = useCallback\([\s\S]*?\n  \}, \[\]\);/);
    expect(reset, "找不到 resetTaskState").not.toBeNull();
    expect(reset![0], "该清 pendingResult").toContain("setPendingResult(null)");
  });

  it("暴露 holding 给 UI（否则用户以为卡住了）", () => {
    expect(SRC).toMatch(/holding:\s*pendingResult !== null/);
  });
});

describe("会话层：推迟 record 的语义", () => {
  /** 复刻引擎的「暂存 → 确认 → 补记」流程 */
  function makeEngine(tasks: string[]) {
    let session = createSession("test", tasks);
    let pending: { taskId: string; ok: boolean; ms: number } | null = null;

    return {
      /** 答对 —— hold 模式下只暂存 */
      solve() {
        const id = currentTaskId(session)!;
        pending = { taskId: id, ok: true, ms: 100 };
      },
      /** 按任意键确认 —— 补记，游标推进 */
      confirm() {
        if (!pending) return;
        session = record(session, pending);
        pending = null;
      },
      get cursor() { return cursor(session); },
      get current() { return currentTaskId(session); },
      get holding() { return pending !== null; },
      get done() { return isDone(session); },
    };
  }

  it("答对后游标**不动**（题目不换 → 布局不重置）", () => {
    const e = makeEngine(["a", "b", "c"]);
    e.solve();
    expect(e.holding, "该处于等确认状态").toBe(true);
    expect(e.cursor, "游标不该动").toBe(0);
    expect(e.current, "当前题还是第一题").toBe("a");
  });

  it("确认后游标才推进", () => {
    const e = makeEngine(["a", "b", "c"]);
    e.solve();
    e.confirm();
    expect(e.holding).toBe(false);
    expect(e.cursor).toBe(1);
    expect(e.current).toBe("b");
  });

  it("连做三题：每题都要确认一次", () => {
    const e = makeEngine(["a", "b", "c"]);
    for (const want of ["a", "b", "c"]) {
      expect(e.current).toBe(want);
      e.solve();
      expect(e.holding).toBe(true);
      e.confirm();
    }
    expect(e.done).toBe(true);
  });

  it("没有待确认时 confirm 是空操作（不会误推进）", () => {
    const e = makeEngine(["a", "b"]);
    e.confirm();
    expect(e.cursor, "没答对就确认，不该动").toBe(0);
  });
});

describe("hydra 开了这个选项", () => {
  it("holdOnSolve: true", () => {
    const hydra = readFileSync(join(__dirname, "../app/windows/hydra.tsx"), "utf8");
    expect(hydra, "hydra 该开 holdOnSolve").toContain("holdOnSolve: true");
  });

  it("传了 holding 给 FlashLine", () => {
    const hydra = readFileSync(join(__dirname, "../app/windows/hydra.tsx"), "utf8");
    expect(hydra).toContain("holding={d.holding}");
  });

  it("其它板块**没有**开（默认还是命中即翻页）", () => {
    for (const f of ["buffers", "tabs", "files", "text", "ui", "diag", "search"]) {
      const src = readFileSync(join(__dirname, `../app/${f}/drill.tsx`), "utf8");
      expect(src, `${f} 不该开 holdOnSolve（打字流要连续）`).not.toContain("holdOnSolve");
    }
  });
});

describe("等确认时用户能看见提示", () => {
  const hydra = readFileSync(join(__dirname, "../app/windows/hydra.tsx"), "utf8");
  const ui = readFileSync(join(__dirname, "../lib/drill-ui.tsx"), "utf8");

  /**
   * ⚠️ 光在页面底部给提示是不够的。
   *
   * 答对后用户的视线在**布局**上（他在看效果），
   * 而 `FlashLine` 在页面底部 —— 那行字他看不到，会以为卡住了。
   * 所以题目区（视线落点附近）要有一个显眼的横幅。
   */
  it("hydra 在题目区有显眼的等确认横幅", () => {
    expect(hydra, "该有 data-holding-banner").toContain("data-holding-banner");
    expect(hydra, "该提示「按任意键继续」").toContain("按任意键继续");
  });

  it("横幅只在 holding 时出现", () => {
    expect(hydra).toMatch(/d\.holding && \(/);
  });

  it("FlashLine 也支持 holding（兜底，防漏）", () => {
    expect(ui).toMatch(/holding\?:\s*boolean/);
    expect(ui).toContain("data-holding");
  });
});
