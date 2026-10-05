import { describe, expect, it } from "vitest";
import { COMMANDS } from "../lib/bindings";
import { boardCoveredIds, coveredByBoard, BOARDS } from "../lib/boards";

/**
 * 跨页面去重 —— 「同一条命令不该在两个页面各练一遍」。
 *
 * ## 发现的问题
 *
 * `/seq` 的描述是「**其余**全部键位」，但实测它和专门页面重复了 70 条：
 *
 * ```
 * <Space>u*  界面开关    24 条
 * diag        诊断       18 条
 * <Space>f*   文件查找    10 条
 * buffers     缓冲区       8 条
 * <Space><Tab>*  标签页     7 条
 * ```
 *
 * 进度 id 已经统一（练哪边都算，不会算两条），但**题量虚高** ——
 * 用户在 `/seq` 看到 243 条，其中 70 条已经在别的页面练过了。
 */

const WINDOW_NAV =
  /^(Go to (Left|Right|Upper|Lower) Window|Split Window|Delete Window|Move (Up|Down)|(Increase|Decrease) Window)/;

/** `/seq` 实际的池子（复刻 app/seq/page.tsx 的逻辑） */
function seqPool() {
  const covered = boardCoveredIds(COMMANDS);
  return COMMANDS.filter((c) => !WINDOW_NAV.test(c.desc) && !covered.has(c.id));
}

describe("去重效果", () => {
  it("/seq 池子从 243 降到 173", () => {
    expect(seqPool().length).toBe(173);
  });

  it("排除的 70 条都是真的被别的页面覆盖了", () => {
    const covered = boardCoveredIds(COMMANDS);
    const pool = COMMANDS.filter((c) => !WINDOW_NAV.test(c.desc));
    const excluded = pool.filter((c) => covered.has(c.id));
    expect(excluded.length).toBe(70);
    // 每一条都得能在某个板块的题库里找到出处
    const byDisplay = coveredByBoard();
    for (const c of excluded) {
      const hit = byDisplay.has(c.display) || c.alternates.some((a) => byDisplay.has(a));
      expect(hit, `${c.display} 被排除了，但找不到它属于哪个板块`).toBe(true);
      // 且必须指向一个真实板块
      const disp = byDisplay.has(c.display) ? c.display : c.alternates.find((a) => byDisplay.has(a))!;
      expect(BOARDS.map((b) => b.id)).toContain(byDisplay.get(disp));
    }
  });

  it("保留的都不在任何专门页面的题库里", () => {
    const byDisplay = coveredByBoard();
    for (const c of seqPool()) {
      expect(byDisplay.has(c.display), `${c.display} 该被排除却留下了`).toBe(false);
      for (const a of c.alternates) {
        expect(byDisplay.has(a), `${c.display} 的次解 ${a} 已被覆盖`).toBe(false);
      }
    }
  });

  /**
   * ⚠️ 回归测试：hydra 面板键**不能**当成全局键。
   *
   * 我第一版把 `/windows` 的题按 `t.key`（裸面板键）加进去，
   * 于是面板里的 `H` / `>` 把**全局**的 `H`（上一个 buffer）
   * 和 `>`（缩进）也标记成「被覆盖」—— 这是两回事：
   * 面板键只在 `<Space><Space>` 进入面板后才存在。
   */
  it("hydra 面板键不误伤同名全局键", () => {
    const covered = boardCoveredIds(COMMANDS);
    // 全局的 `>` 和 `<` 不该被排除
    for (const disp of [">", "<"]) {
      const c = COMMANDS.find((x) => x.display === disp);
      if (!c) continue;
      expect(covered.has(c.id), `全局的 ${disp} 被 hydra 面板键误伤了`).toBe(false);
    }
    // 但完整三段式 `<Space>w>` 属于 hydra
    const byDisplay = coveredByBoard();
    expect(byDisplay.get("<Space>w>")).toBe("windows-hydra");
  });

  it("H / L 确实被 buffers 排除（它们是 buffer 的题）", () => {
    const covered = boardCoveredIds(COMMANDS);
    for (const disp of ["H", "L"]) {
      const c = COMMANDS.find((x) => x.display === disp)!;
      expect(covered.has(c.id), `${disp} 该被 buffers 排除`).toBe(true);
    }
  });
});

describe("保留的键位仍然覆盖到该练的东西", () => {
  it("搜索、git、跳转这些没有专门页面的族都留着", () => {
    const kept = new Set(seqPool().map((c) => c.group));
    for (const g of ["search", "git", "goto", "next", "prev", "code", "visual", "insert"]) {
      expect(kept.has(g), `${g} 整个族都被排除了？应该保留`).toBe(true);
    }
  });

  it("四种形态都还有题（没有哪个形态被清空）", () => {
    const shapes: Record<string, number> = {};
    for (const c of seqPool()) {
      const s = c.display.startsWith("<Space>")
        ? "leader"
        : /^<(C|M)-/.test(c.display)
          ? "ctrl"
          : /^[[\]]/.test(c.display)
            ? "brackets"
            : "bare";
      shapes[s] = (shapes[s] ?? 0) + 1;
    }
    for (const s of ["leader", "ctrl", "brackets", "bare"]) {
      expect(shapes[s], `${s} 形态一条题都没有了`).toBeGreaterThan(0);
    }
  });

  it("池子没有重复 id", () => {
    const ids = seqPool().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
