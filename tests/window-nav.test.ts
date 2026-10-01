import { describe, it, expect } from "vitest";
import { windowNavDir } from "../lib/keys";

/** 造一个 KeyboardEvent 的最小替身 */
const K = (key: string, ctrlKey = false, altKey = false, metaKey = false) => ({
  key,
  ctrlKey,
  altKey,
  metaKey,
});

describe("windowNavDir —— 本机只有 <C-H/J/K/L>", () => {
  it("Ctrl+字母 → 对应方向(实测浏览器 key 是小写)", () => {
    // 实测 Playwright/Chromium:按 Ctrl+H → key === "h" ctrl === true
    expect(windowNavDir(K("h", true))).toBe("h");
    expect(windowNavDir(K("j", true))).toBe("j");
    expect(windowNavDir(K("k", true))).toBe("k");
    expect(windowNavDir(K("l", true))).toBe("l");
  });

  it("大写也认(部分浏览器带 shift)", () => {
    expect(windowNavDir(K("H", true))).toBe("h");
    expect(windowNavDir(K("J", true))).toBe("j");
  });

  it("⚠️ 裸 hjkl 一律不认 —— 本机 Normal 模式没有这些映射", () => {
    // 这是实测踩到的真bug:原来 /windows 把裸 hjkl 和方向键当窗口导航收下,
    // 结果在这里练 hjkl,回真 nvim 按 hjkl 只会移动光标。
    expect(windowNavDir(K("h"))).toBeNull();
    expect(windowNavDir(K("j"))).toBeNull();
    expect(windowNavDir(K("k"))).toBeNull();
    expect(windowNavDir(K("l"))).toBeNull();
    expect(windowNavDir(K("H"))).toBeNull();
  });

  it("⚠️ 方向键不认 —— 和 hjkl 一样只是移动光标", () => {
    expect(windowNavDir(K("ArrowLeft"))).toBeNull();
    expect(windowNavDir(K("ArrowUp"))).toBeNull();
  });

  it("Ctrl+H 可能被浏览器报成 Backspace(同一个字节 0x08)", () => {
    expect(windowNavDir(K("Backspace", true))).toBe("h");
  });

  it("不带 Backspace 的裸 Backspace 不认", () => {
    expect(windowNavDir(K("Backspace"))).toBeNull();
  });

  it("Alt/Meta 组合不认", () => {
    expect(windowNavDir(K("h", true, true))).toBeNull();
    expect(windowNavDir(K("h", true, false, true))).toBeNull();
  });

  it("别的 Ctrl 键不认(比如 Ctrl+W 是 which-key hydra,不是关窗口)", () => {
    expect(windowNavDir(K("w", true))).toBeNull();
    expect(windowNavDir(K("r", true))).toBeNull();
  });

  it("多字符 key 不认", () => {
    expect(windowNavDir(K("Enter", true))).toBeNull();
  });
});