import type { Binding } from "./matcher";

/**
 * 数据集统计 —— 四张可视化图共用同一份计算。
 *
 * ## 为什么单独一个文件
 *
 * 之前统计逻辑散在各处(手写 python 脚本、分关卡时临时算),
 * 每处都可能算出不一样的数。集中到这里,四张图的口径就一致了 ——
 * 你看"键位分布图"里某关有多少条,和"练了多久"面板里的分母要对得上。
 */

/** 模式的可读名 */
export const MODE_LABEL: Record<string, string> = {
  n: "Normal",
  v: "Visual",
  x: "Visual-选区",
  o: "Operator",
  c: "命令行",
};

/**
 * 一关的统计。
 *
 * `byMode` 是重点:同一个键在不同模式下动作不同
 * (`gc` 在 Normal 是注释操作符,在 Visual 是切换注释)。
 * 只按 display 去重会掩盖这个差异,所以按 display+mode 计数。
 */
export type LevelStat = {
  level: number;
  name: string;
  groupKey: string;
  groupLabel: string;
  total: number;
  /** mode → 条数 */
  byMode: Record<string, number>;
  /** 这个关卡里出现过的唯一 display 数(去掉模式重复) */
  uniqueKeys: number;
  /** 唯一 leader 前缀,如 "<Space>f" */
  prefixes: string[];
  /** 平均按键长度 —— 序列越长越难记 */
  avgKeys: number;
  longest: number;
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

export function levelStats(bindings: Binding[], levelNames: Record<number, string>): LevelStat[] {
  const map = new Map<number, Binding[]>();
  for (const b of bindings) {
    if (!map.has(b.level)) map.set(b.level, []);
    map.get(b.level)!.push(b);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => {
      const byMode: Record<string, number> = {};
      for (const b of list) byMode[b.mode] = (byMode[b.mode] || 0) + 1;
      const prefixes = [...new Set(list.map((b) => prefixOf(b.display)).filter(Boolean))].sort();
      const lens = list.map((b) => b.keys.length);
      return {
        level,
        name: levelNames[level] ?? `第 ${level} 关`,
        groupKey: list[0].group,
        groupLabel: list[0].groupLabel,
        total: list.length,
        byMode,
        uniqueKeys: new Set(list.map((b) => b.display)).size,
        prefixes,
        avgKeys: Math.round((lens.reduce((a, b) => a + b, 0) / lens.length) * 10) / 10,
        longest: Math.max(...lens),
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
  children: { key: string; display: string; count: number; levels: number[] }[];
}[] {
  const map = new Map<string, Map<string, { display: string; levels: Set<number> }>>();
  for (const b of bindings) {
    const p = prefixOf(b.display);
    if (!p) continue;
    if (!map.has(p)) map.set(p, new Map());
    const inner = map.get(p)!;
    if (!inner.has(b.display)) inner.set(b.display, { display: b.display, levels: new Set() });
    inner.get(b.display)!.levels.add(b.level);
  }
  return [...map.entries()]
    .map(([prefix, inner]) => ({
      prefix,
      count: [...inner.values()].length,
      children: [...inner.values()]
        .map((v) => ({ key: v.display, display: v.display, count: 1, levels: [...v.levels] }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => b.count - a.count);
}

/** 训练进度:每关练了多少 */
export type ProgressView = {
  level: number;
  total: number;
  mastered: number;
  shaky: number;
  fresh: number;
  /** 完成度 0~1 */
  done: number;
};

export function progressByLevel(
  bindings: Binding[],
  progress: Record<string, { seen: number; correct: number; streak: number; lastAt: number }>,
): ProgressView[] {
  const map = new Map<number, { mastered: number; shaky: number; fresh: number; total: number }>();
  for (const b of bindings) {
    if (!map.has(b.level)) map.set(b.level, { mastered: 0, shaky: 0, fresh: 0, total: 0 });
    const slot = map.get(b.level)!;
    slot.total++;
    const s = progress[b.id];
    if (!s || s.seen === 0) slot.fresh++;
    else if (s.streak >= 3) slot.mastered++;
    else slot.shaky++;
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, v]) => ({
      level,
      ...v,
      done: v.total === 0 ? 0 : (v.mastered + v.shaky) / v.total,
    }));
}
