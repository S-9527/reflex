import { describe, it, expect } from "vitest";
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
