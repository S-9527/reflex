import { describe, expect, it } from "vitest";
import { diffLines, hasChange } from "../lib/diff";
import { CORE_ITEMS } from "../lib/core-vim";

/**
 * 行级 diff —— `/core` 页「按下去之后 buffer 变成什么」的判据。
 *
 * ## ⚠️⚠️ 为什么需要这个文件
 *
 * 第一版把「改过的行」掉进了 `else` 分支标成 `same`，后果是
 * **`→` 箭头一个都不渲染** —— 界面看起来「这个键什么也没做」。
 *
 * 而且它**单测抓不到**：数据层（`CORE_ITEMS`）完全正确，
 * 错的是渲染分支。我是跑起来抓 DOM 才看见的
 * （`document.querySelectorAll("pre >> text=→").length === 0`）。
 *
 * 所以现在把 diff 逻辑抽成纯函数（`lib/diff.ts`）并在这里钉住：
 * **改过的行必须被识别成 del/add，不能是 same**。
 */

describe("diffLines：基本形态", () => {
  it("完全一样 → 全是 same，没有变化", () => {
    const rows = diffLines(["a", "b"], ["a", "b"]);
    expect(rows.map((r) => r.kind)).toEqual(["same", "same"]);
    expect(hasChange(rows)).toBe(false);
  });

  it("⚠️ 内容变了但行数没变 → 必须是 del + add，**不能是 same**", () => {
    /**
     * 这就是第一版丢的那一支。`x` 删掉一个字符后行数不变，
     * 但内容变了 —— 必须能被识别出来，否则界面没有箭头。
     */
    const rows = diffLines(["ocal", "two"], ["local", "two"]);
    expect(hasChange(rows), "改过的行被当成没变 —— 界面会显示「什么也没做」").toBe(true);
    expect(rows.some((r) => r.kind === "del")).toBe(true);
    expect(rows.some((r) => r.kind === "add")).toBe(true);
  });

  it("删掉整行 → 那一行是 del，后面的行不动（LCS 的效果）", () => {
    const before = ["one", "two", "three"];
    const after = ["two", "three"];
    const rows = diffLines(before, after);
    const dels = rows.filter((r) => r.kind === "del");
    expect(dels.map((d) => d.text)).toEqual(["one"]);
    // 后面两行必须识别成 same，而不是「全变了」
    expect(rows.filter((r) => r.kind === "same").map((r) => r.text)).toEqual(["two", "three"]);
  });

  it("新增一行 → 那一行是 add", () => {
    const rows = diffLines(["one"], ["one", "two"]);
    expect(rows.filter((r) => r.kind === "add").map((r) => r.text)).toEqual(["two"]);
  });

  it("清空 buffer → 全是 del", () => {
    const rows = diffLines(["one", "two"], [""]);
    expect(rows.some((r) => r.kind === "del")).toBe(true);
  });
});

describe("diffLines：afterIndex 是给光标用的", () => {
  /**
   * ⚠️ 光标要画在 `after` 的那一行上，所以必须给出 after 的下标。
   *    删除行没有 after 下标（它是 null），不能拿它去索引。
   */
  it("same / add 行有 afterIndex，del 行是 null", () => {
    const rows = diffLines(["a", "b", "c"], ["a", "c"]);
    for (const r of rows) {
      if (r.kind === "del") {
        expect(r.afterIndex, `del 行不该有 afterIndex：${r.text}`).toBeNull();
      } else {
        expect(r.afterIndex, `${r.kind} 行缺 afterIndex：${r.text}`).not.toBeNull();
      }
    }
  });

  it("afterIndex 能正确指回 after 的内容", () => {
    const after = ["a", "c"];
    const rows = diffLines(["a", "b", "c"], after);
    for (const r of rows) {
      if (r.afterIndex === null) continue;
      expect(after[r.afterIndex], `${r.kind} 行的 afterIndex 指错了`).toBe(r.text);
    }
  });
});

describe("diffLines：拿真实题库数据跑一遍", () => {
  /**
   * ⚠️ 这一条是「端到端」的：用 `CORE_ITEMS` 里真实的实测数据，
   *    验证「标了 changed 的条目，diff 一定识别得出变化」。
   *
   * 第一版的 bug 就会在这里红 —— 数据说 changed=true，而 diff 全是 same。
   */
  it("标了 changed 的条目，diff 都识别得出变化", () => {
    const bad: string[] = [];
    for (const item of CORE_ITEMS) {
      if (!item.measured.changed) continue;
      /**
       * ⚠️⚠️ 折叠 / 标签页类的「有效果」**不在 buffer 文本上**。
       *
       * `za` 改的是折叠状态、`gt` 改的是当前标签页 —— 文本和光标都不动，
       * 所以 diff 全是 `same` 是对的。界面要另外说明「改的是折叠状态」，
       * 不能画一个空的 diff 说「什么也没做」。
       */
      const m = item.measured;
      if (m.foldChanged || m.tabsChanged) continue;
      const rows = diffLines(m.before, m.result);
      if (!hasChange(rows)) bad.push(item.key);
    }
    expect(
      bad,
      `这些条目数据说 changed 但 diff 认不出来（界面不会显示箭头）：\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("折叠/标签页类的条目，changed 由状态变化解释（不是凭空标的）", () => {
    for (const item of CORE_ITEMS) {
      const m = item.measured;
      if (!m.changed || !(m.foldChanged || m.tabsChanged)) continue;
      // 这类条目应该**文本没变**，changed 完全来自状态
      expect(
        JSON.stringify(m.before),
        `${item.key} 标了状态变化，但文本其实变了 —— 应该由 diff 来解释`,
      ).toBe(JSON.stringify(m.result));
    }
  });

  it("没改变 buffer 的条目，diff 确实没有变化", () => {
    const bad: string[] = [];
    for (const item of CORE_ITEMS) {
      // ⚠️ changed 是「相对前置之后」的状态，所以只查没有前置的那些
      if (item.measured.changed || item.measured.pre) continue;
      const rows = diffLines(item.measured.before, item.measured.result);
      if (hasChange(rows)) bad.push(item.key);
    }
    expect(bad, `这些条目没标 changed 但 diff 看出变化了：\n${bad.join("\n")}`).toEqual([]);
  });

  it("diff 不丢行：行数 = same + del + add", () => {
    for (const item of CORE_ITEMS) {
      const rows = diffLines(item.measured.before, item.measured.result);
      expect(rows.length, `${item.key} 的 diff 行数不对`).toBe(
        item.measured.before.length + item.measured.result.length -
          rows.filter((r) => r.kind === "same").length,
      );
    }
  });
});
