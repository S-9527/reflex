/**
 * `/seq` 盲背模式的分组 —— 用**键的形态**,不用「第 x 关」。
 *
 * ## 为什么要换掉「第 x 关」
 *
 * 原来 15 个按钮只写「第 2 关」…「第 15 关」,没有名字。
 * 用户报「看起来很不清晰」。查了一下,那 15 关是抽取脚本按
 * `group` 硬编号排的,彼此之间**没有内在逻辑**:
 *
 * ```
 * 第 4关  5条  会话
 * 第 9关  4条  窗口调整大小        ← 比第 4 关还少,排它前面没道理
 * 第15关  2条  其他裸键            ← 2 条,单独一关纯属编号凑数
 * 第 7关 40条  搜索替换
 * 第 6关 38条  特殊键 + 代码/LSP   ← 一关里混了两个不相干的族
 * 第 2关 26条  缓冲区 + 单键       ← 也是混的
 * ```
 *
 * 而且原来的编号和用户的直觉是反的:第 1 关(窗口)是最该练的,
 * 却被移走了,剩下的从「第 2 关」开始 —— 开头就缺一截。
 *
 * ## 现在的判据:按**键的形态**分
 *
 * 盲背模式练的是「看到描述 → 按出序列」。所以分组要回答
 * 「这组键长得像什么」,而不是「这组有多少条」。
 *
 * 四类形态,一眼能对上:
 *
 * | 分组 | 形态 | 例 |
 * |------|------|-----|
 * | leader 二级 | `<Space>` + 一个前缀 + 一键 | `<Space>s"f` `<Space>gb` |
 * | Ctrl 系列 | `<C-...>` | `<C-H>` `<C-d>` `<C-/>` |
 * | 列表跳转 | `[` `]` + 键 | `[d` `]q` `[s` |
 * | 裸键 | 一个字符 | `L` `H` `[a` `j` |
 *
 * 每组下面再列具体的族(`s*` 搜索 / `g*` Git / …),所以既粗又细。
 */

/** 键的形态 —— 盲背时最容易认出来的特征 */
export type Shape = "leader" | "ctrl" | "brackets" | "bare";

/** 分组定义。顺序 = 练习建议的顺序(按出现频率) */
export type SeqGroup = {
  id: string;
  /** 组名 */
  name: string;
  /** 形态 */
  shape: Shape;
  /** 一句话说明这一组在练什么 */
  what: string;
};

export const SEQ_GROUPS: SeqGroup[] = [
  {
    id: "leader",
    name: "leader 前缀键",
    shape: "leader",
    what: "`<Space>` 打头,后面跟一个前缀字母。这是 LazyVim 的主力键位,量最大",
  },
  {
    id: "ctrl",
    name: "Ctrl 系列",
    shape: "ctrl",
    what: "`<C-…>`。和 leader 那套是两套记忆,别混着练",
  },
  {
    id: "brackets",
    name: "列表跳转",
    shape: "brackets",
    what: "`[` `]` 打头。在诊断、搜索结果、文件列表之间跳",
  },
  {
    id: "bare",
    name: "裸键",
    shape: "bare",
    what: "单个字符,不带任何前缀。最短,但和字母表混在一起,得单独记",
  },
];

export const SHAPE_NAME: Record<Shape, string> = {
  leader: "leader 前缀",
  ctrl: "Ctrl 系列",
  brackets: "方括号跳转",
  bare: "裸键",
};

/**
 * 判断一个键写法属于哪种形态。
 *
 * ⚠️ 顺序有意义:`<Space><Tab>x` 既是 leader 也是「特殊键」,
 *   但形状上它显然先该归 leader —— 因为要记的是「先按 Space」。
 *   同理 `<C-w>d` 先归 ctrl。
 */
export function shapeOf(display: string): Shape {
  if (display.startsWith("<Space>")) return "leader";
  if (display.includes("<C-")) return "ctrl";
  // <BS> <Esc> 这类不在字母表里的键,归 leader 还是 ctrl?
  // 它们本身没前缀,归裸键更诚实。
  if (/^[[]/.test(display) || /^]/.test(display)) return "brackets";
  return "bare";
}