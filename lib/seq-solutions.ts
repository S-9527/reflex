/**
 * 「全部解法」查询 —— **COMMANDS 的适配层**。
 *
 * ## ⚠️ 这个文件被重写过，旧版是手写表
 *
 * 旧版维护了两样手写的东西：
 *
 * 1. `NATIVE_VERIFIED` —— 73 条原生 Ex 对应关系（人工判断 + exists() 实测）
 * 2. 按 `desc` 聚合出的等价键
 *
 * 手写表的实测结果是**既多又少**：
 *
 * | desc | 手写声称 | 真实（按 rhs） |
 * |------|---------|---------------|
 * | Next Buffer | `L` `]b` `<Space>bb` `<Space>b\`` | `L` `]b` |
 * | Switch to Other Buffer | 未收录 | `` ` `` `<Space>bb` |
 * | Down | 未收录 | `j` `<Down>` |
 *
 * 错因是**没有 rhs**：`<Space>bb` 的 rhs 是 `<Cmd>e #<CR>`，
 * 跟 `L` 的 `<Cmd>BufferLineCycleNext<CR>` 是两条不同的命令。
 *
 * 现在 `scripts/build-dataset.mjs` 已经按 rhs 聚合出 `COMMANDS`
 * （`display` = 最优解，`alternates` = 次解，`native` = 原生 Ex），
 * 所以这里不再维护任何数据，只做查询适配。
 *
 * `NATIVE_VERIFIED` 仍然导出自 `lib/bindings`，因为那张表的
 * **存在性实测记录**（哪些命令 `exists()` 验过）是有价值的元数据。
 */

import { COMMANDS, type Command } from "./bindings";

/** 一个 desc 的解法信息（旧 API 的形状，保持向后兼容） */
export type DescSolution = {
  /** desc 原文（作为聚合键） */
  desc: string;
  /** 本机有这些键做这件事（含最优解） */
  keys: string[];
  /** 这些键分别在哪些 mode 有效 */
  modes: string[];
  /** Vim 原生 Ex 等价。null = 确认没有（插件功能） */
  native: string | null;
  /** 我实测过 `exists(':native')` 吗 */
  verified: true | "unchecked";
  /** 为什么没有原生等价 */
  note?: string;
};

/** display → 命令。建一次，查询 O(1) */
const BY_DISPLAY = new Map<string, Command>();
for (const c of COMMANDS) {
  BY_DISPLAY.set(c.display, c);
  for (const a of c.alternates) BY_DISPLAY.set(a, c);
}

/** 这个键序列属于哪条命令 */
export function commandOf(display: string): Command | undefined {
  return BY_DISPLAY.get(display);
}

/** 这道题的全部解法（最优解 + 次解） */
export function solutionsFor(display: string): DescSolution | null {
  const c = commandOf(display);
  if (!c) return null;
  return {
    desc: c.desc,
    keys: [c.display, ...c.alternates],
    modes: c.modes,
    native: c.native,
    verified: c.nativeVerified,
    note:
      c.native === null
        ? "插件功能，Vim 里没有原生等价"
        : c.nativeVerified === "unchecked"
          ? "Ex 命令，存在性没核实"
          : undefined,
  };
}

/** 这个键序列本身是什么 desc */
export function descOfKey(display: string): string | undefined {
  return commandOf(display)?.desc;
}

/**
 * 判「这道题算不算答对」。
 *
 * ## ⚠️ 为什么不能只认键相等
 *
 * 实测：同一个命令在本机有多个键，rhs 完全相同：
 *
 * ```
 * H   rhs=<Cmd>BufferLineCyclePrev<CR>  desc=Prev Buffer
 * [b  rhs=<Cmd>BufferLineCyclePrev<CR>  desc=Prev Buffer
 * ```
 *
 * 它们就是同一条命令。旧版判 `binding.id === current.id`，
 * 于是题目问 `H` 时按 `[b` 判错 —— 浏览器实测抓到的那句提示很讽刺：
 * 「这个键是「打开的缓冲区」，但本题要的是「打开的缓冲区」」。
 *
 * **训练器比真实环境挑剔是最要命的毛病**：用户明明按对了，
 * 却以为自己没学会，于是反复练一道其实已经会的题。
 *
 * ## 判据
 *
 * 两条键属于**同一条命令**（同一个 `Command`）即等价。
 * 命令身份在 build 阶段由 rhs 定（严格），无 rhs 时退回 desc（弱）。
 */
export function judge(
  expected: { id: string; display: string; desc: string },
  pressed: { id: string; display: string; desc: string },
): "exact" | "equivalent" | "wrong" {
  if (pressed.id === expected.id) return "exact";
  const a = commandOf(expected.display);
  const b = commandOf(pressed.display);
  if (a && b && a.id === b.id) return "equivalent";
  return "wrong";
}

/** 命中「等价」时，把同功能的其它键列出来 */
export function equivalentsOf(pressedDisplay: string): string[] {
  const c = commandOf(pressedDisplay);
  if (!c) return [];
  return [c.display, ...c.alternates].filter((k) => k !== pressedDisplay);
}

/** 全部命令（旧 API：按 desc 聚合的解法表） */
export function allSolutions(): DescSolution[] {
  return COMMANDS.map((c) => ({
    desc: c.desc,
    keys: [c.display, ...c.alternates],
    modes: c.modes,
    native: c.native,
    verified: c.nativeVerified,
    note: c.native === null ? "插件功能，Vim 里没有原生等价" : undefined,
  }));
}

/** 多个不同键做同一件事的命令 */
export function multiKeyDescs(): DescSolution[] {
  return allSolutions()
    .filter((s) => s.keys.length > 1)
    .sort((a, b) => b.keys.length - a.keys.length);
}
