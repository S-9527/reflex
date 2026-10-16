import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldIntercept, firstKeySet, normalize, splitLhs } from "../lib/keys";
import { RAW } from "../lib/bindings";

/**
 * 按键接管的边界。
 *
 * 这些断言都来自**实测**:无条件 preventDefault 之后,
 * Tab 焦点被劫持、Ctrl+R 刷新被拦、F12 开发工具被拦 ——
 * 而这些键数据集里根本没有,按了只会白得一次"判错"。
 */

const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) }));
const FIRST = firstKeySet(BINDINGS);

describe("firstKeySet", () => {
  it("包含多键序列的第一键", () => {
    expect(FIRST.has("<Space>")).toBe(true); // <Space>ff 等
    expect(FIRST.has("g")).toBe(true); // gr/grn/gri
    expect(FIRST.has("<C-")).toBe(false); // <C-H> 是单键键名,不拆
  });

  it("包含本身就是单键的绑定", () => {
    expect(FIRST.has("j")).toBe(true);
  });

  it("不含二键以上的中间键(那些只有在前缀匹配后才相关)", () => {
    // "f" 之所以在里面,是因为有单键绑定用到它;
    // 断言的是"集合里全是单键记法",不是"只含第一键"
    for (const k of FIRST) {
      expect(k.length).toBeGreaterThan(0);
      // 单键记法要么是一个可打印字符,要么是完整的 <...> 记号
      expect(k.length === 1 || k.startsWith("<")).toBe(true);
    }
  });
});

describe("shouldIntercept", () => {
  const ev = (key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

  it("数据集里的键:接管", () => {
    // <Space> 是 <Space>ff 等序列的第一键
    const k = normalize(ev(" "))!;
    expect(shouldIntercept(k.vim, FIRST)).toBe(true);
  });

  it("数据集里的 Ctrl 组合:接管(否则 Ctrl+W 会关标签页)", () => {
    for (const ch of ["h", "j", "k", "l", "w", "f", "s", "b"]) {
      const k = normalize(ev(ch, { ctrlKey: true }))!;
      expect(shouldIntercept(k.vim, FIRST), `<C-${ch.toUpperCase()}> 应该接管`).toBe(true);
    }
  });

  it("数据集里没有的浏览器保留键:放行", () => {
    // F1~F12 —— F5 刷新、F12 开发工具。数据集里没有,实测曾被无条件拦截。
    for (const f of ["F1", "F5", "F11", "F12"]) {
      expect(shouldIntercept(normalize(ev(f))!.vim, FIRST), `${f} 应该放行`).toBe(false);
    }
    // Ctrl+R / Ctrl+P / Ctrl+N —— 刷新 / 打印 / 新窗口
    for (const ch of ["r", "p", "n"]) {
      expect(shouldIntercept(normalize(ev(ch, { ctrlKey: true }))!.vim, FIRST), `<C-${ch.toUpperCase()}> 应该放行`).toBe(
        false,
      );
    }
  });

  it("<Tab> 在数据集里,所以要接管 —— 这是取舍不是 bug", () => {
    // 数据集里有一条 <Tab>(snippet 跳转),所以拦它才能练。
    // 代价:Tab 焦点导航被劫持。想用键盘导航要改配置,见 excludeFirstKeys。
    expect(FIRST.has("<Tab>")).toBe(true);
    expect(shouldIntercept(normalize(ev("Tab"))!.vim, FIRST)).toBe(true);
  });

  it("excludeFirstKeys 能把某个键从接管集里去掉(给键盘导航用)", () => {
    const reduced = new Set([...FIRST].filter((k) => k !== "<Tab>"));
    expect(shouldIntercept("<Tab>", reduced)).toBe(false);
    expect(shouldIntercept("<Space>", reduced)).toBe(true); // 其他不受影响
  });

  it("纯浏览器快捷键:放行", () => {
    // Ctrl+T 开新标签页 —— 数据集里没有 <C-T>
    expect(shouldIntercept(normalize(ev("t", { ctrlKey: true }))!.vim, FIRST)).toBe(false);
    // Ctrl+P 打印
    expect(shouldIntercept(normalize(ev("p", { ctrlKey: true }))!.vim, FIRST)).toBe(false);
  });

  it("空集合时一律放行(数据没加载完不能乱拦)", () => {
    expect(shouldIntercept("<Space>", new Set())).toBe(false);
  });
});

/**
 * ⚠️⚠️ `<C-R>` 的记法必须是**大写** —— 用户报「按 `<C-r>` 会跳回第一关」。
 *
 * ## 现象
 *
 * `/core` 里有一道题是 `<C-R>`（重做）。按下去**页面刷新了**，
 * 表现为「回到了第 1 关」。那不是跳关，是 Ctrl+R 的浏览器默认行为
 * （reload）没被拦下来。
 *
 * ## 根因
 *
 * `defaultToPanelKey` 原来只查一张特殊键表，其余 `return e.key`：
 *
 * ```
 * 按 Ctrl+R → e.key === "r" → 返回 "r"
 * ```
 *
 * 而数据集里是 `<C-R>` —— `"r"` 永远匹配不上 → `shouldTake` = false
 * → 不接管 → `preventDefault` 没被调用 → 浏览器刷新。
 *
 * 实测（headless chromium 抓 keydown）：
 *
 * ```
 * [{"key":"r","ctrl":true,"prevented":false}]    ← 没拦
 * [{"key":"r","ctrl":true,"prevented":true}]     ← 修好后
 * ```
 *
 * ## 为什么大写
 *
 * nvim 报的规范写法就是大写（实测 `nvim_get_keymap`）：
 *
 * ```
 * desc=redo       lhs="<C-R>"
 * desc=halfdown   lhs="<C-D>"
 * ```
 *
 * 而 `normalize()` 也产大写 —— 两边一致才能匹配上。
 */
describe("Ctrl 记法：大写才匹配得上（<C-r> 刷新页面的根因）", () => {
  const ev = (key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

  it("Ctrl + 字母 → 大写记法", () => {
    for (const [ch, want] of [
      ["r", "<C-R>"],
      ["d", "<C-D>"],
      ["u", "<C-U>"],
      ["v", "<C-V>"],
      ["o", "<C-O>"],
      ["i", "<C-I>"],
      ["w", "<C-W>"],
      ["f", "<C-F>"],
      ["b", "<C-B>"],
      ["y", "<C-Y>"],
      ["e", "<C-E>"],
    ] as const) {
      expect(normalize(ev(ch, { ctrlKey: true }))!.vim, `Ctrl+${ch} 该产大写`).toBe(want);
    }
  });

  /**
   * ⚠️ 端到端判据：归一化产 `<C-R>`，题目解法里也是 `<C-R>`，
   *    于是 `shouldIntercept` 接管 —— 浏览器刷新就不会发生。
   */
  it("题目解法里有 <C-R> 时会被接管（这就是不再刷新的原因）", () => {
    const firstKeys = new Set(["<C-R>"]);
    const pressed = normalize(ev("r", { ctrlKey: true }))!.vim;
    expect(pressed).toBe("<C-R>");
    expect(
      shouldIntercept(pressed, firstKeys),
      "按 Ctrl+R 没被接管 —— 浏览器会执行刷新，表现为「跳回第一关」",
    ).toBe(true);
  });

  it("小写记法永远匹配不上（说明为什么必须大写）", () => {
    const lowered = normalize(ev("r", { ctrlKey: true }))!.vim.toLowerCase();
    expect(
      shouldIntercept(lowered, new Set(["<C-R>"])),
      "小写居然能匹配上？那大写归一化就没意义了",
    ).toBe(false);
  });

  it("Ctrl + 非字母（<C-/>）不受大写规则影响", () => {
    expect(normalize(ev("/", { ctrlKey: true }))!.vim).toBe("<C-/>");
  });
});

/**
 * ⚠️⚠️ 源码级断言：`defaultToPanelKey` **必须走 `normalize()`**。
 *
 * ## 为什么不能只测 `normalize`
 *
 * 上面那组测试全是测 `normalize()` 的 —— 但用户报的 bug 出在
 * **`use-drill.ts` 里的 `defaultToPanelKey`**：它当时自己写了一张
 * 特殊键表，其余 `return e.key`，于是 Ctrl+R 被记成 `"r"`。
 *
 * 实测确认这个盲区：把 `defaultToPanelKey` 换成旧实现（bug），
 * 上面 14 条测试**全绿** —— 因为它们测的是 `normalize`，不是这个函数。
 *
 * `lib/use-drill.ts` 用了 `@/` 别名，vitest 里 import 不了
 * （会报 `Cannot find package '@/lib/drill'`），所以这里读源码断言。
 */
describe("源码级：defaultToPanelKey 必须复用 normalize", () => {
  const SRC = readFileSync(join(__dirname, "../lib/use-drill.ts"), "utf8");

  it("它调用了 normalize，而不是自己写一张特殊键表", () => {
    const fn = SRC.match(/export function defaultToPanelKey\([\s\S]{0,600}?\n\}/);
    expect(fn, "找不到 defaultToPanelKey 的实现").not.toBeNull();
    expect(
      fn![0],
      "defaultToPanelKey 必须走 normalize() —— 自己查表会让 Ctrl+字母全错",
    ).toContain("normalize(");
    /**
     * ⚠️ 不能有「其余一律 return e.key」那种兜底 ——
     *    那正是 Ctrl+R 被记成 `"r"`、浏览器刷新的根因。
     */
    expect(
      fn![0],
      "defaultToPanelKey 里不该再有 e.key 直通兜底",
    ).not.toMatch(/return\s+e\.key\s*;/);
  });
});
