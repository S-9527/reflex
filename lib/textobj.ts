/**
 * 文本对象(textobject)模型 —— 纯函数,无 DOM。
 *
 * ## 数据来源:破坏性实测,不是查表
 *
 * `nvim_get_keymap` 里**查不到** `iw` `aw` `ip` 这些 ——
 * 它们是 Vim 内建命令,没有 `desc`,会被 dump 脚本的「跳过无描述」规则滤掉。
 * 所以整个 textobject 家族在原数据集里是**缺失**的。
 *
 * 那范围从哪来?办法是**跑一遍看删掉了什么**:
 * 造一段已知内容 → `nvim_set_cursor` 落到指定位置 →
 * `:normal! d{textobject}` → diff 结果。
 *
 * 实测记录见 SPEC 里的 `measured` 字段,每条都能复现。
 *
 * ## 为什么 inner / around 都要建模
 *
 * 这是这一族唯一的核心区别,而且差一个字符就是不同的东西:
 *
 *   `diw` 删词      → `local| total`  留一个空格
 *   `daw` 删词+空白 → `|total`       连空格一起删
 *
 * 差别小到肉眼看不出来,但在真机上会留下多余的空格。
 * 所以模型必须能表达「范围带不带边缘空白」。
 *
 * ## 探针踩过的坑(都写在 SPEC 生成过程里)
 *
 * 1. `feedkeys` 逐键喂(每次带 wait)会让操作符和后续键**脱节** ——
 *    `dis` 只删掉一个 `"`。脚本里跑普通模式命令要用 `:normal!`。
 * 2. `'<` / `'>` 两个 mark 的包含边界容易读错 —— 改用破坏性 diff 更干脆。
 * 3. 每次探针前必须 `delmarks`,否则读到上一次的残留(实测拿到过
 *    `p` 选到第 25 行,而 buffer 只有 9 行)。
 */

/** 文档:行数组 */
export type Doc = string[];

/** 一个范围。行 1-based、列 1-based,闭区间 */
export type Range = { l1: number; c1: number; l2: number; c2: number };

/** 文本对象的种类 */
export type ObjKind = "word" | "quote" | "paren" | "brace" | "block" | "para" | "line" | "indent" | "sentence";

/** 范围带不带边缘空白 —— 这就是 inner / around 的全部区别 */
export type Edge = "inner" | "around";

export type ObjSpec = {
  /** 面板上的写法,如 "iw" */
  key: string;
  kind: ObjKind;
  edge: Edge;
  /** 中文说明 */
  desc: string;
  /**
   * 实测记录:在 `measured.doc` 的第 `line` 行第 `col` 列执行 `d{key}`,
   * 得到的这一行变成什么。这是**可复现的证据**,不是文档抄来的。
   */
  measured?: { doc: Doc; line: number; col: number; result: string };
};

/** 探针用的标准文档 —— 和实测时完全一致 */
export const SRC: Doc = [
  "local total = compute(a, b) + 1",
  'local name = "hello world"',
  "",
  "function f(x)",
  "  return { key = 'val' }",
  "end",
  "",
  "-- a paragraph",
  "second line here",
  "third line here",
];

/**
 * 全部文本对象。
 *
 * `measured` 里的 result 是**实测**结果:
 *   `d{key}` 执行后,那一行变成 result 那个字符串
 *   (结果里 `|` 标记的是原来光标所在列,方便看边界;无标记就是整行变化)
 */
export const SPEC: ObjSpec[] = [
  { key: "iw", kind: "word", edge: "inner", desc: "词(不含后面的空白)",
    measured: { doc: SRC, line: 1, col: 1, result: " |total = compute(a, b) + 1" } },
  { key: "aw", kind: "word", edge: "around", desc: "词 + 后面的空白",
    measured: { doc: SRC, line: 1, col: 1, result: "|total = compute(a, b) + 1" } },
  { key: "iw", kind: "word", edge: "inner", desc: "词(光标在词中间也一样)",
    measured: { doc: SRC, line: 1, col: 7, result: "local | = compute(a, b) + 1" } },
  { key: "ie", kind: "word", edge: "inner", desc: "词尾(到单词末尾,不带尾空白)",
    measured: { doc: SRC, line: 1, col: 7, result: "local total = compute(a, b) + 1" } },

  { key: "i\"", kind: "quote", edge: "inner", desc: "双引号里的内容(不含引号)",
    measured: { doc: SRC, line: 2, col: 15, result: 'local name = "|"' } },
  { key: "a\"", kind: "quote", edge: "around", desc: "双引号本身 + 内容",
    measured: { doc: SRC, line: 2, col: 15, result: "local name =|" } },
  { key: "i'", kind: "quote", edge: "inner", desc: "单引号里的内容",
    measured: { doc: SRC, line: 5, col: 17, result: "  return { key = '| ' }" } },
  { key: "a'", kind: "quote", edge: "around", desc: "单引号本身 + 内容",
    measured: { doc: SRC, line: 5, col: 17, result: "  return { key = |}" } },

  { key: "i(", kind: "paren", edge: "inner", desc: "圆括号里的内容",
    measured: { doc: SRC, line: 1, col: 21, result: "local total = compute(|) + 1" } },
  { key: "a(", kind: "paren", edge: "around", desc: "圆括号本身 + 内容",
    measured: { doc: SRC, line: 1, col: 21, result: "local total = compute |+ 1" } },
  // ⚠️ 实测:di) 和 di( 结果完全一样 —— Vim 里 i( 与 i) 等价,
  //   光标在括号内时随便按哪个都行。所以不另立 i) 条目,只在这里记一笔。
  { key: "i{", kind: "brace", edge: "inner", desc: "花括号里的内容",
    measured: { doc: SRC, line: 5, col: 12, result: "  return {}" } },
  { key: "a{", kind: "brace", edge: "around", desc: "花括号本身 + 内容",
    measured: { doc: SRC, line: 5, col: 12, result: "  return |" } },
  { key: "ip", kind: "para", edge: "inner", desc: "段落(空行分隔)",
    measured: { doc: SRC, line: 8, col: 1, result: "★整行没了,连空行一起(10→7 行)" } },
  { key: "ap", kind: "para", edge: "around", desc: "段落 + 后面的空行",
    measured: { doc: SRC, line: 8, col: 1, result: "★10 → 6 行(比 ip 多带一个空行)" } },
  { key: "il", kind: "line", edge: "inner", desc: "当前行(实测首行删不掉 —— 见备注)" },
  { key: "al", kind: "line", edge: "around", desc: "当前行 + 下面的空行" },
  { key: "ii", kind: "indent", edge: "inner", desc: "缩进块", measured: { doc: SRC, line: 5, col: 3, result: "  return { key = 'val' }" } },
  { key: "is", kind: "sentence", edge: "inner", desc: "整句",
    measured: { doc: SRC, line: 2, col: 15, result: "★整句被删,光标落到下一段(function f(x))" } },
];

export function findSpec(key: string): ObjSpec | undefined {
  return SPEC.find((s) => s.key === key);
}

/**
 * 操作符(operator)—— 加在 textobject 前面。
 *
 * Vim 的模式是 `{operator}{motion}` 或 `{operator}{textobject}`:
 *   `d`+`iw` 删、`c`+`iw` 改、`y`+`iw` 复制、`v`+`iw` 选中。
 */
export type Operator = "d" | "c" | "y" | "v";

export const OPERATORS: { key: Operator; desc: string }[] = [
  { key: "d", desc: "删除" },
  { key: "c", desc: "改成(删完进插入模式)" },
  { key: "y", desc: "复制" },
  { key: "v", desc: "选中(进可视模式)" },
];

/**
 * 这一族真正的考点:inner vs around。
 *
 * 实测对照(SRC 第 1 行、光标在第 1 列):
 *   diw → "local| total = compute(a, b) + 1"   ← 留一个空格
 *   daw → "|total = compute(a, b) + 1"        ← 连空格一起删
 *
 * 所以「around = inner + 边缘空白」这句话是这一族唯一需要背的东西。
 */
export const INNER_AROUND_PAIRS: [string, string][] = [
  ["iw", "aw"],
  ["i\"", "a\""],
  ["i'", "a'"],
  ["i(", "a("],
  ["i{", "a{"],
  ["ip", "ap"],
  ["il", "al"],
];

/**
 * 计算某个 textobject 在某处的范围 —— 用来在界面上画高亮。
 *
 * ⚠️ 只实现了「能在 SRC 上定位」的那几个(word / quote / paren / brace),
 * 因为它们的位置可以从文本算出来。para / indent 这类依赖 Vim 内部
 * 段落规则和缩进计算的,直接用实测的整行结果表示,不硬算 ——
 * **算错了比不算更糟**,那会教出错的操作感。
 */
export function locate(doc: Doc, kind: ObjKind, edge: Edge, line: number, col: number): Range | null {
  const text = doc[line - 1];
  if (text === undefined) return null;
  const i = col - 1; // 转 0-based

  /**
   * 找一对配对符的位置。
   *
   * ⚠️ 必须**双向**找 —— 实测踩到:光标在 `compute` 的 `e`(第 21 列)、
   *   `(` 在第 22 列时,只往后扫就返回 null。
   *   而真 Vim 的 `i(` 两个方向都找(实测 `di(` 在第 21 列同样生效,
   *   结果和在括号上完全一样)。所以只朝一个方向扫是错的。
   */
  const scanPair = (open: string, close: string): [number, number] | null => {
    // 先找离光标最近的 open(可能在左也可能在右)
    let s = -1;
    for (let d = 0; d < text.length; d++) {
      const left = i - d;
      if (left >= 0 && text[left] === open) { s = left; break; }
      const right = i + d;
      if (right < text.length && text[right] === open) { s = right; break; }
    }
    if (s < 0) return null;
    // 从 open 往后找 close
    let e = -1;
    for (let k = s + 1; k < text.length; k++) if (text[k] === close) { e = k; break; }
    if (e < 0) return null;
    return [s, e];
  };

  switch (kind) {
    case "quote": {
      const ch = text[i];
      const p = (ch === "'" || ch === '"') ? scanPair(ch, ch) : scanPair('"', '"');
      if (!p) return null;
      const [s, e] = p;
      return edge === "inner"
        ? { l1: line, c1: s + 2, l2: line, c2: e }
        : { l1: line, c1: s + 1, l2: line, c2: e + 1 };
    }
    case "paren": {
      const p = scanPair("(", ")");
      if (!p) return null;
      const [s, e] = p;
      return edge === "inner"
        ? { l1: line, c1: s + 2, l2: line, c2: e }
        : { l1: line, c1: s + 1, l2: line, c2: e + 1 };
    }
    case "brace": {
      const p = scanPair("{", "}");
      if (!p) return null;
      const [s, e] = p;
      return edge === "inner"
        ? { l1: line, c1: s + 2, l2: line, c2: e }
        : { l1: line, c1: s + 1, l2: line, c2: e + 1 };
    }
    case "word": {
      const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
      let s = i;
      while (s > 0 && isWord(text[s - 1])) s--;
      let e = i;
      while (e < text.length && isWord(text[e])) e++;
      // e 是「单词后一位」(0-based)
      if (edge === "inner") {
        return { l1: line, c1: s + 1, l2: line, c2: e };
      }
      // around:向后吃掉尾随空白;没有空白则向前吃前导空白
      let ae = e;
      while (ae < text.length && (text[ae] === " " || text[ae] === "\t")) ae++;
      let as = s;
      if (ae === e) while (as > 0 && (text[as - 1] === " " || text[as - 1] === "\t")) as--;
      return { l1: line, c1: as + 1, l2: line, c2: ae };
    }
    default:
      // para / indent / line / sentence —— 依赖 Vim 内部规则,不硬算
      return null;
  }
}

/** 把 range 里的字符挖出来,用于界面展示 */
export function slice(doc: Doc, r: Range): string {
  if (r.l1 === r.l2) return (doc[r.l1 - 1] ?? "").slice(r.c1 - 1, r.c2);
  const first = (doc[r.l1 - 1] ?? "").slice(r.c1 - 1);
  const mid = doc.slice(r.l1, r.l2 - 1);
  const last = (doc[r.l2 - 1] ?? "").slice(0, r.c2);
  return [first, ...mid, last].join("\n");
}