/**
 * 「这个键属于 Vim 原生还是插件」—— 一张实测的对照表。
 *
 * ## 为什么要单独一个文件
 *
 * 用户提的问题很对:有些键我测不出效果,于是页面上只写「未实测」,
 * 那等于什么都没说 —— 用户还是不知道按了会发生什么。
 *
 * **测不出「效果」不等于说不出「作用」。** 这两件事可以分开:
 *
 * - **作用**(这个键干什么):来自 `desc` 实测原文 + 底层 API 核实。
 *   这部分我**能**给,而且给得出。
 * - **视觉效果**(画面怎么变):headless 下测不出。
 *   这部分要如实说测不出,但不能因此连作用一起吞掉。
 *
 * 所以每个键现在有三个字段:
 *   `effect` —— 作用(尽量实测)
 *   `origin` —— Vim 内建 / Neovim 内建 / 插件提供 / 纯插件功能
 *   `verified` —— 我到底核实到哪一层(见下)
 *
 * ## verified 的四档(诚实标注,不是免责声明)
 *
 * | 值 | 含义 |
 * |----|------|
 * | `opt` | 我核实了对应的 option / Ex 命令 / API **在本机存在** |
 * | `rhs` | 实测拿到了真 rhs(Ex 字符串),内容逐字可信 |
 * | `desc` | 只有 desc 原文,底层没核实 |
 * | `none` | 什么都没核实到 |
 *
 * 「存在」和「这个键确实改它」是两回事 —— 我只核实前者,
 * 所以标 `opt` 而不是标「实测有效」。
 */

/** 键的来源 */
export type Origin =
  | "Vim 内建 option"
  | "Vim 内建 Ex 命令"
  | "Neovim 内建 API"
  | "LazyVim 键位 → Vim option"
  | "LazyVim 键位 → Neovim API"
  | "纯插件功能(无原生等价)";

/** 我核实到哪一层 */
export type Verified =
  /** 核实了 option/Ex/API 在本机 exists */
  | "opt"
  /** 实测拿到了真 rhs */
  | "rhs"
  /** 只有 desc 原文 */
  | "desc"
  /** 什么都没核实到 */
  | "none";

/**
 * 本机实测记录(用来支撑上面两个字段)。
 *
 * 我第一版是**凭印象**给每个键写「原生等价」,比如把
 * `uS` 写成 `:set scrolljump`、把 `uZ` 写成「无对应」。
 * 这次逐条核实发现:
 *
 * - `relativenumber` `number` `wrap` `spell` `conceallevel`
 *   `scrolljump` `showtabline` `background` —— option **确实存在**
 * - `:colorscheme` `:checkhealth` `:nohlsearch` `:diffupdate` `:redraw`
 *   —— exists() = 2,**确实存在**
 * - `:getcurpos` —— exists() = 0,**不存在**!它是函数不是 Ex 命令。
 *   我第一版给它写了 `:echo getcurpos()`,那句本身能跑(它是个函数调用),
 *   但作为「Ex 命令对照」是错的。
 * - `vim.diagnostic.jump/get`、`vim.lsp.buf.*` 六个、`vim.treesitter`
 *   —— **API 全部存在**
 *
 * 所以 `ui` 键的作用现在有了实测支撑,不是猜的。
 */

/** 实测:本机存在的 option(逐个 vim.o[opt] 读过) */
export const MEASURED_OPTIONS = [
  "relativenumber",
  "number",
  "wrap",
  "spell",
  "conceallevel",
  "scrolljump",
  "showtabline",
  "background",
  "cursorline",
  "list",
  "signcolumn",
] as const;

/** 实测:exists() = 2 的 Ex 命令 */
export const MEASURED_EX = [
  "colorscheme",
  "checkhealth",
  "nohlsearch",
  "diffupdate",
  "redraw",
  "sort",
  "normal",
  "undojoin",
  "syntax",
  "echo",
] as const;

/** 实测:**不存在**的 Ex 命令(写上去就会误导) */
export const NOT_EXISTING_EX = ["getcurpos"] as const;

/** 实测:存在的 Lua API */
export const MEASURED_API = [
  "vim.diagnostic.jump",
  "vim.diagnostic.get",
  "vim.diagnostic.set",
  "vim.diagnostic.open_float",
  "vim.diagnostic.is_enabled",
  "vim.lsp.buf.references",
  "vim.lsp.buf.rename",
  "vim.lsp.buf.code_action",
  "vim.lsp.buf.implementation",
  "vim.lsp.buf.type_definition",
  "vim.lsp.buf.document_symbol",
  "vim.lsp.inlay_hint",
  "vim.treesitter",
  "vim.uv",
] as const;

/**
 * 实测里发现的一个反直觉点,记一笔免得以后又踩:
 *
 * `vim.wo.showtabline` **不存在**,但 `vim.o.showtabline` 存在。
 *
 * 原因是 `showtabline` 是**全局局部都行**的选项(global-local),
 * 而 `vim.wo` 只暴露 window-local 的那些。
 *
 * ⚠️ 这类「同一份文档写 vim.o 和 vim.wo 都能用」的地方很容易想当然。
 * 我写完 effect 之后顺手逐条核实,才撞见这个差异。
 */
export const WO_ONLY_TRAP = {
  showtabline: "vim.wo.showtabline 不存在,vim.o.showtabline 存在(global-local 选项)",
};

/** origin → 界面上的一句话解释 */
export const ORIGIN_NOTE: Record<Origin, string> = {
  "Vim 内建 option": "任何 Vim 都有这个选项,只是本机绑了键",
  "Vim 内建 Ex 命令": "任何 Vim 都有这条命令,只是本机绑了键",
  "Neovim 内建 API": "Neovim 自带(0.11 有),不是插件",
  "LazyVim 键位 → Vim option": "键是 LazyVim 加的,做的事本身是 Vim 原生的",
  "LazyVim 键位 → Neovim API": "键是 LazyVim 加的,做的事本身是 Neovim 的 API",
  "纯插件功能(无原生等价)": "整件事都是插件做的,Vim/Neovim 里没有对应",
};

/** verified → 界面上的一句话解释 */
export const VERIFIED_NOTE: Record<Verified, string> = {
  opt: "已核实:对应的 option / 命令 / API 在你机器上确实存在",
  rhs: "已核实:实测拿到了它的 rhs(Ex 字符串)",
  desc: "只核实到 desc 原文,底层存在性没查",
  none: "什么都没核实到",
};