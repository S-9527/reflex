// 自动生成，请勿手改。
//
// 生成：node scripts/build-core.mjs
// 数据源：data/probe-core.json（由 scripts/probe-core.lua 在本机 nvim 实测）
//
// ## ⚠️⚠️ 为什么需要这个文件
//
// 数据集（lib/bindings.ts）全部来自 `nvim_get_keymap`，而它**只返回
// 用户/插件映射** —— Vim 内建命令一条都不在里面。本机实测：
//
//     u      n: （没有映射）
//     dd     n: （没有映射）
//     p      n: （没有映射）
//
// 所以 `u` `p` `dd` `f` `m` `q` 这些**从抽取阶段就不存在** ——
// 后面怎么聚合、去重都补不回来。这就是「vim 操作没有完全覆盖」的根因。
//
// 补的办法和 /text（文本对象）一样：**破坏性实测**。
// 造已知内容 → 落到指定位置 → `:normal! {键}` → 记录 buffer 和光标的 diff。
// 每条 `measured` 都是可复现的实测结果，探针在 scripts/probe-core.lua。
//
// ## 为什么 `desc` 是人写的
//
// 内建命令**没有 desc**（这正是它们缺失的原因）。所以「`dw` 删到下一个
// 词首」这句话没有任何数据源能生成 —— 只能人工写。
// 但每条都能对应到一个**可复现的探针下标**，`tests/core-vim.test.ts` 守住这点。
//
// ## ⚠️ headless 测不出的，如实标出来
//
// 折叠（`za` `zR` `zM`）和 `gx`（开系统程序）在 headless 下测不出效果，
// 所以**不出题**，只在 `CORE_SKIPPED` 里列出并说明。
// 「测不出来就说测不出来」是这个项目的底线。

/** 一条内建操作的实测证据 */
export type CoreMeasured = {
  /** 探针在文档的哪一行、哪一列（1-based）按下 */
  line: number;
  col: number;
  /** 前置操作（空 = 没有）。`u` 这种必须先有东西可撤销 */
  pre: string;
  /** 探针设的 filetype（`==` 这类依赖缩进规则） */
  ft: string | null;
  /** 按下之后整个 buffer 的内容 */
  result: string[];
  /** 按下之后的光标 {行, 列}，1-based */
  cursor: [number, number];
  /**
   * 按键**之前**的 buffer。
   *
   * ⚠️ 有前置操作时，这是**前置跑完**的状态，不是原始文档 ——
   * 否则 `u`（前置 `x`）的 diff 会显示「完全没变化」。
   */
  before: string[];
  /** buffer 内容变了吗 */
  changed: boolean;
  /** 可视选区（只有可视模式那几条有） */
  selection: { l1: number; c1: number; l2: number; c2: number } | null;
  /**
   * 这一条用的**自定义文档**（`null` = 用标准 CORE_SRC）。
   *
   * ⚠️ 为什么需要：标准文档是为 motion/textobject 设计的，里面没有
   * 「嵌套括号」「重复的单词」这类结构。拿它测 `%` / `*` / `&` 会得到
   * **假的「无变化」** —— 不是键失效，是样本不成立。
   * 所以那几条用自己的文档，画 diff 时要用它当「之前」。
   */
  doc: string[] | null;
};

/** 一条要练的内建操作 */
export type CoreItem = {
  /** 键序列，也是面板上显示的 */
  key: string;
  /** 分组 */
  category: string;
  /** 中文说明（人写，见文件头） */
  desc: string;
  /** 实测确认的等价键（仅展示，也算答对） */
  alts: string[];
  measured: CoreMeasured;
};

/** 测了但不出题的，以及原因 */
export type CoreSkipped = { key: string; reason: string };

/** 探针用的标准文档 —— 和实测时完全一致 */
export const CORE_SRC: string[] = [
  "local Total = compute(a, b) + 1, tail",
  "local name = \"hello world\"",
  "",
  "function f(x)",
  "  return { key = 'val' }",
  "end",
  "",
  "-- a paragraph",
  "second line here",
  "third line here"
];

/** 全部要练的内建操作 */
export const CORE_ITEMS: CoreItem[] = [
  {
    "key": "u",
    "category": "撤销 / 重复",
    "desc": "撤销上一次修改",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "x",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "ocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-R>",
    "category": "撤销 / 重复",
    "desc": "重做（撤销的反操作）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "xu",
      "ft": null,
      "result": [
        "ocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": ".",
    "category": "撤销 / 重复",
    "desc": "重复上一次修改（会跟着光标位置走）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "xw",
      "ft": null,
      "result": [
        "ocal otal = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        6
      ],
      "changed": true,
      "before": [
        "ocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "U",
    "category": "撤销 / 重复",
    "desc": "把整行恢复到本次编辑前（行级撤销，不是全局撤销）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "xx",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "cal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "dd",
    "category": "删除 / 修改",
    "desc": "删掉整行",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "cc",
    "category": "删除 / 修改",
    "desc": "改整行：清空内容并进插入模式",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "D",
    "category": "删除 / 修改",
    "desc": "从光标删到行尾",
    "alts": [
      "d$"
    ],
    "measured": {
      "line": 1,
      "col": 7,
      "pre": "",
      "ft": null,
      "result": [
        "local ",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        6
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "C",
    "category": "删除 / 修改",
    "desc": "从光标改到行尾（删完进插入模式）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 7,
      "pre": "",
      "ft": null,
      "result": [
        "local ",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        6
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "x",
    "category": "删除 / 修改",
    "desc": "删掉光标处的字符",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "ocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "X",
    "category": "删除 / 修改",
    "desc": "删掉光标**前**一个字符",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 7,
      "pre": "",
      "ft": null,
      "result": [
        "localTotal = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        6
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "r",
    "category": "删除 / 修改",
    "desc": "把光标处字符替换成一个新字符（不进插入模式）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "Zocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "s",
    "category": "删除 / 修改",
    "desc": "删掉光标字符并进插入模式（= xi）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "Zocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "S",
    "category": "删除 / 修改",
    "desc": "清空整行并进插入模式（= cc）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "new",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        3
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "dw",
    "category": "删除 / 修改",
    "desc": "删到下一个词首（词 + 后面的空格一起没）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "de",
    "category": "删除 / 修改",
    "desc": "删到词尾（只删词，**留**空格）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        " Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "d0",
    "category": "删除 / 修改",
    "desc": "从光标删到行首",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 7,
      "pre": "",
      "ft": null,
      "result": [
        "Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "daw",
    "category": "删除 / 修改",
    "desc": "删一个词 + 后面的空白（around）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "diw",
    "category": "删除 / 修改",
    "desc": "删一个词，保留空白（inner）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        " Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "yy",
    "category": "复制 / 粘贴",
    "desc": "复制整行",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "Y",
    "category": "复制 / 粘贴",
    "desc": "复制整行 —— Vim 里 Y **等价 yy**，不是 y$（书上常说错）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 7,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        7
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "yiw",
    "category": "复制 / 粘贴",
    "desc": "复制一个词",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "p",
    "category": "复制 / 粘贴",
    "desc": "粘贴到光标**后**面（行级粘贴时是下一行）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "yy",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "P",
    "category": "复制 / 粘贴",
    "desc": "粘贴到光标**前**面（行级粘贴时是上一行）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "yy",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "ddp",
    "category": "复制 / 粘贴",
    "desc": "交换相邻两行 —— dd 删行 + p 粘到下一行",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local name = \"hello world\"",
        "local Total = compute(a, b) + 1, tail",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "\"ayy",
    "category": "寄存器 / 标记 / 宏",
    "desc": "把整行复制到**命名寄存器 a**（前缀是双引号 + 寄存器名）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "\"ap",
    "category": "寄存器 / 标记 / 宏",
    "desc": "从命名寄存器 a 粘贴",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "\"ayy3j",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "local Total = compute(a, b) + 1, tail",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "\"_dd",
    "category": "寄存器 / 标记 / 宏",
    "desc": "用**黑洞寄存器** _ 删行 —— 删掉且不污染无名寄存器",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "ma",
    "category": "寄存器 / 标记 / 宏",
    "desc": "在当前位置打标记 a（buffer 不变，但跳转时用得上）",
    "alts": [],
    "measured": {
      "line": 3,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        3,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "`a",
    "category": "寄存器 / 标记 / 宏",
    "desc": "跳回标记 a 的**精确位置**（行 + 列）",
    "alts": [],
    "measured": {
      "line": 3,
      "col": 5,
      "pre": "maG",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        3,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "'a",
    "category": "寄存器 / 标记 / 宏",
    "desc": "跳回标记 a **所在行的行首**（列不还原）—— 和 `a 的区别就在这",
    "alts": [],
    "measured": {
      "line": 3,
      "col": 5,
      "pre": "maG",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        3,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "@a",
    "category": "寄存器 / 标记 / 宏",
    "desc": "重放寄存器 a 里录的宏",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "qaxqj",
      "ft": null,
      "result": [
        "ocal Total = compute(a, b) + 1, tail",
        "ocal name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": true,
      "before": [
        "ocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "@@",
    "category": "寄存器 / 标记 / 宏",
    "desc": "重复上一次执行的宏",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "qaxqj@a",
      "ft": null,
      "result": [
        "ocal Total = compute(a, b) + 1, tail",
        "cal name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": true,
      "before": [
        "ocal Total = compute(a, b) + 1, tail",
        "ocal name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "i",
    "category": "插入入口",
    "desc": "在光标**前**插入",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "loXcal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        3
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "a",
    "category": "插入入口",
    "desc": "在光标**后**追加",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "locXal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        4
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "I",
    "category": "插入入口",
    "desc": "跳到行首插入（跳过缩进后的第一个非空字符）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "Xlocal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "A",
    "category": "插入入口",
    "desc": "跳到行尾插入",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tailX",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        38
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "o",
    "category": "插入入口",
    "desc": "在**下面**开一个新行并插入",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "X",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "O",
    "category": "插入入口",
    "desc": "在**上面**开一个新行并插入",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "X",
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "R",
    "category": "插入入口",
    "desc": "进替换模式：连续覆盖后面的字符，直到按 <Esc>",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "XYcal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        2
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "v",
    "category": "可视模式",
    "desc": "字符级可视：选中一个字符范围",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        3
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": {
        "c1": 1,
        "l2": 1,
        "c2": 3,
        "l1": 1
      },
      "doc": null
    }
  },
  {
    "key": "V",
    "category": "可视模式",
    "desc": "行级可视：整行整行地选",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": {
        "c1": 1,
        "l2": 1,
        "c2": 2147483647,
        "l1": 1
      },
      "doc": null
    }
  },
  {
    "key": "<C-V>",
    "category": "可视模式",
    "desc": "块级可视：竖着选一列（列编辑）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": {
        "c1": 1,
        "l2": 1,
        "c2": 1,
        "l1": 1
      },
      "doc": null
    }
  },
  {
    "key": "viw",
    "category": "可视模式",
    "desc": "选中一个词（可视 + textobject）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        5
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": {
        "c1": 1,
        "l2": 1,
        "c2": 5,
        "l1": 1
      },
      "doc": null
    }
  },
  {
    "key": "v$",
    "category": "可视模式",
    "desc": "从光标选中到行尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        37
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": {
        "c1": 1,
        "l2": 1,
        "c2": 38,
        "l1": 1
      },
      "doc": null
    }
  },
  {
    "key": "ggVG",
    "category": "可视模式",
    "desc": "全选整个文件（gg 到开头 + V 行可视 + G 到末尾）",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        10,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": {
        "c1": 1,
        "l2": 10,
        "c2": 2147483647,
        "l1": 1
      },
      "doc": null
    }
  },
  {
    "key": "w",
    "category": "光标移动",
    "desc": "跳到下一个词首",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        7
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "b",
    "category": "光标移动",
    "desc": "跳到上一个词首",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 10,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        7
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "e",
    "category": "光标移动",
    "desc": "跳到当前/下一个词的词尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        5
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "W",
    "category": "光标移动",
    "desc": "跳到下一个字串（按空白分，标点不算分隔）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        7
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "B",
    "category": "光标移动",
    "desc": "跳到上一个字串",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 10,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        7
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "E",
    "category": "光标移动",
    "desc": "跳到字串尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        5
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "ge",
    "category": "光标移动",
    "desc": "跳到上一个词的词尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 10,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        5
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "0",
    "category": "光标移动",
    "desc": "跳到行首（第 0 列，缩进也算）",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 9,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "^",
    "category": "光标移动",
    "desc": "跳到行内第一个非空字符 —— 和 0 的区别就是缩进",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 9,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        3
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "$",
    "category": "光标移动",
    "desc": "跳到行尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        37
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "gg",
    "category": "光标移动",
    "desc": "跳到文件开头",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "G",
    "category": "光标移动",
    "desc": "跳到文件末尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        10,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "5G",
    "category": "光标移动",
    "desc": "跳到第 N 行（G 吃计数）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "}",
    "category": "光标移动",
    "desc": "跳到下一段（空行分隔）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        3,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "{",
    "category": "光标移动",
    "desc": "跳到上一段",
    "alts": [],
    "measured": {
      "line": 8,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        7,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "M",
    "category": "光标移动",
    "desc": "跳到屏幕中部",
    "alts": [],
    "measured": {
      "line": 9,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "f",
    "category": "行内查找",
    "desc": "向右找到某个字符并停在它上面",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        22
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "t",
    "category": "行内查找",
    "desc": "向右到某个字符**之前**一格（t = till）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        21
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "F",
    "category": "行内查找",
    "desc": "向左找到某个字符",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 25,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        22
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "T",
    "category": "行内查找",
    "desc": "向左到某个字符**之后**一格",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 25,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        23
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": ";",
    "category": "行内查找",
    "desc": "重复上一次 f/t/F/T（保持方向）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "f,",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        32
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": ",",
    "category": "行内查找",
    "desc": "反向重复上一次 f/t/F/T",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 25,
      "pre": "F,",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        32
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": ">>",
    "category": "缩进 / 大小写",
    "desc": "整行右缩进一个 shiftwidth",
    "alts": [],
    "measured": {
      "line": 4,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "  function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        4,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<<",
    "category": "缩进 / 大小写",
    "desc": "整行左缩进一个 shiftwidth",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "==",
    "category": "缩进 / 大小写",
    "desc": "按 filetype 的缩进规则自动缩进整行",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "<<",
      "ft": "lua",
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": ">j",
    "category": "缩进 / 大小写",
    "desc": "缩进当前行和下一行（操作符 + motion）",
    "alts": [],
    "measured": {
      "line": 4,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "  function f(x)",
        "    return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        4,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "~",
    "category": "缩进 / 大小写",
    "desc": "切换光标处字符的大小写，并右移一格",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "Local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        2
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "g~~",
    "category": "缩进 / 大小写",
    "desc": "整行大小写取反",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "LOCAL tOTAL = COMPUTE(A, B) + 1, TAIL",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "gUU",
    "category": "缩进 / 大小写",
    "desc": "整行转大写",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "LOCAL TOTAL = COMPUTE(A, B) + 1, TAIL",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "guu",
    "category": "缩进 / 大小写",
    "desc": "整行转小写",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "gUw",
    "category": "缩进 / 大小写",
    "desc": "把下一个词转大写（gU + motion）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "LOCAL Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "J",
    "category": "合并 / 拆分",
    "desc": "把下一行合上来，中间**补一个空格**",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        38
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "gJ",
    "category": "合并 / 拆分",
    "desc": "合并下一行，**不补**空格",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, taillocal name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        38
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-D>",
    "category": "滚动",
    "desc": "向下滚半屏",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        10,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-U>",
    "category": "滚动",
    "desc": "向上滚半屏",
    "alts": [],
    "measured": {
      "line": 9,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-F>",
    "category": "滚动",
    "desc": "向下滚一整页",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        10,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-B>",
    "category": "滚动",
    "desc": "向上滚一整页",
    "alts": [],
    "measured": {
      "line": 9,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        9,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-E>",
    "category": "滚动",
    "desc": "向下滚一行（光标不动）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        6,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-Y>",
    "category": "滚动",
    "desc": "向上滚一行（光标不动）",
    "alts": [],
    "measured": {
      "line": 9,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        9,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "zt",
    "category": "滚动",
    "desc": "把当前行滚到屏幕顶部（t = top）",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "zz",
    "category": "滚动",
    "desc": "把当前行滚到屏幕中间",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "zb",
    "category": "滚动",
    "desc": "把当前行滚到屏幕底部（b = bottom）",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "di(",
    "category": "文本对象",
    "desc": "删圆括号内（i( 和 i) 等价，随便按哪个）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 22,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute() + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        23
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "da(",
    "category": "文本对象",
    "desc": "删圆括号 + 括号本身",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 22,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        22
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "di{",
    "category": "文本对象",
    "desc": "删花括号内",
    "alts": [
      "diB"
    ],
    "measured": {
      "line": 5,
      "col": 12,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return {}",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        11
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "da{",
    "category": "文本对象",
    "desc": "删花括号 + 括号本身",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 12,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return ",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        9
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "di\"",
    "category": "文本对象",
    "desc": "删双引号内（不含引号）",
    "alts": [],
    "measured": {
      "line": 2,
      "col": 15,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        15
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "da\"",
    "category": "文本对象",
    "desc": "删双引号 + 引号本身",
    "alts": [],
    "measured": {
      "line": 2,
      "col": 15,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name =",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        2,
        12
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "di'",
    "category": "文本对象",
    "desc": "删单引号内",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 19,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = '' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        19
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "da'",
    "category": "文本对象",
    "desc": "删单引号 + 引号本身",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 19,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        18
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "dis",
    "category": "文本对象",
    "desc": "删一整句",
    "alts": [],
    "measured": {
      "line": 2,
      "col": 15,
      "pre": "",
      "ft": null,
      "result": [
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "dii",
    "category": "文本对象",
    "desc": "删同样缩进的整块（ii = 同缩进级别）",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 3,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        3
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "dil",
    "category": "文本对象",
    "desc": "删当前行（i + l）",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "dal",
    "category": "文本对象",
    "desc": "删当前行 + 下面的空行",
    "alts": [],
    "measured": {
      "line": 5,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        5,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-O>",
    "category": "跳转",
    "desc": "跳回上一个位置（跳转历史里往回）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "G",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "<C-I>",
    "category": "跳转",
    "desc": "跳到下一个位置（<C-o> 的反向）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "G<C-o>",
      "ft": null,
      "result": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "local Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "g;",
    "category": "跳转",
    "desc": "跳到上一个修改点（changelist 往回）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "xx",
      "ft": null,
      "result": [
        "cal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "cal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "g,",
    "category": "跳转",
    "desc": "跳到下一个修改点",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "xx",
      "ft": null,
      "result": [
        "cal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": false,
      "before": [
        "cal Total = compute(a, b) + 1, tail",
        "local name = \"hello world\"",
        "",
        "function f(x)",
        "  return { key = 'val' }",
        "end",
        "",
        "-- a paragraph",
        "second line here",
        "third line here"
      ],
      "selection": null,
      "doc": null
    }
  },
  {
    "key": "%",
    "category": "括号跳转",
    "desc": "在 ( 上跳到配对的 )",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 12,
      "pre": "",
      "ft": null,
      "result": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "cursor": [
        1,
        22
      ],
      "changed": false,
      "before": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "selection": null,
      "doc": [
        "local x = f({ a = 1 })",
        "end"
      ]
    }
  },
  {
    "key": "%",
    "category": "括号跳转",
    "desc": "在 { 上跳到配对的 }（同一条命令，换个括号也一样）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 13,
      "pre": "",
      "ft": null,
      "result": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "cursor": [
        1,
        21
      ],
      "changed": false,
      "before": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "selection": null,
      "doc": [
        "local x = f({ a = 1 })",
        "end"
      ]
    }
  },
  {
    "key": "g%",
    "category": "括号跳转",
    "desc": "**反向**跳到配对的括号 —— matchit 提供",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 22,
      "pre": "",
      "ft": null,
      "result": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "cursor": [
        1,
        12
      ],
      "changed": false,
      "before": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "selection": null,
      "doc": [
        "local x = f({ a = 1 })",
        "end"
      ]
    }
  },
  {
    "key": "[%",
    "category": "括号跳转",
    "desc": "跳到**外层**未配对的括号开头 —— matchit 的 Multi 系列",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 13,
      "pre": "",
      "ft": null,
      "result": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "cursor": [
        1,
        12
      ],
      "changed": false,
      "before": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "selection": null,
      "doc": [
        "local x = f({ a = 1 })",
        "end"
      ]
    }
  },
  {
    "key": "]%",
    "category": "括号跳转",
    "desc": "跳到**外层**未配对的括号结尾",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 13,
      "pre": "",
      "ft": null,
      "result": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "cursor": [
        1,
        21
      ],
      "changed": false,
      "before": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "selection": null,
      "doc": [
        "local x = f({ a = 1 })",
        "end"
      ]
    }
  },
  {
    "key": "a%",
    "category": "括号跳转",
    "desc": "选中当前括号块 —— 可当 textobject 用（a%）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 13,
      "pre": "",
      "ft": null,
      "result": [
        "local x = f({% a = 1 })",
        "end"
      ],
      "cursor": [
        1,
        14
      ],
      "changed": true,
      "before": [
        "local x = f({ a = 1 })",
        "end"
      ],
      "selection": null,
      "doc": [
        "local x = f({ a = 1 })",
        "end"
      ]
    }
  },
  {
    "key": "*",
    "category": "搜索词",
    "desc": "向下搜索光标所在的**整个词**（自动加 \\< \\> 边界）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 7,
      "pre": "",
      "ft": null,
      "result": [
        "local total = 1",
        "total = 2",
        "print(total)"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": false,
      "before": [
        "local total = 1",
        "total = 2",
        "print(total)"
      ],
      "selection": null,
      "doc": [
        "local total = 1",
        "total = 2",
        "print(total)"
      ]
    }
  },
  {
    "key": "#",
    "category": "搜索词",
    "desc": "向上搜索光标所在的整个词",
    "alts": [],
    "measured": {
      "line": 3,
      "col": 8,
      "pre": "",
      "ft": null,
      "result": [
        "local total = 1",
        "total = 2",
        "print(total)"
      ],
      "cursor": [
        2,
        1
      ],
      "changed": false,
      "before": [
        "local total = 1",
        "total = 2",
        "print(total)"
      ],
      "selection": null,
      "doc": [
        "local total = 1",
        "total = 2",
        "print(total)"
      ]
    }
  },
  {
    "key": "&",
    "category": "替换",
    "desc": "在下一行重复上一次 :s 替换",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": ":s/aaa/ZZZ/\r",
      "ft": null,
      "result": [
        "ZZZ bbb ZZZ",
        "aaa ccc"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "ZZZ bbb aaa",
        "aaa ccc"
      ],
      "selection": null,
      "doc": [
        "aaa bbb aaa",
        "aaa ccc"
      ]
    }
  },
  {
    "key": "<C-W>",
    "category": "插入模式编辑",
    "desc": "插入模式：删掉光标前的一个词",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        "hello world "
      ],
      "cursor": [
        1,
        12
      ],
      "changed": true,
      "before": [
        "hello world foo"
      ],
      "selection": null,
      "doc": [
        "hello world foo"
      ]
    }
  },
  {
    "key": "<C-U>",
    "category": "插入模式编辑",
    "desc": "插入模式：删到行首（整行清空）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "",
      "ft": null,
      "result": [
        ""
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "hello world foo"
      ],
      "selection": null,
      "doc": [
        "hello world foo"
      ]
    }
  },
  {
    "key": ">",
    "category": "缩进 / 大小写",
    "desc": "可视模式：缩进选中的行，且**保持选中**（rhs 是 >gv）",
    "alts": [],
    "measured": {
      "line": 1,
      "col": 1,
      "pre": "Vj",
      "ft": null,
      "result": [
        "  function f(x)",
        "    body",
        "end"
      ],
      "cursor": [
        1,
        1
      ],
      "changed": true,
      "before": [
        "function f(x)",
        "  body",
        "end"
      ],
      "selection": null,
      "doc": [
        "function f(x)",
        "  body",
        "end"
      ]
    }
  }
];

/**
 * 分组（按操作性质，不是 which-key —— 内建命令本来就不在 which-key 里）。
 *
 * 顺序即面板上的顺序，刻意按「学习的依赖关系」排：
 * 先撤销/删除，再插入，然后移动，最后才是冷门的寄存器/宏。
 */
export const CORE_CATEGORIES: string[] = [
  "撤销 / 重复",
  "删除 / 修改",
  "复制 / 粘贴",
  "寄存器 / 标记 / 宏",
  "插入入口",
  "可视模式",
  "光标移动",
  "行内查找",
  "缩进 / 大小写",
  "合并 / 拆分",
  "滚动",
  "文本对象",
  "跳转",
  "括号跳转",
  "搜索词",
  "替换",
  "插入模式编辑"
];

/** 测了但不出题的 —— 页面上单独列出，用户能核对这个判断 */
export const CORE_SKIPPED: CoreSkipped[] = [
  {
    "key": "u",
    "reason": "同一操作的第二次实测（dd 后撤销），和 u 是同一个键 —— 不重复出题"
  },
  {
    "key": ".",
    "reason": "同一操作的第二次实测（dd 后重复），和 . 是同一个键"
  },
  {
    "key": "d$",
    "reason": "和 D 是同一个操作（实测结果逐字相同），作为 D 的等价键展示"
  },
  {
    "key": "dgg",
    "reason": "d + gg 的组合，不是独立要背的键位（gg 已在光标移动里出题）"
  },
  {
    "key": "dG",
    "reason": "d + G 的组合，不是独立要背的键位（G 已在光标移动里出题）"
  },
  {
    "key": "dap",
    "reason": "和 dip 只差「带不带后面空行」，已由 inner/around 规律覆盖（见 /text）"
  },
  {
    "key": "dip",
    "reason": "同上，inner/around 规律已覆盖"
  },
  {
    "key": "yy",
    "reason": "只复制不粘贴的对照探针，和 yy 同一个键"
  },
  {
    "key": "vaw",
    "reason": "和 viw 只差 around，规律已由 inner/around 覆盖"
  },
  {
    "key": ";",
    "reason": "t, 之后重复的第二次实测，和 ; 同一个键"
  },
  {
    "key": "==",
    "reason": "对照探针（那一行本来就缩进正确，所以无变化）—— 用 << 之后的那次"
  },
  {
    "key": "q",
    "reason": "「停止录制」是宏的一部分，单独出题没意义（@a / @@ 已覆盖宏的用法）"
  },
  {
    "key": "za",
    "reason": "headless 下没有折叠可开 —— 实测无变化，**测不出效果就不出题**"
  },
  {
    "key": "zR",
    "reason": "同上，headless 下测不出折叠行为"
  },
  {
    "key": "zM",
    "reason": "同上，headless 下测不出折叠行为"
  },
  {
    "key": "di[",
    "reason": "标准文档里没有方括号 —— 样本不成立，测不出结果"
  },
  {
    "key": "di<",
    "reason": "标准文档里没有尖括号 —— 样本不成立"
  },
  {
    "key": "diB",
    "reason": "和 di{ 实测结果逐字相同，作为等价键展示"
  },
  {
    "key": "dit",
    "reason": "标准文档里没有 HTML 标签 —— 样本不成立"
  },
  {
    "key": "gcc",
    "reason": "注释是插件/Neovim 内建 comment，本机行为已由 /seq 的 gcc 覆盖"
  },
  {
    "key": "gcgc",
    "reason": "同上，和 gcc 等价"
  },
  {
    "key": "gx",
    "reason": "headless 下打不开系统程序 —— 测不出效果"
  }
];

/**
 * 题库 —— **首页分母和页面题库读的是同一份**。
 *
 * ⚠️⚠️ 这个常量存在的唯一理由，是让 `lib/boards.ts` 能拿到**真实题数**。
 *
 * 原来首页的分母是手写的估计值，于是四个板块对不上页面实际题数
 * （`/seq` 写 235 实际 135、`/text` 写 16 实际 11），而且**都不报错** ——
 * 后果是进度条永远到不了 100%。详见 `lib/boards.ts` 顶部。
 *
 * 这里直接给出题目形状（id + 键 + 解法），页面和 boards 都用它，不可能对不上。
 */
export type CoreTask = {
  /** 题目 id：`core:<键>#<下标>`（同一个键有多次实测，用下标区分） */
  id: string;
  /** 键序列 */
  key: string;
  /** 中文说明 */
  desc: string;
  /** 分组 */
  category: string;
  /** 主解法 + 实测等价键 */
  accept: string[][];
};

export const CORE_TASKS: CoreTask[] = CORE_ITEMS.map((it, i) => ({
  id: `core:${it.key}#${i}`,
  key: it.key,
  desc: it.desc,
  category: it.category,
  accept: [splitLhs(it.key), ...it.alts.map((a) => splitLhs(a))],
}));

/** Vim 记法 → 逐键数组。和 lib/keys.ts 的 splitLhs 同源 */
function splitLhs(lhs: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lhs.length) {
    if (lhs[i] === "<") {
      const end = lhs.indexOf(">", i);
      if (end > i) {
        out.push(lhs.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    out.push(lhs[i]);
    i++;
  }
  return out;
}
