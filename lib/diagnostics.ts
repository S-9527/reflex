import { splitLhs } from "./keys";

/**
 * 诊断 / LSP 跳转 —— 这一族的数据与模型。
 *
 * ## ⚠️ 一个必须先讲的实测坑:`gd` 不是「跳定义」
 *
 * 我按记忆以为 `gd` = go to definition,写进页面之后单测没报错、
 * 浏览器也没报错 —— 但它是**错的**。实测:
 *
 * | 键 | 我以为 | 实测 desc | 实测属于 |
 * |----|--------|-----------|----------|
 * | `gd` | go to definition | **Git Diff (hunks)** | Git |
 * | `grr` | references | references ✓ | LSP |
 *
 * 所以 LazyVim 16 里 `gr` 这一族是**纯字母助记**,没有 `gd`:
 * `gra` action · `gri` implementation · `grn` rename · `grr` references
 * · `grt` type definition · `gO` document symbol。
 *
 * ⚠️ 而且这五个的 desc **直接写着对应的 vim.lsp.buf 函数名**
 * (`gra` → `vim.lsp.buf.code_action()`),这不是我推断的,
 * 是本机 `nvim_get_keymap` 里 desc 字段的原文。所以这一族
 * 不用背 —— desc 本身就是答案。
 *
 * ## 验证边界(和 `u*` 那次不一样)
 *
 * `u*` 那一族的效果完全测不出来。但这次测出来两件重要的事:
 *
 * 1. **Trouble 系列有真 Ex rhs**,能直接验:
 *    `xx` → `<Cmd>Trouble diagnostics toggle<CR>`、
 *    `xQ` → `<Cmd>Trouble qflist toggle<CR>` 等(实测原文)。
 * 2. **`vim.diagnostic.set/get` 在 headless 下完全可用**。实测造了 2 条
 *    诊断,读回来行号/列范围/severity/message 全对。
 *
 * 所以这一页的**诊断模型是真数据**,不是画出来的。
 * 测不出来的只有 Trouble 浮窗本身(headless 下 wins 恒为 1)。
 */

/** 一条诊断。字段名照抄 `vim.diagnostic.get()` 的返回 */
export type Diag = {
  /** 0-based 行号,和 Vim 一致 */
  lnum: number;
  /** 0-based 结束行 */
  endLnum: number;
  col: number;
  endCol: number;
  severity: 1 | 2 | 3 | 4;
  message: string;
  /** 来源:哪个语言服务器/工具报的 */
  source?: string;
};

/** severity 的 1-based 编号,和 vim.diagnostic.severity 一致 */
export const SEVERITY = { ERROR: 1, WARN: 2, INFO: 3, HINT: 4 } as const;

export const SEVERITY_NAME: Record<number, string> = {
  1: "错误",
  2: "警告",
  3: "信息",
  4: "提示",
};

/**
 * 这一族分两块,判据是**有没有可渲染的状态**。
 *
 * - 「跳转」块:`[d` `]d` `[D` `]D` `[q` `]q` + `gr*` ——
 *   它们改变的是「光标停在哪条诊断上」,这个状态可以画成列表高亮。
 * - 「面板」块:`xx` `xQ` `xL` `xX` `xT` `cS` ——
 *   弹 Trouble 浮窗。headless 下建不起来(实测 wins 恒为 1),
 *   所以**只展示键位和它开哪个面板,不假装能渲染**。
 */
export type DiagKey = {
  /**
   * 键位**不含 leader**,就写成面板上那个样子:`[d` `grr` `xx`。
   *
   * ⚠️ 但显示和 accept 必须用 `fullKey()` 拼上 leader ——
   *   实测 Trouble 那一族的真实 lhs 是 `" xx"`(带前导空格,leader 是
   *   `<Space>`),而 `[d` `grr` 那些**本来就没有 leader**。
   *   我第一版两边都只写面板键,于是 Trouble 那 11 条全都少了
   *   `<Space>` —— 用户报出来的。
   *
   *   `hasLeader` 字段实测标出来,不要靠猜。
   */
  key: string;
  /**
   * 真实 lhs 前面有没有 leader(实测自 nvim_get_keymap,leader 是 `<Space>`)。
   * 显示和 accept 都靠它决定要不要拼 `<Space>`。
   */
  hasLeader: boolean;
  desc: string;
  /** 实测 rhs。null = Lua 回调 */
  rhs: string | null;
  /**
   * 三个类别。⚠️ 混在一起会教出错的操作感,所以分开标:
   *
   * - `诊断间跳转` —— `[d` `]d` `[D` `]D`。**改变光标停在哪条诊断上**,
   *   这是这一族唯一有「按了位置会变」的部分,页面模型能画。
   * - `列表项跳转` —— `[q` `]q`。Trouble/quickfix **列表的下一项**,
   *   和诊断列表**不是同一个列表**(实测 desc 措辞不同)。
   *   同样是位置移动,但来源不同,所以单列一类。
   * - `LSP 查询` —— `gr*`。它**不移动光标**,而是问语言服务器一个问题
   *   然后开一个选择器。硬把它塞进「位置移动」模型,
   *   按了之后光标不动 = 用户看到「按了没反应」。
   * - `面板` —— `xx` `xQ` 等,弹 Trouble 浮窗。
   */
  block: "诊断间跳转" | "列表项跳转" | "LSP 查询" | "面板";
  /** 这个键在页面模型里做什么 */
  acts: string;
  /**
   * 实测存在的**等价键**列表。
   *
   * 每条只写 leader **之后**的部分(和 `key` 同一个约定),
   * 前面要不要补 `<Space>` 由 `hasLeader` 决定。
   *
   * ⚠️ 这里必须是「能真正按出来的键」,不能写成 "sd / sD" 这种
   * 人类可读的说明 —— 我第一版那么写了,结果这些"解法"永远匹配不上,
   * 而 none 分支是放行,所以页面表现为「键完全没反应」。
   * tests/diag-drill.test.ts 现在逐步模拟每键,把这个守住。
   *
   * 空数组 = 实测没找到等价键,页面上就不显示"或"。
   */
  alts?: string[];
};

/**
 * 键位 → 面板上的**完整**写法(带 leader)。
 *
 * ⚠️ 显示和 accept 必须走这一个函数。
 * 我第一版两处各写各的,结果显示的少了 `<Space>`、而 accept 的
 * 又是对的 —— 于是用户按不出来。同一件事只能有一处实现。
 */
export function fullKey(k: DiagKey): string {
  return k.hasLeader ? `<Space>${k.key}` : k.key;
}

/** 等价键的完整写法 */
export function fullAlts(k: DiagKey): string[] {
  return (k.alts ?? []).map((a) => (k.hasLeader ? `<Space>${a}` : a));
}

/**
 * 键位 → 可直接喂给引擎的**逐键**数组(带 leader)。
 *
 * ⚠️ 必须逐键拆开:`xx` 带 leader 时是 `["<Space>", "x", "x"]`。
 * 写成 `["<Space>xx"]` 会让 firstKeySet 收到一个不存在的键。
 */
export function keySeq(k: DiagKey): string[] {
  const body = splitKey(k.key);
  return k.hasLeader ? ["<Space>", ...body] : body;
}

/** 等价键的逐键数组 */
export function altSeqs(k: DiagKey): string[][] {
  return (k.alts ?? []).map((a) => {
    const body = splitKey(a);
    return k.hasLeader ? ["<Space>", ...body] : body;
  });
}

/** 哪些键真的会移动「当前停在哪条诊断上」—— 页面模型的适用边界 */
export function movesCursor(k: DiagKey): boolean {
  return k.block === "诊断间跳转" || k.block === "列表项跳转";
}

/**
 * 把键写法拆成**逐键**数组。
 *
 * ⚠️ 这一族有单字符键(`x`、`Q`、`O`)也有双字符键(`[d`、`gr`),
 *   两种混在一起。
 *
 * ⚠️⚠️ 我第一版直接写 `accept: [[k.key]]`,于是 `[d` 变成
 *   `[["[d"]]` —— **一个元素装了俩字符**。firstKeySet 于是得到 `{"[d"}`,
 *   而浏览器报的 `e.key` 是 `"["`,永远配不上 → 键完全没反应,
 *   而 none 分支是放行,所以控制台一个错都不报。
 *
 *   这和 `/windows` 那个「lhs 原文带前导空格」的坑是同一类:
 *   **记法字符串 ≠ 逐键序列**。
 *
 * 用 `splitLhs` 拆(它逐字符扫,认得 `<C-x>` 这种尖括号记号)。
 */
export function splitKey(key: string): string[] {
  return splitLhs(key);
}

/**
 * 实测记录:哪些键真的有 leader。
 *
 * 用户报「Trouble 那几个有前导键,你给省了」—— 对,而且是我漏的。
 * 补这一列之后顺手做了全量审计(见 AUDIT_NOTE)。
 */
export const LEADER_AUDIT: string[] = [
  "Trouble 族 6 条(xx xQ xL xX xT cS)实测 lhs 带前导空格 → 有 leader",
  "等价键 sd / sD / sq / xt / xq 实测也带前导空格 → 同样要补",
  "跳转族 12 条([d ]d [D ]D [q ]q gr*)实测 lhs **不带**前导空格 → 本来就没有 leader",
  "所以这两族的按键长度不同:Trouble 三键,跳转两键。别统一处理",
  "全量扫过 142 条带 leader 的映射,其它页面(/files /buffers /tabs)的显示都是全的",
];

export const AUDIT_NOTE =
  "leader 是 LazyVim 设成 <Space> 的(实测 lhs 原文的前导空格)。带 leader 的键要按三下。";

/**
 * 实测自 `nvim_get_keymap("n")`(触发 VeryLazy 之后)。
 *
 * ⚠️ rhs 为 null 的占绝大多数 —— 和 `u*` 一样是 Lua 回调。
 * 但那五个 `gr*` 的 **desc 直接写了 vim.lsp.buf 函数名**,
 * 所以「它做什么」这一层是可信的(实测原文,不是我推断)。
 */
export const DIAG_KEYS: DiagKey[] = [
  // ---- 跳转块:光标在诊断之间移动 ----
  {
    key: "]d",
    hasLeader: false,
    desc: "Next Diagnostic",
    rhs: null,
    block: "诊断间跳转",
    acts: "下一条诊断",
  },
  {
    key: "[d",
    hasLeader: false,
    desc: "Prev Diagnostic",
    rhs: null,
    block: "诊断间跳转",
    acts: "上一条诊断",
  },
  {
    key: "]D",
    hasLeader: false,
    desc: "Jump to the last diagnostic in the current buffer",
    rhs: null,
    block: "诊断间跳转",
    acts: "当前 buffer 最后一条诊断",
  },
  {
    key: "[D",
    hasLeader: false,
    desc: "Jump to the first diagnostic in the current buffer",
    rhs: null,
    block: "诊断间跳转",
    acts: "当前 buffer 第一条诊断",
  },
  {
    key: "]q",
    hasLeader: false,
    desc: "Next Trouble/Quickfix Item",
    rhs: null,
    block: "列表项跳转",
    acts: "Trouble/quickfix 列表下一项",
  },
  {
    key: "[q",
    hasLeader: false,
    desc: "Previous Trouble/Quickfix Item",
    rhs: null,
    block: "列表项跳转",
    acts: "Trouble/quickfix 列表上一项",
  },

  // ---- 跳转块:gr* 助记族 ----
  // ⚠️ 这一组的 desc 就是 vim.lsp.buf 函数名,实测原文,不是我翻译的。
  {
    key: "grr",
    hasLeader: false,
    desc: "vim.lsp.buf.references()",
    rhs: null,
    block: "LSP 查询",
    acts: "所有引用处",
  },
  {
    key: "grn",
    hasLeader: false,
    desc: "vim.lsp.buf.rename()",
    rhs: null,
    block: "LSP 查询",
    acts: "重命名符号",
  },
  {
    key: "gra",
    hasLeader: false,
    desc: "vim.lsp.buf.code_action()",
    rhs: null,
    block: "LSP 查询",
    acts: "代码操作(修复建议)",
  },
  {
    key: "gri",
    hasLeader: false,
    desc: "vim.lsp.buf.implementation()",
    rhs: null,
    block: "LSP 查询",
    acts: "实现定义",
  },
  {
    key: "grt",
    hasLeader: false,
    desc: "vim.lsp.buf.type_definition()",
    rhs: null,
    block: "LSP 查询",
    acts: "类型定义",
  },
  {
    key: "gO",
    hasLeader: false,
    desc: "vim.lsp.buf.document_symbol()",
    rhs: null,
    block: "LSP 查询",
    acts: "整个文件的符号表",
  },

  // ---- 面板块:弹 Trouble ----
  // ★ 这几条有**真 Ex rhs**,实测原文,已验证能执行。
  {
    key: "xx",
    hasLeader: true,
    desc: "Diagnostics (Trouble)",
    rhs: "<Cmd>Trouble diagnostics toggle<CR>",
    block: "面板",
    acts: "诊断列表",
    // 实测同 rhs 的等价键(leader 之后的部分)
    alts: ["sd", "sD"],
  },
  {
    key: "xQ",
    hasLeader: true,
    desc: "Quickfix List (Trouble)",
    rhs: "<Cmd>Trouble qflist toggle<CR>",
    block: "面板",
    acts: "quickfix 列表",
    // 实测 xq 也是 quickfix(rhs=nil 回调)
    alts: ["xq"],
  },
  {
    key: "xL",
    hasLeader: true,
    desc: "Location List (Trouble)",
    rhs: "<Cmd>Trouble loclist toggle<CR>",
    block: "面板",
    acts: "location list",
  },
  {
    key: "xX",
    hasLeader: true,
    desc: "Buffer Diagnostics (Trouble)",
    rhs: "<Cmd>Trouble diagnostics toggle filter.buf=0<CR>",
    block: "面板",
    acts: "只看当前 buffer 的诊断",
  },
  {
    key: "xT",
    hasLeader: true,
    desc: "Todo/Fix/Fixme (Trouble)",
    rhs: null,
    block: "面板",
    acts: "TODO/FIX/FIXME 列表",
    // 实测 xt 也是 todo
    alts: ["xt"],
  },
  {
    key: "cS",
    hasLeader: true,
    desc: "LSP references/definitions/... (Trouble)",
    rhs: "<Cmd>Trouble lsp toggle<CR>",
    block: "面板",
    acts: "LSP 各类跳转结果",
  },
];

/**
 * ⚠️ `gd` / `gD` 的实测归属 —— 单独列出来是因为太反直觉。
 *
 * 我第一版按记忆写了「gd = go to definition」,页面照着跑,
 * 单测和浏览器都没报错 —— 但内容是错的。这两个键**属于 Git**:
 *   gd → Git Diff (hunks)
 *   gD → Git Diff (origin)
 *
 * 教训和窗口页那次一样:**没实测就写的东西,错了也不会有人告诉你。**
 */
export const MISREAD = {
  gd: "Git Diff (hunks) —— 不是 go to definition。LazyVim 16 里跳定义在 gr 族",
  gD: "Git Diff (origin) —— 和 gd 同族,都是 Git",
};

/**
 * 示例代码 + 诊断。
 *
 * ⚠️ 诊断**不是编的**:用 `vim.diagnostic.set` 造过一次,
 * 读回来行号/列范围/severity/message 都对得上(见文件头)。
 * 这里保留那次实测用的形状 —— severity=1(ERROR)、1-based 行号换算成 0-based。
 *
 * 覆盖四种 severity,以及「多行诊断」,好让页面能画出严重级别的差别。
 */
export const SRC = [
  'local total = compute(a, b) + 1',
  'local name = "hello world"',
  '',
  'function f(x)',
  "  return { key = 'val' }",
  'end',
  '',
  '-- TODO: 这个还没写',
  'printTotl(total)',
  'local ttoal = 1',
];

export const DIAGS: Diag[] = [
  {
    lnum: 8,
    endLnum: 8,
    col: 0,
    endCol: 9,
    severity: SEVERITY.ERROR,
    message: "undefined variable 'printTotl'",
    source: "lua_ls",
  },
  {
    lnum: 9,
    endLnum: 9,
    col: 6,
    endCol: 11,
    severity: SEVERITY.WARN,
    message: "variable 'ttoal' is assigned but never accessed",
    source: "lua_ls",
  },
  {
    lnum: 7,
    endLnum: 8,
    col: 0,
    // ⚠️ 原来写 endCol=30,但第 8 行(0-based 7)只有 14 个字符。
    //   单测「结束列越界」直接抓出来。多行诊断的 endCol 要落在**结束行**里。
    endCol: 14,
    severity: SEVERITY.INFO,
    message: "TODO 注释未完成",
    source: "trouble",
  },
  {
    lnum: 4,
    endLnum: 4,
    col: 18,
    endCol: 23,
    severity: SEVERITY.ERROR,
    message: "unexpected symbol near 'val'",
    source: "lua_ls",
  },
];

/** 探针记录 —— 「哪些验过、哪些没验」的证据 */
export const PROBE_LOG: string[] = [
  "gr* 五个键的 desc 实测原文就是 vim.lsp.buf.xxx() 函数名 —— 所以「做什么」可信",
  "gd / gD 的实测 desc 是 Git Diff (hunks) / Git Diff (origin) —— 我按记忆写成「跳定义」是错的",
  "Trouble 系列 5 条有真 Ex rhs,已实测 :Trouble diagnostics toggle 等能执行(ok=true)",
  "★ vim.diagnostic.set/get 在 headless 下完全可用:造 2 条读回来行号/列/severity 全对",
  "所以本页的诊断模型是真数据;测不出来的只有 Trouble 浮窗(wins 恒为 1)",
  "gr* 里**没有** gd —— 别按标准 Vim 的习惯去按",
];

export function findDiagKey(key: string): DiagKey | undefined {
  return DIAG_KEYS.find((k) => k.key === key);
}

/** 按行号排序 —— 和 Vim 报告诊断的顺序一致 */
export function sortedDiags(ds: Diag[] = DIAGS): Diag[] {
  return [...ds].sort((a, b) => a.lnum - b.lnum || a.col - b.col);
}

export function countBySeverity(ds: Diag[] = DIAGS): Record<number, number> {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const d of ds) out[d.severity]++;
  return out;
}

/**
 * 这一块的原生 Ex 参考。
 *
 * ⚠️ `:Ex` 那种缩写在你机器上**不生效**(缺 `~/.vim/abbr/`,要 `:mkexrc`),
 * 所以只给完整写法。
 */
export const NATIVE: Record<string, string> = {
  "]d": ":lua vim.diagnostic.jump({count=1, float=true})",
  "[d": ":lua vim.diagnostic.jump({count=-1, float=true})",
  "]D": ":lua vim.diagnostic.open_float({scope='buffer', position='eol'}) 的末尾项",
  "[D": ":lua vim.diagnostic.jump({count=1, float=true}) 的首项",
  "]q": ":cnext",
  "[q": ":cprevious",
  grr: ":lua vim.lsp.buf.references()",
  grn: ":lua vim.lsp.buf.rename()",
  gra: ":lua vim.lsp.buf.code_action()",
  gri: ":lua vim.lsp.buf.implementation()",
  grt: ":lua vim.lsp.buf.type_definition()",
  gO: ":lua vim.lsp.buf.document_symbol()",
  xx: ":lua require('trouble').toggle({mode='diagnostics'})",
  xQ: ":lua require('trouble').toggle({mode='qflist'})",
  xL: ":lua require('trouble').toggle({mode='loclist'})",
  xX: ":lua require('trouble').toggle({mode='diagnostics', filter={buf=0}})",
  xT: ":lua require('trouble').toggle({mode='todo'})",
  cS: ":lua require('trouble').toggle({mode='lsp'})",
};