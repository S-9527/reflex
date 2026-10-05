/**
 * 全局题目 id —— 让进度能跨板块对上。
 *
 * ## ⚠️ 为什么需要这个
 *
 * 进度是**全局一张表**（`lib/srs.ts`），key 是 task id。
 * 但各板块原来用**本地 id**：
 *
 * ```
 * /buffers  →  "L#0"    （题库下标）
 * /tabs     →  "<Tab>d#1"
 * /seq      →  "n|L"    （COMMANDS 的全局 id）
 * ```
 *
 * 同一条命令（「下一个 buffer」）在 `/buffers` 和 `/seq` 各练一次，
 * 会被记成**两条独立进度** —— 复习队列重复出题，首页统计虚高。
 *
 * ## 方案：以 COMMANDS 的 id 为唯一真源
 *
 * `COMMANDS` 的 id 形如 `n|<Space>bd`（`mode|lhs`），
 * 它天然全局唯一、稳定，而且是数据集生成的。
 *
 * ## ⚠️ 但有三种情况映射不过去
 *
 * 实测（见 tests/id-mapping.test.ts）：
 *
 * | 板块 | 能否映射 | 原因 |
 * |------|---------|------|
 * | buffers / tabs / ui / files | ✅ | 键都在 `COMMANDS` 里 |
 * | text | ❌ | `diw` 是 Vim 内建文本对象，不在 `nvim_get_keymap` 里 |
 * | diagnostics | ❌ 部分 | `gr*` 是 buffer-local 映射，不在全局表里 |
 * | windows-hydra | ❌ 多数 | hydra 面板键只在 `<Space><Space>` 后才存在 |
 *
 * 所以**不能一刀切**：能映射的用全局 id，不能的保留本地 id
 * （加板块前缀避免跨板块撞车）。
 */

import { COMMANDS } from "./bindings";

/** display（含次解）→ 全局命令 id */
const BY_DISPLAY = new Map<string, string>();
for (const c of COMMANDS) {
  BY_DISPLAY.set(c.display, c.id);
  for (const a of c.alternates) BY_DISPLAY.set(a, c.id);
}

/**
 * 查一个键序列的全局 id。
 *
 * @returns 全局 id；查不到返回 null（该用本地 id）
 */
export function globalIdOf(display: string): string | null {
  return BY_DISPLAY.get(display) ?? null;
}

/**
 * 给一道题算稳定的 id。
 *
 * ## 判据
 *
 * 1. 能映射到 `COMMANDS` → 用全局 id（跨板块共享进度）
 * 2. 映射不到 → 用 `板块:本地key`（**带板块前缀**，避免不同板块的
 *    同名键撞在一起，比如 `/text` 的 `iw` 和别处的 `iw`）
 *
 * ## ⚠️ 为什么要 `suffix`
 *
 * `/buffers` 里有两道题的 key 都是 `L`（故意考「从末尾切回第一个会绕回」）。
 * 它们**不是**同一个题目（起始状态不同），但键序列相同 ——
 * 用全局 id 会撞成一条，做完一题另一题也显示已做。
 *
 * 所以允许调用方给一个后缀区分。**只在该板块真的有重复 key 时才用** ——
 * 滥用会让「同一条命令在多个板块共享进度」这个好处失效。
 *
 * @param board     板块 id（本地 id 的前缀）
 * @param display   键序列（Vim 记法）
 * @param suffix    同板块内区分重复 key 的后缀（可选）
 */
export function taskIdOf(board: string, display: string, suffix?: string | number): string {
  const g = globalIdOf(display);
  if (g) return suffix === undefined ? g : `${g}#${suffix}`;
  // 映射不到 —— 本地 id 必须带板块前缀，否则跨板块会撞
  return `${board}:${display}${suffix === undefined ? "" : `#${suffix}`}`;
}
