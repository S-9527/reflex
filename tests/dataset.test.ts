import { describe, it, expect } from "vitest";
import { RAW, LEVEL_NAMES } from "../lib/bindings";
import { DEMOTED } from "../scripts/build-dataset.mjs";

const byDisplay = new Map(RAW.map((b) => [b.display, b]));

describe("关卡分级", () => {
  it("第 1 关含完整窗口闭环:创建 → 跳转 → 关闭 → 缩放", () => {
    const l1 = RAW.filter((b) => b.level === 1);
    // 用集合比较,不用有序数组 —— 顺序只是 sort() 的结果,不是契约。
    // (手写顺序时踩过:`|` 是 0x7C,排在所有字母之后)
    expect(new Set(l1.map((b) => b.display))).toEqual(
      new Set(["<C-H>", "<C-J>", "<C-K>", "<C-L>", "<Space>-", "<Space>|", "<Space>wd", "<Space>wm"]),
    );
  });

  it("第 1 关必须有能创建窗口的键(能跳却不能创建,逻辑上不成立)", () => {
    // 实测踩过:LazyVim 16 的分屏键是 <Space>| 和 <Space>-,
    // 不匹配任何 leader 子树,掉进 leader-other 兜底桶排到第 10 关。
    // 结果第 1 关叫「窗口」却一个创建键都没有。
    const l1 = RAW.filter((b) => b.level === 1);
    const creates = l1.filter((b) => /Split Window/.test(b.desc));
    expect(creates.length, "第 1 关没有创建窗口的键").toBeGreaterThanOrEqual(2);
    // 且必须同时有左右和上下两种
    expect(creates.some((b) => /Right/.test(b.desc))).toBe(true);
    expect(creates.some((b) => /Below/.test(b.desc))).toBe(true);
  });

  it("所有分屏键都在第 1 关,不在兜底桶里", () => {
    for (const b of RAW.filter((x) => /Split Window/.test(x.desc))) {
      expect(b.level, `${b.display} 是分屏键,应该在第 1 关`).toBe(1);
      expect(b.group, `${b.display} 归到了错的组`).toBe("window");
    }
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
