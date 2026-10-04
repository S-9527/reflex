/**
 * 标签页(tab)模型 —— 纯函数,无 DOM。
 *
 * ## 为什么和 buffer 分开
 *
 * buffer 关心「哪些文件开着」,tab 关心「有几组窗口」。
 * `<Tab>d` 关掉的是**一整个标签页**(连带里面所有窗口),
 * `<Space>bd` 关的只是**一个 buffer**。这两个操作后果完全不同,
 * 混在一个模型里会把「关窗口」和「关标签页」搞混。
 *
 * ## 模型
 *
 * 一个 tab 就是「一组窗口」。这里不模拟窗口的具体排布(那是 lib/split 的事),
 * 只记**窗口数量** —— 因为 tab 的所有操作对布局的影响都只体现在
 * 「这个 tab 剩几个窗口」和「现在是哪个 tab」上。
 */

/** 一个标签页 */
export type Tab = {
  id: number;
  /** 这个标签页里的窗口数 */
  wins: number;
};

export type TabState = {
  tabs: Tab[];
  /** 当前是第几个 tab(下标) */
  cur: number;
  nextId: number;
};

export function initial(): TabState {
  return { tabs: [{ id: 1, wins: 1 }], cur: 0, nextId: 2 };
}

export function count(state: TabState): number {
  return state.tabs.length;
}

export function current(state: TabState): Tab | null {
  return state.tabs[state.cur] ?? null;
}

/**
 * `<Tab><Tab>`:新开一个标签页。
 *
 * 新 tab 从当前 tab 复制 —— 这是 Vim 的真实行为
 * (`:tab split` 会带上当前窗口),所以窗口数一样。
 */
export function newTab(state: TabState): TabState {
  const t: Tab = { id: state.nextId, wins: current(state)?.wins ?? 1 };
  const tabs = [...state.tabs];
  tabs.splice(state.cur + 1, 0, t);
  return { tabs, cur: state.cur + 1, nextId: state.nextId + 1 };
}

/** 私有:删掉若干 tab(按下标),并把 cur 落到还活着的上面 */
function remove(state: TabState, idxs: Set<number>, preferRight: boolean): TabState | null {
  if (idxs.size === 0) return null;
  const kept = state.tabs.filter((_, i) => !idxs.has(i));
  // 最后一个 tab 不能关,Vim 直接拒绝
  if (kept.length === 0) return null;

  // ⚠️ 当前 tab 若没被删,它的**下标依然会变** —— 前面少了好几个 tab,
  // 它就往前挪。所以不能沿用旧的 cur,得按 id 在 kept 里重新定位。
  // 实测踩到:`<Tab>o` 从 4 个 tab(cur=1)关到只剩 1 个,
  // 沿用 cur=1 会指向不存在的槽位,界面直接空掉。
  const curId = state.tabs[state.cur].id;

  let cur = kept.findIndex((t) => t.id === curId);
  if (cur < 0) {
    // 当前 tab 确实被删了:优先往右找,否则往左
    if (preferRight) {
      let right = -1;
      for (let i = 0; i < kept.length; i++) if (i > state.cur) { right = i; break; }
      cur = right >= 0 ? right : kept.length - 1;
    } else {
      let left = 0;
      for (let i = kept.length - 1; i >= 0; i--) if (i < state.cur) { left = i; break; }
      cur = left;
    }
  }
  return { ...state, tabs: kept, cur };
}

/** `<Tab>d`:关掉当前标签页 */
export function closeTab(state: TabState): TabState | null {
  return remove(state, new Set([state.cur]), true);
}

/** `<Tab>o`:只留当前标签页 */
export function closeOtherTabs(state: TabState): TabState | null {
  const gone = state.tabs.map((_, i) => i).filter((i) => i !== state.cur);
  return remove(state, new Set(gone), true);
}

/**
 * `<Tab>]` / `<Tab>[`:下一个 / 上一个标签页。
 *
 * 到末尾**不环绕** —— Vim 的 `:tabnext` 到最后一个就停,
 * 不跳回第一个。这和 buffer 的轮换不同,是个容易记错的点。
 */
export function nextTab(state: TabState): TabState | null {
  if (state.cur >= state.tabs.length - 1) return null;
  return { ...state, cur: state.cur + 1 };
}

export function prevTab(state: TabState): TabState | null {
  if (state.cur <= 0) return null;
  return { ...state, cur: state.cur - 1 };
}

/** `<Tab>f`:跳到第一个 */
export function firstTab(state: TabState): TabState | null {
  if (state.cur === 0) return null;
  return { ...state, cur: 0 };
}

/** `<Tab>l`:跳到最后一个 */
export function lastTab(state: TabState): TabState | null {
  if (state.cur === state.tabs.length - 1) return null;
  return { ...state, cur: state.tabs.length - 1 };
}

/** 跳到指定下标(Vim 的 `:{n}` 或 <Tab>{n}) */
export function goTo(state: TabState, n: number): TabState | null {
  if (n < 0 || n >= state.tabs.length) return null;
  if (n === state.cur) return null;
  return { ...state, cur: n };
}

/* ---------------------------------------------------------------- 题库 */

/** 一道题 */
export type TabTask = {
  key: string;
  desc: string;
  /** 起始有几个标签页 */
  tabs: number;
  /** 起始是第几个 */
  curIndex: number;
};

export const TAB_TASKS: TabTask[] = [
  { key: "<Tab><Tab>", desc: "新开一个标签页", tabs: 2, curIndex: 0 },
  { key: "<Tab>d", desc: "关掉当前标签页", tabs: 3, curIndex: 1 },
  { key: "<Tab>o", desc: "只留当前标签页", tabs: 4, curIndex: 1 },
  { key: "<Tab>]", desc: "跳到下一个标签页", tabs: 3, curIndex: 0 },
  { key: "<Tab>[", desc: "跳到上一个标签页", tabs: 3, curIndex: 2 },
  { key: "<Tab>f", desc: "跳到第一个标签页", tabs: 3, curIndex: 2 },
  { key: "<Tab>l", desc: "跳到最后一个标签页", tabs: 3, curIndex: 0 },
];

export function stateFrom(t: TabTask): TabState {
  const tabs = Array.from({ length: t.tabs }, (_, i) => ({ id: i + 1, wins: 1 }));
  return { tabs, cur: t.curIndex, nextId: tabs.length + 1 };
}

/** 题目键 → 操作。键用面板上的记法(带 <Tab>) */
export function applyTabKey(key: string, s: TabState): TabState | null {
  switch (key) {
    case "<Tab><Tab>": return newTab(s);
    case "<Tab>d": return closeTab(s);
    case "<Tab>o": return closeOtherTabs(s);
    case "<Tab>]": return nextTab(s);
    case "<Tab>[": return prevTab(s);
    case "<Tab>f": return firstTab(s);
    case "<Tab>l": return lastTab(s);
    default: return null;
  }
}

/** 这个键要在浏览器里按几下的提示 */
export const TAB_ARITY: Record<string, number> = {
  "<Tab><Tab>": 2,
  "<Tab>d": 2,
  "<Tab>o": 2,
  "<Tab>]": 2,
  "<Tab>[": 2,
  "<Tab>f": 2,
  "<Tab>l": 2,
};