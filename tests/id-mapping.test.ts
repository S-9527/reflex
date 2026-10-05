import { describe, expect, it } from "vitest";
import { COMMANDS } from "../lib/bindings";
import { BUF_TASKS } from "../lib/bufs";
import { TAB_TASKS } from "../lib/tabs";
import { UI_TOGGLES, fullKey } from "../lib/ui-toggles";
import { DIAG_KEYS, fullKey as diagFullKey } from "../lib/diagnostics";
import { FILE_TASKS } from "../lib/files";
import { TASKS as WIN_TASKS, findKey } from "../lib/winkeys";
import { SPEC } from "../lib/textobj";
import { taskIdOf } from "../lib/task-id";

/**
 * 各板块的题目能不能映射到 `COMMANDS` 的全局 id。
 *
 * ## 为什么要测这个
 *
 * 进度是**全局一张表**（`lib/srs.ts`），key 是 task id。
 * 但各板块现在用**本地 id**：
 *
 * ```
 * /buffers  →  "L#0"          （题库下标）
 * /seq      →  "n|L"          （COMMANDS 的全局 id）
 * ```
 *
 * 同一条命令（「下一个 buffer」）在两个页面练，会被记成**两条独立进度** ——
 * 复习队列会重复出题，首页统计也虚高。
 *
 * 这个测试量化「有多少能映射过去」，作为统一 id 的依据。
 */

const BY_DISPLAY = new Map<string, (typeof COMMANDS)[number]>();
for (const c of COMMANDS) {
  BY_DISPLAY.set(c.display, c);
  for (const a of c.alternates) BY_DISPLAY.set(a, c);
}

/** 尝试把一个键序列映射到全局命令 id */
function globalId(display: string): string | null {
  return BY_DISPLAY.get(display)?.id ?? null;
}

describe("buffers 板块", () => {
  it("每道题都能映射到全局 id", () => {
    const miss: string[] = [];
    for (const t of BUF_TASKS) {
      // 两种都试：裸键（L / H / ]B）和面板键（bd → <Space>bd）
      if (!globalId(t.key) && !globalId(`<Space>${t.key}`)) miss.push(t.key);
    }
    expect(miss, `这些映射不过去：\n${miss.join("\n")}`).toEqual([]);
  });
});

describe("tabs 板块", () => {
  it("每道题都能映射到全局 id（真实键带 <Space> 前缀）", () => {
    const miss: string[] = [];
    for (const t of TAB_TASKS) {
      // ⚠️ 真实 lhs 是 `<Space><Tab>d`，题库里写的是 `<Tab>d`
      if (!globalId(`<Space>${t.key}`) && !globalId(t.key)) miss.push(t.key);
    }
    expect(miss, `这些映射不过去：\n${miss.join("\n")}`).toEqual([]);
  });
});

describe("ui 板块", () => {
  it("每道题都能映射到全局 id", () => {
    const miss: string[] = [];
    for (const t of UI_TOGGLES) {
      const k = fullKey(t);
      if (!globalId(k) && !globalId(k.replace("<Space>", ""))) miss.push(`${t.key} → ${k}`);
    }
    expect(miss, `这些映射不过去：\n${miss.join("\n")}`).toEqual([]);
  });
});

describe("files 板块", () => {
  it("每道题都能映射到全局 id", () => {
    const miss: string[] = [];
    for (const t of FILE_TASKS) {
      if (!globalId(t.key)) miss.push(t.key);
    }
    expect(miss, `这些映射不过去：\n${miss.join("\n")}`).toEqual([]);
  });
});

describe("windows hydra 板块", () => {
  /**
   * ⚠️ 这族的键**大多不在 COMMANDS 里** —— 这是实测事实，不是 bug。
   *
   * LazyVim 16 用 `<Space>|` / `<Space>-` 做分屏，**不是** `<Space>wv` / `<Space>ws`
   * （那是书里的旧键）。其余 `<Space>wX` 是 hydra 面板键，
   * 而 hydra 面板只在按 `<Space><Space>` 进入后才存在，
   * 不是全局 keymap，所以 `nvim_get_keymap` 里没有。
   *
   * 结论：`/windows` 的 hydra 需要**自己的 id 方案**，
   * 不能硬套 COMMANDS 的全局 id。这条测试把事实记下来。
   */
  it("面板键大多不在 COMMANDS 里（记录现状）", () => {
    let mapped = 0;
    for (const t of WIN_TASKS) {
      const wk = findKey(t.key);
      if (!wk) continue;
      if (globalId(wk.lazy ?? "")) mapped++;
    }
    // 少数能映射（比如分屏那两条走 <Space>| / <Space>-），但大多数不能
    expect(mapped).toBeLessThan(WIN_TASKS.length);
  });

  it("分屏键确实是 <Space>| 和 <Space>-（不是书里的 <Space>wv/ws）", () => {
    expect(globalId("<Space>|"), "<Space>| 应该在数据集里").not.toBeNull();
    expect(globalId("<Space>-"), "<Space>- 应该在数据集里").not.toBeNull();
    expect(globalId("<Space>wv"), "LazyVim 16 没有 <Space>wv").toBeNull();
    expect(globalId("<Space>ws"), "LazyVim 16 没有 <Space>ws").toBeNull();
  });
});

describe("diagnostics 板块", () => {
  it("记录一下有多少能映射（这族的键多为 Vim 内建，可能不在数据集里）", () => {
    let ok = 0;
    const miss: string[] = [];
    for (const k of DIAG_KEYS) {
      const fk = diagFullKey(k);
      if (globalId(fk) || globalId(fk.replace("<Space>", ""))) ok++;
      else miss.push(fk);
    }
    // 这族含 [d ]d gr* 等 —— gr* 是 buffer-local，不在全局数据集里
    expect(ok, `只有 ${ok}/${DIAG_KEYS.length} 能映射`).toBeGreaterThan(0);
    if (miss.length > 0) {
      // 记录下来，供统一 id 时决定这些怎么办
      expect(miss.length).toBeGreaterThan(0);
    }
  });
});

describe("text 板块", () => {
  it("文本对象的键不在 COMMANDS 里（那是插件映射，不是 keymap）", () => {
    // `diw` 这种是 Vim 内建文本对象，不在 nvim_get_keymap 的映射表里
    const spec = SPEC.filter((s) => s.measured);
    expect(spec.length).toBeGreaterThan(0);
    const anyInCommands = spec.some((s) => BY_DISPLAY.has(`d${s.key}`));
    // 断言它**不在** —— 这是事实，说明 text 板块需要另一套 id 方案
    expect(anyInCommands, "文本对象居然在 COMMANDS 里？那映射逻辑要重看").toBe(false);
  });
});

describe("taskIdOf —— 统一 id 的规则", () => {
  it("能映射的用全局 id（跨板块共享进度）", () => {
    expect(taskIdOf("buffers", "L")).toBe("n|L");
    expect(taskIdOf("seq", "L")).toBe("n|L");
    // ⚠️ 关键：同一个键在两个板块得到**同一个 id**
    expect(taskIdOf("buffers", "L")).toBe(taskIdOf("seq", "L"));
  });

  it("带 leader 的面板键也能映射", () => {
    expect(taskIdOf("buffers", "<Space>bd")).toBe("n|<Space>bd");
  });

  it("次解映射到它所属命令的 id（不是它自己的）", () => {
    // ]b 是 L 的次解 —— 应该得到 L 的 id
    expect(taskIdOf("buffers", "]b")).toBe(taskIdOf("buffers", "L"));
  });

  it("映射不到的用「板块:本地key」（带前缀防跨板块撞车）", () => {
    const id = taskIdOf("text", "diw");
    expect(id).toBe("text:diw");
    // ⚠️ 不同板块的同名键必须不同 id
    expect(taskIdOf("text", "diw")).not.toBe(taskIdOf("other", "diw"));
  });

  it("suffix 只在该板块真的有重复 key 时才用", () => {
    // buffers 有两道 key 都是 L（故意考绕回），必须区分
    const a = taskIdOf("buffers", "L", 0);
    const b = taskIdOf("buffers", "L", 1);
    expect(a).not.toBe(b);
    expect(a).toBe("n|L#0");
    expect(b).toBe("n|L#1");
  });

  it("不给 suffix 时不会凭空加后缀", () => {
    expect(taskIdOf("buffers", "L")).toBe("n|L");
    expect(taskIdOf("buffers", "L")).not.toContain("#");
  });

  it("id 稳定 —— 同样的输入永远同样的输出", () => {
    for (const d of ["L", "<Space>bd", "diw", "<C-H>"]) {
      expect(taskIdOf("buffers", d)).toBe(taskIdOf("buffers", d));
    }
  });
});
