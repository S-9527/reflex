/**
 * leader 序列的输入状态机 —— 纯逻辑,无 React、无 DOM。
 *
 * ## 为什么需要它
 *
 * 实测踩过的坑:原来首页用 `firstKeySet` 判断"这个键要不要接管",
 * 而 `firstKeySet` **只含每个序列的第一个键**。于是 `<Space>|` 的
 * 续键 `|` 从来不在集合里 → 按下就被 `return` 放行给浏览器 →
 * 序列卡在 `<Space>` 状态,`|` 永远送不到匹配器。
 *
 * 后果不是个别键:290 条绑定里 233 条是多键序列,其中
 * **206 条(71%)有至少一个续键不在 firstKeySet 里**。
 * 也就是说首页七成的题按不到终点。
 *
 * 而 `/windows` 没这个问题,因为它自己写了一套 leader 状态机。
 * **同一个概念两套实现,必然不同步** —— 这才是根因。
 * 现在统一到这里,两边共用。
 *
 * ## 判据:什么时候接管一个键
 *
 * - `idle`(还没按任何键):只在 `firstKeySet` 里才接管。
 *   这样 F5 / F12 / Ctrl+P 这些浏览器快捷键不会被劫持
 *   (它们不在任何绑定里),也不会在按字母时被吞掉。
 * - `pending`(已按了 leader,正在等续键):**无条件接管**。
 *   此时任何字符都是潜在续键,不可能是浏览器快捷键。
 *
 * ## 为什么不在这里判分
 *
 * 本模块只回答"这一键收不收、收到序列里"。判分交给
 * `lib/matcher.ts` 的前缀树(`hit`/`partial`/`miss` 三态)——
 * 那是纯函数、已充分单测的部分,不该和输入处理耦合。
 */

export type LeaderState = {
  /** 已按下的键序列(逐键,Vim 记法) */
  typed: string[];
  /** 上一次产出的序列是否还在等续键 */
  pending: boolean;
};

export const idle: LeaderState = { typed: [], pending: false };

/**
 * 这个键序列还能不能往下接?
 *
 * @param firstKeys firstKeySet(...) 的结果
 */
export function shouldTake(vimKey: string, st: LeaderState, firstKeys: Set<string>): boolean {
  // 已经在序列中间:任何键都可能是续键,全收。
  // ⚠️ 这一条就是之前漏掉的 —— 少了它,`<Space>|` 的 `|` 会被放行。
  if (st.pending) return true;
  return firstKeys.has(vimKey);
}

/**
 * 把一个键追加到序列上,并判断是否进入"等续键"状态。
 *
 * `extendable` 由调用方用匹配器判定(prefix 是否还有子节点),
 * 因为"还有没有后续"是**数据集相关**的,不该在这里硬编码。
 */
export function push(
  st: LeaderState,
  vimKey: string,
  opts: { isTerminal: boolean; extendable: boolean },
): LeaderState {
  const typed = [...st.typed, vimKey];
  // 终点且不能延长 → 序列结束(pending=false),调用方可以判分了
  if (opts.isTerminal && !opts.extendable) return { typed, pending: false };
  return { typed, pending: true };
}

/** 从任意状态回到起点 */
export function reset(): LeaderState {
  return { typed: [], pending: false };
}