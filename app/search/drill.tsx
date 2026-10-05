"use client";

/**
 * 搜索跳转练习。
 *
 * ## 为什么这一族需要专门一页
 *
 * `n` / `N` 看着是「下一个 / 上一个」，闭着眼都能按。但实测本机映射：
 *
 * ```vim
 * n → 'Nn'[v:searchforward].'zv'
 * N → 'nN'[v:searchforward].'zv'
 * ```
 *
 * 这是**方向感知**的 —— `n` 和 `N` 会随搜索方向翻转：
 *
 * | 怎么搜的 | `n` | `N` |
 * |---------|-----|-----|
 * | `/foo` | 往后 | 往前 |
 * | `?foo` | **往前** | **往后** |
 *
 * 用 `?` 搜完再按 `n` 是往回走 —— 光看 desc「Next Search Result」
 * 完全看不出来。所以题目里专门有几道是**反向搜索**起的。
 *
 * ## 第二件容易记错的：`<Esc>` 只清高亮
 *
 * LazyVim 把 `<Esc>` 映射成 `:nohlsearch` —— 高亮消失，
 * 但**搜索寄存器还在**，再按 `n` 还能跳（高亮会回来）。
 * 很多人以为 Esc 把搜索也清了。
 */

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatMs } from "@/lib/session";
import {
  clearHighlight,
  initial,
  press,
  setDir,
  summary,
  type SearchDir,
  type SearchState,
} from "@/lib/search-nav";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, useDrill } from "@/lib/use-drill";
import {
  DrillFlow,
  FlashLine,
  KeyLog,
  KeySequence,
  Provenance,
  SearchNavView,
  TaskBar,
  TaskBox,
  streakOf,
} from "@/lib/drill-ui";

/** 练的源码 —— 挑了一段有 4 个 total 的 lua，匹配分布在不同行 */
const SOURCE = [
  "local total = 0",
  "for i = 1, 10 do",
  "  total = total + i",
  "end",
  "print(total)",
];

const PATTERN = "total";

/** 每题：要按的键 + 起始状态 + 说明 */
type Q = {
  key: string;
  /** 起始搜索方向 */
  dir: SearchDir;
  /** 起始在第几个匹配 */
  startAt: number;
  desc: string;
};

/**
 * 题库。
 *
 * ⚠️ 反向搜索的题是**故意加的** —— 那是这一族最容易记错的地方，
 *    而普通练习只会从正向开始，永远练不到。
 */
const QUESTIONS: Q[] = [
  { key: "n", dir: "forward", startAt: 0, desc: "正向搜索后，跳到下一个匹配" },
  { key: "n", dir: "forward", startAt: 1, desc: "继续往后跳一个" },
  { key: "N", dir: "forward", startAt: 2, desc: "正向搜索后，往回跳一个" },
  { key: "N", dir: "backward", startAt: 1, desc: "⚠️ 反向搜索后，N 是往后跳" },
  { key: "n", dir: "backward", startAt: 2, desc: "⚠️ 反向搜索后，n 反而往前跳" },
  { key: "n", dir: "forward", startAt: 3, desc: "在最后一个匹配上按 n —— 会绕回开头（wrapscan）" },
  { key: "N", dir: "forward", startAt: 0, desc: "在第一个匹配上按 N —— 会绕回末尾" },
  { key: "<Esc>", dir: "forward", startAt: 1, desc: "清掉搜索高亮（但搜索寄存器还在）" },
];

const TASKS: DrillTask[] = QUESTIONS.map((q, i) => ({
  id: `search:${q.key}@${i}`,
  short: q.key,
  desc: q.desc,
  accept: [q.key === "<Esc>" ? ["<Esc>"] : [q.key]],
}));

const Q_OF = new Map<string, Q>(TASKS.map((t, i) => [t.id, QUESTIONS[i]]));

export default function SearchDrill() {
  const router = useRouter();

  const init = useCallback((t: DrillTask): SearchState => {
    const q = Q_OF.get(t.id)!;
    const s = initial(SOURCE, PATTERN, q.dir);
    return { ...s, index: q.startAt };
  }, []);

  const apply = useCallback((_seq: string[], st: SearchState, t: DrillTask): SearchState => {
    const q = Q_OF.get(t.id)!;
    // ⚠️ `<Esc>` 只清高亮，不动光标 —— 它也是个「有效果」的操作
    if (q.key === "<Esc>") return clearHighlight(st);
    const next = press(st, q.key as "n" | "N");
    // 绕回也算有效果（光标确实动了）
    return next;
  }, []);

  const d = useDrill<SearchState>({
    boardId: "search",
    tasks: TASKS,
    init,
    apply,
    toPanelKey: defaultToPanelKey,
    noEffectText: (seq) => `${seq.join("")} 按了但光标没动`,
  });

  const sum = useMemo(() => summary(d.state), [d.state]);

  return (
    <DrillFlow
      cursor={d.taskIndex}
      total={d.session.queue.length}
      accuracy={d.summary.accuracy}
      keysPerMin={d.summary.keysPerMin}
      streak={streakOf(d.session.results)}
      done={d.done}
      summary={d.summary}
      formatMs={formatMs}
      descOf={(id) => TASKS.find((t) => t.id === id)?.desc ?? id}
      onRetry={() => d.restart()}
      onRetryMistakes={() => d.restart(d.session.results.filter((r) => !r.ok).map((r) => r.taskId))}
      onExit={() => router.push("/")}
      mode={d.mode}
      onMode={d.setMode}
      hint={d.hint}
      canHint={d.canHint}
      onHint={d.showHint}
    >
      <TaskBar
        tasks={TASKS}
        current={TASKS.findIndex((t) => t.id === d.task.id)}
        solvedAll={d.solvedAll}
        onClear={d.clearProgress}
        onPick={d.setTaskIndex}
        onReset={d.reset}
      />

      <TaskBox>
        <div className="text-neutral-300">{d.task.desc}</div>
        <div className="mt-1 text-[11px] text-neutral-600">
          搜索方向：<b className="text-neutral-400">{Q_OF.get(d.task.id)!.dir === "forward" ? "/ 正向" : "? 反向"}</b>
          {Q_OF.get(d.task.id)!.dir === "backward" && (
            <span className="text-amber-500/90"> —— 此时 n 和 N 的角色互换了</span>
          )}
        </div>
        <div className="mt-3">
          <KeySequence keys={d.shownKeys} feed={d.keyFeed} />
        </div>
      </TaskBox>

      <SearchNavView
        source={SOURCE}
        matches={d.state.matches}
        index={d.state.index}
        hl={d.state.hl}
        note={d.flash?.ok === true ? d.flash.text : d.state.note}
      />

      <div className="flex flex-wrap gap-x-4 text-[11px] text-neutral-600">
        <span>
          第 <b className="text-neutral-300">{sum.pos ?? "-"}</b> / {sum.total} 个匹配
        </span>
        {sum.atFirst && <span className="text-neutral-700">已在第一个</span>}
        {sum.atLast && <span className="text-neutral-700">已在最后一个</span>}
      </div>

      <KeyLog log={d.log} hint="按 n 或 N —— 光标会立刻跳" />
      <FlashLine flash={d.flash} />

      <Provenance>
        映射实测自 <code>nvim_get_keymap(&quot;n&quot;)</code>：
        <code>n</code> 的真实 rhs 是 <code>&apos;Nn&apos;[v:searchforward].&apos;zv&apos;</code>
        —— 这是<b>方向感知</b>的写法，所以 <code>?</code> 反向搜完
        <code>n</code> 会往前。绕回行为来自 Vim 默认的 <code>wrapscan</code>。
      </Provenance>
    </DrillFlow>
  );
}
