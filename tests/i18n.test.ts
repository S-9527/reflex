import { describe, it, expect } from "vitest";
import { translate, translations, byKeyMode } from "../lib/i18n";
import { RAW } from "../lib/bindings";

describe("translate", () => {
  it("键级覆盖优先于 desc 级", () => {
    const old = byKeyMode["X|n"];
    byKeyMode["X|n"] = "按键级";
    translations["X"] = "desc 级";
    expect(translate("X", "n", "X")).toBe("按键级");
    delete byKeyMode["X|n"];
    delete translations["X"];
    expect(old).toBeUndefined();
  });

  it("未收录的 desc 原样返回英文(不猜、不空)", () => {
    expect(translate("<Space>zz", "n", "Some Unmapped Desc")).toBe("Some Unmapped Desc");
  });

  it("翻译表自身没有重复 key", () => {
    // 用 Object 长度对不上源文件的 key 数来发现重复。
    // 重复在 TS 里是编译错误,但只在同一文件内报;这里防的是
    // 「以为改了、其实改的是另一处」这种隐蔽覆盖。
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../lib/i18n.ts"),
      "utf8",
    );
    const literalKeys = [...src.matchAll(/^ {2}(".*?"): /gm)].map((m) => JSON.parse(m[1]));
    const uniq = new Set(literalKeys);
    expect(literalKeys.length).toBe(uniq.size);
  });

  it("中文描述里不该残留英文句子(排除白名单)", () => {
    // 这些是刻意保留英文的:命令名、插件内部标记、专有名词
    const WHITELIST = [
      "MiniPairs", "which_key_ignore", "vim.snippet", "Noice", "Trouble",
      "vim.lsp", "LazyVim", "Telescope", "FzfLua", "snippet",
    ];
    const untranslated = RAW.filter((b) => {
      if (translate(b.display, b.mode, b.desc) !== b.desc) return false; // 已翻译
      if (b.desc.trim().startsWith(":")) return false; // 裸 Ex 命令,故意不翻
      return !WHITELIST.some((w) => b.desc.includes(w));
    });
    const list = untranslated.map((b) => `${b.display} → ${b.desc}`);
    expect(list, `这些没翻译:\n${list.join("\n")}`).toEqual([]);
  });

  it("翻译覆盖率 ≥ 90%(裸 Ex 命令不计入)", () => {
    const den = RAW.filter((b) => !b.desc.trim().startsWith(":"));
    const num = den.filter((b) => translate(b.display, b.mode, b.desc) !== b.desc);
    const rate = num.length / den.length;
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });
});
