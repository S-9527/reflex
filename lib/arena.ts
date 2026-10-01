/**
 * 窗口练习的核心逻辑 —— 纯函数,无 DOM,可单测。
 *
 * ## 为什么单独抽出来
 *
 * 因为上一轮的教训:布局渲染的 bug(横跨两列的窗口被画两遍)是在
 * 浏览器里肉眼发现的。几何和判分逻辑必须在单测里锁住,不能靠眼睛。
 *
 * ## 布局怎么表示
 *
 * 刻意**不用** row/col/rowspan/colspan —— 那是终端坐标,和"方向键往哪跳"
 * 隔着一层推导。练习只关心"谁在谁的左边/上边",所以直接用**邻接表**:
 *
 *     leftOf[i]  =  i 左边那个窗口的下标(-1 = 没有)
 *     rightOf[i] =  i 右边那个窗口的下标
 *     aboveOf[i] =  i 上方那个窗口的下标
 *     belowOf[i] =  i 下方那个窗口的下标
 *
 * 这样按 <C-H> 就是 `focus = leftOf[focus]`,一行,没有分支。
 */

/** 一个窗口。名字用来在页面上显示。 */
export type Win = {
  name: string;
  /** 渲染用:这个格子的内容 */
  label: string;
};

/** 一套布局:窗口列表 + 邻接表 */
export type Arena = {
  name: string;
  /** 这套布局练什么(给用户看) */
  note: string;
  wins: Win[];
  leftOf: number[];
  rightOf: number[];
  aboveOf: number[];
  belowOf: number[];
  /** 初始焦点窗口下标 */
  start: number;
};

const NONE = -1;

/** 排成 2 行 2 列的四宫格 */
function grid2x2(name: string, note: string): Arena {
  return {
    name,
    note,
    wins: [
      { name: "左上", label: "左上" },
      { name: "右上", label: "右上" },
      { name: "左下", label: "左下" },
      { name: "右下", label: "右下" },
    ],
    //   0     1
    //   2     3
    // 逐列看:0 在 2 上方,1 在 3 上方。0 和 1 在最顶,所以
    // belowOf[0]=2、belowOf[1]=3(往下一格),而 aboveOf[0]=aboveOf[1]=-1(没上面)。
    // ⚠️ 别把这两组写反:写反会出现 belowOf[0]=0 这种自环,
    //    move(0,'j') 就返回 0 —— 按 <C-J> "跳到自己",测试能抓到,肉眼不容易。
    leftOf:  [NONE, 0,   NONE, 2],
    rightOf: [1,    NONE, 3,   NONE],
    aboveOf: [NONE, NONE, 0,   1],
    belowOf: [2,    3,    NONE, NONE],
    start: 0,
  };
}

/** 左右两栏 */
function twoCol(name: string, note: string, start = 0): Arena {
  return {
    name,
    note,
    wins: [
      { name: "左", label: "左栏" },
      { name: "右", label: "右栏" },
    ],
    leftOf:  [NONE, 0],
    rightOf: [1,    NONE],
    aboveOf: [NONE, NONE],
    belowOf: [NONE, NONE],
    start,
  };
}

/** 上下两栏 */
function twoRow(name: string, note: string, start = 0): Arena {
  return {
    name,
    note,
    wins: [
      { name: "上", label: "上栏" },
      { name: "下", label: "下栏" },
    ],
    leftOf:  [NONE, NONE],
    rightOf: [NONE, NONE],
    aboveOf: [NONE, 0],
    belowOf: [1,    NONE],
    start,
  };
}

/** 左边窄、右边宽(不等宽)—— 练"分屏后焦点在谁那" */
function uneven(name: string, note: string): Arena {
  return {
    name,
    note,
    wins: [
      { name: "窄", label: "窄栏(左)" },
      { name: "宽", label: "宽栏(右)" },
    ],
    leftOf:  [NONE, 0],
    rightOf: [1,    NONE],
    aboveOf: [NONE, NONE],
    belowOf: [NONE, NONE],
    start: 0,
  };
}

export const ARENAS: Arena[] = [
  twoCol("左右两栏", "最基础。只有 <C-H> 和 <C-L> 有意义,<C-J>/<C-K> 什么也不做"),
  twoRow("上下两栏", "只有 <C-J> 和 <C-K> 有意义。左右方向键是空的"),
  grid2x2("四宫格", "四个窗口。<C-H> 到左边,<C-J> 到下面,不能横穿"),
  uneven("不等宽", "左窄右宽。真实终端里最常见的形态"),
  {
    name: "嵌套(竖切再横切)",
    note: "左半再上下分,右半一整块。<C-J> 只在左半内有意义 —— 到右半就断了",
    wins: [
      { name: "a", label: "左上" },
      { name: "b", label: "左下" },
      { name: "c", label: "右侧" },
    ],
    //   0     2
    //   1
    // 上下关系只有 0↔1 这一对:0 在上、1 在下。2 贯穿整列,上下都是空的。
    leftOf:  [NONE, NONE, 0],
    rightOf: [2,    NONE, NONE],
    aboveOf: [NONE, 0,    NONE],
    belowOf: [1,    NONE, NONE],
    start: 0,
  },
];

/** 按一个方向,返回新的焦点。边界上返回 null(表示"哪也没去")。 */
export function move(arena: Arena, focus: number, dir: "h" | "j" | "k" | "l"): number | null {
  const table =
    dir === "h" ? arena.leftOf : dir === "j" ? arena.belowOf : dir === "k" ? arena.aboveOf : arena.rightOf;
  const next = table[focus];
  return next === NONE ? null : next;
}

/** 这个方向键在此布局里有意义吗 —— 用于"这个键没反应"的提示 */
export function hasNeighbor(arena: Arena, focus: number, dir: "h" | "j" | "k" | "l"): boolean {
  return move(arena, focus, dir) !== null;
}

/** 从 from 到 to 的最少步数(BFS)—— 用来判"你这题绕远了" */
export function shortestSteps(arena: Arena, from: number, to: number): number {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  let steps = 0;
  while (frontier.length > 0) {
    steps++;
    const next: number[] = [];
    for (const cur of frontier) {
      for (const dir of ["h", "j", "k", "l"] as const) {
        const n = move(arena, cur, dir);
        if (n !== null && !seen.has(n)) {
          if (n === to) return steps;
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return -1; // 不连通
}

/** 一道题 */
export type Task = {
  from: number;
  to: number;
  /** 提示:往哪个方向 */
  hint: string;
};

/** 出题:随机挑一个不同于当前焦点的目标 */
export function makeTask(arena: Arena, focus: number, rand: () => number = Math.random): Task {
  const others = arena.wins.map((_, i) => i).filter((i) => i !== focus);
  if (others.length === 0) return { from: focus, to: focus, hint: "" };
  const to = others[Math.floor(rand() * others.length)];
  const dr = arena.belowOf[to];
  const dl = arena.leftOf[to];
  let hint = "在这个布局里找「" + arena.wins[to].label + "」";
  if (dr !== NONE) hint += " —— 它在当前窗口下面";
  else if (dl !== NONE) hint += " —— 它在当前窗口左边";
  return { from: focus, to, hint };
}
