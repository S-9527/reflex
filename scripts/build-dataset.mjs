/**
 * 数据集构建:从 data/raw-lazyvim.json 生成 lib/bindings.ts
 *
 * 跑:npx tsx scripts/build-dataset.mjs
 * 或直接用 node(这个脚本不 import TS,纯 JS)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(readFileSync(join(root, "data/raw-lazyvim.json"), "utf8"));

/** Neovim 的 lhs 里,leader 是真空格,不是 <Space>。统一成 <Space> 记法。 */
function toVimNotation(lhs) {
  return lhs
    .replace(/^ /, "<Space>")
    .replace(/ /g, " ") // 其余空格保留原样(理论上不该有)
    .replace(/\u00a0/g, " ");
}

/**
 * leader 第二字符 → 关卡。顺序即学习顺序。
 * 依据:「你现在能做什么」,不是官方分类。
 * 窗口(w)排很前是因为那是你当前的弱项。
 */
// 注意顺序:长前缀在前,<Space> 兜底必须放最后,
// 否则 `find()` 会先命中 <Space> 把所有 leader 键都吞进 leader-other。
//
// ⚠️ 分屏键为什么是精确匹配而不是前缀:
// LazyVim 16 里创建窗口不是 <Space>ws / <Space>wv(那是书里的旧键),
// 而是 <Space>| 和 <Space>-。它们不匹配任何 leader 子树,
// 所以必须显式列出来 —— 否则会掉进 leader-other 兜底桶排到第 10 关,
// 而「窗口」组里就一个创建窗口的键都没有,逻辑上不成立
// (能跳窗口却不能创建,现实中的顺序是先分屏再跳)。
const GROUPS = [
  // 窗口排第 1 关:这是用户当前自评的弱项
  { prefix: "<Space>w", key: "window", label: "窗口", level: 1 },
  { prefix: "<Space>b", key: "buffer", label: "缓冲区", level: 2 },
  { prefix: "<Space>f", key: "file", label: "文件查找", level: 3 },
  { prefix: "<Space>q", key: "session", label: "会话", level: 4 },
  { prefix: "<Space>g", key: "git", label: "Git", level: 5 },
  { prefix: "<Space>c", key: "code", label: "代码 / LSP", level: 6 },
  { prefix: "<Space>s", key: "search", label: "搜索替换", level: 7 },
  { prefix: "<Space>u", key: "ui", label: "界面", level: 8 },
  { prefix: "<Space>l", key: "lazy", label: "插件管理", level: 9 },
  { prefix: "<Space>", key: "leader-other", label: "其他 leader 键", level: 10 },
];

/**
 * 降级名单:从第 1 关挪到第 9 关的键。
 *
 * 抽出来单独放,是为了能被 tests/dataset.test.ts 断言 ——
 * 分级是最容易被"重跑脚本 + 手改排序"悄悄改坏的东西。
 */
export const DEMOTED = {
  // 窗口调整大小:书 9.3.5 说该配计数用或直接拖鼠标,裸按没意义
  "<C-Up>": 9,
  "<C-Down>": 9,
  "<C-Left>": 9,
  "<C-Right>": 9,
};

/**
 * 没有 leader 前缀的键(裸键)分组。
 *
 * ⚠️ 窗口键是重点:你机器上 LazyVim 16 已经**不教** `<C-w>h/j/k/l` 了,
 * 换成了 `<C-H/J/K/L>` 导航。所以窗口组必须同时收 leader 版和 Ctrl 版。
 */
const CTRL_WINDOW_NAV = new Set([
  "<C-H>", "<C-J>", "<C-K>", "<C-L>", // 切换窗口 —— 每次多窗口都用
]);

/**
 * 调整大小的 4 条。降级到第 9 关(和插件管理同级)。
 *
 * ## 为什么降级而不是删掉
 *
 * 用户自己提的判断,并且书支持:
 * - 书 9.3.5 原话:「the easiest way to resize Vim splits is to use… *the mouse*」
 * - 同一节还说键盘方式「只移动一行或一列,所以你几乎肯定要
 *   **在前面加一个大于 10 的计数**」—— 也就是裸按没意义
 * - 裸按 `<C-Up>` 挪一行,真实场景要的是 `20<C-Up>`
 *
 * 删掉的话以后真要用还得回来查。留在题库第 9 关,不打���核心关卡。
 */
const CTRL_WINDOW_RESIZE = new Set([
  "<C-Up>", "<C-Down>", "<C-Left>", "<C-Right>",
]);

function classifyBare(lhs) {
  if (CTRL_WINDOW_NAV.has(lhs)) return { key: "window", label: "窗口", level: 1 };
  if (CTRL_WINDOW_RESIZE.has(lhs)) return { key: "window-resize", label: "窗口调整大小", level: 9 };
  if (/^<C-[bB]/.test(lhs)) return { key: "ctrl-b", label: "Ctrl-b 系列", level: 5 };
  if (/^</.test(lhs)) return { key: "special", label: "特殊键", level: 6 };
  if (/^[A-Z]/.test(lhs)) return { key: "upper", label: "大写键", level: 3 };
  if (lhs === "jk") return { key: "mine", label: "我自己的映射", level: 1 };
  if (lhs.length === 1) return { key: "single", label: "单键", level: 2 };
  return { key: "multi", label: "多键序列", level: 4 };
}

const out = [];
const skipped = { nodesc: 0, weird: 0, autopair: 0, insert: 0, helpref: 0 };

for (const r of raw) {
  const vim = toVimNotation(r.lhs);

  // 只练 Normal / Visual / Operator-pending / Cmdline。
  //
  // 排除 Insert 的理由不是"不重要",而是**两个实测出来的问题**:
  //   1. Insert 模式的 desc 可能是 help 引用(`<C-W>` → `:help i_CTRL-W-default`),
  //      不是人话描述,当题干会误导
  //   2. Insert 里按键大多是"打出这个字符",肌肉记忆是自动的,不需要练。
  //      真正需要刻意记的是 Normal 模式那些多键序列。
  if (r.mode === "i" || r.mode === "s") {
    skipped.insert++;
    continue;
  }

  // 无描述的:跳过。不练自己不知道干什么的键 = 制造错误肌肉记忆。
  if (!r.desc || !r.desc.trim()) {
    skipped.nodesc++;
    continue;
  }

  // auto-pairs:实测 18 条,desc 形如 `Open action for "()" pair`。
  // 这类是"打左括号自动配右括号",不是按键功能,而且 Insert 模式里
  // 练它没意义(你不需要记 auto-pairs,手感自然就有)。全部排除。
  if (/(action for|Closeopen)/.test(r.desc)) {
    skipped.autopair++;
    continue;
  }

  // 明显不是用户接口的
  if (/^<Plug>|<80>|^<F\d+>$|^\s*$/.test(vim)) {
    skipped.weird++;
    continue;
  }

  // desc 其实是 help 引用,不是人话描述。
  // 实测踩到:`#` 键在 Visual 模式 desc 是 `:help v_#-default`,
  // 当题干等于"按 help 引用里说的那个键" —— 毫无意义。
  // 这类键本身是 Vim 内建且有用(# 是选计数词),但需要自己补描述,
  // 不能直接把 help 串扔给用户。
  if (/^:help\b/.test(r.desc.trim())) {
    skipped.helpref++;
    continue;
  }

  // 精确键名映射(不分 leader 子树)。分屏键必须走这里 ——
  // 见 GROUPS 上面的说明:它们不匹配任何前缀规则。
  const EXACT = {
    "<Space>|": { key: "window", label: "窗口", level: 1 },
    "<Space>-": { key: "window", label: "窗口", level: 1 },
  };

  const g =
    EXACT[vim] ||
    GROUPS.find((x) => vim.startsWith(x.prefix) && vim !== x.prefix) ||
    classifyBare(vim) || { key: "other", label: "其他", level: 9 };

  // : 命令行里的一堆 :s/.../... 变体,单独归一类,不进主关卡
  const isExCommand = vim.startsWith(":") && vim.length > 6;

  out.push({
    id: `${r.mode}:${vim}`,
    keys: null, // 运行时生成
    display: vim,
    label: r.desc,
    desc: r.desc,
    mode: r.mode,
    group: g.key,
    groupLabel: g.label,
    level: isExCommand ? 11 : g.level,
    status: "mapped",
  });
}

out.sort((a, b) => a.level - b.level || a.display.localeCompare(b.display));

// 生成 TS
const ts = `// 自动生成,请勿手改。改法:改 data/raw-lazyvim.json 后重跑 scripts/build-dataset.mjs
//
// 来源:${out.length} 条,从本机 LazyVim 会话的 nvim_get_keymap 实测抽取。
// 全部 status="mapped"(键确实存在,含义取自插件 desc,未经逐条亲验)。
//
// 跳过:${skipped.insert} 条 Insert/Select + ${skipped.autopair} 条 auto-pairs
//     + ${skipped.helpref} 条 desc 是 help 引用 + ${skipped.nodesc} 条无描述
//     + ${skipped.weird} 条非用户接口

import type { Binding } from "./matcher";

export const GROUPS: Record<string, string> = {
${[...new Set(out.map((b) => b.group))]
  .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(out.find((b) => b.group === k).groupLabel)},`)
  .join("\n")}
};

export const LEVEL_NAMES: Record<number, string> = {
${[...new Set(out.map((b) => b.level))].sort((a, b) => a - b).map((l) => `  ${l}: ${JSON.stringify(
    l === 1 ? "第 1 关 · 立刻要会" : l === 11 ? "附:Ex 命令变体" : `第 ${l} 关`,
  )},`).join("\n")}
};

export const RAW: Omit<Binding, "keys">[] = ${JSON.stringify(
  out.map(({ keys: _k, ...rest }) => rest),
  null,
  1,
)};
`;

writeFileSync(join(root, "lib/bindings.ts"), ts);
console.log(`✅ 生成 ${out.length} 条,跳过 ${skipped.nodesc}(无描述)+${skipped.weird}(内部)`);
console.log(`   关卡分布:`);
const byLevel = {};
for (const b of out) byLevel[b.level] = (byLevel[b.level] || 0) + 1;
for (const l of Object.keys(byLevel).sort((a, b) => a - b)) {
  console.log(`     L${l}: ${byLevel[l]} 条`);
}
