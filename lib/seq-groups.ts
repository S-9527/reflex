/**
 * `/seq` 的分组与筛选 —— 纯函数，有单测。
 *
 * ## 分组：按 which-key 的真实分类
 *
 * 原来用「按键形态」（leader / ctrl / brackets / bare）。那个分法
 * 只回答「这键长什么样」，而用户脑子里是「这键干什么用」——
 * which-key 面板里看到的正是后者。
 *
 * 现在真分组直接用 which-key 的 `group`（`search` / `git` / `goto` …），
 * 兜底键（没有 which-key 分组的）**合成一个「其它」**。
 *
 * ⚠️ 兜底键占 63 条，分成 insert / visual / ctrl-misc / leader-misc /
 *    bare / other / operator 七桶。七个小桶各自成按钮意义不大，
 *    合成「其它」更好用 —— 它们本来就是「which-key 没管的那批」。
 *
 * ## 筛选：不能当题干背的键要排掉
 *
 * 有 38 条键**没法当题干**：
 *
 * | 原因 | 条数 | 例 |
 * |------|------|-----|
 * | 没有描述 | 19 | `%` `g%` `,` `;`（插件没上报 desc） |
 * | desc 是 help 引用 | 8 | `@` → `:help v_@-default` |
 * | auto-pairs 自动配对 | 9 | `(` → `Open action for "()" pair` |
 * | MiniPairs 内部行为 | 2 | `<BS>` → `MiniPairs <BS>` |
 *
 * 前三类是**真的不能出题**（题干空白或显示 help 字符串）。
 * 但排掉不等于藏起来 —— 用户应该能看到「排除了什么、为什么」，
 * 所以单独给一栏展示（`skipped`）。
 *
 * ⚠️ 旧版把「空 desc」也留在题库里，于是会出现**题干空白**的题。
 *    那不是「简洁」，是坏了。
 */

import { COMMANDS, GROUPS, type Command } from "./bindings";
import { boardCoveredIds } from "./boards";

/** 窗口键交给 `/windows` —— 那里能画出真实分屏树 */
const WINDOW_NAV =
  /^(Go to (Left|Right|Upper|Lower) Window|Split Window|Delete Window|Move (Up|Down)|(Increase|Decrease) Window)/;

/** 排掉的原因 */
export type SkipReason =
  | "没有描述（插件没上报 desc）"
  | "desc 是 help 引用，不是人话"
  | "auto-pairs 自动配对行为，不是要背的键位"
  | "MiniPairs 内部行为";

/** 一条被排掉的键 */
export type Skipped = {
  command: Command;
  reason: SkipReason;
};

/**
 * 这条命令能当题干背吗？
 *
 * @returns 不能背的原因；能背返回 null
 */
export function whyNotDrillable(c: { desc: string }): SkipReason | null {
  const d = c.desc.trim();
  if (!d) return "没有描述（插件没上报 desc）";
  if (/^:help\b/.test(d)) return "desc 是 help 引用，不是人话";
  if (/action for|Closeopen/i.test(d)) return "auto-pairs 自动配对行为，不是要背的键位";
  if (/^MiniPairs/.test(d)) return "MiniPairs 内部行为";
  return null;
}

/** 一个分组（按钮）*/
export type SeqGroup = {
  /** 分组 id（which-key 的 group 名，或兜底的 `__other__`） */
  id: string;
  /** 显示名 */
  name: string;
  /** 这一组有多少题 */
  count: number;
};

/** 兜底分组的 id */
export const OTHER_ID = "__other__";

/**
 * 筛出可练的命令。
 *
 * @param commands 默认用全量 `COMMANDS`（测试时可传子集）
 */
export function drillablePool(commands: Command[] = COMMANDS): Command[] {
  const covered = boardCoveredIds(commands);
  return commands.filter(
    (c) => !WINDOW_NAV.test(c.desc) && !covered.has(c.id) && !whyNotDrillable(c),
  );
}

/** 被排掉的命令（给「排除项」那一栏展示） */
export function skippedPool(commands: Command[] = COMMANDS): Skipped[] {
  const covered = boardCoveredIds(commands);
  return commands
    .filter((c) => !WINDOW_NAV.test(c.desc) && !covered.has(c.id))
    .map((c) => ({ command: c, reason: whyNotDrillable(c) }))
    .filter((x): x is Skipped => x.reason !== null);
}

/**
 * 按 which-key 分组切分。
 *
 * ⚠️ 排序：真分组按**题量降序**（量大的先练），
 *    「其它」**永远排最后** —— 它是兜底，不该抢在前面。
 */
export function groupOf(commands: Command[]): SeqGroup[] {
  const real = new Map<string, number>();
  let other = 0;

  for (const c of commands) {
    if (c.inWhichKey) {
      real.set(c.group, (real.get(c.group) ?? 0) + 1);
    } else {
      other++;
    }
  }

  const out: SeqGroup[] = [...real.entries()]
    .map(([id, count]) => ({ id, name: GROUPS[id] ?? id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  if (other > 0) out.push({ id: OTHER_ID, name: "其它", count: other });
  return out;
}

/** 取某个分组下的命令 */
export function filterByGroup(commands: Command[], groupId: string): Command[] {
  if (groupId === OTHER_ID) return commands.filter((c) => !c.inWhichKey);
  return commands.filter((c) => c.inWhichKey && c.group === groupId);
}
