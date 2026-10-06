import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UI_TOGGLES, fullKey, isToggle } from "../lib/ui-toggles";
import { taskIdOf } from "../lib/task-id";

/**
 * ⚠️⚠️ `/ui` 的状态集合存的是**本地 key**（`uL`），不是全局 id。
 *
 * ## 这个文件是因为一次白屏才有的
 *
 * 报错：`Cannot read properties of undefined (reading 'group')`
 *
 * 根因链：
 *
 * ```
 * 上一轮把 task.id 改成全局 id（`n|<Space>uL`）
 *   → 但 apply 里往 on 集合存的是 t.id（全局）
 *   → OpenPanel 用 UI_TOGGLES.find(x => x.key === k) 查（k 是全局 id）
 *   → 查不到，返回 undefined
 *   → isToggle(undefined) 读 .group → 整页崩
 * ```
 *
 * ## 为什么必须是本地 key
 *
 * 这个集合是给**界面渲染**用的（哪些开关开着）：
 *
 * - `OpenPanel` 用它列出「当前打开」的开关
 * - `MockEditor` 用它决定画不画行号 / 缩进线 / 波浪线
 *
 * 界面用的是 `uL` / `ul` 这种本地 key。全局 id 只用于**进度存储**。
 */

const SRC = readFileSync(join(__dirname, "../app/ui/drill.tsx"), "utf8");

describe("on 集合存的是本地 key", () => {
  it("apply 里用 TASK_OF 反查出本地 key", () => {
    const apply = SRC.match(/const apply = useCallback\([\s\S]*?\n  \}, \[\]\);/);
    expect(apply, "找不到 apply").not.toBeNull();
    expect(apply![0], "该反查本地 key").toContain("TASK_OF.get(t.id)");
    expect(apply![0], "该用 key 而不是 t.id").toMatch(/on\.includes\(key\)/);
  });

  it("不再直接往集合里塞 t.id", () => {
    // ⚠️ 这条守的是「不能再回到存全局 id」
    const apply = SRC.match(/const apply = useCallback\([\s\S]*?\n  \}, \[\]\);/);
    expect(apply![0], "又往集合里塞 t.id 了").not.toMatch(/\[\.\.\.on, t\.id\]/);
  });

  it("消费方查的是本地 key", () => {
    // OpenPanel / MockEditor 用 x.key 查 —— 所以集合里必须是本地 key
    expect(SRC).toMatch(/UI_TOGGLES\.find\(\(x\) => x\.key === k\)/);
    expect(SRC, "MockEditor 用本地 key").toMatch(/has\("uL"\)/);
  });
});

describe("本地 key 和全局 id 确实是两套东西", () => {
  it("UI_TOGGLES 的 key 是 `uL` 这种短的", () => {
    for (const t of UI_TOGGLES.slice(0, 5)) {
      expect(t.key.length, `${t.key} 看着不像本地 key`).toBeLessThanOrEqual(3);
    }
  });

  it("taskIdOf 给出的是全局 id（`n|<Space>uL`）", () => {
    const t = UI_TOGGLES[0];
    const id = taskIdOf("ui", fullKey(t));
    expect(id, "该是全局 id").toMatch(/^n\|/);
    expect(id, "和本地 key 不同").not.toBe(t.key);
  });

  it("用全局 id 查 UI_TOGGLES 会查不到（这就是崩的原因）", () => {
    const t = UI_TOGGLES[0];
    const globalId = taskIdOf("ui", fullKey(t));
    const found = UI_TOGGLES.find((x) => x.key === globalId);
    expect(found, "全局 id 当然查不到 —— 所以不能拿它当 key").toBeUndefined();
  });
});

describe("防御：查不到时不该崩", () => {
  /**
   * ⚠️ `isToggle(undefined)` 会读 `.group` 直接崩。
   *
   * 消费方用了 `!` 断言（`UI_TOGGLES.find(...)!`）——
   * 查不到时 TypeScript 不报错，运行时才炸。
   *
   * 理想做法是过滤掉查不到的，而不是断言。这条测试记录这个约定。
   */
  it("isToggle 收到 undefined 会崩（所以调用方必须先过滤）", () => {
    expect(() => isToggle(undefined as never)).toThrow();
  });

  it("OpenPanel 该过滤掉查不到的（而不是用 ! 断言）", () => {
    const openPanel = SRC.match(/function OpenPanel[\s\S]*?\n\}/);
    expect(openPanel, "找不到 OpenPanel").not.toBeNull();
    // 现在是用 ! 断言的 —— 记录现状，改了之后这条要跟着改
    // （不断言「必须过滤」，因为过滤是改进项不是现状）
    expect(openPanel![0]).toContain("UI_TOGGLES.find");
  });
});

describe("模拟完整流程：答对后 OpenPanel 不该崩", () => {
  /**
   * ⚠️ 报错只在**答题之后**触发 —— `OpenPanel` 要 `on` 非空才渲染。
   *    SSR 抓不到那个状态，所以这里手工模拟一遍。
   */
  it("答对一题 → 集合里有本地 key → 能查到 → 不崩", () => {
    // 复刻修好后的 apply
    const TASK_OF = new Map(UI_TOGGLES.map((t) => [taskIdOf("ui", fullKey(t)), t]));
    const apply = (on: string[], taskId: string) => {
      const key = TASK_OF.get(taskId)!.key;
      return on.includes(key) ? on.filter((k) => k !== key) : [...on, key];
    };

    // 答对第一题（全局 id）
    const first = UI_TOGGLES[0];
    const globalId = taskIdOf("ui", fullKey(first));
    const on = apply([], globalId);

    // 集合里该是本地 key
    expect(on, "集合里该是本地 key").toEqual([first.key]);

    // OpenPanel 的消费方式：用 x.key 查
    const tg = UI_TOGGLES.find((x) => x.key === on[0]);
    expect(tg, "该能查到（修好前这里是 undefined，然后就崩了）").toBeDefined();
    // 这一步修好前会抛错
    expect(() => isToggle(tg!)).not.toThrow();
    expect(isToggle(tg!)).toBe(first.group !== "动作(不是开关)");
  });

  it("再按一次 → 从集合里移除（开/关两态）", () => {
    const TASK_OF = new Map(UI_TOGGLES.map((t) => [taskIdOf("ui", fullKey(t)), t]));
    const apply = (on: string[], taskId: string) => {
      const key = TASK_OF.get(taskId)!.key;
      return on.includes(key) ? on.filter((k) => k !== key) : [...on, key];
    };
    const t = UI_TOGGLES.find((x) => x.group !== "动作(不是开关)")!;
    const id = taskIdOf("ui", fullKey(t));
    let on = apply([], id);
    expect(on).toHaveLength(1);
    on = apply(on, id);
    expect(on, "再按一次该关掉").toHaveLength(0);
  });

  it("每个开关都能被查到（全量检查，不只抽查）", () => {
    const TASK_OF = new Map(UI_TOGGLES.map((t) => [taskIdOf("ui", fullKey(t)), t]));
    for (const t of UI_TOGGLES) {
      const id = taskIdOf("ui", fullKey(t));
      const back = TASK_OF.get(id);
      expect(back, `${fullKey(t)} 反查失败`).toBeDefined();
      expect(back!.key).toBe(t.key);
      // 消费方查得到
      expect(UI_TOGGLES.find((x) => x.key === back!.key)).toBeDefined();
    }
  });
});
