/**
 * 按键序列的前缀匹配器 —— 纯函数,无副作用,可单测。
 *
 * ## 为什么这样设计
 *
 * Vim 的键不是"一个键一个功能",而是**键序列**:`<Space>ff` 三个键、
 * `<C-w>s` 两个键、`gd` 两个键。所以状态机必须能表达
 * "按了一半,还在等下一个键"。
 *
 * 用一个前缀树来查:插入按逐键展开的路径,查询给出一条路径,
 * 返回所有以它为前缀的绑定。这是唯一能同时支持
 * "精确命中" 和 "还在等后续键" 的结构。
 */

/** 一个键位绑定。`keys` 必须是逐键展开的形式(见 splitLhs)。 */
export type Binding = {
  id: string;
  /** 逐键,如 ["<Space>","f","f"] */
  keys: string[];
  /** 给人看的串,如 "<Space>ff" */
  display: string;
  label: string;
  desc: string;
  mode: string;
  group: string;
  /** group 的中文名。UI 显示用 */
  groupLabel: string;
  level: number;
  status: "verified" | "mapped" | "unknown";
  /** 易混项 / 坑 */
  traps?: string;
};

/** 前缀树节点 */
type Node = {
  children: Map<string, Node>;
  /** 完整落在本节点的绑定 */
  terminal: Binding | null;
};

function newNode(): Node {
  return { children: new Map(), terminal: null };
}

export type MatchResult =
  | { kind: "idle" }
  /** 精确命中 */
  | { kind: "hit"; binding: Binding }
  /** 前缀有效,还在等后续键 */
  | { kind: "partial"; candidates: Binding[]; extendable: boolean }
  /** 前缀无效 —— 已按的键不对 */
  | { kind: "miss"; typed: string[]; hint: Binding[]; expected: Binding[] };

/**
 * 建索引。同一个 lhs 有多个绑定时,取 level 最小的(学习顺序靠前的优先)。
 */
export function buildIndex(bindings: Binding[]): Node {
  const root = newNode();
  for (const b of bindings) {
    let node = root;
    for (const k of b.keys) {
      let next = node.children.get(k);
      if (!next) {
        next = newNode();
        node.children.set(k, next);
      }
      node = next;
    }
    const cur = node.terminal;
    if (!cur || b.level < cur.level) node.terminal = b;
  }
  return root;
}

/**
 * 在索引里查一条已按的键序列。
 *
 * @param root     buildIndex 的结果
 * @param typed    已按下的键序列(逐键)
 * @param pool     出题池。用于 miss 时给出"正确答案"的候选提示
 */
export function match(root: Node, typed: string[], pool: Binding[] = []): MatchResult {
  if (typed.length === 0) return { kind: "idle" };

  let node = root;
  for (const k of typed) {
    const next = node.children.get(k);
    if (!next) {
      // 已按的这条路径走不通。给两个提示:
      //   hint     —— 同一位置,同一 mode 下有哪些真实候选(帮助定位)
      //   expected —— 池子里 label 接近的绑定(可能只是你按错了这一步)
      return {
        kind: "miss",
        typed,
        hint: candidatesAt(root, typed, pool),
        expected: nearest(typed, pool),
      };
    }
    node = next;
  }

  if (node.terminal) return { kind: "hit", binding: node.terminal };

  // 前缀有效但不是终点:收集该前缀下的所有绑定。
  // typed 非空走到这里,必然至少有 partial 候选或 hit,不会是 idle ——
  // 所以这里不返回 idle,调用方也无需处理。
  const all: Binding[] = [];
  walk(node, all);
  return { kind: "partial", candidates: all, extendable: all.length > 0 };
}

function walk(n: Node, out: Binding[]) {
  if (n.terminal) out.push(n.terminal);
  for (const c of n.children.values()) walk(c, out);
}

/** 走到 typed 最后一个键之后,还有哪些候选(按 level 排序,取前 8) */
function candidatesAt(root: Node, typed: string[], pool: Binding[]): Binding[] {
  const out: Binding[] = [];
  walk(root, out);
  const set = new Set(out.map((b) => b.id));
  return pool.filter((b) => set.has(b.id)).sort((a, b) => a.level - b.level).slice(0, 8);
}

/** 池子里最长公共前缀最接近 typed 的绑定 —— 猜"你想按的可能是这个" */
function nearest(typed: string[], pool: Binding[]): Binding[] {
  return pool
    .map((b) => {
      let common = 0;
      for (let i = 0; i < Math.min(typed.length, b.keys.length); i++) {
        if (typed[i] === b.keys[i]) common++;
        else break;
      }
      return { b, common };
    })
    .filter((x) => x.common > 0)
    .sort((a, b) => b.common - a.common || a.b.level - b.b.level)
    .slice(0, 3)
    .map((x) => x.b);
}
