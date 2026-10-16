/**
 * 行级 diff —— 纯函数，有单测。
 *
 * ## ⚠️⚠️ 为什么需要它（我第一版写错了，而且是「看不出来」的那种错）
 *
 * `/core` 页面要画「按下去之后 buffer 变成什么」。我第一版是**按行号直接比**：
 *
 * ```ts
 * if (before[i] === after[i]) → same
 * else if (after[i] === undefined) → del
 * else if (before[i] === undefined) → add
 * else → same          // ← 这里
 * ```
 *
 * 最后那个 `else` 是**改过的行**（两边都有、但内容不同），却被标成了 `same`。
 * 后果：**`→` 箭头一个都不渲染** —— 界面看起来「这个键什么也没做」。
 *
 * 实测（headless chromium 抓 DOM）：`dd` 那一题的行 1 从
 * `local Total = compute(a, b) + 1, tail` 变成 `local name = "hello world"`，
 * 而渲染出来两个都是普通文本，没有箭头、没有颜色。
 *
 * ⚠️ 这个 bug **单元测试抓不到**（数据层是对的，是渲染分支错了），
 *    只有真跑起来看才看得见。所以现在有 `tests/diff.test.ts` 钉住
 *    「改过的行必须被识别出来」。
 *
 * ## 为什么用 LCS 而不是按行号比
 *
 * `dd` 删掉第 1 行之后，**后面 9 行全部上移**。按行号比会说
 * 「下面 9 行全变了」—— 那是噪音，用户看不出真正改了什么。
 *
 * LCS（最长公共子序列）能识别出「第 1 行没了、其余 9 行没动」，
 * 这才是用户想看的。
 */

export type DiffRow = {
  /** 行号（按 `after` 的编号；删除行沿用相邻位置） */
  ln: number;
  kind: "same" | "del" | "add";
  /** 这一行的内容 */
  text: string;
  /**
   * 这一行在 `after` 里的下标（`del` 行为 null）。
   *
   * ⚠️ 光标要画在 `after` 的那一行上，所以必须是 after 的下标，
   *    不能拿 before 的下标去索引。
   */
  afterIndex: number | null;
};

/**
 * 算行级 diff。
 *
 * @param before 按键之前的 buffer
 * @param after  按键之后的 buffer
 */
export function diffLines(before: string[], after: string[]): DiffRow[] {
  const n = before.length;
  const m = after.length;

  /**
   * LCS 长度表。`lcs[i][j]` = `before[i..]` 和 `after[j..]` 的最长公共子序列长度。
   *
   * 从后往前填，回溯时从前往后走 —— 这样输出的顺序是自然的文档顺序。
   */
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        before[i] === after[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  /** 当前显示到 after 的第几行（1-based）—— 删除行沿用这个值 */
  let displayLn = 1;

  while (i < n && j < m) {
    if (before[i] === after[j]) {
      rows.push({ ln: displayLn, kind: "same", text: before[i], afterIndex: j });
      i++;
      j++;
      displayLn++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // 删掉 before[i]
      rows.push({ ln: displayLn, kind: "del", text: before[i], afterIndex: null });
      i++;
    } else {
      // 插入 after[j]
      rows.push({ ln: displayLn, kind: "add", text: after[j], afterIndex: j });
      j++;
      displayLn++;
    }
  }
  while (i < n) {
    rows.push({ ln: displayLn, kind: "del", text: before[i], afterIndex: null });
    i++;
  }
  while (j < m) {
    rows.push({ ln: displayLn, kind: "add", text: after[j], afterIndex: j });
    j++;
    displayLn++;
  }

  return rows;
}

/** diff 里有没有真正的变化（用于「这个键没改动 buffer」的提示） */
export function hasChange(rows: DiffRow[]): boolean {
  return rows.some((r) => r.kind !== "same");
}
