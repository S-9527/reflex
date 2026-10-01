/**
 * Vim 窗口布局的数据模型与几何计算。
 *
 * ## 为什么要单独建模
 *
 * 第 9 章最难的地方不是记键位,是**三个概念同时存在**:
 *   Buffer  = 打开的文件,全局一份,跨所有窗口和 tab 共享
 *   Window  = 屏幕上显示 buffer 的一个视口
 *   Tab     = 一整套窗口布局
 * 而且 bufferline 把 buffer 画成 tab 的样子,于是「看到的」和「以为的」对不上。
 *
 * 这个文件把布局表示成**纯数据**,渲染交给 React。
 * 好处:几何计算(谁在左边、谁在上面)可以单测,不用起浏览器。
 */

/** 一个窗口。位置用 1-based 行列,和 Vim 的 win_screenpos 一致。 */
export type Win = {
  winid: number;
  /** 这个窗口显示的 buffer id */
  buf: number;
  /** buffer 名(绝对路径太长时前端会截断) */
  name: string;
  /** 在 tab 内的 1-based 网格坐标 */
  row: number;
  col: number;
  /** 占用多少行 / 列(含分隔符) */
  rowspan: number;
  colspan: number;
  active: boolean;
};

/** 一个 tab = 一整套窗口布局 */
export type Tab = {
  tabnr: number;
  wins: Win[];
  active: boolean;
};

/** 一个 buffer。`winids` 记录它出现在哪几个窗口 —— 这就是「一个 buffer 可多窗口显示」 */
export type Buf = {
  id: number;
  name: string;
  listed: boolean;
  loaded: boolean;
  /** 出现在这些窗口里 */
  winids: number[];
  /** 是否被 pin 住 */
  pinned: boolean;
};

/** nvim 导出的完整布局 */
export type Layout = {
  /** 单键序列:当前 tab 内,窗口的排列顺序 */
  tabs: Tab[];
  buffers: Buf[];
  /** 焦点窗口 */
  curwin: number;
  /** 总宽高(列/行) */
  columns: number;
  lines: number;
};

/**
 * 网格:把窗口摆进 cells[row][col]。
 *
 * ## 关键:网格是"压缩"的,不是原始行列
 *
 * 第一版按真实行列建数组(80 列 × 24 行),结果是一个 1920 格的大数组。
 * 几何上没错,但拿来渲染就荒谬 —— React 要画 1920 个 div,页面直接卡死。
 *
 * 所以这里只保留**有意义的边界**:
 *   行边界 = 所有窗口的 row,加上每个窗口的 row+rowspan
 *   列边界 = 所有窗口的 col,加上每个窗口的 col+colspan
 *
 * 两行分屏(col 1,colspan 80)×2 → 列边界 {1, 81} → 压成 1 列。
 * 四宫格 → 行列各 2 个边界 → 2×2。真实比例由 span 保留。
 */
export function toGrid(tab: Tab): { grid: (Win | null)[][]; rowHeights: number[]; colWidths: number[] } {
  if (tab.wins.length === 0) return { grid: [], rowHeights: [], colWidths: [] };

  const rowEdges = new Set<number>();
  const colEdges = new Set<number>();
  for (const w of tab.wins) {
    rowEdges.add(w.row);
    rowEdges.add(w.row + w.rowspan);
    colEdges.add(w.col);
    colEdges.add(w.col + w.colspan);
  }
  const rows = [...rowEdges].sort((a, b) => a - b);
  const cols = [...colEdges].sort((a, b) => a - b);

  const grid: (Win | null)[][] = Array.from({ length: rows.length - 1 }, () =>
    Array(cols.length - 1).fill(null),
  );
  const rowHeights: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) rowHeights.push(rows[i + 1] - rows[i]);
  const colWidths: number[] = [];
  for (let i = 0; i < cols.length - 1; i++) colWidths.push(cols[i + 1] - cols[i]);

  for (const w of tab.wins) {
    // 找到覆盖这个窗口的单元格范围
    const r0 = rows.findIndex((r) => r >= w.row);
    const r1 = rows.findIndex((r) => r >= w.row + w.rowspan);
    const c0 = cols.findIndex((c) => c >= w.col);
    const c1 = cols.findIndex((c) => c >= w.col + w.colspan);
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        if (grid[r]) grid[r][c] = w;
      }
    }
  }
  return { grid, rowHeights, colWidths };
}

/** 这个 buffer 出现在几个窗口里 —— 「同文件可并排看两处」的量化指标 */
export function multiWindowBuffers(layout: Layout): Buf[] {
  return layout.buffers.filter((b) => b.winids.length > 1);
}

/**
 * 找出「看起来像 tab 但其实不是 tab」的 buffer。
 *
 * bufferline 把 buffer 画成 tab 的样子排在左边,真正的 tab 是右端的小数字。
 * 用户混淆的主因就在这。这个函数标出前者,供 UI 显式区分。
 */
export function bufferLike(layout: Layout): Buf[] {
  return layout.buffers.filter((b) => b.listed);
}

/** 校验:布局自洽吗。导出 Lua 写错了要能查出来,不能画出一张骗人的图。 */
export function validate(layout: Layout): string[] {
  const errs: string[] = [];
  if (layout.tabs.length === 0) errs.push("没有任何 tab");
  if (layout.tabs.filter((t) => t.active).length !== 1) {
    errs.push(`active 的 tab 数量应为 1,实际 ${layout.tabs.filter((t) => t.active).length}`);
  }
  for (const t of layout.tabs) {
    if (t.active && t.wins.length === 0) errs.push(`第 ${t.tabnr} 个 tab 是激活的但没有窗口`);
    if (t.wins.filter((w) => w.active).length > 1) {
      errs.push(`第 ${t.tabnr} 个 tab 有多个 active 窗口`);
    }
  }
  const winids = new Set(layout.tabs.flatMap((t) => t.wins.map((w) => w.winid)));
  for (const b of layout.buffers) {
    for (const id of b.winids) {
      if (!winids.has(id)) errs.push(`buffer ${b.name} 声称在窗口 ${id} 里,但布局里没这个窗口`);
    }
  }
  if (!winids.has(layout.curwin)) errs.push(`curwin=${layout.curwin} 不在布局里`);
  return errs;
}
