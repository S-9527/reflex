import type { Binding } from "./matcher";

/**
 * 数据集统计 —— 四张可视化图共用同一份计算。
 *
 * ## 为什么单独一个文件
 *
 * 之前统计逻辑散在各处(手写 python 脚本、分关卡时临时算),
 * 每处都可能算出不一样的数。集中到这里,四张图的口径就一致了。
 *
 * ## ⚠️ 为什么不再按「关卡」
 *
 * 旧版按 `b.level`(手编的「第 x 关」)统计,而那个 level 是
 * `build-dataset.mjs` 里**手写前缀规则猜的** —— 和 which-key 的真实分组无关。
 * 实测下来它把「窗口」放第 1 关(其实只有 2 条),而真实最大的两组
 * search(40 条)和 goto(30 条)被埋在中间。
 *
 * 现在直接按 `b.group` 统计,分组来自 which-key 的 `group = "..."` 声明 ——
 * 所以统计面板里看到的分类,和你在 nvim 里按 `<Space>` 看到的一致。
 */

/** 模式的可读名 */
export const MODE_LABEL: Record<string, string> = {
  n: "Normal",
  v: "Visual",
  x: "Visual-选区",
  o: "Operator",
  c: "命令行",
  i: "Insert",
  s: "Select",
  t: "终端",
};

/**
 * 一个分组的统计。
 *
 * `byMode` 是重点:同一个键在不同模式下动作不同
 * (`gc` 在 Normal 是注释操作符,在 Visual 是切换注释)。
 * 只按 display 去重会掩盖这个差异,所以按 display+mode 计数。
 */
export type GroupStat = {
  group: string;
  name: string;
  total: number;
  /** mode → 条数 */
  byMode: Record<string, number>;
  /** 这个分组里出现过的唯一 display 数(去掉模式重复) */
  uniqueKeys: number;
  /** 唯一 leader 前缀,如 "<Space>f" */
  prefixes: string[];
  /** 平均按键长度 —— 序列越长越难记 */
  avgKeys: number;
  longest: number;
  /** 落在 which-key 分组树里的条数(其余是按形态兜底归的) */
  inWhichKey: number;
};

/**
 * 建树用的一级分组。
 *
 * ⚠️ 语义是「一级」不是「两级」:`<Space>ff` 和 `<Space>fg` 都归到
 * `<Space>f`。之前写成两级(slice(0,2)),结果 ff/fg/fb 分成三组,
 * 建树时 142 vs 156 对不上 —— 三键的键被当成了独立分组。
 *
 * 单键层级特殊处理:`<Space>|` 的 rest 长度是 1,slice(0,1) 正好。
 */
export function prefixOf(display: string): string {
  if (!display.startsWith("<Space>")) return "";
  const rest = display.slice(7);
  if (rest === "") return "<Space>";
  return "<Space>" + rest.slice(0, 1);
}

export function groupStats(bindings: Binding[], groupNames: Record<string, string>): GroupStat[] {
  const map = new Map<string, Binding[]>();
  for (const b of bindings) {
    if (!map.has(b.group)) map.set(b.group, []);
    map.get(b.group)!.push(b);
  }

  return [...map.entries()]
    // 按条数降序 —— 量大的分组排前面,一眼看出「主要该练什么」
    .sort((a, b) => b[1].length - a[1].length)
    .map(([group, list]) => {
      const byMode: Record<string, number> = {};
      for (const b of list) byMode[b.mode] = (byMode[b.mode] || 0) + 1;
      const prefixes = [...new Set(list.map((b) => prefixOf(b.display)).filter(Boolean))].sort();
      const lens = list.map((b) => b.keys.length);
      return {
        group,
        name: groupNames[group] ?? group,
        total: list.length,
        byMode,
        uniqueKeys: new Set(list.map((b) => b.display)).size,
        prefixes,
        avgKeys: Math.round((lens.reduce((a, b) => a + b, 0) / lens.length) * 10) / 10,
        longest: Math.max(...lens),
        inWhichKey: list.filter((b) => b.inWhichKey).length,
      };
    });
}

/** 按 mode 汇总全量 */
export function modeTotals(bindings: Binding[]): { mode: string; label: string; count: number }[] {
  const c: Record<string, number> = {};
  for (const b of bindings) c[b.mode] = (c[b.mode] || 0) + 1;
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => ({ mode, label: MODE_LABEL[mode] ?? mode, count }));
}

/** 按 leader 前缀汇总(建树用) */
export function prefixTree(bindings: Binding[]): {
  prefix: string;
  count: number;
  children: { key: string; display: string; count: number; groups: string[] }[];
}[] {
  const map = new Map<string, Map<string, { display: string; groups: Set<string> }>>();
  for (const b of bindings) {
    const p = prefixOf(b.display);
    if (!p) continue;
    if (!map.has(p)) map.set(p, new Map());
    const inner = map.get(p)!;
    if (!inner.has(b.display)) inner.set(b.display, { display: b.display, groups: new Set() });
    inner.get(b.display)!.groups.add(b.group);
  }
  return [...map.entries()]
    .map(([prefix, inner]) => ({
      prefix,
      count: [...inner.values()].length,
      children: [...inner.values()]
        .map((v) => ({ key: v.display, display: v.display, count: 1, groups: [...v.groups] }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => b.count - a.count);
}

/** 训练进度:每个分组练了多少 */
export type ProgressView = {
  group: string;
  name: string;
  total: number;
  mastered: number;
  shaky: number;
  fresh: number;
  /** 完成度 0~1 */
  done: number;
};

/**
 * 按 which-key 分组统计进度。
 *
 * ## ⚠️ 用哪个 id 查进度
 *
 * 进度是按**命令**记的（`lib/srs.ts`），一条命令一个 id。
 * 而这里遍历的是 `bindings`（一个键位一行）。
 *
 * 所以**不能**直接 `progress[b.id]` —— 次解那几条 binding
 * 的 id 在进度表里根本不存在，会被算成「没见过」，
 * 于是「已掌握」永远偏低（实测：`L` 会，`]b` 不会）。
 *
 * 正确做法：先用 `COMMANDS` 把 binding id 映射到它所属命令的 id。
 * 次解和最优解指向同一条命令，所以它们共享同一条进度。
 */
export function progressByGroup(
  bindings: Binding[],
  progress: Record<string, { seen: number; independent: number; streak: number }>,
  groupNames: Record<string, string>,
  /** binding id → 命令 id。不传就按 binding id 原样查（旧行为） */
  commandIdOf?: Map<string, string>,
): ProgressView[] {
  const map = new Map<string, { mastered: number; shaky: number; fresh: number; total: number }>();
  /** 同一命令只统计一次 —— 否则次解会让 total 虚高 */
  const counted = new Set<string>();
  for (const b of bindings) {
    const cmdId = commandIdOf?.get(b.id) ?? b.id;
    if (counted.has(cmdId)) continue;
    counted.add(cmdId);

    if (!map.has(b.group)) map.set(b.group, { mastered: 0, shaky: 0, fresh: 0, total: 0 });
    const slot = map.get(b.group)!;
    slot.total++;
    const s = progress[cmdId];
    if (!s || s.seen === 0) slot.fresh++;
    else if (s.streak >= 3) slot.mastered++;
    else slot.shaky++;
  }
  return [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([group, v]) => ({
      group,
      name: groupNames[group] ?? group,
      ...v,
      done: v.total === 0 ? 0 : (v.mastered + v.shaky) / v.total,
    }));
}
