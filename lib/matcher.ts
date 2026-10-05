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
  status: "verified" | "mapped" | "unknown";
  /**
   * 右值。`<Cmd>BufferLineCycleNext<CR>` 这种。
   *
   * ⚠️ 这是判定「两条映射是不是同一条命令」的**唯一严格依据**。
   *   空字符串表示 Lua 回调(rhs=nil),看不出等价于谁 —— 见 `lua`。
   *
   * 旧数据集抽了 rhs 却在写 JSON 时丢掉,导致等价解只能按 `desc` 猜,
   * 于是出现「<Space>bb 被当成 L 的等价解」这种错。
   */
  rhs: string;
  /** rhs 为空 = Lua 回调。这类键有动作但看不出是什么,不能假装知道它等价于谁 */
  lua: boolean;
  /** 是否落在 which-key 的分组树里(而非我们按形态兜底归的类) */
  inWhichKey: boolean;
  /** which-key 的原始分组名。`true` = 插件自动推断的,不是显式声明 */
  wkGroup: string | true | null;
  /** 英文原文。中文翻译后仍保留,便于对照上游 */
  descEn?: string;
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
  /** 精确命中。extendable 表示该前缀还有子节点(可能只是另一个序列的开头) */
  | { kind: "hit"; binding: Binding; extendable: boolean }
  /** 前缀有效,还在等后续键 */
  | { kind: "partial"; candidates: Binding[]; extendable: boolean }
  /** 前缀无效 —— 已按的键不对 */
  | { kind: "miss"; typed: string[]; hint: Binding[]; expected: Binding[] };

/**
 * 建索引。同一个 lhs 有多个绑定时,取**代价最小**的。
 *
 * ⚠️ 原来按 `level`(手编关卡)取最小的,而关卡概念已删。
 * 现在按「键数少 → 不用修饰键 → 不用 leader」取 ——
 * 这和 build-dataset.mjs 选最优解用的是同一套判据,
 * 保证匹配器命中的和页面展示的是同一个键。
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
    if (!cur || keyCost(b) < keyCost(cur)) node.terminal = b;
  }
  return root;
}

/** 一个绑定的「按键代价」——越小越优先。和 build-dataset.mjs 的 cost() 同源 */
function keyCost(b: Binding): number {
  const keys = b.keys.length;
  const mods = b.keys.filter((k) => /^<(C|M|S)-/.test(k)).length;
  const leader = b.keys[0] === "<Space>" ? 1 : 0;
  return keys * 100 + mods * 10 + leader;
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

  // 命中了,但这个前缀**还可能是别的序列的开头** —— 比如 g 既是终点,
  // 又有 gd / gr 之类的子节点。
  //
  // ⚠️ extendable 必须一并返回:调用方要用它决定"序列是否结束"。
  // 少了它,按到 g 就立刻判死,而用户本来要按的是 gd。
  if (node.terminal) {
    return { kind: "hit", binding: node.terminal, extendable: node.children.size > 0 };
  }

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

/** 走到 typed 最后一个键之后,还有哪些候选(按键代价排序,取前 8) */
function candidatesAt(root: Node, typed: string[], pool: Binding[]): Binding[] {
  const out: Binding[] = [];
  walk(root, out);
  const set = new Set(out.map((b) => b.id));
  return pool.filter((b) => set.has(b.id)).sort((a, b) => keyCost(a) - keyCost(b)).slice(0, 8);
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
    .sort((a, b) => b.common - a.common || keyCost(a.b) - keyCost(b.b))
    .slice(0, 3)
    .map((x) => x.b);
}
