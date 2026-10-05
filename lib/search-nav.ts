/**
 * 搜索跳转的状态模型 —— 纯函数，无 React、无 DOM，有单测。
 *
 * ## 这一族为什么值得可视化
 *
 * `n` / `N` 看着简单（「下一个 / 上一个」），但实测本机映射是：
 *
 * ```vim
 * n  → 'Nn'[v:searchforward].'zv'
 * N  → 'nN'[v:searchforward].'zv'
 * ```
 *
 * 这是**方向感知**的：`n` 和 `N` 会随搜索方向翻转 ——
 *
 * | 你怎么搜的 | `n` | `N` |
 * |-----------|-----|-----|
 * | `/foo`（正着） | 往后 | 往前 |
 * | `?foo`（倒着） | **往前** | **往后** |
 *
 * 也就是说用 `?` 搜完之后，`n` 是往回走。光看文字「下一个搜索结果」
 * 完全看不出这件事，**走一遍就明白了**。
 *
 * ## ⚠️ 第二件容易记错的事：到头不绕回
 *
 * Vim 默认 `wrapscan` 是开的，`n` 到末尾会**绕回开头**并提示
 * 「search hit BOTTOM, continuing at TOP」。但：
 *
 * - LazyVim 的映射带 `zv`（打开折叠），绕回时行为有细微差别
 * - 更常见的困惑是：**绕回了但用户不知道**，以为没动
 *
 * 所以模型里把「绕回」显式建模成一个事件，界面上明确提示 ——
 * 而不是让用户自己猜为什么光标跳回去了。
 *
 * ## 高亮
 *
 * 搜索会**高亮所有匹配**（`hlsearch`），`n`/`N` 只是移动光标。
 * 而 `<Esc>` 的 LazyVim 映射是 `:nohlsearch` —— 清掉高亮但**不清搜索寄存器**，
 * 所以清完再按 `n` 还能继续跳（高亮会重新出现）。这个也画出来。
 */

/** 一次搜索的方向 */
export type SearchDir = "forward" | "backward";

/** 匹配位置（0-based 行、列区间） */
export type Match = {
  /** 哪一行 */
  line: number;
  /** 起始列（0-based） */
  col: number;
  /** 结束列（不含） */
  endCol: number;
};

export type SearchState = {
  /** 代码行 */
  source: string[];
  /** 全部匹配，按「正序」排好（行、列升序） */
  matches: Match[];
  /** 当前在第几个匹配（`matches` 的下标） */
  index: number;
  /** 搜索方向 —— 决定 `n`/`N` 谁往后 */
  dir: SearchDir;
  /** 高亮是否可见（`hlsearch`） */
  hl: boolean;
  /** 上一次操作的反馈 */
  note: string;
};

/** 找出所有匹配位置 */
export function findMatches(source: string[], pattern: string): Match[] {
  if (!pattern) return [];
  const out: Match[] = [];
  const re = new RegExp(escapeRe(pattern), "g");
  source.forEach((text, line) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ line, col: m.index, endCol: m.index + pattern.length });
      // 空匹配会死循环，防御一下
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  });
  return out;
}

/** 正则转义 —— 用户搜的是字面量 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 初始状态：光标停在第一个匹配上，高亮打开 */
export function initial(source: string[], pattern: string, dir: SearchDir = "forward"): SearchState {
  const matches = findMatches(source, pattern);
  return { source, matches, index: 0, dir, hl: true, note: "" };
}

/**
 * 解析 `n` / `N` 的**实际方向**。
 *
 * ⚠️ 这是这一族的核心：`n` 不总是「往后」。
 *
 * 本机映射 `'Nn'[v:searchforward]` 的含义是：
 * 搜索方向为正向时取 `'Nn'[1]` = `n`（往后），
 * 反向时取 `'Nn'[0]` = `N`（往前）。
 *
 * @returns 真实的移动方向
 */
export function resolveDir(key: "n" | "N", dir: SearchDir): "next" | "prev" {
  if (dir === "forward") return key === "n" ? "next" : "prev";
  // 反向搜索时两者互换
  return key === "n" ? "prev" : "next";
}

/**
 * 按 `n` 或 `N`。
 *
 * ⚠️ 到头时**绕回**（Vim 默认 `wrapscan` 开着），并在 note 里明说 ——
 * 「悄悄绕回去」是最让人困惑的行为。
 */
export function press(state: SearchState, key: "n" | "N"): SearchState {
  if (state.matches.length === 0) {
    return { ...state, note: "没有匹配（先 / 或 ? 搜一下）" };
  }
  const move = resolveDir(key, state.dir);
  const n = state.matches.length;
  let i = state.index + (move === "next" ? 1 : -1);
  let wrapped = false;
  if (i >= n) {
    i = 0;
    wrapped = true;
  } else if (i < 0) {
    i = n - 1;
    wrapped = true;
  }

  const dirWord = move === "next" ? "下一个" : "上一个";
  const cross = state.dir === "backward" ? `（因为你是用 ? 倒着搜的，n 反而往前）` : "";
  const note = wrapped
    ? `search hit ${move === "next" ? "BOTTOM" : "TOP"}, continuing at ${move === "next" ? "TOP" : "BOTTOM"} —— 绕回了${move === "next" ? "开头" : "末尾"}`
    : `${dirWord}匹配：第 ${state.matches[i].line + 1} 行${cross}`;

  // 绕回时高亮重新出现（Vim 行为）
  return { ...state, index: i, hl: true, note };
}

/** 改变搜索方向（模拟 `/` 与 `?`） */
export function setDir(state: SearchState, dir: SearchDir): SearchState {
  return {
    ...state,
    dir,
    note: dir === "forward" ? "用 / 正向搜索" : "用 ? 反向搜索 —— 现在 n 和 N 的角色互换了",
  };
}

/**
 * `<Esc>` —— 清高亮但**不清搜索寄存器**。
 *
 * ⚠️ 这是 LazyVim 的实测映射：`:nohlsearch`。
 *    高亮消失，但按 `n` 还能跳（跳的时候高亮会重新出现）。
 *    很多人以为 Esc 把搜索也清了 —— 那是错的。
 */
export function clearHighlight(state: SearchState): SearchState {
  return {
    ...state,
    hl: false,
    note: "高亮清了，但搜索寄存器还在 —— 再按 n 还能继续跳（高亮会回来）",
  };
}

/** 当前位置 */
export function current(state: SearchState): Match | null {
  return state.matches[state.index] ?? null;
}

/** 统计 */
export function summary(state: SearchState): {
  total: number;
  pos: number | null;
  atFirst: boolean;
  atLast: boolean;
} {
  const n = state.matches.length;
  if (n === 0) return { total: 0, pos: null, atFirst: false, atLast: false };
  return {
    total: n,
    pos: state.index + 1,
    atFirst: state.index === 0,
    atLast: state.index === n - 1,
  };
}
