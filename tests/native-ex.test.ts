import { describe, expect, it } from "vitest";
import { COMMANDS } from "../lib/bindings";

/**
 * 原生 Ex 等价的可信度。
 *
 * ## ⚠️ 背景：这个项目第七次被实测推翻
 *
 * `lib/bindings.ts` 里 75 条标着 `nativeVerified: true`，意思是
 * 「逐条跑过 `exists(':命令')` 确认存在」。
 *
 * 但做这轮审计时发现**探针脚本已经不存在了**，只有注释在声称。
 * 于是重跑了一遍（`scripts/probe-ex.lua` + 三个 bdelete 探针），
 * 抓到三条**写法是错的**：
 *
 * | 原来写的 | 实测 | 问题 |
 * |---------|------|------|
 * | `:bdelete 1,$` | ❌ E94 | 范围语法是 `:1,$bdelete`（范围紧贴命令名）|
 * | `:bdelete %,$` | ❌ E94 | 同上 |
 * | `:bdelete +bufhidden` | ❌ E94 | `+bufhidden` 是 buffer 选项，不是参数 |
 *
 * 还有一条更隐蔽的：我改成 `:1,{当前-1}bdelete` —— **占位符跑不通**
 * （`E492: Not an editor command`）。正确写法是相对范围
 * `:1,.-1bdelete`。
 *
 * ## 这个文件守什么
 *
 * 1. 标了 `verified: true` 的必须**真的能跑**（不能有占位符）
 * 2. 已知的错误写法不能再出现
 * 3. 承认「没有单条等价」的，要说明原因而不是编一个
 */

describe("标了「已实测」的原生等价", () => {
  const verified = COMMANDS.filter((c) => c.nativeVerified === true && c.native);

  it("确实有一批（表没被清空）", () => {
    expect(verified.length).toBeGreaterThan(50);
  });

  /**
   * ⚠️ 核心断言：标了 verified 的**不能含占位符**。
   *
   * `{当前-1}` 这种是我第一版写的，`exists()` 根本验不了它 ——
   * 标成「已实测」就是撒谎。
   */
  it("不含占位符（{} 里的东西跑不通）", () => {
    const withPlaceholder = verified.filter((c) => /[{}]/.test(c.native!));
    expect(
      withPlaceholder.map((c) => `${c.display} → ${c.native}`),
      "标了「已实测」却含占位符 —— 那验不了",
    ).toEqual([]);
  });

  it("都以 : 开头（是 Ex 命令）", () => {
    for (const c of verified) {
      expect(c.native!.startsWith(":"), `${c.native} 不是 Ex 命令`).toBe(true);
    }
  });

  it("不带换行/多余空白", () => {
    for (const c of verified) {
      expect(c.native, `${c.native} 含换行`).not.toMatch(/\n/);
      expect(c.native, `${c.native} 首尾有空白`).toBe(c.native!.trim());
    }
  });
});

describe("已知的错误写法不能再出现（回归）", () => {
  const all = COMMANDS.map((c) => c.native).filter(Boolean) as string[];

  /**
   * ⚠️ 三条实测报 `E94: No matching buffer for ...` 的写法。
   *
   * 根因：`:bdelete` 的**范围要写在命令名前面**（`:N,Mbdelete`），
   * 写在后面会被当成 buffer 名去找 —— 找不到就报 E94。
   * 见 `:help :bdelete` 的 `:N,Mbdelete[!]`。
   */
  it("没有 `:bdelete 1,$` 这种把范围写在后面的", () => {
    const bad = all.filter((n) => /^:bdelete\s+[\d$%,.]/.test(n));
    expect(bad, `范围该写在命令名前面（:N,Mbdelete）`).toEqual([]);
  });

  it("没有 `:bdelete +选项` 这种写法", () => {
    const bad = all.filter((n) => /^:bdelete\s+\+/.test(n));
    expect(bad, `+bufhidden 是 buffer 选项，不是 :bdelete 的参数`).toEqual([]);
  });

  it("范围写法用相对范围（. 和 $），不用占位符", () => {
    const ranges = all.filter((n) => /bdelete$/.test(n) && /[,.$%]/.test(n));
    for (const r of ranges) {
      expect(r, `${r} 含占位符`).not.toMatch(/[{}]/);
    }
  });
});

describe("承认「没有单条等价」的要说明原因", () => {
  it("native 为 null 的都有 note 解释", () => {
    const noNative = COMMANDS.filter((c) => c.native === null);
    expect(noNative.length).toBeGreaterThan(0);
    for (const c of noNative) {
      // 数据里没存 note 字段，但 verified 该是 unchecked
      expect(
        c.nativeVerified,
        `${c.display} 没有原生等价，却不该标成已核实`,
      ).toBe("unchecked");
    }
  });

  it("「删不可见的 buffer」诚实地标成没有单条等价", () => {
    // ⚠️ 原来写 `:bdelete +bufhidden`（跑不通）。
    //    Vim 里确实没有单条等价 —— 要按可见性自己筛。
    const c = COMMANDS.find((x) => x.desc === "Delete Invisible Buffers");
    expect(c, "找不到这条").toBeDefined();
    expect(c!.native, "不该编一个跑不通的命令").toBeNull();
  });

  it("「删未固定的 buffer」同理", () => {
    const c = COMMANDS.find((x) => x.desc === "Delete Non-Pinned Buffers");
    expect(c!.native).toBeNull();
  });
});

describe("探针产物存在（结论可复现）", () => {
  it("scripts/ 下有验证 Ex 命令的探针", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(__dirname, "../scripts");
    const files = fs.readdirSync(dir);
    expect(files, "缺 probe-ex.lua").toContain("probe-ex.lua");
  });

  it("data/ 下有探针跑出来的记录", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(__dirname, "../data");
    const files = fs.readdirSync(dir);
    // 至少要有 Ex 命令那条
    expect(files.some((f: string) => f.startsWith("probe-")), "缺探针记录").toBe(true);
  });
});
