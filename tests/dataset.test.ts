import { describe, it, expect } from "vitest";
import { RAW, LEVEL_NAMES } from "../lib/bindings";
import { DEMOTED } from "../scripts/build-dataset.mjs";

const byDisplay = new Map(RAW.map((b) => [b.display, b]));

describe("关卡分级", () => {
  it("第 1 关只含高价值键:窗口导航 + 关闭 + 缩放", () => {
    const l1 = RAW.filter((b) => b.level === 1);
    const displays = l1.map((b) => b.display).sort();
    expect(displays).toEqual([
      "<C-H>",
      "<C-J>",
      "<C-K>",
      "<C-L>",
      "<Space>wd",
      "<Space>wm",
    ]);
  });

  it("调整大小的 4 条确实在降级名单里,且真的被降到 9", () => {
    for (const [key, level] of Object.entries(DEMOTED)) {
      const b = byDisplay.get(key);
      expect(b, `降级名单里的 ${key} 应该在数据集里`).toBeDefined();
      expect(b!.level, `${key} 应该被降到第 ${level} 关`).toBe(level);
    }
  });

  it("降级名单里的键不留在第 1 关", () => {
    for (const key of Object.keys(DEMOTED)) {
      expect(byDisplay.get(key)!.level).not.toBe(1);
    }
  });

  it("没有降级名单指向不存在的键(改了名单忘了跑脚本会报这条)", () => {
    for (const key of Object.keys(DEMOTED)) {
      expect(byDisplay.has(key), `降级名单里的 ${key} 不在数据集中,可能已改名`).toBe(true);
    }
  });

  it("每一关都有名字(关卡按钮显示的是 LEVEL_NAMES)", () => {
    for (const lv of new Set(RAW.map((b) => b.level))) {
      expect(LEVEL_NAMES[lv], `第 ${lv} 关缺名字`).toBeDefined();
    }
  });

  it("没有空关卡(否则关卡按钮点了没反应)", () => {
    const levels = [...new Set(RAW.map((b) => b.level))].sort((a, b) => a - b);
    for (let i = 1; i < levels.length; i++) {
      // 允许跳号(比如没有 9 就从 8 到 10),但不允许有号没内容
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(2);
    }
  });
});
