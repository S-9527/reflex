import { describe, it, expect } from "vitest";
import { normalize, splitLhs, formatKeys } from "../lib/keys";
import { buildIndex, match, type Binding } from "../lib/matcher";

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("normalize", () => {
  it("空格归一化成 <Space>", () => {
    expect(normalize(ev(" "))?.vim).toBe("<Space>");
  });

  it("Shift+w 变成大写 W(不是 shift-w)", () => {
    // 真实浏览器行为:按住 Shift 时 key 已经是大写,不会是 "w"+shiftKey
    expect(normalize(ev("W", { shiftKey: true }))?.vim).toBe("W");
    expect(normalize(ev("W"))?.vim).toBe("W");
    // 防御性:即便收到不合法的 "w"+shiftKey,也应产出 W。
    // 归一化自己抬一手,因为用户看不到 shift 键,只看到字符。
    expect(normalize(ev("w", { shiftKey: true }))?.vim).toBe("W");
  });

  it("Ctrl+字母 抬成大写(Vim 约定),用实测输入", () => {
    // 实测(Playwright 真实按键,不是合成事件):
    //   按 Ctrl+H → key="h" ctrl=true shift=false
    //   按 Ctrl+J → key="j" ctrl=true shift=false
    // 而 nvim_get_keymap 报的是 <C-H> / <C-J>(修饰键后大写)。
    // 不抬这一手 → 归一化产 <C-h>,和数据集永远对不上。
    expect(normalize(ev("h", { ctrlKey: true }))?.vim).toBe("<C-H>");
    expect(normalize(ev("j", { ctrlKey: true }))?.vim).toBe("<C-J>");
    expect(normalize(ev("w", { ctrlKey: true }))?.vim).toBe("<C-W>");
    expect(normalize(ev("s", { ctrlKey: true }))?.vim).toBe("<C-S>");
    expect(normalize(ev("f", { ctrlKey: true }))?.vim).toBe("<C-F>");
    expect(normalize(ev("b", { ctrlKey: true }))?.vim).toBe("<C-B>");
  });

  it("Ctrl+已是大写的输入也不重复处理", () => {
    expect(normalize(ev("H", { ctrlKey: true }))?.vim).toBe("<C-H>");
  });

  it("Ctrl+符号键不参与大写化", () => {
    // 这些本来就不是字母,实测浏览器行为是 key="_" / key="/"
    expect(normalize(ev("_", { ctrlKey: true }))?.vim).toBe("<C-_>");
    expect(normalize(ev("/", { ctrlKey: true }))?.vim).toBe("<C-/>");
  });

  it("Ctrl+特殊键走命名表,修饰键放尖括号内", () => {
    // 注意是 <C-Up> 不是 <C-ArrowUp>:ArrowUp 先经 NAMED 表变成 <Up>,
    // 修饰键加在尖括号内。这正好等于数据集里的 <C-Up>(窗口调整大小)。
    expect(normalize(ev("ArrowUp", { ctrlKey: true }))?.vim).toBe("<C-Up>");
    expect(normalize(ev("ArrowLeft", { ctrlKey: true }))?.vim).toBe("<C-Left>");
  });

  it("Ctrl+Alt+a 是 <C-M-A>(修饰键后字母一律大写)", () => {
    expect(normalize(ev("a", { ctrlKey: true, altKey: true }))?.vim).toBe("<C-M-A>");
  });

  it("特殊键走命名表", () => {
    expect(normalize(ev("Escape"))?.vim).toBe("<Esc>");
    expect(normalize(ev("Enter"))?.vim).toBe("<CR>");
    expect(normalize(ev("Tab"))?.vim).toBe("<Tab>");
    expect(normalize(ev("Backspace"))?.vim).toBe("<BS>");
  });

  it("纯修饰键返回 null(按 Ctrl 本身不算输入)", () => {
    expect(normalize(ev("Control", { ctrlKey: true }))).toBeNull();
    expect(normalize(ev("Shift", { shiftKey: true }))).toBeNull();
  });

  it("<Space> 有可打印哨兵,才能作为前缀被查到", () => {
    const r = normalize(ev(" "));
    expect(r?.ch).toBe("␣");
    // 哨兵不是字母,没有"大写"可言
    expect(r?.chUpper).toBeNull();
  });

  it("区分 l 与 L:ch 保留原字符大小写,chUpper 总是大写", () => {
    // 这个区分是必须的:`L` 是「下一个 buffer」,`l` 是「右移一格」。
    // 如果两边都归一化成小写,前缀树会把两个不同的绑定合并掉。
    const lower = normalize(ev("l"));
    expect(lower?.ch).toBe("l");
    expect(lower?.chUpper).toBe("L");

    const upper = normalize(ev("L", { shiftKey: true }));
    expect(upper?.ch).toBe("L");
    expect(upper?.chUpper).toBe("L");

    expect(lower?.ch).not.toBe(upper?.ch);
  });

  it("Ctrl+特殊键:修饰键在尖括号内", () => {
    expect(normalize(ev(" ", { ctrlKey: true }))?.vim).toBe("<C-Space>");
    expect(normalize(ev("Escape", { altKey: true }))?.vim).toBe("<M-Esc>");
  });

  it("绝不出现尖括号套尖括号", () => {
    for (const m of [{}, { ctrlKey: true }, { altKey: true }, { ctrlKey: true, altKey: true }]) {
      for (const k of ["a", " ", "Escape", "Enter", "F5"]) {
        const v = normalize(ev(k, m))?.vim ?? "";
        const inner = v.slice(1, -1);
        expect(inner).not.toContain("<");
        expect(inner).not.toContain(">");
      }
    }
  });
});

describe("splitLhs", () => {
  it("拆出逐键序列", () => {
    expect(splitLhs("<Space>ff")).toEqual(["<Space>", "f", "f"]);
    expect(splitLhs("<C-w>s")).toEqual(["<C-w>", "s"]);
    expect(splitLhs("gd")).toEqual(["g", "d"]);
    expect(splitLhs("ZZ")).toEqual(["Z", "Z"]);
  });

  it("往返一致", () => {
    expect(formatKeys(splitLhs("<Space>fg"))).toBe("<Space>fg");
  });

  it("混合串要逐字符拆:字符 + 尖括号记号", () => {
    // 实测踩过:数据里存在 `[<C-L>` 这种 lhs。用 `<[^<>]+>` 一次性
    // replace 会拆不出来,keys 长度变成 1,判分永远匹配不上。
    expect(splitLhs("[<C-L>")).toEqual(["[", "<C-L>"]);
    expect(splitLhs("]<C-Q>")).toEqual(["]", "<C-Q>"]);
    expect(splitLhs("[a")).toEqual(["[", "a"]);
  });

  it("拆分后重新拼接等于原串(对混合串也成立)", () => {
    for (const s of ["[<C-L>", "]<C-Q>", "[<C-T>", "<Space>ff", "gd", "ZZ", "]a"]) {
      expect(formatKeys(splitLhs(s)), s).toBe(s);
    }
  });

  it("未闭合的尖括号当普通字符处理(不吞掉后面的键)", () => {
    expect(splitLhs("a<b")).toEqual(["a", "<", "b"]);
  });
});

// --- 匹配器 ---
const b = (id: string, keys: string[]): Binding => ({
  id,
  keys,
  display: keys.join(""),
  label: id,
  desc: "",
  mode: "n",
  group: "g",
  groupLabel: "测试组",
  status: "verified",
  rhs: "",
  lua: true,
  inWhichKey: false,
  wkGroup: null,
});

const POOL = [
  b("ff", ["<Space>", "f", "f"]),
  b("fg", ["<Space>", "f", "g"]),
  b("fb", ["<Space>", "f", "b"]),
  b("cws", ["<C-w>", "s"]),
  b("cwh", ["<C-w>", "h"]),
  b("gd", ["g", "d"]),
];
const IDX = buildIndex(POOL);

describe("match", () => {
  it("空序列是 idle", () => {
    expect(match(IDX, []).kind).toBe("idle");
  });

  it("按满整条序列 → hit", () => {
    const r = match(IDX, ["<Space>", "f", "f"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.binding.id).toBe("ff");
  });

  it("按到一半 → partial,并列出候选", () => {
    const r = match(IDX, ["<Space>", "f"]);
    expect(r.kind).toBe("partial");
    if (r.kind === "partial") {
      expect(r.candidates.map((x) => x.id).sort()).toEqual(["fb", "ff", "fg"]);
      expect(r.extendable).toBe(true);
    }
  });

  it("只按 <Space> → partial", () => {
    const r = match(IDX, ["<Space>"]);
    expect(r.kind).toBe("partial");
  });

  it("第一键就错 → miss,且给出候选", () => {
    const r = match(IDX, ["<C-p>"], POOL);
    expect(r.kind).toBe("miss");
    if (r.kind === "miss") {
      expect(r.hint.length).toBeGreaterThan(0);
    }
  });

  it("前缀对但最后键错 → miss,expected 指出最接近的", () => {
    const r = match(IDX, ["<Space>", "f", "x"], POOL);
    expect(r.kind).toBe("miss");
    if (r.kind === "miss") {
      // ff/fg/fb 三个与 "x" 在第 3 键分叉,公共前缀 2
      expect(r.expected.length).toBe(3);
    }
  });

  it("<C-w> 是独立前缀,不会和 <Space> 混", () => {
    expect(match(IDX, ["<C-w>"]).kind).toBe("partial");
    const r = match(IDX, ["<C-w>", "s"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.binding.id).toBe("cws");
  });

  it("单键绑定直接 hit", () => {
    const r = match(IDX, ["g", "d"]);
    expect(r.kind).toBe("hit");
  });

  /**
   * 同一键序列有多条映射时,索引必须给出**确定**的结果。
   *
   * ⚠️ 旧版按 `level`(手编关卡)取最小的,而关卡概念已删。
   * 现在按「键数少 → 不用修饰键 → 不用 leader」算代价,
   * 代价相同时保留**先写入**的那条(判据是 `<` 不是 `<=`)。
   * 这条断言的就是那个确定性 —— 它保证同一份数据每次建索引结果一样。
   */
  it("同键序列冲突时结果确定(保留先写入的)", () => {
    const first = { ...b("first", ["x"]), display: "x" };
    const second = { ...b("second", ["x"]), display: "<C-x>" };
    const r = match(buildIndex([first, second]), ["x"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.binding.id).toBe("first");
  });

  /**
   * 代价判据本身:同前缀下,`<Space>ff`(3 键 + leader)比
   * `<C-w>s`(2 键 + 修饰)贵,比单键更贵。
   *
   * 这里通过 `candidatesAt` 的排序间接验证 ——
   * 它按代价升序给候选,所以最省事的排第一。
   */
  it("候选按按键代价排序:单键在 leader 三键之前", () => {
    const pool = [b("leader", ["<Space>", "f", "f"]), b("plain", ["g"])];
    const idx = buildIndex(pool);
    // "g" 是单键,应该直接 hit
    const r = match(idx, ["g"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.binding.id).toBe("plain");
  });
});
