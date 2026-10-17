/**
 * 抽取 Vim **自己的**命令索引 → `data/vim-index.json`。
 *
 * 跑：`node scripts/build-vim-index.mjs`
 *
 * ## 数据源：`$VIMRUNTIME/doc/index.txt`
 *
 * 这是 Vim 官方参考手册里的**完整命令表**（每个 mode 一节），
 * 由 Bram Moolenaar 维护。它和 `nvim_get_keymap` 是**互补的两个源**：
 *
 * | 源 | 有什么 | 没有什么 |
 * |----|--------|---------|
 * | `nvim_get_keymap` | 本机真实的键位映射 | **内建命令一条都看不到** |
 * | `index.txt` | Vim 全部内建命令 + 官方描述 | 本机绑了哪些键 |
 *
 * 所以要回答「练全了没有」，必须两边都有：
 * **index.txt 给分母（Vim 有什么），keymaps 给分子（本机练了什么）**。
 *
 * ## ⚠️ 为什么不能只靠 `nvim_get_keymap` 判断覆盖率
 *
 * 实测：`nvim_get_keymap` 里根本没有 `h` `l` `m` `q` `:` `ZZ` 这些 ——
 * 它们是**内建**命令，不是映射。上一版只查 keymap，于是
 * 「覆盖率」审计看着自洽（数据集内的键有没有练不到），
 * 但**前提「数据集 = 全部要练的东西」不成立**。
 *
 * ## 解析要点
 *
 * ⚠️ 条目行的列是用 **tab** 分隔的，不是空格：
 *
 * ```
 * |CTRL-A|\tCTRL-A\t\t2  add N to number at/after cursor
 * \t\tCTRL-K\t\t   not used
 * ```
 *
 * 所以按 tab 切、过滤空段。**不能**按连续空格切 ——
 * 描述里的空格会把一列切成好几段（踩过：`<C-W> ` 这种带空格的键名被切坏）。
 *
 * ⚠️ 描述会折行，续行**没有 tab** —— 跳过它们（我们只要首行的动作文本）。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 找 nvim 的 runtime 目录（index.txt 在里面） */
function findIndexTxt() {
  const candidates = [];
  // 1) 环境变量 / nvim 自己报
  try {
    const rt = execFileSync("nvim", ["--headless", "-c", "lua io.write(vim.env.VIMRUNTIME or '')", "-c", "qa!"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (rt) candidates.push(join(rt, "doc", "index.txt"));
  } catch {
    /* nvim 不可用就跳过 */
  }
  // 2) 常见系统路径
  candidates.push("/usr/share/nvim/runtime/doc/index.txt");
  candidates.push("/usr/local/share/nvim/runtime/doc/index.txt");
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    "找不到 nvim 的 doc/index.txt —— 它是覆盖率的分母，没它这个页面没法生成。\n" +
      "试过：\n" +
      candidates.map((c) => "  " + c).join("\n"),
  );
}

const INDEX_PATH = findIndexTxt();
const lines = readFileSync(INDEX_PATH, "utf8").split("\n");

/**
 * index.txt 里的章节。
 *
 * 只收 **Normal / Visual / Operator-pending** 相关的 —— 那才是这个训练器
 * 的目标（Insert / Command-line / Ex 是另一回事，页面底部说明为什么不收）。
 */
const SECTIONS = [
  { id: "normal", name: "Normal 模式", desc: "最常用的一大类" },
  { id: "objects", name: "文本对象", desc: "iw / aw / i( 这些（配合 operator 用）" },
  { id: "window", name: "窗口命令", desc: "<C-w>X 那一族" },
  { id: "bracket", name: "[ / ]  前缀", desc: "跳转族，如 [[ ]] [m" },
  { id: "g", name: "g 前缀", desc: "扩展命令，如 gv gi gU" },
  { id: "z", name: "z 前缀", desc: "折叠 / 滚动 / 拼写" },
];

/** 找每个章节的起止行 */
function sectionBounds() {
  /** 标题行 → 行号（0-based） */
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    /**
     * "2. Normal mode" / "2.1 Text objects" 这种标题行。
     *
     * ⚠️ 标题和 tag 之间是 **tab**，不是空格 —— 用 `\s+` 匹配不到
     * 子章节（实测：只抓到 6 个顶层章节，`2.1`~`2.5` 全漏，
     * 于是所有命令都归进了 "normal" 一节）。用 `[\s\t]+` 才全。
     */
        /**
     * ⚠️ 用 `\d[\d.]*` 而不是 `\d+(\.\d+)?` ——
     * 后者会把 `2.1` 整个吃掉，然后要求后面还有一个 `.`，
     * 于是**子章节标题全部匹配不上**（实测：只抓到 6 个顶层章节，
     * `2.1`~`2.5` 全漏，495 条命令全归进了 "normal"）。
     *
     * 编号可能是 `2`（顶层）、`2.1`（子）、`6` 三种形态，
     * 后面跟 `.` + 空白 + 标题 + 空白 + `*tag*`。
     */
    const m = l.match(/^(\d[\d.]*)\s+([^*]+?)\*([^*]+)\*/);
    if (m) heads.push({ num: m[1].replace(/\.$/, ""), title: m[2].trim(), tags: m[3], line: i });
  }
  const pick = (num) => heads.find((h) => h.num === num);
  const bounds = {};
  const at = (num, key) => {
    const h = pick(num);
    if (!h) return;
    // 下一个标题（任意编号）就是终点
    const next = heads.find((x) => x.line > h.line);
    bounds[key] = { start: h.line, end: next ? next.line : lines.length };
  };
  at("2", "normal");
  at("2.1", "objects");
  at("2.2", "window");
  at("2.3", "bracket");
  at("2.4", "g");
  at("2.5", "z");
  return bounds;
}

const BOUNDS = sectionBounds();

/**
 * 把 index.txt 的 char 列 → Vim 记法。
 *
 * index.txt 用的是 `CTRL-A` / `CTRL-W v` 这种**老式写法**，要转成
 * 训练器里统一用的 `<C-A>` / `<C-W>v`。
 */
function toVimNotation(char) {
  let c = char.trim();
  /**
   * ⚠️⚠️ 顺序很重要：**先转 `CTRL-W CTRL-X`，再转 `CTRL-W x`**。
   *
   * 反过来的话，`CTRL-W CTRL-D` 会被「前缀 + 一个字母」那条规则
   * 先吃掉，变成 `<C-W>CTRL-D`（实测踩到，页面上全是这种半成品）。
   */
  // CTRL-W CTRL-D → <C-W><C-D>
  c = c.replace(/^CTRL-W\s+CTRL-(\S+)$/, (_, k) => `<C-W><C-${k.toUpperCase()}>`);
  // ⚠️ CTRL-\ CTRL-N → <C-\><C-N>（反斜杠那个也是 CTRL 键）
  c = c.replace(/^CTRL-\\(\s+)CTRL-(\S+)$/, (_, _sp, k) => `<C-\\><C-${k.toUpperCase()}>`);
  // CTRL-\ a - z → 保留（是范围说明，不是单键）
  c = c.replace(/^CTRL-\\\s+a\s*-\s*z$/, "<C-\\>a-z");
  // CTRL-W v   → <C-W>v        （窗口命令：前缀 + 一个键）
  c = c.replace(/^CTRL-W\s+(\S)$/, "<C-W>$1");
  // CTRL-A     → <C-A>
  c = c.replace(/^CTRL-([A-Za-z@[\]\\^_?<>])$/, (_, k) => `<C-${k.toUpperCase()}>`);
  return c;
}

/**
 * 解析一个章节。
 *
 * 列用 tab 分隔；首段可能是 `|TAG|`，也可能是 char 本身。
 */
function parseSection(key) {
  const b = BOUNDS[key];
  if (!b) return [];
  const out = [];
  const seen = new Set();
  for (let i = b.start; i < b.end; i++) {
    const line = lines[i];
    if (!line.includes("\t")) continue; // 描述续行 / 空行
    const cells = line
      .split("\t")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (cells.length < 2) continue;

    let tag = null;
    let rest = cells;
    const m = cells[0].match(/^\|([^|]+)\|$/);
    if (m) {
      tag = m[1];
      rest = cells.slice(1);
    }
    const char = rest[0];
    if (!char || !/^[!-~<]/.test(char)) continue;

    /**
     * ⚠️⚠️ 排掉表头 / 图例行。
     *
     * 每个章节的表头都长这样（tab 分隔，所以**也会被上面的逻辑收进来**）：
     *
     * ```
     * tag\t\tchar\t\tnote action in Normal mode\t~
     * CHAR\t\t any non-blank character
     * Nmove\t\tthe text that is moved over with a {motion}
     * ```
     *
     * 实测漏了 17 条这种噪声（`CHAR` / `WORD` / `tag` / `2. Normal mode` …）。
     * 它们不是命令，混进报告会让「缺口」虚高、把真缺口淹掉。
     *
     * 判据：
     *   1. `char` 里带空格（真命令不会，`<C-W> ` 那种在 tag 侧）
     *   2. `char` 是已知的占位符名（全大写且不是 `<...>`）
     *   3. 以数字开头（章节标题）
     */
    /**
     * ⚠️⚠️ 判据是「像不像一条命令」，不是「有没有空格」。
     *
     * 我第一版写了 `/\s/.test(char)` —— 把**整个窗口章节**杀光了，
     * 因为 `CTRL-W CTRL-B` / `CTRL-W v` 这种带空格的写法是**合法**的
     * （窗口命令就是「前缀 + 一个键」）。实测 section 计数从 77 掉到 0。
     *
     * 正确的判据：
     *   - 排掉已知的占位符名（`CHAR` / `WORD` / `tag` …，全大写且非 `<...>`）
     *   - 排掉章节标题（`2. Normal mode`）
     *   - 其余带空格的（`CTRL-W x`）**保留**
     */
    if (/^(CHAR|WORD|Nmove|N|SECTION|tag|count|N:)$/.test(char)) continue;
    if (char.includes(".") && /^\d/.test(char)) continue; // "2. Normal mode"
    if (char.length > 1 && /^\d/.test(char)) continue; // note 数字并进来了

    // 动作文本：去掉开头的 note 数字（`1 ` / `2 ` / `1,2 `）
    const action = rest.slice(1).join(" ").replace(/^\d+(,\d+)?\s*/, "").trim();
    if (!action) continue;

    const id = tag || char;
    if (seen.has(id)) continue; // 同名只留第一条
    seen.add(id);

    out.push({
      section: key,
      // 官方 tag（如 `CTRL-W_c`），用于回溯原文
      tag: tag,
      // 官方写的键（原文）
      char: char,
      /**
       * 转成训练器统一的 Vim 记法。
       *
       * ⚠️ 窗口命令要用 **`char`**（`CTRL-W c`）而不是 `tag`
       * （`CTRL-W_c`）—— tag 是帮助标签，下划线不是按键。
       * 实测踩到：`vim` 变成 `CTRL-W_CTRL-B`，页面上一堆下划线，
       * 而且和题库里的 `<C-W>c` 对不上，覆盖率算成 0。
       */
      vim: toVimNotation(char),
      /** 帮助标签，用于回溯原文（`CTRL-W_c` 这种带下划线的） */
      helpTag: tag,
      action,
    });
  }
  return out;
}

const entries = SECTIONS.flatMap((s) => parseSection(s.id));

/**
 * 别名识别：index.txt 里大量条目写的是 `same as "X"` /
 * `same as "CTRL-W x"`。这些**不是独立操作**，练一条就够。
 */
function aliasTarget(action) {
  const m = action.match(/^same as\s+"?((?:CTRL-W\s+)?[^"\s,;)]+)"?/);
  if (!m) return null;
  const raw = m[1].replace(/^CTRL-W\s+/, "CTRL-W ");
  return toVimNotation(raw);
}

for (const e of entries) {
  e.aliasOf = aliasTarget(e.action);
  e.isNotUsed = /^not used/.test(e.action);
  e.isDup = /^\(duplicate\)/.test(e.action);
  // 「见 X 下面的表」这种是分类头，不是可执行命令
  e.isSeeAlso = /see \|/.test(e.action) && /below|\*/.test(e.action);
}

const out = {
  meta: {
    source: INDEX_PATH.replace(/^.*\/nvim\//, "nvim/"),
    extractedAt: new Date().toISOString(),
    // 只收这三个 mode 的命令
    sections: SECTIONS,
    total: entries.length,
    bySection: Object.fromEntries(
      SECTIONS.map((s) => [s.id, entries.filter((e) => e.section === s.id).length]),
    ),
  },
  entries,
};

writeFileSync(join(root, "data/vim-index.json"), JSON.stringify(out, null, 1));

console.log(`✅ 从 ${INDEX_PATH} 抽出 ${entries.length} 条 Vim 命令`);
for (const s of SECTIONS) {
  const n = entries.filter((e) => e.section === s.id).length;
  console.log(`   ${s.name.padEnd(14)} ${n}`);
}
const aliases = entries.filter((e) => e.aliasOf).length;
const notUsed = entries.filter((e) => e.isNotUsed).length;
console.log(`   其中别名（same as X）: ${aliases}`);
console.log(`   标记 not used: ${notUsed}`);
