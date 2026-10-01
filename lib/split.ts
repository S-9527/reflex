/**
 * 分屏搭建 —— 模拟 Vim 的分屏行为,纯函数,无 DOM。
 *
 * ## 为什么用树而不是坐标
 *
 * Vim 的分屏是递归的:每个窗口可以再分成两半(竖切或横切),
 * 所以真实结构是一棵二叉树,不是行列坐标网格。
 * 「左上+右上+左下+右下」用坐标写要 4 个数,用树写是
 * vsplit( vsplit(a, b), c) —— 而且 close 的行为差别很大:
 * 树里关掉一个叶子,它父节点只有一个孩子时会**塌缩**;
 * 坐标网格做不到这个,这是练「关窗口」时最关键的一条规则。
 *
 * ## 为什么这个能替代 dojo 那套判分
 *
 * dojo 判不了按键,因为它要猜「你按的到底是哪个键」。
 * 这里完全不需要猜:页面自己维护窗口状态,按键就是状态转移函数。
 * 判据是「最终状态对不对」,不是「你按了什么」—— 零歧义。
 */

/** 一个窗口 */
export type Win = { id: number };

/** 分屏树节点。leaf 是窗口,split 是分割点 */
export type Node =
  | { t: "leaf"; id: number }
  /** dir="v" 竖切(左右);dir="h" 横切(上下) */
  | { t: "split"; dir: "v" | "h"; a: Node; b: Node };

export type Layout = { root: Node; nextId: number };

export function initial(): Layout {
  return { root: { t: "leaf", id: 1 }, nextId: 2 };
}

/** 深度优先列出所有窗口 id,按「先 a 后 b」顺序 */
export function leaves(n: Node, out: number[] = []): number[] {
  if (n.t === "leaf") out.push(n.id);
  else {
    leaves(n.a, out);
    leaves(n.b, out);
  }
  return out;
}

export function countWindows(root: Node): number {
  return leaves(root).length;
}

/** 把 id 处的叶子换成「两半」,新窗口放在 b 侧(Vim 里新窗口是当前的) */
function replaceLeaf(n: Node, id: number, dir: "v" | "h", newId: number): Node | null {
  if (n.t === "leaf") {
    if (n.id !== id) return null;
    return { t: "split", dir, a: { t: "leaf", id }, b: { t: "leaf", id: newId } };
  }
  const na = replaceLeaf(n.a, id, dir, newId);
  if (na) return { ...n, a: na };
  const nb = replaceLeaf(n.b, id, dir, newId);
  if (nb) return { ...n, b: nb };
  return null;
}

/**
 * 在焦点窗口分屏,焦点移到**新窗口**(和 Vim 一致)。
 *
 * @returns 新的 Layout;窗口数已达上限时返回 null
 */
export function split(l: Layout, focus: number, dir: "v" | "h", max = 12): Layout | null {
  if (countWindows(l.root) >= max) return null;
  const root = replaceLeaf(l.root, focus, dir, l.nextId);
  if (!root) return null;
  return { root, nextId: l.nextId + 1 };
}

/**
 * 关掉一个窗口。
 *
 * ⚠️ 关键规则:关掉之后,父节点如果只剩一个孩子,**父节点本身消失**
 * (那个孩子顶上来的位置)。这是练「关窗口」时最容易错的地方 ——
 * 竖切出两个窗口再关掉一个,剩下的窗口会占满整屏,而不是留一半。
 *
 * 最后一个窗口不能关(Vim 会拒绝)。
 */
export function close(l: Layout, id: number): Layout | null {
  if (countWindows(l.root) <= 1) return null;
  if (!contains(l.root, id)) return null;
  const root = removeLeaf(l.root, id);
  if (!root) return null;
  return { root, nextId: l.nextId };
}

function removeLeaf(n: Node, id: number): Node | null {
  if (n.t === "leaf") return n.id === id ? null : n;
  // ⚠️ 必须先判断 id 在不在这棵子树里。
  // 原来直接 `a ?? b`,当 id 不存在时两侧都返回原树,`a ?? b` 就等于
  // 把整棵树原样返回 —— close(不存在的 id) 不报错、悄悄"成功"了。
  // 实测踩到:测试期望 null,拿到的是原布局。
  if (!contains(n, id)) return n;
  const a = removeLeaf(n.a, id);
  const b = removeLeaf(n.b, id);
  if (a && b) return { ...n, a, b };
  // 一侧没了 → 塌缩,另一侧顶上来
  return a ?? b ?? null;
}

/** 这棵子树里有没有这个窗口 id */
export function contains(n: Node, id: number): boolean {
  if (n.t === "leaf") return n.id === id;
  return contains(n.a, id) || contains(n.b, id);
}

/** 当前焦点的邻居,按方向。没有则 null(不环绕、不猜) */
export function moveFocus(l: Layout, focus: number, dir: "h" | "j" | "k" | "l"): number | null {
  const pos = positions(l.root);
  const me = pos.get(focus);
  if (!me) return null;
  const box = (x: { r0: number; r1: number; c0: number; c1: number }) => x;
  const cands = [...pos.entries()]
    .filter(([id, p]) => {
      if (id === focus) return false;
      switch (dir) {
        case "h": return box(p).c1 <= me.c0; // 完全在左边
        case "l": return box(p).c0 >= me.c1;
        case "k": return box(p).r1 <= me.r0;
        case "j": return box(p).r0 >= me.r1;
      }
    })
    .map(([id, p]) => ({ id, gap: gapBetween(me, p, dir) }))
    .sort((a, b) => a.gap - b.gap);
  return cands.length > 0 ? cands[0].id : null;
}

function gapBetween(
  a: { r0: number; r1: number; c0: number; c1: number },
  b: { r0: number; r1: number; c0: number; c1: number },
  dir: string,
): number {
  if (dir === "h") return a.c0 - b.c1;
  if (dir === "l") return b.c0 - a.c1;
  if (dir === "k") return a.r0 - b.r1;
  return b.r0 - a.r1;
}

/**
 * 每个窗口的归一化位置(0~1 区间,便于比较形状)。
 * 这就是判断「形状对不对」的依据 —— 绝对像素不重要,比例才重要。
 */
export function positions(root: Node): Map<number, { r0: number; r1: number; c0: number; c1: number }> {
  const out = new Map<number, { r0: number; r1: number; c0: number; c1: number }>();
  walk(root, 0, 0, 1, 1, out);
  return out;
}

function walk(
  n: Node,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
  out: Map<number, { r0: number; r1: number; c0: number; c1: number }>,
): void {
  if (n.t === "leaf") {
    out.set(n.id, { r0, c0, r1, c1 });
    return;
  }
  if (n.dir === "v") {
    const mid = (c0 + c1) / 2;
    walk(n.a, r0, c0, r1, mid, out);
    walk(n.b, r0, mid, r1, c1, out);
  } else {
    const mid = (r0 + r1) / 2;
    walk(n.a, r0, c0, mid, c1, out);
    walk(n.b, mid, c0, r1, c1, out);
  }
}

/**
 * 形状指纹 —— 用来判「摆对了没」。
 *
 * 不用窗口 id(每次出题 id 都不同),只取:
 *   - 窗口数量
 *   - 每个窗口归一化位置排序后的序列
 * 这样 0.5/0.5 左右分 和 0.3/0.7 左右分 是**不同的**形状 ——
 * 对分屏训练来说这个区分重要,因为 <Space>| 是对半切。
 */
export function shape(l: Layout): string {
  const pos = positions(l.root);
  const rows = [...pos.entries()]
    .map(([id, p]) => ({
      id,
      k: [p.r0, p.c0, p.r1, p.c1].map((x) => Math.round(x * 1000) / 1000).join(","),
    }))
    .sort((a, b) => a.k.localeCompare(b.k));
  return `${rows.length}|${rows.map((r) => r.k).join(";")}`;
}

/** 从一串操作重建布局 —— 测试用,也是「解法示范」的底座 */
export type Op = { dir?: "v" | "h"; close?: true; go?: "h" | "j" | "k" | "l" };

export function run(ops: Op[], start = initial()): { layout: Layout; focus: number } {
  let l = start;
  let focus = leaves(l.root)[0];
  for (const op of ops) {
    if (op.close) {
      const nl = close(l, focus);
      if (nl) {
        l = nl;
        const ls = leaves(l.root);
        focus = ls.includes(focus) ? focus : (ls[0] ?? focus);
      }
      continue;
    }
    if (op.go) {
      const n = moveFocus(l, focus, op.go);
      if (n !== null) focus = n;
      continue;
    }
    if (op.dir) {
      const nl = split(l, focus, op.dir);
      if (nl) {
        l = nl;
        focus = l.nextId - 1; // 新窗口成为焦点
      }
    }
  }
  return { layout: l, focus };
}
