/**
 * 「这条命令已经被某个专门页面覆盖了吗」—— 板块之间的**去重判据**。
 *
 * ## ⚠️ 为什么从 lib/boards.ts 拆出来
 *
 * 原来这两个函数住在 `lib/boards.ts` 里，而 `lib/seq-groups.ts` 要调它们
 * 来算 `/seq` 的题库 —— 于是 `boards → seq-groups → boards` 成了**循环依赖**。
 *
 * 循环本身在 ESM 里不一定炸（函数声明会提升），但只要 `boards.ts`
 * 在模块初始化期调用 `drillablePool()`，就会读到还没初始化的
 * `seq-groups` —— 报的是看不懂的 undefined 错。
 *
 * 而首页的分母**必须**由题库真实长度算出来（原来写死 235，页面实际 135，
 * 见 `lib/boards.ts` 的说明）。所以要能在 `boards.ts` 初始化期安全地
 * 调 `drillablePool()`，就得先把这层依赖掰直：
 *
 * ```
 * 任务数组(bufs/tabs/…) ← coverage ← seq-groups ← boards
 * ```
 *
 * `coverage` 只依赖各板块的**题库数组**，不依赖板块注册表，所以无环。
 */

import { TASKS as WIN_TASKS } from "./winkeys";
import { BUF_TASKS } from "./bufs";
import { TAB_TASKS } from "./tabs";
import { FILE_TASKS } from "./files";
import { UI_TOGGLES } from "./ui-toggles";
import { DIAG_KEYS } from "./diagnostics";

/**
 * 各**专门页面**已经出的题，映射到 `display` → 板块 id。
 *
 * ## ⚠️ 为什么需要这个
 *
 * `/seq` 是「全键位扫描」，它的描述写的就是「**其余**全部键位」——
 * 意思是已经有专门页面的族不该在这里重复出题。
 *
 * 但实测（见 tests/dedup.test.ts）它和专门页面**重复了 62 条**：
 *
 * ```
 * <Space>u*   界面开关    24 条重复
 * <Tab>*      标签页       7 条重复
 * <Space>f*   文件查找    10 条重复
 * buffers     缓冲区       3 条重复
 * diag        诊断        18 条重复
 * ```
 *
 * 后果：同一条命令在两个页面各练一遍（进度 id 已统一，但**题量虚高**），
 * 而且 `/seq` 的「其余」名不副实。
 *
 * ## 判据
 *
 * 一个命令被专门页面覆盖 = 它的键（含次解）出现在那个板块的题库里。
 *
 * ⚠️ 只有**可视化板块**才算 —— `/seq` 自己不算（它就是要练「其余」的）。
 *
 * ⚠️ 这里**不包含**文本对象（`/text`）和窗口跳转/搭建/缩放。
 *    文本对象的键是 `diw` 这种完整三键，和 `COMMANDS` 的 `display`
 *    形态对不上；窗口三模式的题是终态判定，没有固定键序列。
 *    它们本来就不会和 `/seq` 的题目撞车，所以不需要参与去重。
 */
export function coveredByBoard(): Map<string, string> {
  const m = new Map<string, string>(); // display → boardId
  const add = (display: string, boardId: string) => {
    if (!m.has(display)) m.set(display, boardId);
  };

  /**
   * ⚠️ hydra 的题是**三段式** `<Space>wX`，不是裸面板键。
   *
   * 我第一版直接 `add(t.key)`，于是面板里的 `H` / `>` 把
   * **全局**的 `H`（上一个 buffer）和 `>`（缩进）也标记成「被覆盖」——
   * 这是两回事：面板键只在 `<Space><Space>` 进入面板后才存在，
   * 不是全局映射（`lib/winkeys.ts` 里记过这条实测结论）。
   *
   * 所以只贡献完整三段式 `display`。
   */
  for (const t of WIN_TASKS) add(`<Space>w${t.key}`, "windows-hydra");
  for (const t of BUF_TASKS) {
    add(t.key, "buffers");
    if (t.key.length > 1 && !t.key.startsWith("<")) add(`<Space>${t.key}`, "buffers");
  }
  for (const t of TAB_TASKS) add(`<Space>${t.key}`, "tabs");
  for (const t of FILE_TASKS) add(t.key, "files");
  for (const t of UI_TOGGLES) add(t.hasLeader ? `<Space>${t.key}` : t.key, "ui");
  for (const k of DIAG_KEYS) add(k.hasLeader ? `<Space>${k.key}` : k.key, "diagnostics");

  return m;
}

/**
 * 这些命令已经有专门页面了（`display` 或次解命中就算）。
 *
 * `/seq` 用它过滤出题库 —— 返回的是**要排除的 id 集合**。
 *
 * ⚠️ 次解也要算：`H` 的次解 `[b` 如果出现在某个专门页面，
 *    那 `H` 本身也该算被覆盖（它们同一条命令）。
 */
export function boardCoveredIds(
  commands: { id: string; display: string; alternates: string[] }[],
): Set<string> {
  const byDisplay = coveredByBoard();
  const out = new Set<string>();
  for (const c of commands) {
    if (byDisplay.has(c.display) || c.alternates.some((a) => byDisplay.has(a))) {
      out.add(c.id);
    }
  }
  return out;
}
