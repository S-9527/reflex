/**
 * 缓冲区(buffer)列表模型 —— 纯函数,无 DOM。
 *
 * ## 为什么单独建模
 *
 * 窗口模型(lib/split.ts)只管「窗口怎么排布」,而 buffer 关心的是
 * **哪几个文件开着、哪个是当前的、哪些被 pin 住**。
 * 两者会互相影响(`<Space>bD` 是 buffer 和窗口一起动),
 * 但作为训练目标是两件事,所以拆开。
 *
 * ## 为什么模型是「一条带子」而不是窗口树
 *
 * Vim 的 buffer 在界面上就是一条水平带子,操作也几乎全是
 * 「在这条带子上删/移/标」—— 删除左侧、删除右侧、只留当前、
 * 删掉看不见的。带子模型直接对应这个心智,不用绕。
 *
 * ## visible 的作用
 *
 * `<Space>bi`(Delete Invisible Buffers)需要知道哪些 buffer
 * 正显示在某个窗口里。所以模型里带一个 `visible: number[]`。
 * 它是「外部事实」,不由本模块计算 —— 调用方从窗口那边拿。
 */

/** 一个 buffer */
export type Buf = {
  id: number;
  name: string;
  /** `<Space>bp` 标记的:非 pinned 的会被 `<Space>bP` 一次清掉 */
  pinned: boolean;
  /** 至少显示在某个窗口里 */
  visible: boolean;
};

export type BufState = {
  bufs: Buf[];
  /** 当前 buffer 的 id */
  cur: number;
  nextId: number;
};

export function initial(names: string[] = ["init.lua"]): BufState {
  const bufs = names.map((name, i) => ({ id: i + 1, name, pinned: false, visible: i === 0 }));
  return { bufs, cur: bufs[0]?.id ?? 1, nextId: bufs.length + 1 };
}

export function count(state: BufState): number {
  return state.bufs.length;
}

/** 当前 buffer;没有则 null(全删光时会出现) */
export function current(state: BufState): Buf | null {
  return state.bufs.find((b) => b.id === state.cur) ?? null;
}

/**
 * 切换到下一个 buffer(`<Space>bb`)。
 *
 * 注意是**按带子顺序**轮换,不是按窗口位置 —— 和 `<C-w>W`
 * 同一个心智:「顺着一个列表走」,和几何无关。到末尾回到开头。
 */
export function switchNext(state: BufState): BufState | null {
  if (state.bufs.length < 2) return null;
  const i = state.bufs.findIndex((b) => b.id === state.cur);
  if (i < 0) return null;
  return { ...state, cur: state.bufs[(i + 1) % state.bufs.length].id };
}

/** 往回切(`[b` / `H`) */
export function switchPrev(state: BufState): BufState | null {
  if (state.bufs.length < 2) return null;
  const i = state.bufs.findIndex((b) => b.id === state.cur);
  if (i < 0) return null;
  return { ...state, cur: state.bufs[(i - 1 + state.bufs.length) % state.bufs.length].id };
}

/**
 * 私有函数:从列表里删掉若干 id,并把 cur 挪到一个还活着的 buffer 上。
 *
 * ⚠️ cur 的落点是有讲究的,实测踩过:Vim 删掉当前 buffer 后,
 * 光标落在**原来右边那个**;右边没有了才落左边。写成"总是取第一个"
 * 会让用户觉得窗口跳到了一个不相干的地方。
 */
function remove(state: BufState, ids: Set<number>, preferRight: boolean): BufState | null {
  const gone = state.bufs.filter((b) => ids.has(b.id));
  if (gone.length === 0) return null; // 一个都没删 → 无效
  const kept = state.bufs.filter((b) => !ids.has(b.id));

  let cur = state.cur;
  if (ids.has(cur)) {
    if (kept.length === 0) {
      // 全删光:Vim 会留一个空的 unnamed buffer,不是空白
      const fresh: Buf = { id: state.nextId, name: "[No Name]", pinned: false, visible: true };
      return { bufs: [fresh], cur: fresh.id, nextId: state.nextId + 1 };
    }
    // 优先往右找,否则往左
    const right = preferRight ? kept.findIndex((b) => b.id > cur) : -1;
    const left = preferRight ? kept.findLastIndex((b) => b.id < cur) : kept.findIndex((b) => b.id < cur);
    cur = right >= 0 ? kept[right].id : kept[left >= 0 ? left : 0].id;
  }
  return { ...state, bufs: kept, cur };
}

/** `<Space>bd`:删掉当前 buffer */
export function deleteCurrent(state: BufState): BufState | null {
  return remove(state, new Set([state.cur]), true);
}

/** `<Space>bD`:连 buffer 带窗口一起删 —— 窗口层面交给调用方,这里只删 buffer */
export function deleteBufferAndWindow(state: BufState): BufState | null {
  return remove(state, new Set([state.cur]), true);
}

/** `<Space>bi`:删掉所有没有显示在任何窗口里的 buffer */
export function deleteInvisible(state: BufState): BufState | null {
  const gone = state.bufs.filter((b) => !b.visible && !b.pinned).map((b) => b.id);
  return remove(state, new Set(gone), true);
}

/** `<Space>bo`:只留当前 buffer */
export function deleteOthers(state: BufState): BufState | null {
  const gone = state.bufs.filter((b) => b.id !== state.cur).map((b) => b.id);
  return remove(state, new Set(gone), true);
}

/** `<Space>bl`:删掉当前 buffer 左边的全部 */
export function deleteLeft(state: BufState): BufState | null {
  const i = state.bufs.findIndex((b) => b.id === state.cur);
  if (i <= 0) return null; // 已经在最左,没东西可删
  const gone = state.bufs.slice(0, i).map((b) => b.id);
  return remove(state, new Set(gone), true);
}

/** `<Space>br`:删掉当前 buffer 右边的全部 */
export function deleteRight(state: BufState): BufState | null {
  const i = state.bufs.findIndex((b) => b.id === state.cur);
  if (i < 0 || i >= state.bufs.length - 1) return null;
  const gone = state.bufs.slice(i + 1).map((b) => b.id);
  return remove(state, new Set(gone), true);
}

/** `<Space>bP`:删掉所有没被 pin 的 buffer */
export function deleteNonPinned(state: BufState): BufState | null {
  const gone = state.bufs.filter((b) => !b.pinned).map((b) => b.id);
  return remove(state, new Set(gone), true);
}

/**
 * `]B` / `[B`:把当前 buffer 在带子上的**位置**挪一格。
 *
 * ⚠️ 和切换是两回事:
 *   `L` / `H`  → 换「哪个是当前 buffer」(内容跟着焦点走)
 *   `]B` / `[B` → 挪「它在带子上的位置」(当前还是当前)
 * 实测 rhs:BufferLineMoveNext / BufferLineMovePrev。
 * 到边界不动(和 buffer 的轮换会绕回不同)。
 */
export function moveBufferNext(state: BufState): BufState | null {
  const i = state.bufs.findIndex((b) => b.id === state.cur);
  if (i < 0 || i >= state.bufs.length - 1) return null;
  const bufs = [...state.bufs];
  [bufs[i], bufs[i + 1]] = [bufs[i + 1], bufs[i]];
  return { ...state, bufs };
}

export function moveBufferPrev(state: BufState): BufState | null {
  const i = state.bufs.findIndex((b) => b.id === state.cur);
  if (i <= 0) return null;
  const bufs = [...state.bufs];
  [bufs[i], bufs[i - 1]] = [bufs[i - 1], bufs[i]];
  return { ...state, bufs };
}

/** `<Space>bp`:标记/取消标记当前 buffer */
export function togglePin(state: BufState): BufState | null {
  if (!state.bufs.some((b) => b.id === state.cur)) return null;
  return {
    ...state,
    bufs: state.bufs.map((b) => (b.id === state.cur ? { ...b, pinned: !b.pinned } : b)),
  };
}

/** 把某些 buffer 标记为「正在某窗口里显示」—— 由调用方在窗口变化后同步 */
export function markVisible(state: BufState, ids: number[]): BufState {
  const set = new Set(ids);
  return { ...state, bufs: state.bufs.map((b) => ({ ...b, visible: set.has(b.id) })) };
}

/** 往带子里加一个 buffer(`<Space>bn` 之类,或打开新文件) */
export function addBuffer(state: BufState, name: string): BufState {
  const b: Buf = { id: state.nextId, name, pinned: false, visible: true };
  return { bufs: [...state.bufs, b], cur: b.id, nextId: state.nextId + 1 };
}

/* ---------------------------------------------------------------- 题库 */

import type { Op } from "./split";

/** 一道题 */
export type BufTask = {
  key: string;
  desc: string;
  /** 起始 buffer 名(按顺序) */
  start: string[];
  /** 起始当前是第几个 */
  curIndex: number;
  /** 预先 pin 住哪些下标 */
  pinned?: number[];
};

/**
 * 起始题目。
 *
 * 每道题都刻意留了「有东西可删 / 有东西可切」的前提 ——
 * 比如 bl 的起始必须是当前不在最左,否则删左边等于没删,
 * 页面会毫无反应(这个坑在窗口那页已经踩过两次)。
 */
export const BUF_TASKS: BufTask[] = [
  // ⚠️ key 用的是 SOLUTIONS 的主键,不是「最常见的那个键」。
  // 因为「下一个 buffer」有四条解法(L / ]b / <Space>bb / <Space>b`)，
  // 题干要展示的是**这一组**，所以 key 统一用组名 L。
  { key: "L", desc: "切到下一个 buffer", start: ["a.lua", "b.lua", "c.lua"], curIndex: 0 },
  { key: "L", desc: "从末尾切回第一个(会绕回)", start: ["a.lua", "b.lua", "c.lua"], curIndex: 2 },

  // ⚠️ 裸 H / L 和 <C-H> / <C-L> 长得几乎一样,但一个是换 buffer、
  //   一个是跳窗口(<C-W>h / <C-W>l,实测)。这两题是刻意加的。
  { key: "H", desc: "切到上一个 buffer", start: ["a.lua", "b.lua", "c.lua"], curIndex: 2 },

  { key: "bd", desc: "关掉当前 buffer", start: ["a.lua", "b.lua", "c.lua"], curIndex: 1 },
  { key: "bD", desc: "关掉 buffer 及其窗口", start: ["a.lua", "b.lua", "c.lua"], curIndex: 1 },
  { key: "bi", desc: "清掉看不见的 buffer", start: ["a.lua", "b.lua", "c.lua", "d.lua"], curIndex: 0 },
  { key: "bo", desc: "只留当前 buffer", start: ["a.lua", "b.lua", "c.lua"], curIndex: 1 },
  { key: "bl", desc: "删掉左边的全部", start: ["a.lua", "b.lua", "c.lua"], curIndex: 2 },
  { key: "br", desc: "删掉右边的全部", start: ["a.lua", "b.lua", "c.lua"], curIndex: 0 },
  { key: "bP", desc: "删掉所有未固定的", start: ["a.lua", "b.lua", "c.lua"], curIndex: 0, pinned: [0] },
  { key: "bp", desc: "标记/取消标记当前", start: ["a.lua", "b.lua", "c.lua"], curIndex: 1 },
  { key: "]B", desc: "把当前 buffer 往后挪一位", start: ["a.lua", "b.lua", "c.lua"], curIndex: 0 },
];

/** 把 BufTask 的 start 还原成 BufState */
export function stateFrom(t: BufTask): BufState {
  const bufs = t.start.map((name, i) => ({
    id: i + 1,
    name,
    pinned: t.pinned?.includes(i) ?? false,
    // 只有当前那个算可见,其余交给 bi 那道题去删
    visible: i === t.curIndex,
  }));
  return { bufs, cur: bufs[t.curIndex].id, nextId: bufs.length + 1 };
}

/** 题目键 → 操作 */
export function applyBufKey(key: string, s: BufState): BufState | null {
  switch (key) {
    case "bb": return switchNext(s);
    case "L": return switchNext(s);
    case "`": return switchPrev(s);
    case "H": return switchPrev(s);
    case "bd": return deleteCurrent(s);
    case "bD": return deleteBufferAndWindow(s);
    case "bi": return deleteInvisible(s);
    case "bo": return deleteOthers(s);
    case "bl": return deleteLeft(s);
    case "br": return deleteRight(s);
    case "bP": return deleteNonPinned(s);
    case "bp": return togglePin(s);
    case "]B": return moveBufferNext(s);
    case "[B": return moveBufferPrev(s);
    default: return null;
  }
}

/**
 * 所有解法 —— 同一件事在本机有多个键时全列出来。
 *
 * 数据来自按 **rhs 聚合** `nvim_get_keymap("n")`:rhs 相同的映射
 * 底层执行的是同一条命令,就是真同义键。所以这份表不是猜的,
 * 是「同一行rhs 下出现过的所有 lhs」。
 *
 * 例:BufferLineCycleNext 这一行下面有 `L` 和 `]b`,
 * 而 `<Space>bb` / `<Space>b\`` 走的是 `:e #`(换个写法但同一件事)。
 *
 * ## native 字段
 *
 * Vim 原生的 Ex 命令。**逐条在真 nvim 里 feedkeys 验过**(`:bn` 切下一个、
 * `:bp` 切上一个、`:bd` 删当前、`:bd %` 全删、`:bfirst` / `:blast` 首尾、
 * `:buffers` 列出)。原生命令没绑到任何键上,得手打 `:`,
 * 所以它是**参考**不是解法 —— 训练器不收它,否则会逼你手打冒号。
 */
export const SOLUTIONS: Record<string, { seqs: string[][]; native?: string; note?: string }> = {
  // ---- 切换 ----
  L: {
    seqs: [["L"], ["]", "b"], ["<Space>", "b", "b"], ["<Space>", "b", "`"]],
    native: ":bn  /  :bnext",
    note: "四条都是「下一个 buffer」。裸 L 最省事(单键)",
  },
  H: {
    seqs: [["H"], ["[", "b"], ["<Space>", "b", "`"]],
    native: ":bp  /  :bprevious",
    note: "「上一个 buffer」。⚠ 裸 H 和 <C-H> 不是一回事 —— 那个跳窗口",
  },
  "]B": { seqs: [["]", "B"]], native: "(无对应 Ex 命令)", note: "挪**位置**,不是切换;当前还是当前。到边界不动" },
  "[B": { seqs: [["[", "B"]], native: "(无对应 Ex 命令)", note: "挪**位置**,不是切换" },

  // ---- 删除 ----
  bd: { seqs: [["<Space>", "b", "d"]], native: ":bd  /  :bdelete" },
  bD: { seqs: [["<Space>", "b", "D"]], native: ":bd +closewindow", note: "连所在窗口一起关" },
  bl: { seqs: [["<Space>", "b", "l"]], native: ":%bd {左边界}", note: "删当前 buffer 左边的全部" },
  br: { seqs: [["<Space>", "b", "r"]], native: ":%bd {右边界}", note: "删当前 buffer 右边的全部" },
  bo: { seqs: [["<Space>", "b", "o"]], native: ":bd 只是当前的" , note: "只留当前,其余全删" },
  bi: { seqs: [["<Space>", "b", "i"]], native: ":%bd {不可见的}", note: "清掉没显示在任何窗口里的" },
  bP: { seqs: [["<Space>", "b", "P"]], native: ":bd! {未固定的}", note: "删掉没被 pin 的" },

  // ---- 標記 / 选择器 ----
  bp: { seqs: [["<Space>", "b", "p"]], native: "(无 Ex 等价)", note: "标记/取消标记,固定后 bP 不删它" },
  bj: {
    seqs: [["<Space>", "b", "j"], ["<Space>", "f", "b"], ["<Space>", ","]],
    native: ":buffers  /  :ls",
    note: "三个键都弹buffer 选择器",
  },
  sb: { seqs: [["<Space>", "s", "b"]], native: "(无 Ex 等价)", note: "打开 buffer line UI(自己那套)" },
};

/** 把一个 Vim 记法序列归一化成可比对的字符串,如 ["L"] → "L" */
export function normSeq(seq: string[]): string {
  return seq.join("|");
}

/** 这个操作的全部解法(归一化后的集合),用于判分 */
export function solutionsOf(opKey: string): Set<string> {
  const s = SOLUTIONS[opKey];
  if (!s) return new Set();
  return new Set(s.seqs.map(normSeq));
}