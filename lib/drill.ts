/**
 * 练习页的公共输入引擎 —— 纯逻辑部分(无 React、无 DOM),有单测。
 *
 * ## 为什么要抽这个
 *
 * 这一轮所有 bug 都出在「同一个概念抄了四遍」上:
 *
 * | bug | 根因 |
 * |-----|------|
 * | leader 三键按不到终点(290 条里 206 条失效) | `firstKeySet` 只含首键,续键被放行 |
 * | `<Space>w` 整个子树失灵 | `parseSeq` 返回 wait 时没回写 next |
 * | `/text` 按键完全没反应 | `settle` 定义了但从未被调用 |
 * | `<Tab>` 永远查不到 | 浏览器 key 是 `"Tab"` 没尖括号,直接拼成 `"<Tab>Tab"` |
 * | buffer 页「按了状态没变」被当成对 | 判对时比的是**长度**不是内容 |
 *
 * 五处各写一遍 = 五套判据 = 必然不同步。所以收敛到这里。
 *
 * ## 三态判据
 *
 * 一个键按下来只有三种可能,**必须穷举,不许有第四种**:
 *
 * - `hit`    凑齐了某一条完整解法 → 结算
 * - `prefix` 是某条解法的真前缀   → 收下,等下一个键
 * - `none`   都不是               → **放行**给浏览器,并清空缓冲
 *
 * `none` 走放行而不是 preventDefault,是为了不劫持 F5 / Ctrl+R / `/` 这些
 * 浏览器快捷键 —— 训练器没理由抢走它们。
 *
 * ## 接管时机:pending 时无条件接管
 *
 * 序列中间任何一个字符都可能是续键,不可能是浏览器快捷键,所以全收。
 * 少了这一条,`<Space>|` 的 `|` 会被放行,序列永远卡在 `<Space>`。
 * 详见 lib/leader.ts 顶部的注释。
 *
 * ## apply 返回 null = 「按了但状态没变」
 *
 * 这条不是可选的。没有它,起始状态已经满足条件的题(焦点已在最左、
 * 布局已经对半)会**静默无反应** —— 用户根本分不清是按错了还是坏了。
 * 静默吞输入是这类工具最难查的毛病。
 */

export type DrillTask = {
  /** 唯一 id。进度存储用它,所以不能重复 */
  id: string;
  /** 面板按钮上的短标签,如 `"bf"` `"<Tab>d"` `"diw"` */
  short: string;
  /**
   * 本题的全部等价解法,每条是**逐键**数组。
   *
   * ⚠️ 这里每一条**都算解过**。「下一个 buffer」在本机有四条等价键
   * (`L` / `]b` / `<Space>bb` / `<Space>b\``,按 rhs 聚合实测),
   * 用户按哪条都是对的 —— 只认第一条就是「训练器比真实环境挑剔」,
   * 是这类工具最要命的毛病。所以 `accept[0]` 只是**显示顺序**第一,
   * 不是唯一正解。
   *
   * 反过来,不属于本题的键**不要**放进 `accept`;要收但不算对
   * (比如 `/windows` 面板里的其它命令)用引擎的 `extraAccept`。
   */
  accept: string[][];
  /** 判对时的反馈文案 */
  desc: string;
};

export type Classify =
  | { kind: "hit"; seq: string[] }
  | { kind: "prefix"; next: string[] }
  | { kind: "none" };

/** 把逐键数组归一化成可比对的字符串:["L"] → "L",["<Space>","b"] → "<Space>|b" */
export function normSeq(seq: string[]): string {
  return seq.join("|");
}

/**
 * 当前题的「第一键」集合 —— idle 时只接管这些键。
 *
 * 只用**本题的**解法算,不用全集。理由:题目问的是 `diw`,那按 `b` 就该
 * 原样落到浏览器,而不是被训练器吞掉再报一次错。
 */
export function firstKeySet(accept: string[][]): Set<string> {
  const s = new Set<string>();
  for (const seq of accept) {
    if (seq.length > 0) s.add(seq[0]);
  }
  return s;
}

/**
 * 三态判据。整个引擎的核心。
 *
 * ⚠️ 比对的是**内容**不是长度。之前 buffer 页写的是
 * `seqs.some(x => x.length === typed.length)` —— 三键的题会收下任意一条
 * 三键解法,按错了也判对。
 */
export function classify(accept: string[][], buf: string[]): Classify {
  const joined = normSeq(buf);
  const hit = accept.find((a) => normSeq(a) === joined);
  if (hit) return { kind: "hit", seq: hit };

  const isPrefix = accept.some(
    (a) => a.length > buf.length && a.slice(0, buf.length).every((x, i) => x === buf[i]),
  );
  if (isPrefix) return { kind: "prefix", next: buf };

  return { kind: "none" };
}

/** 这次输入要不要接管(见文件头「接管时机」) */
export function shouldTake(buf: string[], firstKeys: Set<string>, vimKey: string): boolean {
  if (buf.length > 0) return true;
  return firstKeys.has(vimKey);
}

/**
 * 本板块的「非解法但要接管」的键 —— 交给 `onOther` 处理。
 *
 * `/windows` 需要它:面板里有 20 个键,但每道题只对其中一个。
 * 按了另一个键时应该**明确说「那是另一个命令」并演示它的效果**,
 * 而不是静默吞掉或放行给浏览器。
 *
 * `/buffers` 这类 accept 就是全部命令的板块不需要它,留空即可。
 */
export function mergeFirstKeys(...accepts: string[][][]): Set<string> {
  const s = new Set<string>();
  for (const accept of accepts) for (const k of firstKeySet(accept)) s.add(k);
  return s;
}