import { describe, expect, it } from "vitest";
import { taskIdOf, globalIdOf } from "../lib/task-id";
import { BOARDS } from "../lib/boards";
import * as SRS from "../lib/srs";

/**
 * 跨板块进度共享 —— 统一 id 的**目的**。
 *
 * ## 改之前
 *
 * ```
 * /buffers  「下一个 buffer」 → id "L#0"
 * /seq      「下一个 buffer」 → id "n|L"
 * ```
 *
 * 练一次 `/seq` 再去 `/buffers`，那题还是「没见过」——
 * 同一条命令两份进度，复习队列重复出题，首页掌握数虚高。
 *
 * ## 改之后
 *
 * 两处都是 `n|L` —— 练一次两边都算。
 */

describe("跨板块共享进度", () => {
  /**
   * ⚠️ 核心断言：同一条命令在不同板块得到**同一个 id**。
   */
  it("「下一个 buffer」在 /buffers 和 /seq 是同一个 id", () => {
    const inBuffers = taskIdOf("buffers", "L");
    const inSeq = taskIdOf("seq", "L");
    expect(inBuffers).toBe(inSeq);
    expect(inBuffers).toBe("n|L");
  });

  it("面板键也共享（<Space>bd 在 buffers 和 seq 同 id）", () => {
    expect(taskIdOf("buffers", "<Space>bd")).toBe(taskIdOf("seq", "<Space>bd"));
  });

  it("次解映射到所属命令的 id —— 按 ]b 也算练过 L", () => {
    // ]b 是 L 的次解
    expect(taskIdOf("seq", "]b")).toBe(taskIdOf("seq", "L"));
    expect(globalIdOf("]b")).toBe("n|L");
  });

  it("同 id 的记录真的会被累计（不是两条）", () => {
    const id = taskIdOf("buffers", "L");
    const sameId = taskIdOf("seq", "L");
    let p: SRS.Progress = {};
    p = SRS.record(p, id, true, { board: "buffers", independent: true, now: 1 });
    p = SRS.record(p, sameId, true, { board: "seq", independent: true, now: 2 });
    // 只有一个 key，seen 累加到 2
    expect(Object.keys(p)).toHaveLength(1);
    expect(p[id].seen).toBe(2);
    expect(p[id].streak, "连对两次").toBe(2);
  });
});

describe("无法映射的板块保留本地 id", () => {
  /**
   * ⚠️ 不能一刀切。
   *
   * 文本对象（`diw`）是 Vim 内建，不在 `nvim_get_keymap` 的映射表里；
   * hydra 面板键只在 `<Space><Space>` 之后才存在。它们的键**不在**
   * `COMMANDS` 里，硬套全局 id 会得到 null。
   */
  it("文本对象的键映射不到 COMMANDS", () => {
    expect(globalIdOf("diw")).toBeNull();
    expect(globalIdOf("daw")).toBeNull();
  });

  it("映射不到时用「板块:本地key」，带前缀防跨板块撞车", () => {
    const a = taskIdOf("text", "diw");
    const b = taskIdOf("diag", "diw");
    expect(a).toBe("text:diw");
    expect(b).toBe("diag:diw");
    expect(a).not.toBe(b);
  });

  it("本地 id 不会和全局 id 形式混淆", () => {
    // 全局 id 形如 `n|xxx`，本地 id 形如 `board:xxx`
    expect(taskIdOf("seq", "L")).toMatch(/^n\|/);
    expect(taskIdOf("text", "diw")).toMatch(/^text:/);
  });
});

describe("板块注册表和页面的 boardId 必须一致", () => {
  /**
   * ⚠️ 这条最关键。
   *
   * `Item.board` 存的是 `useDrill` 的 `boardId`。
   * 如果注册表里的 id 和页面上写的不一致，首页统计**永远显示 0**
   * —— 记录落在别的 key 下，而且不报错。
   */
  it("注册表里每个板块的 id，页面上真的有这个 boardId", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const appDir = path.join(__dirname, "../app");

    /**
     * 页面上实际用的 boardId。
     *
     * ⚠️ 要扫**所有** .tsx，不能只扫 `drill.tsx` / `page.tsx` ——
     *    `/windows` 的 hydra 模式在 `hydra.tsx` 里，
     *    只扫那两个文件名会漏掉它（这条测试第一版就漏了）。
     */
    const used = new Set<string>();
    for (const dir of fs.readdirSync(appDir)) {
      const dirPath = path.join(appDir, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith(".tsx")) continue;
        const src = fs.readFileSync(path.join(dirPath, file), "utf8");
        for (const m of src.matchAll(/boardId:\s*[`"]([^`"]+)[`"]/g)) {
          // seq 的 boardId 是模板串 `seq-${shape}` —— 只有 `seq-` 前缀是写死的
          used.add(m[1].startsWith("seq-") ? "seq" : m[1]);
        }
      }
    }

    const missing = BOARDS.map((b) => b.id).filter((id) => !used.has(id));
    expect(missing, `这些板块在注册表里，但代码里找不到对应的 boardId：\n${missing.join("\n")}`).toEqual([]);
  });
});
