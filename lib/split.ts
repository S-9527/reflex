/**
 * 分屏布局模型 —— 纯函数,无 DOM,无 React。
 *
 * ## 为什么是树,不是坐标网格
 *
 * Vim 的分屏是递归的:每个窗口可以再分成两半(竖切或横切),
 * 所以真实结构是二叉树。「左上+右上+左下+右下」用坐标写要 4 个数,
 * 用树写是 split( split(a,b), split(c,d) )。
 *
 * 关键差别在 **close**:树里关掉一个叶子,它父节点只剩一个孩子时,
 * **父节点消失**,那个孩子顶上来占满。坐标网格表达不了这条规则,
 * 而它恰恰是练「关窗口」时最容易错的地方。
 *
 * ## 为什么节点带 ratio
 *
 * 早期版本每个分割点都是中点,于是只能表达「对半切」。
 * 但 hydra 里有一整组调整大小的键(+ - < > = _ |),拉宽之后
 * 就不再对半了。ratio 让比例成为模型的一部分,而不是 UI 的假象。
 *
 * 所以判定分两种:
 *   topology() —— 忽略比例,只看树的形状。用于搭建题。
 *   shape()     —— 含比例(取整到 3 位)。用于调整大小的题。
 */

/** 一个窗口 */
export type Win = { id: number };

/**
 * 分屏树节点。
 *   leaf  = 窗口
 *   split = 分割点,dir="v" 竖切(左右)、dir="h" 横切(上下)
 *           ratio 是 a 那一侧占的比例(0~1)
 */
export type Node =
  | { t: "leaf"; id: number }
  | { t: "split"; dir: "v" | "h"; ratio: number; a: Node; b: Node };

export type Layout = { root: Node; nextId: number };

/** ratio 的上下限。留 10% 给另一边,免得某个窗口被压成一条缝 */
const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;

/** 调整大小的一步,和 Vim 的 `resize ±N` 对齐(2 行 / 2 列) */
export const RESIZE_STEP = 0.1;

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

/** 这棵子树里有没有这个窗口 id */
export function contains(n: Node, id: number): boolean {
  if (n.t === "leaf") return n.id === id;
  return contains(n.a, id) || contains(n.b, id);
}

/* ---------------------------------------------------------------- 切分 */

/** 把 id 处的叶子换成「两半」,新窗口放在 b 侧(Vim 里新窗口是当前的) */
function replaceLeaf(
  n: Node,
  id: number,
  dir: "v" | "h",
  ratio: number,
  newId: number,
): Node | null {
  if (n.t === "leaf") {
    if (n.id !== id) return null;
    return { t: "split", dir, ratio, a: { t: "leaf", id }, b: { t: "leaf", id: newId } };
  }
  const na = replaceLeaf(n.a, id, dir, ratio, newId);
  if (na) return { ...n, a: na };
  const nb = replaceLeaf(n.b, id, dir, ratio, newId);
  if (nb) return { ...n, b: nb };
  return null;
}

/**
 * 在焦点窗口分屏,焦点移到**新窗口**(和 Vim 一致,实测确认)。
 *
 * ⚠️ 比例永远从 0.5 起 —— 真实 Vim 的 `:vsplit` 也是对半,
 * 想不均等得之后手动 resize。所以「三列并排」必须切两次,
 * 不能一次想切出不等宽的三列。
 */
export function split(l: Layout, focus: number, dir: "v" | "h", max = 12): Layout | null {
  if (countWindows(l.root) >= max) return null;
  if (!contains(l.root, focus)) return null;
  const root = replaceLeaf(l.root, focus, dir, 0.5, l.nextId);
  if (!root) return null;
  return { root, nextId: l.nextId + 1 };
}

/* ---------------------------------------------------------------- 关闭 */

function removeLeaf(n: Node, id: number): Node | null {
  if (n.t === "leaf") return n.id === id ? null : n;
  // ⚠️ 必须先判断 id 在不在这棵子树里。
  // 原来直接 `a ?? b`,当 id 不存在时两侧都返回原树,`a ?? b` 就等于
  // 把整棵树原样返回 —— close(不存在的 id) 不报错、悄悄"成功"了。
  if (!contains(n, id)) return n;
  const a = removeLeaf(n.a, id);
  const b = removeLeaf(n.b, id);
  if (a && b) return { ...n, a, b };
  // 一侧没了 → 塌缩,另一侧顶上来
  return a ?? b ?? null;
}

/**
 * 关掉一个窗口。
 *
 * ⚠️ 关键规则:关掉之后,父节点如果只剩一个孩子,**父节点本身消失**
 * (那个孩子顶上来的位置)。竖切出两个窗口再关掉一个,剩下的窗口
 * 会占满整屏,而不是留一半。
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

/**
 * 只留这一个窗口,其他全关(`<C-w>o`)。
 *
 * 和挨个 close 的区别:挨个关会一路塌缩,最终剩下的是「最先被切出来
 * 那个」的祖先位置;而 `<C-w>o` 明确保��当前窗口。
 * 两者常常落在同一棵树,但不保证 —— 所以单独建模。
 */
export function closeOthers(l: Layout, keep: number): Layout | null {
  if (!contains(l.root, keep)) return null;
  return { root: { t: "leaf", id: keep }, nextId: l.nextId };
}

/* ---------------------------------------------------------------- 导航 */

/**
 * 当前焦点的邻居,按方向。没有则 null(不环绕、不猜)。
 * 取**最近**的,不是最远的。
 */
export function moveFocus(l: Layout, focus: number, dir: "h" | "j" | "k" | "l"): number | null {
  const pos = positions(l.root);
  const me = pos.get(focus);
  if (!me) return null;
  const cands = [...pos.entries()]
    .filter(([id, p]) => {
      if (id === focus) return false;
      switch (dir) {
        case "h": return p.c1 <= me.c0; // 完全在左边
        case "l": return p.c0 >= me.c1;
        case "k": return p.r1 <= me.r0;
        case "j": return p.r0 >= me.r1;
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

/* ---------------------------------------------------------------- 位置 */

/**
 * 每个窗口的归一化位置(0~1 区间)。判断"形状对不对"的依据 ——
 * 绝对像素不重要,比例才重要。
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
    const mid = c0 + (c1 - c0) * n.ratio;
    walk(n.a, r0, c0, r1, mid, out);
    walk(n.b, r0, mid, r1, c1, out);
  } else {
    const mid = r0 + (r1 - r0) * n.ratio;
    walk(n.a, r0, c0, mid, c1, out);
    walk(n.b, mid, c0, r1, c1, out);
  }
}

/* ---------------------------------------------------------------- 指纹 */

/**
 * 拓扑指纹 —— **忽略比例**,只看树的形状。
 *
 * 搭建题用这个:用户中途拉宽过某个窗口,只要骨架对就算过。
 * 反过来,调整大小的题才用 shape()。
 */
export function topology(l: Layout): string {
  const norm = (n: Node): string => {
    if (n.t === "leaf") return "L";
    return `(${norm(n.a)}${n.dir}${norm(n.b)})`;
  };
  return norm(l.root);
}

/**
 * 形状指纹 —— 含比例(取整到 2 位,避免浮点尾数让判定抖动)。
 *
 * 用 `shape(l) === target` 这种精确比较,所以取整粒度得比
 * 任何一道题的判定容差更粗,否则会出现"数字对但判定不过"。
 */
export function shape(l: Layout): string {
  const pos = positions(l.root);
  const rows = [...pos.entries()]
    .map(([id, p]) => ({
      id,
      k: [p.r0, p.c0, p.r1, p.c1].map((x) => Math.round(x * 100) / 100).join(","),
    }))
    .sort((a, b) => a.k.localeCompare(b.k));
  return `${rows.length}|${rows.map((r) => r.k).join(";")}`;
}

/* -------------------------------------------------- 移动 / 交换 / 大小 */

/** 找到包含 id 的那个直接父分割点(连同它在父节点里的位置) */
function parentOf(
  n: Node,
  id: number,
): { node: Node; side: "a" | "b"; parent: Node | null } | null {
  if (n.t === "leaf") return null;
  if (contains(n.a, id)) return { node: n, side: "a", parent: null };
  if (contains(n.b, id)) return { node: n, side: "b", parent: null };
  const ra = parentOf(n.a, id);
  if (ra) return { node: ra.node, side: ra.side, parent: n };
  const rb = parentOf(n.b, id);
  if (rb) return { node: rb.node, side: rb.side, parent: n };
  return null;
}



/**
 * 调整大小。
 *
 * 规则对齐 Vim 的 `resize ±N`:**改的是包含焦点窗口的那个分割点**,
 * 当前窗口变大就把相邻那侧挤小。只动一层,不递归往上 ——
 * 这也是 Vim 的行为(连按 `<C-Up>` 会逐层往上顶)。
 *
 * axis "v" 改宽度,"h" 改高度;delta 为正表示焦点窗口变大。
 * 轴对不上(比如焦点窗口是横切出来的,却按了 `>`)则不动 —— Vim 也是如此。
 */
export function resize(l: Layout, focus: number, axis: "v" | "h", delta: number): Layout | null {
  const p = parentOf(l.root, focus);
  if (!p) return null; // 只有 1 个窗口,没有可调的分割点
  const node = p.node;
  if (node.t !== "split" || node.dir !== axis) return null;
  // ratio 是"a 侧"的比例。焦点在 a 侧时它变大 → ratio 增;在 b 侧则减。
  const signed = p.side === "a" ? delta : -delta;
  const ratio = clamp(node.ratio + signed);
  if (ratio === node.ratio) return null; // 已经顶到头了
  return {
    root: replaceRatio(l.root, node, ratio),
    nextId: l.nextId,
  };
}

/**
 * 按对象引用替换某个分割点的 ratio。
 *
 * 靠**引用相等**定位,而不是靠 id —— ratio 挂在分割点上,
 * 分割点没有自己的 id,所以只能拿 `parentOf` 返回的那个对象当锚。
 */
function replaceRatio(n: Node, target: Node, ratio: number): Node {
  // target 一定是 split(调用方只从 parentOf 拿),先收窄类型
  if (n === target && n.t === "split") return { ...n, ratio };
  if (n.t === "leaf") return n;
  // 目标在这个子树里吗?不在就别动,免得复制整棵树
  if (!subtreeHas(n.a, target)) return { ...n, b: replaceRatio(n.b, target, ratio) };
  return { ...n, a: replaceRatio(n.a, target, ratio) };
}

/** 目标对象是否在这棵子树里(用结构比较,因为没有反向指针) */
function subtreeHas(n: Node, target: Node): boolean {
  if (n === target) return true;
  if (n.t === "leaf") return false;
  return subtreeHas(n.a, target) || subtreeHas(n.b, target);
}

function clamp(x: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, x));
}

/**
 * 把焦点窗口拉到最大:它所在的分割点给它 100%,另一边 MIN_RATIO。
 * 这就是 `<C-w>_`(高度拉满) / `<C-w>|`(宽度拉满)。
 */
export function maxOut(l: Layout, focus: number, axis: "v" | "h"): Layout | null {
  const p = parentOf(l.root, focus);
  if (!p) return null;
  const node = p.node;
  if (node.t !== "split" || node.dir !== axis) return null;
  const ratio = p.side === "a" ? MAX_RATIO : MIN_RATIO;
  return { root: replaceRatio(l.root, node, ratio), nextId: l.nextId };
}

/** `<C-w>=` 把焦点所在的那层恢复成对半 */
export function equalize(l: Layout, focus: number): Layout | null {
  const p = parentOf(l.root, focus);
  if (!p) return null;
  const node = p.node;
  if (node.t !== "split") return null;
  if (node.ratio === 0.5) return null;
  return { root: replaceRatio(l.root, node, 0.5), nextId: l.nextId };
}

/**
 * 把焦点窗口移到最边(`<C-w>H/J/K/L`)。
 *
 * 实现:先把它摘出来,剩下的塌缩成一棵,再用一个新的根分割点
 * 把它放到目标那一侧。这是**简化** —— 真实 Vim 会尽量保留
 * 兄弟窗口的相对位置,这里会重新分配空间。对训练来说够用,
 * 但不是像素级还原,所以注释里写明。
 */
export function moveToEdge(l: Layout, focus: number, dir: "h" | "j" | "k" | "l"): Layout | null {
  if (countWindows(l.root) <= 1) return null;
  if (!contains(l.root, focus)) return null;
  const rest = removeLeaf(l.root, focus);
  if (!rest) return null;
  const leaf: Node = { t: "leaf", id: focus };
  // "移到最左/最上" → 新窗口放 a 侧;"最右/最下" → 放 b 侧
  const isLeftOrTop = dir === "h" || dir === "k";
  const axis: "v" | "h" = dir === "h" || dir === "l" ? "v" : "h";
  const root: Node = isLeftOrTop
    ? { t: "split", dir: axis, ratio: 0.5, a: leaf, b: rest }
    : { t: "split", dir: axis, ratio: 0.5, a: rest, b: leaf };
  return { root, nextId: l.nextId };
}

/**
 * 和「下一个」窗口交换位置(`<C-w>x`)。
 *
 * 树的结构(谁包含谁)完全不变,只换两个叶子坐在哪 ——
 * 这正是 `x` 的语义:布局骨架不动,两个窗口换位置。
 */
export function swapNext(l: Layout, focus: number): Layout | null {
  const ids = leaves(l.root);
  const i = ids.indexOf(focus);
  if (i < 0 || ids.length < 2) return null;
  const j = (i + 1) % ids.length;
  return { root: swapLeaves(l.root, ids[i], ids[j]), nextId: l.nextId };
}

/**
 * 轮换焦点 —— `<C-w>W`。
 *
 * 按 `leaves` 的顺序(先 a 后 b,深度优先)走到下一个窗口,
 * 到末尾回到第一个。所以它不是"几何上的邻居",而是**顺序上的下一个**,
 * 和 `moveFocus` 的方向语义完全不同 —— 这正是这个键容易按错的原因。
 */
export function cycleFocus(l: Layout, focus: number): number | null {
  const ids = leaves(l.root);
  if (ids.length < 2) return null;
  const i = ids.indexOf(focus);
  if (i < 0) return null;
  return ids[(i + 1) % ids.length];
}

/**
 * 跳到第 n 个窗口 —— `<C-w>0` / `<C-w>1`。
 *
 * n 超出范围返回 null。注意 `<C-w>0` 的下标和直觉相反:
 * Vim 里 `0` 指 Alternate File(上一个文件),不是"第一个"。
 * 这里按**位置**建模,0 就是最左上的那个 —— 因为我们不模拟 buffer 历史。
 */
export function focusIndex(l: Layout, n: number): number | null {
  const ids = leaves(l.root);
  if (n < 0 || n >= ids.length) return null;
  return ids[n];
}

/**
 * 缩放 —— `<C-w>m`:只留当前窗口,再按一次恢复。
 *
 * ⚠️ 单靠 Layout 表达不了"再按一次恢复",因为要记住之前的样子。
 * 所以这里只给**进入**缩放的操作(等价于 closeOthers),
 * 退出由调用方保存/恢复 prev —— 组件里用一个 ref 存。
 */
export function zoomIn(l: Layout, focus: number): Layout | null {
  return closeOthers(l, focus);
}

/**
 * 交换任意两个窗口 —— `<C-w>Hx` / `<C-w>Jx` 这种两步操作的最后一步。
 *
 * 和 swapNext 的区别:swapNext 只能和"下一个"换,这个可以指定任意一个。
 * 两者都只换 id、保留骨架,所以窗口内容换了位置而布局形状不变。
 */
export function swapTwo(l: Layout, x: number, y: number): Layout | null {
  if (!contains(l.root, x) || !contains(l.root, y) || x === y) return null;
  return { root: swapLeaves(l.root, x, y), nextId: l.nextId };
}

/** 交换两个叶子的 id,其余结构原样保留 */
function swapLeaves(n: Node, x: number, y: number): Node {
  if (n.t === "leaf") {
    if (n.id === x) return { t: "leaf", id: y };
    if (n.id === y) return { t: "leaf", id: x };
    return n;
  }
  return { ...n, a: swapLeaves(n.a, x, y), b: swapLeaves(n.b, x, y) };
}

/* ---------------------------------------------------------------- 剧本 */

/** 一个操作。字段互斥,和 lib/arena.ts 的 Op 风格一致 */
export type Op = {
  dir?: "v" | "h";
  close?: true;
  go?: "h" | "j" | "k" | "l";
  move?: "h" | "j" | "k" | "l";
  swap?: true;
  others?: true;
  resize?: "v+" | "v-" | "h+" | "h-" | "maxv" | "maxh" | "eq";
  /** 把焦点窗口和 dir 方向的兄弟窗口交换位置(Vim 的 `<C-w>Jx` 那种两步) */
  swapWith?: "h" | "j" | "k" | "l";
};

/** 执行一串操作 —— 测试用,也是「解法示范」的底座 */
export function run(ops: Op[], start = initial()): { layout: Layout; focus: number } {
  let l = start;
  let focus = leaves(l.root)[0];

  for (const op of ops) {
    const settle = (nl: Layout | null, f: number) => {
      if (!nl) return;
      l = nl;
      const alive = leaves(l.root);
      focus = alive.includes(f) ? f : (alive[0] ?? f);
    };

    if (op.close) {
      settle(close(l, focus), focus);
      continue;
    }
    if (op.others) {
      settle(closeOthers(l, focus), focus);
      continue;
    }
    if (op.go) {
      const n = moveFocus(l, focus, op.go);
      if (n !== null) focus = n;
      continue;
    }
    if (op.move) {
      settle(moveToEdge(l, focus, op.move), focus);
      continue;
    }
    if (op.swap) {
      // 交换后焦点跟到原位置(窗口本身还在那儿,只是内容换了)
      settle(swapNext(l, focus), focus);
      continue;
    }
    if (op.swapWith) {
      const target = moveFocus(l, focus, op.swapWith);
      if (target !== null) {
        settle(swapTwo(l, focus, target), focus);
      }
      continue;
    }
    if (op.resize) {
      const spec = op.resize;
      let nl: Layout | null = null;
      if (spec === "v+") nl = resize(l, focus, "v", RESIZE_STEP);
      else if (spec === "v-") nl = resize(l, focus, "v", -RESIZE_STEP);
      else if (spec === "h+") nl = resize(l, focus, "h", RESIZE_STEP);
      else if (spec === "h-") nl = resize(l, focus, "h", -RESIZE_STEP);
      else if (spec === "maxv") nl = maxOut(l, focus, "v");
      else if (spec === "maxh") nl = maxOut(l, focus, "h");
      else if (spec === "eq") nl = equalize(l, focus);
      settle(nl, focus);
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
/* ------------------------------------------------------- 按「列/行」缩放 */

/**
 * 按**固定列数/行数**缩放 —— 和本机 `<C-Left/Right/Up/Down>` 的实测行为一致。
 *
 * ## ⚠️ 为什么不能用上面那个 `resize()`
 *
 * `resize()` 按 **ratio 步进 0.1**，转成实际列数取决于屏幕宽度
 * （80 列屏上一步 = 8 列）。但本机 LazyVim 把这两个键的 rhs
 * 写成了**硬编码**的固定步长：
 *
 * ```
 * <C-Right>  rhs=<Cmd>vertical resize +2<CR>
 * <C-Down>   rhs=<Cmd>resize -2<CR>
 * ```
 *
 * 实测（探针 `scripts/probe-resize.lua`）：
 *
 * | 按键 | 宽度变化 |
 * |------|---------|
 * | `<C-Right>` | 39 → 37（**挪 2**）|
 * | `10<C-Right>` | 37 → 35（**也是 2**）|
 * | `30<C-Right>` | 35 → 33（**还是 2**）|
 *
 * ⚠️ 所以**书里那条「加计数来多挪」在本机不成立** ——
 *    rhs 的步长写死了，计数被忽略。这条实测结论很重要，
 *    因为它和 Vim 内建的 `<C-w>>`（吃计数）行为**不一样**。
 *
 * @param cols 这一侧的总列数（或行数）—— 用来把列换算成 ratio
 * @param step 每次挪多少列（本机是 2）
 */
export function resizeByCells(
  l: Layout,
  focus: number,
  axis: "v" | "h",
  dir: 1 | -1,
  cols: number,
  step = 2,
): Layout | null {
  if (cols <= 0) return null;
  // 把「挪 N 列」换算成 ratio 增量
  const delta = (step / cols) * dir;
  return resize(l, focus, axis, delta);
}

/** 这一侧能不能往这个方向缩（有对应的分割点，且没顶到头） */
export function canResize(l: Layout, focus: number, axis: "v" | "h"): boolean {
  const p = parentOf(l.root, focus);
  if (!p) return false;
  const node = p.node;
  return node.t === "split" && node.dir === axis;
}
