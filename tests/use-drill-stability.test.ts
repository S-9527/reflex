import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ 回归测试：`useEffect` 依赖里不能有**不稳定**的回调。
 *
 * ## 这个测试是因为一个真实白屏才有的
 *
 * 报错：`Maximum update depth exceeded`（`/windows` 的键位模式整页崩）。
 *
 * 根因链：
 *
 * ```
 * 调用方写 onResetExtra: () => { zoomedRef.current = null }   ← 每次渲染新引用
 *   → 引擎的 effect 依赖里含 onResetExtra
 *   → 每次渲染依赖都"变了" → 跑 resetTaskState → setState
 *   → 再渲染 → 依赖又变 → … 无限循环
 * ```
 *
 * 引擎侧已改成走 ref（`onResetExtraRef`），调用方也包了 `useCallback`。
 * 这个测试从**源码层面**守住：那个回调不能再回到依赖数组里。
 */

const SRC = readFileSync(join(__dirname, "../lib/use-drill.ts"), "utf8");

describe("use-drill 的 effect 依赖稳定性", () => {
  /**
   * ⚠️ 核心断言：`onResetExtra` 不能出现在任何 `useEffect` 的依赖数组里。
   *
   * 它由调用方传入，几乎总是内联箭头函数 —— 引用每帧都变。
   */
  it("裸的 onResetExtra 不在 effect 依赖里（走 ref）", () => {
    // 找出所有 useEffect 的依赖数组
    const depArrays = [...SRC.matchAll(/\},\s*\[([^\]]*)\]\s*\);/g)].map((m) => m[1]);

    /**
     * ⚠️ 只排除**裸的** `onResetExtra`（引擎的 props 解构出来的那个）。
     *
     * `[opts.onResetExtra]` 是**允许**的 —— 那是「ref 同步 effect」，
     * 作用是「回调变了就把新值写进 ref」，而写 ref **不触发重渲染**，
     * 所以不会循环。我第一版把两者一起禁了，测试自己先红了。
     */
    const bad = depArrays.filter((d) =>
      d.split(",").map((x) => x.trim()).includes("onResetExtra"),
    );
    expect(bad, `裸的 onResetExtra 出现在依赖数组里：${bad.join(" | ")}`).toEqual([]);
  });

  it("确实用 ref 存了它", () => {
    expect(SRC, "该有 onResetExtraRef").toContain("onResetExtraRef");
    expect(SRC, "该同步 ref.current").toContain("onResetExtraRef.current =");
    expect(SRC, "该通过 ref 调用").toContain("onResetExtraRef.current?.()");
  });

  /**
   * ⚠️ 所有**外部回调**都该走 ref，不只是 onResetExtra。
   *
   * 12 个练习页里几乎每个都有内联箭头函数传进来 ——
   * 逐个改调用方是治标，引擎侧统一走 ref 才是治本。
   */
  it("apply / onOther / noEffectText / onResetExtra 四个都走 ref", () => {
    for (const name of ["applyRef", "onOtherRef", "noEffectTextRef", "onResetExtraRef"]) {
      expect(SRC, `缺 ${name}`).toContain(`const ${name} = useRef(`);
    }
  });

  it("ref 同步 effect 没有依赖数组（每次渲染都同步，且不触发重渲染）", () => {
    // 写 ref 不触发重渲染 → 这个 effect 本身不会造成循环。
    const sync = SRC.match(
      /applyRef\.current = apply;[\s\S]{0,200}?\}\);/,
    );
    expect(sync, "找不到 ref 同步 effect").not.toBeNull();
    // 它不该带依赖数组
    expect(sync![0], "ref 同步 effect 不该带依赖数组").not.toMatch(/\}, \[/);
  });
});

describe("调用方：传给 hook 的回调要稳定", () => {
  it("hydra 的 onResetExtra 是 useCallback 包过的", () => {
    const hydra = readFileSync(join(__dirname, "../app/windows/hydra.tsx"), "utf8");
    // 不能是内联箭头函数
    expect(hydra, "onResetExtra 不该写成内联箭头函数").not.toMatch(/onResetExtra:\s*\(\)\s*=>/);
    // 该引用一个稳定的东西
    expect(hydra, "onResetExtra 该引用 useCallback 的结果").toMatch(/onResetExtra:\s*resetZoom/);
    expect(hydra, "resetZoom 该用 useCallback 包").toMatch(/const resetZoom = useCallback\(/);
  });
});

describe("其它传给 hook 的回调", () => {
  /**
   * `apply` / `init` / `toPanelKey` / `noEffectText` 也进依赖数组。
   *
   * ⚠️ 它们同样有风险 —— 但引擎的 keydown effect 依赖的是 `apply`
   *    和 `noEffectText`（`commit` 也在里面）。
   *    调用方都用了 `useCallback`（有 eslint 的 exhaustive-deps 盯着），
   *    所以这里只记录「哪些回调进了依赖」，方便以后排查。
   */
  it("keydown effect 的依赖里**不含**外部回调（它们走 ref）", () => {
    const m = SRC.match(
      /\},\s*\[firstKeys,\s*toPanelKey[\s\S]{0,200}?\]\s*\);/,
    );
    expect(m, "找不到 keydown effect 的依赖数组").not.toBeNull();
    // 还在依赖里的（这些要么是稳定的，要么来自 props 且调用方包了 useCallback）
    expect(m![0]).toContain("firstKeys");
    expect(m![0]).toContain("toPanelKey");
    // ⚠️ 这四个**不能**在依赖里 —— 调用方几乎总是内联箭头函数
    for (const name of ["apply,", "onOther,", "noEffectText,", "onResetExtra,"]) {
      expect(m![0], `${name} 不该在 keydown effect 依赖里`).not.toContain(name);
    }
  });
});
