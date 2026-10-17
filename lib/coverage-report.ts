/**
 * 覆盖率对照 —— 「Vim 有什么」× 「reflex 练了什么」。
 *
 * 纯函数，有单测（`tests/coverage-report.test.ts`）。
 *
 * ## ⚠️⚠️ 为什么必须拿 `index.txt` 当分母
 *
 * 这个项目有两个**互补**的数据源：
 *
 * | 源 | 有什么 | 没有什么 |
 * |----|--------|---------|
 * | `nvim_get_keymap`（`data/keymaps.json`）| 本机真实映射 | **内建命令一条都看不到** |
 * | Vim 官方 `doc/index.txt`（`data/vim-index.json`）| 全部内建命令 + 官方描述 | 本机绑了哪些键 |
 *
 * 只用前者，覆盖率审计看着自洽（「数据集内的键有没有练不到」），
 * 但**前提「数据集 = 全部要练的东西」不成立** ——
 * 实测 `nvim_get_keymap` 里根本没有 `h` `l` `m` `q` `:` `ZZ`
 * 这些内建命令，于是它们从来没进过审计视野。
 *
 * 所以：「练全了没有」这个问题，**只能用 index.txt 当分母**。
 *
 * ## 三个状态
 *
 * 一条 Vim 命令，对 reflex 来说只有三种情况：
 *
 * | 状态 | 含义 |
 * |------|------|
 * | `covered` | 有题在练它（最优解或等价键命中） |
 * | `alias` | 它是别的命令的别名（`<BS>` = `h`）—— 练那条就够 |
 * | `missing` | **没题，也不是别名** —— 这才是真正的缺口 |
 *
 * 另外两类不算缺口：`notUsed`（文档标记 `not used`）、
 * `prefix`（`g` / `z` / `[` 这种等下一个键的前缀，单独出题没意义）。
 */

import type { Command } from "./bindings";

/** `data/vim-index.json` 的一条 */
export type VimIndexEntry = {
  section: string;
  /** 官方 tag（`CTRL-W_c`），可回溯原文 */
  tag: string | null;
  /** 帮助标签（`CTRL-W_c`），用于回溯原文 */
  helpTag?: string | null;
  /** 官方写的键原文 */
  char: string;
  /** 转成训练器统一记法后的键 */
  vim: string;
  action: string;
  /** `same as X` 指向的目标键（null = 不是别名） */
  aliasOf: string | null;
  isNotUsed: boolean;
  isDup: boolean;
  isSeeAlso: boolean;
};

export type CoverageState =
  | "covered"
  | "alias"
  | "prefix"
  /** 需要参数（`{register}` / `{count}%` / `d{motion}`）—— 单独出题没意义 */
  | "needsParam"
  | "notUsed"
  | "missing";

export type CoverageRow = {
  entry: VimIndexEntry;
  state: CoverageState;
  /** `covered` 时：是哪些题在练它 */
  via: string[];
  /** `alias` 时：最终指向哪条命令 */
  resolvedAlias: string | null;
  /** `prefix` 时：说明它是什么前缀 */
  prefixNote?: string;
};

export type CoverageReport = {
  total: number;
  byState: Record<CoverageState, number>;
  rows: CoverageRow[];
  /** ⚠️ 真正的缺口（missing）—— 这一栏才是「还差什么」 */
  missing: CoverageRow[];
};

/**
 * 前缀类：这些键**等下一个键**，单独出题没意义。
 *
 * 判据不是「名字长」，而是「它在 index.txt 里就是个分类头」——
 * 比如 `g` 的 action 是 `extended commands, see |g| below`。
 */
const PREFIX_NOTE: Record<string, string> = {
  g: "g 前缀（下面有整整一节子命令）",
  z: "z 前缀（折叠/滚动/拼写一族）",
  "[": "[ 前缀（跳转族）",
  "]": "] 前缀（跳转族）",
  '"': "寄存器前缀（等一个寄存器名）",
  "'": "标记前缀（等一个 mark）",
  "`": "标记前缀（等一个 mark）",
  d: "operator：等一个 motion / textobject",
  c: "operator：等一个 motion / textobject",
  y: "operator：等一个 motion / textobject",
  "@": "等一个寄存器名",
  m: "等一个 mark 名",
  q: "等一个寄存器名开始录制",
  ":": "进入 Ex 命令行",
  "/": "进入搜索输入",
  "?": "进入反向搜索输入",
  "!": "等一个 filter / motion",
  "=": "等于 `==`（等一个 motion）",
  "N": "计数前缀",
  "\\)": "等一个括号配对",
};

/**
 * 把 Vim 官方记法归一化到训练器用的形态。
 *
 * index.txt 原文是 `CTRL-A` / `CTRL-W v` 这种老写法，
 * 而数据集里统一用 `<C-A>` / `<C-W>v`。
 */
export function normalizeVimKey(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^CTRL-W\s+CTRL-(\S+)$/, "<C-W><C-$1>");
  s = s.replace(/^CTRL-W\s+(\S)$/, "<C-W>$1");
  s = s.replace(/^CTRL-([A-Za-z@[\]\\^_?])$/, (_, k) => `<C-${k.toUpperCase()}>`);
  /**
   * ⚠️⚠️ `<C-w>` → `<C-W>`：修饰键里的字母**统一大写**。
   *
   * 两边的记法不一样：
   *   Vim 官方 index.txt  → `<C-W>v`（大写 W）
   *   本机 / windows 页面的 native → `<C-w>v`（小写 w，LazyVim 写法）
   *
   * 不归一的话，`<C-W>v` 永远匹配不上 `<C-w>v` ——
   * 实测：窗口一章 25 个键**只有 2 条算覆盖**，而页面明明有 16 道题。
   */
  s = s.replace(/<C-([a-z])>/g, (_, k) => `<C-${k.toUpperCase()}>`);
  return s;
}

/**
 * 建「这条 Vim 命令被哪些题练了」的索引。
 *
 * ⚠️ 判据要**双向**：
 *   1. 题目的最优解 / 等价键，正好等于这条 Vim 命令
 *   2. 或者题目是「Vim 命令 + 参数」的展开形态 ——
 *      比如 Vim 的 `dd` 是一条命令，题目也是 `dd`；
 *      而 Vim 的 `d`（operator）对应题目 `diw` / `daw` 这一族
 *
 * 第 2 条只在**前缀类**上用（见 `classify`）。
 */
export function buildCoverageIndex(commands: Command[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  const add = (key: string, label: string) => {
    /**
     * ⚠️⚠️ **索引侧也要归一化**。
     *
     * 题目的 `native` 是 LazyVim 写法 `<C-w>v`（小写 w），
     * 而 Vim 官方是 `<C-W>v`（大写 W）。只归一化一边，
     * 两边永远匹配不上 —— 实测窗口一章 75 条只报 2 条覆盖。
     */
    key = normalizeVimKey(key);
    const arr = byKey.get(key);
    if (arr) {
      if (!arr.includes(label)) arr.push(label);
    } else {
      byKey.set(key, [label]);
    }
  };
  for (const c of commands) {
    const label = `${c.display}（${c.desc || "没描述"}）`;
    add(c.display, label);
    for (const a of c.alternates) add(a, label);
    /**
     * ⚠️⚠️ **原生等价也要算「练了」**。
     *
     * `/windows` 的题是 `<Space>wv` 三段式，而 Vim 官方那条是 `<C-W>v`。
     * 如果把 `native` 排除在外，这一页 25 个键在报告里全算缺口 ——
     * 实测就是这样（窗口一章只报 2 条覆盖，而页面明明有 16 道题）。
     *
     * 用户的诉求原话是「练最优解，其他的解标注在旁边显示」——
     * 既然标注了、用户也能按，那就该算覆盖。
     */
    if (c.native) add(c.native, `${label} ← 原生等价`);
  }
  return byKey;
}

/**
 * 判断一条 Vim 命令对 reflex 来说是什么状态。
 *
 * @param entry       index.txt 的一条
 * @param trained     本机的题目索引（`buildCoverageIndex` 的结果）
 * @param resolveAlias 递归解析别名（`<BS>` → `h`），返回最终目标
 */
export function classify(
  entry: VimIndexEntry,
  trained: Map<string, string[]>,
  resolveAlias: (key: string) => { final: string; chain: string[] },
): CoverageRow {
  const key = normalizeVimKey(entry.vim);

  if (entry.isNotUsed) {
    return { entry, state: "notUsed", via: [], resolvedAlias: null };
  }

  /**
   * ⚠️⚠️ 「没有可学行为」的条目也不算缺口。
   *
   * index.txt 里有几类是**说明性**的，不是可执行命令：
   *
   * ```
   * CTRL-\ CTRL-N   go to Normal mode (no-op)   ← 什么都不做
   * CTRL-\ a - z    reserved for extensions    ← 范围保留
   * ```
   *
   * 它们没有「练什么」可言。算进缺口会让报告虚高，
   * 而且第一页全是这种，把真缺口淹掉（实测：`<C-\>` 一族占了前 3 行）。
   */
  if (/\bno-op\b/i.test(entry.action) || /\breserved\b/i.test(entry.action)) {
    return { entry, state: "notUsed", via: [], resolvedAlias: null };
  }

  /**
   * ⚠️ 带 `{}` 占位符的是**参数化形态**，不是能直接按的键：
   *
   *     {register}   ← 等一个寄存器名
   *     {count}%     ← 等一个计数
   *     '{a-zA-Z0-9} ← 等一个 mark
   *     <{motion}    ← 等一个 motion
   *
   * 它们单独出题没意义（和前缀同理），但**不能算缺口** ——
   * 否则报告里全是这种「等参数」，把真缺口淹掉。
   */
  if (/\{[^}]*\}/.test(key)) {
    return { entry, state: "needsParam", via: [], resolvedAlias: null };
  }

  // 1) 直接命中（最优解或等价键）
  const via = trained.get(key);
  if (via && via.length > 0) {
    return { entry, state: "covered", via, resolvedAlias: null };
  }

  /**
   * ⚠️ 别名要**递归**解析后再查一次。
   *
   * `<BS>` 的 action 是 `same as "h"` —— 而 `<BS>` 自己当然不在题库里，
   * 直接判 missing 会把它算成缺口。实测这类有 100+ 条，
   * 全算缺口会让报告失真（分母虚高、缺口虚大）。
   *
   * 注意这里**不因为「别名」就放过**：如果别名指向的目标也没题，
   * 那说明**目标本身漏了**，要照实报出来。
   */
  if (entry.aliasOf) {
    const { final, chain } = resolveAlias(entry.aliasOf);
    const targetVia = trained.get(normalizeVimKey(final));
    if (targetVia && targetVia.length > 0) {
      return { entry, state: "alias", via: targetVia, resolvedAlias: final };
    }
    /**
     * ⚠️ 别名指向的目标没题 —— 这是**真缺口**，但缺口是**目标**不是别名。
     *    所以状态仍报 `missing`，`resolvedAlias` 记下它指向谁，
     *    页面据此说「缺的是 X，这条只是它的别名」。
     */
    return {
      entry,
      state: "missing",
      via: [],
      resolvedAlias: `${final}（别名链：${chain.join(" → ")}）`,
    };
  }

  /**
   * 2) 文本对象 / 参数化形态 —— 它们**不是独立命令**，而是组件。
   *
   * Vim 的 index.txt 把 `a"` / `i(` / `aW` 这些列在 Operator-pending 一节，
   * 意思是「**等一个 operator**」（`d` + `a"` = `da"`）。
   *
   * 所以判据是：**有没有任何题目 = 某 operator + 这个对象**。
   * 实测：36 条文本对象直接查全报缺口，而 `/text` 和 `/core` 明明
   * 有 `diw` `daw` `di"` `da"` `di(` `da(` … 一整族题。
   */
  if (entry.section === "objects") {
    const ops = ["d", "c", "y", "v"];
    const hits: string[] = [];
    for (const op of ops) {
      const via2 = trained.get(`${op}${key}`);
      if (via2) hits.push(...via2);
    }
    if (hits.length > 0) {
      return { entry, state: "covered", via: hits, resolvedAlias: null };
    }
  }

  // 3) 前缀类：不是缺口，但要说清楚为什么
  const note = PREFIX_NOTE[key];
  if (note) {
    return { entry, state: "prefix", via: [], resolvedAlias: null, prefixNote: note };
  }

  // 3) 真缺口
  return { entry, state: "missing", via: [], resolvedAlias: null };
}

/** 递归解析别名链 */
export function makeAliasResolver(entries: VimIndexEntry[]) {
  const byKey = new Map<string, VimIndexEntry>();
  for (const e of entries) {
    const k = normalizeVimKey(e.vim);
    if (!byKey.has(k)) byKey.set(k, e);
  }
  return (start: string): { final: string; chain: string[] } => {
    const chain: string[] = [normalizeVimKey(start)];
    let cur = normalizeVimKey(start);
    const seen = new Set<string>([cur]);
    // 最多跟 8 跳，防环
    for (let i = 0; i < 8; i++) {
      const e = byKey.get(cur);
      if (!e?.aliasOf) break;
      const next = normalizeVimKey(e.aliasOf);
      if (seen.has(next)) break;
      chain.push(next);
      seen.add(next);
      cur = next;
    }
    return { final: cur, chain };
  };
}

/** 汇总成报告 */
export function buildReport(
  entries: VimIndexEntry[],
  commands: Command[],
): CoverageReport {
  const trained = buildCoverageIndex(commands);
  const resolveAlias = makeAliasResolver(entries);
  const rows = entries.map((e) => classify(e, trained, resolveAlias));

  const byState: Record<CoverageState, number> = {
    covered: 0,
    alias: 0,
    prefix: 0,
    needsParam: 0,
    notUsed: 0,
    missing: 0,
  };
  for (const r of rows) byState[r.state]++;

  return {
    total: rows.length,
    byState,
    rows,
    missing: rows.filter((r) => r.state === "missing"),
  };
}

/** 「实打实要看的」分母 —— 排除别名和 not used 之后 */
export function effectiveTotal(report: CoverageReport): number {
  return (
    report.total -
    report.byState.alias -
    report.byState.notUsed -
    report.byState.needsParam
  );
}
