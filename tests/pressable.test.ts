import { describe, expect, it } from "vitest";
import { normalize, splitLhs } from "../lib/keys";
import { COMMANDS } from "../lib/bindings";
import { drillablePool } from "../lib/seq-groups";
import { CORE_ITEMS } from "../lib/core-vim";
import { classify } from "../lib/drill";

/**
 * ⚠️⚠️ 「这道题按得出来吗」—— 判据层面的完整性审计。
 *
 * ## 为什么需要这个文件
 *
 * 用户报过好几次「按了没反应」类的问题，根因各不相同，但都属于同一类：
 * **题目在那儿，用户怎么按都过不了**。而且**都不报错** ——
 * 界面正常显示题目，判分恒为「错」，用户只会怀疑自己记错了。
 *
 * 这一轮抓到的是 `splitLhs` 不处理**裸空格**：
 *
 * ```
 * nvim_get_keymap 报的 lhs 里 leader 是真空格
 *   → "<C-W> " / "] " / "[ " 这几条 display 里带裸空格
 *   → splitLhs 原样 push(" ")
 *   → 而 normalize()（浏览器事件）产出的是 "<Space>"
 *   → 两边永远匹配不上，classify() 恒返回 none
 * ```
 *
 * 实测受影响 3 道题：`<C-W> `（Window Hydra 入口）、`] `（下面开空行）、
 * `[ `（上面开空行）。
 *
 * ## 判据
 *
 * **解法里的每一个键，都必须能被浏览器事件产出。**
 * 做法：把「用户可能按的键」列成一个集合（可打印字符 + 特殊键），
 * 然后检查每条解法的每一键都在这个集合里 —— 不在就说明**按不出来**。
 */

/** 用户按一个键 → normalize 的产出。这就是「能按出来的键」的全集 */
function pressable(key: string, mods: Record<string, boolean> = {}): string {
  const n = normalize({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  } as KeyboardEvent);
  return n?.vim ?? "";
}

/** 全部可打印字符 + 常用特殊键 */
const PRINTABLE =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" +
  "`-=[]\\;',./~!@#$%^&*()_+{}|:\"<>?";

const CANON = new Set<string>();
for (const ch of PRINTABLE) {
  CANON.add(pressable(ch));
  CANON.add(pressable(ch, { shiftKey: true }));
  CANON.add(pressable(ch, { ctrlKey: true }));
  CANON.add(pressable(ch, { altKey: true }));
}
for (const k of [
  " ", "Tab", "Enter", "Escape", "Backspace", "Delete", "Insert",
  "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]) {
  CANON.add(pressable(k));
  /**
   * ⚠️ 特殊键 + Shift 也要收 —— 实测数据集里有 `<S-CR>` / `<S-Tab>`。
   *
   * 注意这和可打印字符不同：`Shift+w` 的 `e.key` **已经是 `"W"`**，
   * 所以那边不加 `S-`；而特殊键的 `e.key` 是 `"Enter"` 这种名字，
   * Shift 只能从 `e.shiftKey` 读。
   */
  CANON.add(pressable(k, { shiftKey: true }));
  CANON.add(pressable(k, { ctrlKey: true }));
  CANON.add(pressable(k, { altKey: true }));
}
CANON.delete("");

/** 这个键能被用户按出来吗 */
function pressableOk(k: string): boolean {
  return CANON.has(k);
}

describe("每条解法都能按出来", () => {
  it("splitLhs 不会拆出裸空格（会永远匹配不上 normalize）", () => {
    const bad: string[] = [];
    for (const b of COMMANDS) {
      for (const d of [b.display, ...b.alternates]) {
        for (const k of splitLhs(d)) {
          if (k === " " || d.includes(" ")) {
            if (k === " ") bad.push(`${JSON.stringify(d)}（${b.desc}）`);
          }
        }
      }
    }
    expect(
      bad,
      `这些解法里拆出了裸空格键 —— 用户按空格产出的是 <Space>，永远匹配不上：\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("/seq 池子里每条解法的每一键，用户都能按出来", () => {
    const bad: string[] = [];
    for (const c of drillablePool()) {
      for (const d of [c.display, ...c.alternates]) {
        for (const k of splitLhs(d)) {
          if (!pressableOk(k)) bad.push(`${JSON.stringify(d)} 的键 ${JSON.stringify(k)}（${c.desc}）`);
        }
      }
    }
    expect(bad, `这些键按不出来：\n${bad.join("\n")}`).toEqual([]);
  });

  it("/core 每条解法的每一键，用户都能按出来", () => {
    const bad: string[] = [];
    for (const it of CORE_ITEMS) {
      for (const d of [it.key, ...it.alts]) {
        for (const k of splitLhs(d)) {
          if (!pressableOk(k)) bad.push(`${JSON.stringify(d)} 的键 ${JSON.stringify(k)}（${it.desc}）`);
        }
      }
    }
    expect(bad, `这些键按不出来：\n${bad.join("\n")}`).toEqual([]);
  });

  /**
   * ⚠️ 端到端：拿「用户实际按的键序列」喂 `classify`，必须命中。
   *
   * 这一条才是真正的判据 —— 上面两条只查「键形态对不对」，
   * 这条查「按下去判不判对」。
   */
  it("按解法对应的键序列，classify 必须命中（不是 none）", () => {
    const bad: string[] = [];
    for (const c of drillablePool()) {
      const accepts = [splitLhs(c.display), ...c.alternates.map((a) => splitLhs(a))];
      // 模拟用户按第一条解法：逐键走一遍，最后一步必须 hit
      const seq = accepts[0];
      const r = classify(accepts, seq);
      if (r.kind !== "hit") {
        bad.push(`${JSON.stringify(c.display)}（${c.desc}）→ ${r.kind}`);
      }
    }
    expect(bad, `这些题按自己的解法却判不出对：\n${bad.join("\n")}`).toEqual([]);
  });

  /**
   * ⚠️ 反向：`<Space>` 这种「裸空格归一化」的结果必须两处一致。
   */
  it("裸空格在 splitLhs 和 normalize 两边产出同一个记法", () => {
    expect(splitLhs("<Space> ")).toEqual(["<Space>", "<Space>"]);
    expect(splitLhs("] ")).toEqual(["]", "<Space>"]);
    expect(splitLhs("[ ")).toEqual(["[", "<Space>"]);
    expect(splitLhs("<C-W> ")).toEqual(["<C-W>", "<Space>"]);
    expect(pressable(" ")).toBe("<Space>");
  });
});
