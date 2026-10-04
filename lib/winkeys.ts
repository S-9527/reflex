/**
 * `<C-w>*` 家族 —— 键 → 操作 的映射表。
 *
 * ## 为什么单独一张表
 *
 * 用户给的截图是 which-key 的 `+windows` hydra,里面 20 多个键
 * 对应 Vim 的 `<C-w>*` 命令。其中一部分 LazyVim 改成了别的键
 * (`<Space>|` 而不是 `<C-w>v`),另一部分没改。
 *
 * **两条路都得会** —— `<C-w>h` 在哪都能用,`<Space>|` 是本机更顺手的。
 * 所以这里同时列出两者的对应关系,而不是只挑一套。
 *
 * ## 实测依据
 *
 * 本机 `nvim_get_keymap("n")` 里真实存在的(leader 已去掉):
 *
 *   |  -> <C-W>v      [Split Window Right]
 *   -  -> <C-W>s      [Split Window Below]
 *   wd -> <C-W>c      [Delete Window]
 *   wm -> (nil)       [Toggle Zoom Mode]
 *   <C-H> -> <C-W>h   [Go to Left Window]
 *   <C-J> -> <C-W>j   [Go to Lower Window]
 *   <C-K> -> <C-W>k   [Go to Upper Window]
 *   <C-L> -> <C-W>l   [Go to Right Window]
 *   <C-W> -> (nil)    [Window Hydra Mode (which-key)]
 *
 * hydra 里那些 `H J K L`(移动窗口)、`x`(交换)、`+ - < > = _ |`(调整大小)
 * 在 Normal 模式**没有顶层映射** —— 它们只在 hydra 内部有效,
 * 即先按 `<C-W>` 进入 hydra 再按那些键。
 *
 * 这点很关键:意味着用户实际的操作路径是
 * `<C-W>` 然后 `H`,而不是直接按 `<C-W>H`。
 * 但底层效果一样,所以训练时按哪个都行,这里按「直接按」记。
 */

import type { Op } from "./split";

/** hydra 里的一个键 */
export type HydraKey = {
  /** hydra 上显示的键,如 "d" / "H" / ">" */
  key: string;
  /** 对应的 `<C-w>*` 记法 */
  command: string;
  /** 中文说明 */
  desc: string;
  /** 模型里的操作;null 表示这个键我们还没建模 */
  op: Op | null;
  /** 分组,用于界面分区 */
  group: "移动" | "切分" | "关闭" | "尺寸" | "其他";
  /** 本机是否有更顺手的等价键(LazyVim 改过的) */
  alt?: string;
};

export const HYDRA: HydraKey[] = [
  // ---- 移动焦点 / 移动窗口 ----
  { key: "h", command: "<C-w>h", desc: "跳到左边的窗口", op: { go: "h" }, group: "移动", alt: "<C-H>" },
  { key: "j", command: "<C-w>j", desc: "跳到下边的窗口", op: { go: "j" }, group: "移动", alt: "<C-J>" },
  { key: "k", command: "<C-w>k", desc: "跳到上边的窗口", op: { go: "k" }, group: "移动", alt: "<C-K>" },
  { key: "l", command: "<C-w>l", desc: "跳到右边的窗口", op: { go: "l" }, group: "移动", alt: "<C-L>" },
  { key: "H", command: "<C-w>H", desc: "把窗口移到最左", op: { move: "h" }, group: "移动" },
  { key: "J", command: "<C-w>J", desc: "把窗口移到最后", op: { move: "j" }, group: "移动" },
  { key: "K", command: "<C-w>K", desc: "把窗口移到最上", op: { move: "k" }, group: "移动" },
  { key: "L", command: "<C-w>L", desc: "把窗口移到最右", op: { move: "l" }, group: "移动" },

  // ---- 切分 ----
  { key: "v", command: "<C-w>v", desc: "竖着切一刀", op: { dir: "v" }, group: "切分", alt: "<Space>|" },
  { key: "s", command: "<C-w>s", desc: "横着切一刀", op: { dir: "h" }, group: "切分", alt: "<Space>-" },

  // ---- 关闭 / 交换 ----
  { key: "d", command: "<C-w>c", desc: "关掉当前窗口", op: { close: true }, group: "关闭", alt: "<Space>wd" },
  { key: "o", command: "<C-w>o", desc: "只留当前窗口,其他全关", op: { others: true }, group: "关闭" },
  { key: "x", command: "<C-w>x", desc: "和下一个窗口换位置", op: { swap: true }, group: "关闭" },

  // ---- 调整大小 ----
  { key: ">", command: "<C-w>>", desc: "窗口变宽", op: { resize: "v+" }, group: "尺寸" },
  { key: "<", command: "<C-w><", desc: "窗口变窄", op: { resize: "v-" }, group: "尺寸" },
  { key: "+", command: "<C-w>+", desc: "窗口变高", op: { resize: "h-" }, group: "尺寸" },
  { key: "-", command: "<C-w>-", desc: "窗口变矮", op: { resize: "h+" }, group: "尺寸" },
  { key: "|", command: "<C-w>|", desc: "宽度拉满", op: { resize: "maxv" }, group: "尺寸" },
  { key: "_", command: "<C-w>_", desc: "高度拉满", op: { resize: "maxh" }, group: "尺寸" },
  { key: "=", command: "<C-w>=", desc: "等高等宽", op: { resize: "eq" }, group: "尺寸" },

  // ---- 还没建模 ----
  { key: "q", command: "<C-w>q", desc: "关窗并回到 Alternate File", op: null, group: "其他" },
  { key: "W", command: "<C-w>W", desc: "在窗口列表里轮换", op: null, group: "其他" },
  { key: "m", command: "<C-w>m", desc: "缩放模式(只留当前窗口)", op: null, group: "其他", alt: "<Space>wm" },
  { key: "T", command: "<C-w>T", desc: "把当前窗口挪到新标签页", op: null, group: "其他" },
  { key: "0", command: "<C-w>0", desc: "跳到第 0 个窗口(上一个文件)", op: null, group: "其他" },
  { key: "1", command: "<C-w>1", desc: "跳到第 1 个窗口", op: null, group: "其他" },
  { key: "^D", command: "<C-w>^D", desc: "显示光标处的诊断信息", op: null, group: "其他" },
];

export const GROUPS: HydraKey["group"][] = ["移动", "切分", "关闭", "尺寸", "其他"];

/** 本机真正绑定了顶层键的(其余只在 hydra 内部有效) */
export const BOUND = HYDRA.filter((h) => h.alt);