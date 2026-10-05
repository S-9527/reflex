/**
 * 物理键盘布局 —— 把 Vim 记号映射到键盘上的**位置**。
 *
 * ## 为什么要这个
 *
 * 盲背练的是「看到描述 → 按出序列」。光看文字记不住的是**位置**:
 * `<Space>uL` 三个键分别在键盘哪儿、手指怎么走过去。
 * qwerty 练习器就是这个思路 —— 它把「记忆」变成「空间定位」。
 *
 * 所以题库里每个记号都要能落到一块具体的键上。
 *
 * ## ⚠️ 尺寸单位
 *
 * 全部用 `1u` = 一个字母键的宽度。这是键盘布局的标准单位,
 * 也让偏移量能直接写成数字(比如 `q` 在 Tab 右边 1.5u)。
 *
 * 我第一版用「每行左边距」硬算,结果 `1` 键比 `` ` `` 键窄、
 * `Backspace` 和 `=` 之间的缝也对不上。改成统一 u 之后才对齐。
 *
 * ## 布局来源
 *
 * 标准 US ANSI 60% + 独立方向键簇(和 LazyVim 用户实际用的
 * 60% 键盘一致)。非字母键(<Space> <Tab> <BS> <CR> 方向键)在键盘上有
 * 真实位置,不在键盘上的(<Esc>)标 `offBoard` —— 画在键盘上方,
 * 不假装它在键盘上。
 */

/** 修饰键。Vim 记法里 C- 是 Ctrl、M- 是 Alt、S- 是 Shift */
export type Mod = "C" | "M" | "S";

export type KeyDef = {
  /** Vim 记号,和 lib/keys.ts 的 splitLhs 输出对得上 */
  id: string;
  /** 键帽上印的字 */
  cap: string;
  /** 宽度,单位 u。默认 1 */
  w?: number;
  /** 需要按住哪个修饰键 */
  mods?: Mod[];
  /**
   * 这个键不在键盘上(如 <Esc>)。
   * 画在键盘上方单独一行 —— 不假装它在键盘上有位置。
   */
  offBoard?: boolean;
};

const k = (id: string, cap: string, extra: Partial<KeyDef> = {}): KeyDef => ({
  id,
  cap,
  ...extra,
});

/** 数字行 */
const ROW_NUM: KeyDef[] = [
  k("`", "`"),
  k("1", "1"),
  k("2", "2"),
  k("3", "3"),
  k("4", "4"),
  k("5", "5"),
  k("6", "6"),
  k("7", "7"),
  k("8", "8"),
  k("9", "9"),
  k("0", "0"),
  k("-", "-"),
  k("=", "="),
  k("<BS>", "⌫", { w: 2 }),
];

/** Tab 行 */
const ROW_Q: KeyDef[] = [
  k("<Tab>", "Tab", { w: 1.5 }),
  k("q", "q"),
  k("w", "w"),
  k("e", "e"),
  k("r", "r"),
  k("t", "t"),
  k("y", "y"),
  k("u", "u"),
  k("i", "i"),
  k("o", "o"),
  k("p", "p"),
  k("[", "["),
  k("]", "]"),
  k("\\", "\\", { w: 1.5 }),
];

/** Caps 行 */
const ROW_A: KeyDef[] = [
  k("<Caps>", "Caps", { w: 1.75 }),
  k("a", "a"),
  k("s", "s"),
  k("d", "d"),
  k("f", "f"),
  k("g", "g"),
  k("h", "h"),
  k("j", "j"),
  k("k", "k"),
  k("l", "l"),
  k(";", ";"),
  k("'", "'"),
  k("<CR>", "Enter", { w: 2.25 }),
];

/** Shift 行。方向键上键在这行的右侧 */
const ROW_Z: KeyDef[] = [
  k("<Shift>", "Shift", { w: 2.25, mods: ["S"] }),
  k("z", "z"),
  k("x", "x"),
  k("c", "c"),
  k("v", "v"),
  k("b", "b"),
  k("n", "n"),
  k("m", "m"),
  k(",", ","),
  k(".", "."),
  k("/", "/"),
  k("<Up>", "↑"),
  k("<Shift>", "Shift", { w: 1.75, mods: ["S"] }),
];

/** 底排。空格 6.25u 是 ANSI 的标准宽度 */
export const ROW_BOTTOM: KeyDef[] = [
  k("<C-Ctrl>", "Ctrl", { w: 1.25, mods: ["C"] }),
  k("<Meta>", "Meta", { w: 1.25 }),
  k("<Alt>", "Alt", { w: 1.25, mods: ["M"] }),
  k("<Space>", "", { w: 6.25 }),
  k("<Alt>", "Alt", { w: 1.25, mods: ["M"] }),
  k("<Meta>", "Meta", { w: 1.25 }),
  k("<Menu>", "Menu", { w: 1.25 }),
  k("<C-Ctrl>", "Ctrl", { w: 1.25, mods: ["C"] }),
];

/** 方向键簇,单独一行右对齐(60% 键盘就是这么排的) */
export const ROW_ARROWS: KeyDef[] = [
  k("<Left>", "←"),
  k("<Down>", "↓"),
  k("<Right>", "→"),
];

/** 键盘主体五行 */
export const KEY_ROWS: KeyDef[][] = [ROW_NUM, ROW_Q, ROW_A, ROW_Z, ROW_BOTTOM];

/**
 * 不在键盘主区块上的键。画在键盘上方一行。
 *
 * ⚠️ 别把 `<CR>` 放进来 —— 它就是主键盘上的 Enter。
 *   我第一版同时在 ROW_A 和 OFF_BOARD 里放了 `<CR>`,
 *   结果 `allKeyIds()` 里出现重复,高亮时同一块键会被点亮两次。
 *   「哪些 id 故意重复」那条测试直接抓出来了。
 */
export const OFF_BOARD: KeyDef[] = [k("<Esc>", "Esc", { offBoard: true })];

/** 一行的总宽度(u)。用来算右对齐 */
export function rowWidth(row: KeyDef[]): number {
  return row.reduce((a, x) => a + (x.w ?? 1), 0);
}

export const BOARD_WIDTH = rowWidth(ROW_NUM);

/** 键盘宽度常量,60% ANSI 是 15u */
export const U = 15;

/** 一个记号 → 要按哪个物理键 + 哪些修饰键 */
export type Resolved = {
  /** 键盘上哪一块 */
  keyId: string;
  /** 要按住哪些修饰键 */
  mods: Mod[];
  /** 键盘上找不到 / 不在键盘上 */
  offBoard: boolean;
};

const NAMED: Record<string, string> = {
  "<Space>": "<Space>",
  "<Tab>": "<Tab>",
  "<CR>": "<CR>",
  "<BS>": "<BS>",
  "<Esc>": "<Esc>",
  "<Up>": "<Up>",
  "<Down>": "<Down>",
  "<Left>": "<Left>",
  "<Right>": "<Right>",
  "<Caps>": "<Caps>",
  "<Shift>": "<Shift>",
  "<Alt>": "<Alt>",
  "<Meta>": "<Meta>",
  "<Menu>": "<Menu>",
  "<C-Ctrl>": "<C-Ctrl>",
};

/**
 * ANSI 键盘上「一个键 = 一个字符」的反向表。
 *
 * 大写字母、`_`、`|` 这些在 ANSI 上**不是独立的键**,
 * 而是 Shift + 某个基础键。所以数据集里出现 `L` `|` `<C-_>` 时,
 * 真正要点的是 Shift 加下面那个键。
 *
 * ⚠️ 我第一版直接拿 `L` 去找键位,键盘上根本没有 —— 数据集里
 * 23 个记号全是这么丢的(大写字母 + `|` + `_`)。
 * 测试「每个记号都能解析到键盘上」直接把它抓出来。
 */
const SHIFT_MAP: Record<string, string> = {
  _: "-",
  "|": "\\",
  "~": "`",
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  "+": "=",
  "{": "[",
  "}": "]",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
};

/**
 * 归一化单个字符 → 基础键 + 要不要补 Shift。
 *
 * ⚠️ 两种「需要 Shift」必须分开,处理方式不一样:
 *
 * | 情况 | 例子 | 真机上要按 Shift 吗 |
 * |------|------|---------------------|
 * | Shift 派生的**符号** | `_` `\|` `{` `?` | **要** —— 它是 Shift + 另一个键 |
 * | **字母**写成了大写 | `L` `H` | **要** —— 用户就是按了 Shift+L |
 * | 带 Ctrl/Alt 的大写**字母** | `<C-H>` | **不要** —— Vim 的大写只是记法约定 |
 *
 * 第三种是最容易搞错的:`<C-H>` 看着像要按 Shift,真机上就是 Ctrl+h。
 * 而 `<C-_>` 真的要按 Ctrl+Shift+横杠。
 */
function baseOf(ch: string): { key: string; shiftSymbol: boolean; upperLetter: boolean } {
  if (SHIFT_MAP[ch]) return { key: SHIFT_MAP[ch], shiftSymbol: true, upperLetter: false };
  if (/^[A-Z]$/.test(ch)) return { key: ch.toLowerCase(), shiftSymbol: false, upperLetter: true };
  return { key: ch, shiftSymbol: false, upperLetter: false };
}

/**
 * 把 Vim 记号解析成「按哪块键 + 按住什么」。
 *
 * 支持三类:
 *   `a`        → 按 a
 *   `L`        → 按住 Shift + l(ANSI 上大写 L 就是 Shift+l)
 *   `<C-h>`    → 按住 Ctrl + h(← 这是 LazyVim 的窗口导航主力)
 *   `<M-j>`    → 按住 Alt + j
 *   `<S-CR>`   → 按住 Shift + Enter
 *   `<C-_>`    → 按住 Ctrl + Shift + -(下划线是 Shift 加横杠)
 *
 * ⚠️ Ctrl 系的字母要转小写。数据集写 `<C-H>`(Vim 约定:带修饰键字母大写),
 *   但浏览器实际按出来是 `event.key === "h"`。不转小写就找不到键位,
 *   而且会出现「高亮了 H、按出去却是 h」。
 */
export function resolve(token: string): Resolved {
  // 数据集里 leader 有 3 条原文是裸空格
  if (token === " ") return { keyId: "<Space>", mods: [], offBoard: false };

  // 已经是命名键
  if (NAMED[token]) {
    return { keyId: NAMED[token], mods: [], offBoard: token === "<Esc>" };
  }

  // <C-x> / <M-x> / <S-x> 形式
  const m = /^<(?:([CMS])-)?(.+)>$/.exec(token);
  if (m) {
    const mod = m[1] as Mod | undefined;
    const inner = m[2];

    // ⚠️ 命名键要按「带修饰记号」的写法再查一次。
    //   数据集里是 `<C-Down>`,只查 `<Down>` 会漏掉 C-,
    //   然后落进下面的「单字符」分支解析出乱七八糟的东西。
    const namedKey = NAMED[`<${inner}>`] ?? NAMED[inner];
    if (namedKey) {
      return {
        keyId: namedKey,
        mods: mod ? [mod] : [],
        offBoard: namedKey === "<Esc>",
      };
    }

    // <C-Ctrl> 这种修饰键自身
    if (inner === "Ctrl" && mod === "C") {
      return { keyId: "<C-Ctrl>", mods: [], offBoard: false };
    }

    // <C-_> / <C-L> 之类:单个字符 + 修饰键
    if (inner.length === 1) {
      const { key, shiftSymbol, upperLetter } = baseOf(inner);
      const mods: Mod[] = [];
      // ⚠️ 大写**字母**在有 Ctrl/Alt 时只是 Vim 的记法约定,不用按 Shift。
      //   但 Shift 派生的**符号**(`_` `|` `{`)是真的要按 Shift,
      //   所以 `<C-_>` = Ctrl + Shift + 横杠,而 `<C-H>` = 只按 Ctrl。
      const realShift = shiftSymbol || (upperLetter && mod === undefined);
      if (realShift) mods.push("S");
      mods.push(mod ?? "C");
      return { keyId: key, mods, offBoard: false };
    }
  }

  // 单个字符
  if (token.length === 1) {
    // 裸的大写字母/符号 = 用户真的按了 Shift
    const { key, shiftSymbol, upperLetter } = baseOf(token);
    return { keyId: key, mods: shiftSymbol || upperLetter ? ["S"] : [], offBoard: false };
  }

  return { keyId: token, mods: [], offBoard: true };
}

/** 整个数据集里出现过的记号 → 逐键解析(给键盘高亮用) */
export function resolveAll(tokens: string[]): Resolved[] {
  return tokens.map(resolve);
}

/** 键盘上所有键的 id,用来核对「数据集里的记号有没有漏画的」 */
/**
 * 键盘上所有键的 id,用来核对「数据集里的记号有没有漏画的」。
 *
 * ⚠️ 必须把 ROW_ARROWS 和 OFF_BOARD 也算进去。
 *   我第一版只算 KEY_ROWS,于是 `<Down>` `<Left>` `<Right>` 全查不到,
 *   而数据集里 `<C-Down>` `<C-Left>` `<C-Right>` `<Up>` `<Down>` 都有 ——
 *   测试直接红了才发现方向键簇被漏算。
 */
export function allKeyIds(): string[] {
  return [...KEY_ROWS.flat(), ...ROW_ARROWS, ...OFF_BOARD].map((x) => x.id);
}

export function hasKey(keyId: string): boolean {
  return allKeyIds().includes(keyId);
}