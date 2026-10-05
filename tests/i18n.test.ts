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
      // ⚠️ 空 desc 是**结构上翻不了**的,不是漏翻。
      //   新数据源不做过滤,所以会带进一批无描述的键
      //   （Vim 内建映射，插件没上报 desc）。它们的题干只能是空串。
      if (!b.desc.trim()) return false;
      if (translate(b.display, b.mode, b.desc) !== b.desc) return false; // 已翻译
      if (b.desc.trim().startsWith(":")) return false; // 裸 Ex 命令,故意不翻
      return !WHITELIST.some((w) => b.desc.includes(w));
    });
    const list = untranslated.map((b) => `${b.display} → ${b.desc}`);
    expect(list, `这些没翻译:\n${list.join("\n")}`).toEqual([]);
  });

  /**
   * ⚠️ 分母要排除**空 desc**。
   *
   * 旧数据集在抽取阶段就扔掉了无描述的键，所以分母天然干净。
   * 现在全量保留，空 desc 会把覆盖率拉低 —— 但它们本来就无法翻译。
   * 把分母限定为「有描述且不是裸 Ex 命令」的键，才是在测翻译表本身。
   */
  it("翻译覆盖率 ≥ 90%(空描述和裸 Ex 命令不计入)", () => {
    const den = RAW.filter((b) => b.desc.trim() && !b.desc.trim().startsWith(":"));
    const num = den.filter((b) => translate(b.display, b.mode, b.desc) !== b.desc);
    const rate = num.length / den.length;
    expect(rate, `${num.length}/${den.length} 已翻译`).toBeGreaterThanOrEqual(0.9);
  });

  it("空描述的键确实存在(新数据源全量保留的代价)", () => {
    // 这条不是「要修的问题」，是记录现状 —— 训练器要能处理空题干。
    const empty = RAW.filter((b) => !b.desc.trim());
    expect(empty.length).toBeGreaterThan(0);
  });
});
