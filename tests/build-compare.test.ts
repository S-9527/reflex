import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initial, run, shape, positions, split, type Layout } from "../lib/split";

/**
 * ⚠️ 搭建模式必须**并排画出「你的」和「目标」**。
 *
 * ## 这个文件是因为一次退化才有的
 *
 * 原来的 `split.tsx`（`577b2e1` 删掉的那个）里有个 `ShapeCompare`：
 *
 * ```
 * ┌────────┬────────┐
 * │  你的   │  目标   │
 * └────────┴────────┘
 * ```
 *
 * 我同化到统一引擎时只画了「你的布局」，目标只剩 `task.target`
 * 那个形状字符串 —— **用户看不见目标**，等于盲拼。
 *
 * 搭建模式练的就是「拼成目标那样」，看不见目标这页就没意义了。
 */

const SRC = readFileSync(join(__dirname, "../app/windows/build.tsx"), "utf8");

describe("搭建模式的对比视图", () => {
  it("有并排对比组件（不是只画一个）", () => {
    expect(SRC, "缺 CompareView").toContain("CompareView");
    expect(SRC, "该有两个缩略图（你的 / 目标）").toContain('data-mini');
  });

  it("对比视图同时接收 mine 和 target", () => {
    const m = SRC.match(/function CompareView\(\{[\s\S]{0,120}?\}/);
    expect(m, "找不到 CompareView 的参数").not.toBeNull();
    expect(m![0]).toContain("mine");
    expect(m![0]).toContain("target");
  });

  it("调用点传了目标的**实际布局**，不只是形状串", () => {
    const call = SRC.match(/<CompareView[\s\S]{0,200}?\/>/);
    expect(call, "找不到 CompareView 的调用").not.toBeNull();
    expect(call![0], "该传 targetLayout（实际布局）").toContain("targetLayout");
  });

  it("题目里存了目标的 Layout（不只是 shape 字符串）", () => {
    // shape() 只是个字符串，画不出图 —— 必须同时存 Layout
    const withTargetLayout = [...SRC.matchAll(/targetLayout:\s*run\(/g)];
    expect(withTargetLayout.length, "该有 4 道题都带 targetLayout").toBe(4);
  });

  it("形状对上时给明确的视觉反馈", () => {
    expect(SRC, "该提示「形状已对上」").toContain("形状已对上");
  });
});

describe("目标布局是可画的（数据完整）", () => {
  /**
   * ⚠️ `run()` 返回的 Layout 必须能画出分屏树。
   *
   * 如果目标的 Layout 是空的或只有一个窗口，对比图就是废的。
   */
  const SOLUTIONS = [
    [{ dir: "v" as const }],
    [{ dir: "h" as const }],
    [{ dir: "v" as const }, { dir: "v" as const }],
    [{ dir: "v" as const }, { go: "l" as const }, { dir: "h" as const }],
  ];

  it("每道题的目标都有 ≥2 个窗口（不然不用搭）", () => {
    for (const sol of SOLUTIONS) {
      const l = run(sol).layout;
      const n = positions(l.root).size;
      expect(n, `${JSON.stringify(sol)} 的目标只有 ${n} 个窗口`).toBeGreaterThanOrEqual(2);
    }
  });

  it("目标布局的坐标是合法的（0~1 之间）", () => {
    for (const sol of SOLUTIONS) {
      const l = run(sol).layout;
      for (const [, p] of positions(l.root)) {
        for (const v of [p.r0, p.r1, p.c0, p.c1]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("起始状态（1 个窗口）≠ 任何目标", () => {
    const start = initial();
    for (const sol of SOLUTIONS) {
      expect(shape(start), `起始不该等于 ${JSON.stringify(sol)} 的目标`).not.toBe(
        shape(run(sol).layout),
      );
    }
  });

  it("对比图能区分「你的」和「目标」（形状不同时）", () => {
    // 起始（1 窗口）和目标（2+ 窗口）形状一定不同
    const startShape = shape(initial());
    for (const sol of SOLUTIONS) {
      expect(startShape).not.toBe(shape(run(sol).layout));
    }
  });
});
