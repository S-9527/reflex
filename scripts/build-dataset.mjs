/**
 * 数据集构建：从 data/keymaps.json 生成 lib/bindings.ts
 *
 * 跑：node scripts/build-dataset.mjs
 *
 * ## 和旧版的区别（这是重写的全部理由）
 *
 * | | 旧版 | 现在 |
 * |---|---|---|
 * | 数据源 | raw-lazyvim.json（无 rhs、无分组） | keymaps.json（有 rhs、有 which-key 分组） |
 * | 分组 | **手写前缀规则猜的** | which-key 的真实分组 |
 * | 等价解 | 手写表 `SOLUTIONS`，实测既多又少 | 按 rhs 聚合算出来的 |
 * | 关卡 | 手编「第 x 关」 | 废弃，改用分组 |
 *
 * ## 为什么等价解要双轨
 *
 * 有 rhs 的键（158 条）：**rhs 相同 = 底层同一条命令**，这是严格判据。
 *
 * 没有 rhs 的键（229 条）：是 Lua 回调，看不出调了什么。
 * 但它们的 `desc` 是插件自己上报的，同 desc = 同一个功能 ——
 * 这是**弱判据**，实测有效（`Toggle Zoom Mode` 的 `<Space>uZ` / `<Space>wm`）。
 * 所以用它兜底，但在数据里标出来是弱判据。
 *
 * 旧版只有手写表，既漏了 `j`/`<Down>` 这种，又把 `<Space>bb` 错当成 `L` 的等价解
 * （它其实是 `` ` `` 的，rhs 是 `<Cmd>e #<CR>`，跟 `BufferLineCycleNext` 是两条命令）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "data/keymaps.json"), "utf8"));

/** Neovim 的 lhs 里，leader 是真空格，不是 <Space>。统一成 <Space> 记法。 */
function toVimNotation(lhs) {
  return lhs.replace(/^ /, "<Space>");
}

/**
 * which-key 分组 → 中文名。
 *
 * 这些名字直接来自 LazyVim 的 `group = "..."`（editor.lua:68-93），
 * 不是我编的分类 —— 所以它天然和 which-key 面板里看到的一致。
 */
const GROUP_LABELS = {
  search: "搜索",
  goto: "跳转",
  ui: "界面",
  prev: "上一个",
  next: "下一个",
  git: "Git",
  "file/find": "文件查找",
  code: "代码 / LSP",
  "diagnostics/quickfix": "诊断 / quickfix",
  "quit/session": "退出 / 会话",
  buffer: "缓冲区",
  windows: "窗口",
  tabs: "标签页",
  debug: "调试",
  profiler: "性能分析",
  hunks: "代码块",
  surround: "包围",
  fold: "折叠",
};

/** 没有 which-key 分组的键归到哪 —— 按形态给个诚实的名字，不硬塞进某个组。 */
function fallbackGroup(vim, mode) {
  if (vim.startsWith("<Space>")) return { key: "leader-misc", label: "leader 其它" };
  if (/^<(C|M|S)-/.test(vim)) return { key: "ctrl-misc", label: "Ctrl / Alt 其它" };
  if (mode === "i") return { key: "insert", label: "Insert 模式" };
  if (mode === "v" || mode === "x" || mode === "s") return { key: "visual", label: "Visual 模式" };
  if (mode === "o") return { key: "operator", label: "Operator-pending" };
  if (mode === "c") return { key: "cmdline", label: "命令行模式" };
  if (mode === "t") return { key: "terminal", label: "终端模式" };
  if (vim.length === 1) return { key: "bare", label: "裸键" };
  return { key: "other", label: "其它" };
}

/**
 * which-key 的分组前缀表：`<Space>b` → `buffer`。
 *
 * ## ⚠️ 为什么要在 build 阶段重新解析，而不是直接用每条键的 `group`
 *
 * `keymaps.json` 里**同一个 lhs 有两条分组记录**：
 *
 * ```
 * { lhs: " b", group: true,    desc: "buffer" }   ← which-key 自动推断
 * { lhs: " b", group: "buffer" }                  ← LazyVim 显式声明
 * ```
 *
 * 抽取脚本按「最长前缀」归组，两条长度相同，`true` 那条先匹配上 ——
 * 于是 10 条 `<Space>b*` 全被归到了兜底的 `leader-misc`，
 * 而不是真实的 `buffer`。
 *
 * 所以这里**以显式命名为准**重建前缀表：同名前缀下，非 `true` 的赢。
 */
const groupPrefixes = new Map(); // lhs → 分组名
for (const g of src.groups ?? []) {
  if (!g.lhs) continue;
  // ⚠️ 必须和键位用同一套记法。分组写 `" b"`（真实空格），
  //   而键位经 toVimNotation 后是 `"<Space>bd"` —— 不转就永远匹配不上，
  //   所有 leader 键会掉进兜底桶（实测：134 条掉进「leader 其它」）。
  const lhs = toVimNotation(g.lhs);
  const cur = groupPrefixes.get(lhs);
  // 显式名（非 true）优先；已经是显式名的不被 true 覆盖
  if (g.group && g.group !== true) groupPrefixes.set(lhs, g.group);
  else if (cur === undefined) groupPrefixes.set(lhs, g.group ?? null);
}
// 按前缀长度降序 —— 匹配时优先取最具体的那个
const groupPrefixList = [...groupPrefixes.entries()]
  .filter(([, name]) => name && name !== true)
  .sort((a, b) => b[0].length - a[0].length);

/** 给一个键找它所属的 which-key 分组（最长前缀匹配） */
function whichKeyGroup(vim) {
  for (const [lhs, name] of groupPrefixList) {
    // 必须比分组键更长，否则分组节点自己也算成员
    if (vim !== lhs && vim.startsWith(lhs)) return name;
  }
  return null;
}

// ---------------------------------------------------------------- 1. 展开全部键
const all = [];
/**
 * 按 `(mode, lhs)` 去重。
 *
 * ⚠️ `nvim_get_keymap("v")` 里真的有两条一模一样的 `<C-S>`（实测），
 * 不去重会让它自己成为自己的「次解」——
 * 页面上会显示「`<C-S>`，次解：`<C-S>`」，看着像 bug。
 */
const seenKey = new Set();
for (const r of src.keys) {
  const vim = toVimNotation(r.lhs);
  const desc = (r.desc || "").trim();

  // 明显不是用户接口的
  if (/^<Plug>|<80>|^<F\d+>$|^\s*$/.test(vim)) continue;

  const dedupKey = `${r.mode}|${vim}`;
  if (seenKey.has(dedupKey)) continue;
  seenKey.add(dedupKey);

  // 分组以 which-key 的显式声明为准（见 groupPrefixes 的说明）
  const wk = whichKeyGroup(vim);
  const g = wk
    ? { key: wk, label: GROUP_LABELS[wk] ?? wk }
    : fallbackGroup(vim, r.mode);

  all.push({
    id: dedupKey,
    display: vim,
    label: desc,
    desc,
    mode: r.mode,
    group: g.key,
    groupLabel: g.label,
    /** which-key 的原始分组名（可能是 true = 自动推断）。留着便于回溯 */
    wkGroup: r.group ?? null,
    /** 是否在 which-key 分组树里 */
    inWhichKey: Boolean(wk),
    rhs: r.rhs || "",
    /** rhs 为空 = Lua 回调，看不出等价于谁 */
    lua: Boolean(r.lua),
    status: "mapped",
  });
}

// ------------------------------------------------- 2. 按「命令」聚合出解法
/**
 * 命令的身份。
 *
 * ## ⚠️ 为什么不带 mode
 *
 * 同一条命令在 n/v/x 各注册一条是**常态**，不是三件不同的事：
 *
 * ```
 * j     n  rhs="v:count == 0 ? 'gj' : 'j'"  desc=Down
 * j     v  rhs="v:count == 0 ? 'gj' : 'j'"  desc=Down
 * j     x  rhs="v:count == 0 ? 'gj' : 'j'"  desc=Down
 * ```
 *
 * 我第一版把 mode 算进身份，于是「Up」出了 3 道题、「Down」出了 3 道题 ——
 * 练同一件事练三遍。去掉 mode 后它们合成一道，mode 记在 `modes` 里。
 *
 * ## 三种身份，可信度递减
 *
 * | 情况 | 身份 | 可信度 |
 * |------|------|--------|
 * | 有 rhs | `rhs\|<右值>` | **严格** —— rhs 相同就是同一条命令 |
 * | Lua 回调且有 desc | `desc\|<描述>` | 弱 —— 同描述是同一功能（实测有效） |
 * | Lua 回调且无 desc | `lhs\|<键>` | 只能当独立题目，不聚合 |
 *
 * 第三种必须单独处理：若也按 desc 聚合，**所有无描述的键会合并成一道题**。
 */
function commandKey(b) {
  if (!b.lua && b.rhs.trim()) return { key: `rhs|${b.rhs}`, by: "rhs" };
  if (b.desc) return { key: `desc|${b.desc}`, by: "desc" };
  return { key: `lone|${b.id}`, by: "lone" };
}

/**
 * 选最优解。
 *
 * 判据（依次）：键数少 > 不用修饰键 > 不用 leader。
 *
 * 例：`L` / `]b` / `<Space>bb` 里选 `L`（1 键，无修饰，无 leader）。
 * 这对应「我练的是最优解」—— 出题只考它，其余只做展示。
 */
function cost(b) {
  const keys = b.keys.length;
  const mods = b.keys.filter((k) => /^<(C|M|S)-/.test(k)).length;
  const leader = b.keys[0] === "<Space>" ? 1 : 0;
  return keys * 100 + mods * 10 + leader;
}

const byCommand = new Map();
for (const b of all) {
  b.keys = splitLhsLocal(b.display);
  const { key, by } = commandKey(b);
  if (!byCommand.has(key)) byCommand.set(key, { by, members: [] });
  byCommand.get(key).members.push(b);
}

function splitLhsLocal(lhs) {
  const out = [];
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

// --------------------------------------------- 3. 原生 Ex 等价（人工核实过）
/**
 * ⚠️ 这张表**没法从数据算出来**。
 *
 * rhs 里是 `<Cmd>BufferLineCycleNext<CR>` 这种插件命令，跟 `:bnext` 的
 * 对应关系需要人判断。所以沿用 lib/seq-solutions.ts 里那张
 * **逐条 `exists(':命令')` 实测过**的表（73 条，全部通过）。
 *
 * 保留 `verified` 字段区分「我确认存在」和「没查到」——
 * 不能把没核实的写成确定结论。
 */
const NATIVE_VERIFIED = {
  "Go to Left Window": [":wincmd h", true],
  "Go to Lower Window": [":wincmd j", true],
  "Go to Upper Window": [":wincmd k", true],
  "Go to Right Window": [":wincmd l", true],
  "Split Window Below": [":split", true],
  "Split Window Right": [":vsplit", true],
  "Delete Window": [":close", true],
  "Switch to Other Buffer": [":buffer #", true],
  "Delete Buffer": [":bdelete", true],
  "Delete Buffer and Window": [":bdelete", true],
  "Delete Invisible Buffers": [":bdelete +bufhidden", true],
  "Pick Buffer": [":buffers", true],
  "Delete Buffers to the Left": [":bdelete 1,$", true],
  "Delete Other Buffers": [":bdelete!", true],
  "Delete Non-Pinned Buffers": [":bdelete +bufhidden", true],
  "Delete Buffers to the Right": [":bdelete %,$", true],
  Buffers: [":buffers", true],
  "Buffers (all)": [":ls", true],
  "Find Config File": [":edit $MYVIMRC", true],
  "Find Files (Root Dir)": [":find", true],
  "Find Files (cwd)": [":find .", true],
  "New File": [":enew", true],
  "Prev Buffer": [":bprevious", true],
  "Next Buffer": [":bnext", true],
  "Save File": [":write", true],
  "Escape and Clear hlsearch": [":nohlsearch", true],
  "Move Down": [":wincmd j", true],
  "Move Up": [":wincmd k", true],
  Registers: [":registers", true],
  "Search History": [":history /", true],
  Autocmds: [":autocmd", true],
  "Command History": [":history", true],
  Commands: [":command", true],
  "Help Pages": [":help", true],
  Jumps: [":jumps", true],
  "Location List": [":lopen", true],
  Marks: [":marks", true],
  "Man Pages": [":Man", true],
  "Quickfix List": [":copen", true],
  "Search and Replace": [":substitute", true],
  "Redraw / Clear hlsearch / Diff Update": [":redraw", true],
  "Decrease Window Height": [":resize -1", true],
  "Decrease Window Width": [":vertical resize -1", true],
  "Increase Window Width": [":vertical resize +1", true],
  "Increase Window Height": [":resize +1", true],
  "Previous Tab": [":tabprevious", true],
  "Next Tab": [":tabnext", true],
  "New Tab": [":tabnew", true],
  "Close Tab": [":tabclose", true],
  "First Tab": [":tabfirst", true],
  "Last Tab": [":tablast", true],
  "Close Other Tabs": [":tabonly", true],
  ":previous": [":previous", true],
  ":rewind": [":rewind", true],
  "Move buffer prev": [":bprevious", true],
  "Prev Error": [":cprevious", true],
  ":lprevious": [":lprevious", true],
  ":lrewind": [":lrewind", true],
  ":crewind": [":crewind", true],
  ":trewind": [":trewind", true],
  ":next": [":next", true],
  ":last": [":last", true],
  "Move buffer next": [":bnext", true],
  "Next Error": [":cnext", true],
  ":lnext": [":lnext", true],
  ":llast": [":llast", true],
  ":clast": [":clast", true],
  ":tlast": [":tlast", true],
  ":lpfile": [":lpfile", true],
  ":cpfile": [":cpfile", true],
  ":lnfile": [":lnfile", true],
  ":cnfile": [":cnfile", true],
  ":ptnext": [":ptnext", true],
};

/**
 * 把命令聚合成「一道题」。
 *
 * best      最优解（出题只考它）
 * alternates 次解 —— 实测等价，仅展示
 * native     原生 Ex —— 仅展示
 */
const commands = [];
for (const [, { by, members }] of byCommand) {
  /**
   * ⚠️ 先按**键本身**去重，再选最优解。
   *
   * 同一命令在 n/v/x 各注册一条是常态，所以 members 里同一个键会重复出现
   * （`<Up>` 在 n/v/x 各一条）。不去重的话次解列表长成
   * 「次解：`<Up>` `<Up>` `k` `k` `k`」—— 同一个键显示三遍。
   *
   * 去重时保留**第一个**出现的（members 的顺序来自数据源，稳定）。
   */
  const byDisplay = new Map();
  for (const m of members) {
    if (!byDisplay.has(m.display)) byDisplay.set(m.display, m);
  }
  const uniqMembers = [...byDisplay.values()];

  const sorted = uniqMembers.sort(
    (a, b) => cost(a) - cost(b) || a.display.localeCompare(b.display),
  );
  const best = sorted[0];
  const alternates = sorted.slice(1);

  const nv = NATIVE_VERIFIED[best.desc];
  const isExDesc = best.desc.startsWith(":");
  const native = nv ? nv[0] : isExDesc ? best.desc : null;
  const nativeVerified = nv ? nv[1] : "unchecked";

  commands.push({
    id: best.id,
    /** 最优解，出题考的就是它 */
    display: best.display,
    desc: best.desc,
    /** 这条命令在哪些 mode 有效（同一命令常在 n/v/x 各注册一条） */
    modes: [...new Set(members.map((m) => m.mode))].sort(),
    group: best.group,
    groupLabel: best.groupLabel,
    /** 次解：实测同一条命令的其它键。仅展示，不出题 */
    alternates: alternates.map((a) => a.display),
    /** 等价判据的可信度：rhs = 严格，desc = 弱，lone = 没聚合 */
    equivBy: by,
    /** 原生 Ex 等价。null = 确认没有（插件功能） */
    native,
    nativeVerified,
    /** 这道命令总共几个键能做 */
    total: sorted.length,
  });
}

commands.sort(
  (a, b) =>
    a.group.localeCompare(b.group) ||
    a.display.length - b.display.length ||
    a.display.localeCompare(b.display),
);

/**
 * ⚠️ id 必须唯一 —— 它是进度存储的键。
 *
 * 聚合去掉了 mode 之后，`n|<Up>` 和 `v|<Up>` 会合成一条，但
 * **不同命令仍可能撞 id**（同一 lhs 在不同 mode 是不同命令，
 * 比如 `<C-S>` 在 n 是存盘、在 i 是别的）。
 * 这里统一改成「命令身份」，保证一道题一个稳定 id。
 */
const seenId = new Map();
for (const c of commands) {
  const n = (seenId.get(c.id) ?? 0) + 1;
  seenId.set(c.id, n);
  if (n > 1) c.id = `${c.id}#${n}`;
}

// ------------------------------------------------------------- 4. 生成 TS
const groupNames = [...new Set(all.map((b) => b.group))];
const groupLabels = {};
for (const b of all) groupLabels[b.group] = b.groupLabel;

/**
 * ⚠️ `RAW` 必须剥掉 `keys`。
 *
 * 聚合阶段为了算代价给每个对象挂了 `keys`（`splitLhs` 的结果），
 * 但 `RAW` 的类型是 `Omit<Binding, "keys">` —— keys 是**运行时**由
 * `splitLhs(display)` 生成的，写进数据集只会重复一份，还过不了类型检查。
 * （踩过：368 条 TS2353，全是这个字段。）
 */
const rawOut = all.map(({ keys: _keys, ...rest }) => rest);

const ts = `// 自动生成，请勿手改。
//
// 生成：node scripts/build-dataset.mjs
// 数据源：data/keymaps.json（由 scripts/dump-maps.lua 从本机 nvim 抽取）
//
// ## 数据来源
//
// - **键位**：\`nvim_get_keymap\`，8 个 mode，${all.length} 条，**不做过滤**
// - **分组**：which-key 的真实分组树（LazyVim 的 \`group = "..."\`），
//   ${all.filter((b) => b.inWhichKey).length} 条落在分组里
// - **rhs**：${all.filter((b) => !b.lua).length} 条有 rhs（可严格判定等价），
//   ${all.filter((b) => b.lua).length} 条是 Lua 回调（只能按 desc 弱判定）
//
// ## ⚠️ 别再用「关卡」
//
// 旧版有 LEVEL_NAMES / level 字段，是手编的「第 x 关」，和真实分组无关。
// 现在分组直接用 which-key 的，所以关卡概念整个删掉了。

import type { Binding } from "./matcher";

/** which-key 分组 → 中文名。名字来自 LazyVim 的 group 声明，不是自己编的 */
export const GROUPS: Record<string, string> = ${JSON.stringify(groupLabels, null, 2)};

/** 全部键位。一个键一行，含 mode 区分（同一 lhs 在 n/v 各有一条） */
export const RAW: Omit<Binding, "keys">[] = ${JSON.stringify(rawOut, null, 1)};

/**
 * 按「命令」聚合后的题目。
 *
 * 一个命令一道题 —— 只考 \`display\`（最优解），
 * \`alternates\` 和 \`native\` 仅作展示。所以题量不因多解而翻倍。
 */
export const COMMANDS: Command[] = ${JSON.stringify(commands, null, 1)};

export type Command = {
  id: string;
  /** 最优解，出题只考它 */
  display: string;
  desc: string;
  /** 这条命令在哪些 mode 有效（同一命令常在 n/v/x 各注册一条） */
  modes: string[];
  group: string;
  groupLabel: string;
  /** 次解：实测同一条命令的其它键。仅展示 */
  alternates: string[];
  /** 等价判据：rhs = 严格实测，desc = 弱（Lua 回调只能按描述归类），lone = 没聚合 */
  equivBy: "rhs" | "desc" | "lone";
  /** 原生 Ex 等价。null = 确认没有（插件功能） */
  native: string | null;
  /** 原生等价核实过没有 */
  nativeVerified: true | "unchecked";
  /** 这道命令总共有几个键能做 */
  total: number;
};
`;

writeFileSync(join(root, "lib/bindings.ts"), ts);

// ---------------------------------------------------------------- 报告
const multi = commands.filter((c) => c.total > 1);
const withNative = commands.filter((c) => c.native);
console.log(`✅ ${all.length} 个键 → ${commands.length} 道题（按命令聚合）`);
console.log(`   多解：${multi.length} 道（${multi.reduce((a, c) => a + c.total - 1, 0)} 个次解，仅展示）`);
console.log(`   原生 Ex：${withNative.length} 道有，其中 ${withNative.filter((c) => c.nativeVerified === true).length} 条实测核实`);
console.log(`   分组：${groupNames.length} 个`);
const byGroup = {};
for (const c of commands) byGroup[c.group] = (byGroup[c.group] || 0) + 1;
for (const [g, n] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${(groupLabels[g] || g).padEnd(16)} ${n}`);
}
