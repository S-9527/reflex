import { describe, expect, it } from "vitest";
import { RAW } from "../lib/bindings";
import { splitLhs } from "../lib/keys";
import {
  KEY_ROWS,
  OFF_BOARD,
  ROW_BOTTOM,
  U,
  allKeyIds,
  hasKey,
  resolve,
  rowWidth,
} from "../lib/keyboard";

/**
 * 键盘布局的测试。
 *
 * 核心不变量:**数据集里出现的每一个记号,都要能在键盘上找到位置**。
 * 找不到就画不出来,那一题的键盘图就是残缺的。
 */

describe("布局尺寸", () => {
  /**
   * 每行必须一样宽,否则键盘是歪的。
   * ANSI 60% 的标准总宽是 15u。
   */
  it("五行宽度一致且等于 15u", () => {
    for (const row of KEY_ROWS) {
      expect(rowWidth(row), `某行宽度不是 15u`).toBe(U);
    }
  });

  it("每行都有键", () => {
    for (const row of KEY_ROWS) expect(row.length).toBeGreaterThan(0);
  });

  it("空格是标准 6.25u", () => {
    const sp = ROW_BOTTOM.find((x) => x.id === "<Space>");
    expect(sp?.w).toBe(6.25);
  });
});

describe("resolve —— 单字符", () => {
  it("小写字母直接对上键位", () => {
    expect(resolve("a")).toEqual({ keyId: "a", mods: [], offBoard: false });
  });

  /**
   * ⚠️ ANSI 键盘上大写字母**不是独立键**,是 Shift + 字母。
   *   我第一版拿 `L` 直接找键位,键盘上没有 —— 数据集里 23 个
   *   大写字母 + `|` + `_` 全都这么丢的。
   */
  it("大写字母 = Shift + 小写", () => {
    expect(resolve("L")).toEqual({ keyId: "l", mods: ["S"], offBoard: false });
    expect(resolve("H")).toEqual({ keyId: "h", mods: ["S"], offBoard: false });
  });

  it("Shift 派生的符号也指向基础键", () => {
    expect(resolve("|")).toEqual({ keyId: "\\", mods: ["S"], offBoard: false });
    expect(resolve("_")).toEqual({ keyId: "-", mods: ["S"], offBoard: false });
  });

  it("符号能落到对应键位", () => {
    for (const s of ["[", "]", ",", ".", "/", "`", "-", "=", "\\", ";", "'"]) {
      const r = resolve(s);
      expect(r.keyId, `${s} 解析错了`).toBe(s);
      expect(hasKey(r.keyId), `${s} 在键盘上没有对应键`).toBe(true);
    }
  });
});

describe("resolve —— 修饰键", () => {
  /**
   * ⚠️ Ctrl 系字母要转小写 —— 数据集写 `<C-H>`(Vim 约定大写),
   *   浏览器按出来是 `event.key === "h"`。不转就找不到键位。
   */
  it("<C-H> = 按住 Ctrl + h(键盘上印的是 H,高亮要落回 h)", () => {
    expect(resolve("<C-H>")).toEqual({ keyId: "h", mods: ["C"], offBoard: false });
  });

  it("<M-j> = 按住 Alt + j", () => {
    expect(resolve("<M-j>")).toEqual({ keyId: "j", mods: ["M"], offBoard: false });
  });

  it("<S-CR> = 按住 Shift + Enter", () => {
    expect(resolve("<S-CR>")).toEqual({ keyId: "<CR>", mods: ["S"], offBoard: false });
  });

  it("<C-/> = 按住 Ctrl + 斜杠", () => {
    expect(resolve("<C-/>")).toEqual({ keyId: "/", mods: ["C"], offBoard: false });
  });

  /**
   * `_` 在 ANSI 上是 Shift + `-`,所以 `<C-_>` 要按 **Ctrl+Shift+横杠**。
   * 只标 Ctrl 会在键盘上找不到对应的键。
   */
  it("<C-_> = Ctrl + Shift + 横杠", () => {
    expect(resolve("<C-_>")).toEqual({ keyId: "-", mods: ["S", "C"], offBoard: false });
  });

  it("修饰键自身 <C-Ctrl> 解析成 Ctrl 块", () => {
    expect(resolve("<C-Ctrl>")).toEqual({ keyId: "<C-Ctrl>", mods: [], offBoard: false });
  });

  it("<C-Down> = 按住 Ctrl + ↓", () => {
    expect(resolve("<C-Down>")).toEqual({ keyId: "<Down>", mods: ["C"], offBoard: false });
  });

  it("<C-L> = Ctrl + l,不是 Ctrl + L", () => {
    expect(resolve("<C-L>")).toEqual({ keyId: "l", mods: ["C"], offBoard: false });
  });
});

describe("resolve —— 命名键", () => {
  it("<Space> 是空格键", () => {
    const r = resolve("<Space>");
    expect(r.keyId).toBe("<Space>");
    expect(hasKey("<Space>")).toBe(true);
  });

  it("<Tab> <BS> 在键盘上", () => {
    expect(hasKey("<Tab>")).toBe(true);
    expect(hasKey("<BS>")).toBe(true);
  });

  it("方向键都在键盘上", () => {
    for (const d of ["<Up>", "<Down>", "<Left>", "<Right>"]) {
      expect(hasKey(d), `${d} 没画`).toBe(true);
    }
  });

  /**
   * ⚠️ <Esc> 严格说不在主键盘区块里。
   * 我把它标 offBoard,画在键盘上方 —— 不假装它在键盘上有位置。
   */
  it("<Esc> 标成不在键盘上,但仍在 OFF_BOARD 里有画", () => {
    const r = resolve("<Esc>");
    expect(r.offBoard).toBe(true);
    expect(OFF_BOARD.map((x) => x.id)).toContain("<Esc>");
  });

  it("裸空格记号也归到 <Space>(数据集里 leader 有 3 条写成裸空格)", () => {
    expect(resolve(" ").keyId).toBe("<Space>");
  });
});

describe("全数据集覆盖 —— 每个记号都得画得出来", () => {
  const tokens = [...new Set(RAW.flatMap((r) => splitLhs(r.display)))];

  it("记号数量在预期范围内(防止 splitLhs 突然坏掉)", () => {
    expect(tokens.length).toBeGreaterThan(50);
    expect(tokens.length).toBeLessThan(120);
  });

  it("每个记号都能解析到键盘上的某块键", () => {
    const missing: string[] = [];
    for (const t of tokens) {
      const r = resolve(t);
      const known = hasKey(r.keyId) || r.offBoard;
      if (!known) missing.push(t);
    }
    expect(missing, `这些记号键盘上画不出来:${missing.join(" ")}`).toEqual([]);
  });

  it("offBoard 的记号数量很少(绝大多数都在键盘上)", () => {
    const off = tokens.filter((t) => resolve(t).offBoard);
    expect(off.length, `offBoard 的太多:${off.join(" ")}`).toBeLessThanOrEqual(2);
  });
});

describe("键位 id 唯一性", () => {
  /**
   * ⚠️ 修饰键在底排出现两次(Ctrl/Alt/Meta 左右各一)、Shift 在底排上两次。
   *   这在真键盘上是对的,但渲染时如果按 id 取单块就会只亮一个。
   *   所以测试要盯住「哪些 id 故意重复」—— 多一个少一个都要知道。
   */
  it("故意重复的只有修饰键", () => {
    const ids = allKeyIds();
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(new Set(dup)).toEqual(new Set(["<Shift>", "<Alt>", "<Meta>", "<C-Ctrl>"]));
  });

  it("字母和符号键都不重复", () => {
    const ids = allKeyIds();
    const singles = ids.filter((id) => id.length === 1);
    expect(new Set(singles).size).toBe(singles.length);
  });

  /**
   * 解析出来的 keyId 必须真的在键盘上。
   * 这条是从「所有记号都能解析到键盘上」里单独拎出来的断言,
   * 因为它出问题时最好定位。
   */
  it("resolve 的结果不会指向不存在的键", () => {
    const ids = allKeyIds();
    for (const id of ids) {
      const r = resolve(id);
      expect(ids, `${id} 解析到 ${r.keyId},键盘上没有`).toContain(r.keyId);
    }
  });
});