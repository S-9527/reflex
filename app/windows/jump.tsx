"use client";

/**
 * 窗口跳转练习 —— 同化到公共引擎后的版本。
 *
 * ## 判据变了：从「按了什么键」到「焦点落在哪」
 *
 * 这是全项目**唯一**一个「目标判定」类的板块。别处都是
 * 「题目给出描述 → 按出对应键序列 → 比对序列」，这里不行：
 * `<C-J>` 本身没有描述（它就是「往下」），判分只能看
 * **焦点最终落在哪个窗口**。
 *
 * 而且**路径不唯一** —— 从左上到右下，先往右再往下、先往下再往右，
 * 都对。所以不能枚举进 `accept`。
 *
 * ## 用引擎的 isSolved 钩子
 *
 * ```
 * 每按一键 → apply 推进焦点 → isSolved(新状态) 判「到了吗」
 *          → 没到就继续走，到了才结算翻页
 * ```
 *
 * 和序列模式的关键差别：**命中不立刻翻页**，要走完才算。
 *
 * ## ⚠️ 接管范围必须自己给
 *
 * 合法方向取决于**当前布局**（有的方向没窗口）。而 `<C-H/J/K/L>`
 * 之外的裸 `hjkl` **本机没有映射** —— 收了会练出用不上的肌肉记忆
 * （`lib/keys.ts` 的 `windowNavDir` 里记过这条实测结论）。
 *
 * 所以 `firstKeysOf` 只给四个 Ctrl 方向键。
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ARENAS,
  hasNeighbor,
  makeTask,
  move,
  shortestSteps,
  type Arena,
} from "@/lib/arena";
import { windowNavDir } from "@/lib/keys";
import { formatMs } from "@/lib/session";
import type { DrillTask } from "@/lib/drill";
import { NO_EFFECT, useDrill } from "@/lib/use-drill";
import {
  DrillFlow,
  FlashLine,
  KeyLog,
  KeySequence,
  Provenance,
  TaskBar,
  TaskBox,
  streakOf,
} from "@/lib/drill-ui";

/**
 * 一道题 = 「把焦点移到某个窗口」。
 *
 * ## ⚠️ 为什么 `ai` 和 `to` 必须放在**同一个** state 对象里
 *
 * 实测踩过：切布局时 `ai` 已经变成两栏（2 个窗口），
 * 但 `to` 还是上一套四宫格的值（3）。渲染时 `arena.wins[3]` → undefined，
 * 读 `.label` 就崩 —— 四宫格（4 个窗口）恰好正常，其他全炸。
 *
 * 分开存就意味着「存在一个中间状态，新旧数据不匹配」。
 * 合并成一个对象之后，`set` 一次全换，**结构上不可能不同步**。
 */
type JumpState = {
  /** 这套布局的下标 */
  ai: number;
  /** 当前焦点窗口 */
  focus: number;
  /** 目标窗口 */
  to: number;
  /** 已经走了几步 */
  steps: number;
  /** 这一题的最优步数（从起点算） */
  opt: number;
  /** 刚达成时的提示文案 */
  done: string | null;
};

/**
 * ⚠️ 初始题目必须**确定性**，不能随机。
 *
 * 实测踩到：`makeTask` 内部随机，而这段跑在 `useState(initial)` 里 ——
 * SSR 算一次、客户端 hydration 又算一次，两次不同 →
 * `isTarget` 不匹配 → hydration failed → React 丢弃整棵树重新生成
 * → **所有按键 handler 全部失效**（表现为「按什么键都没反应」）。
 *
 * 所以固定挑：四宫格、起点左上、目标右上（一步之遥，首题简单且有意义）。
 */
const FIRST_ARENA = 2;

/** 把「布局 + 目标」包成 DrillTask */
const TASKS: DrillTask[] = ARENAS.map((a, ai) => {
  const to = a.wins.length > 1 ? 1 : 0;
  return {
    id: `jump:${a.name}`,
    short: a.name,
    desc: `把焦点移到「${a.wins[to].label}」`,
    // ⚠️ 终态模式不用 accept 判命中，留空
    accept: [],
  };
});

/** 题目 id → 布局下标 */
const AI_OF = new Map(TASKS.map((t, ai) => [t.id, ai]));

/** 四个方向键 → 方向 */
const DIRS = ["h", "j", "k", "l"] as const;

export default function JumpDrill() {
  const router = useRouter();

  const init = useCallback((t: DrillTask): JumpState => {
    const ai = AI_OF.get(t.id) ?? FIRST_ARENA;
    const a = ARENAS[ai];
    const to = a.wins.length > 1 ? 1 : 0;
    return {
      ai,
      focus: a.start,
      to,
      steps: 0,
      opt: shortestSteps(a, a.start, to),
      done: null,
    };
  }, []);

  /**
   * ⚠️ 终态模式：`apply` 收到的是**单个键**，推进焦点。
   *
   * 返回 `NO_EFFECT` = 这个方向在当前布局里没有窗口。
   * 引擎会明确提示，不静默吞掉 —— 静默吞输入最难查。
   */
  const apply = useCallback((seq: string[], s: JumpState): JumpState | typeof NO_EFFECT => {
    const key = seq[seq.length - 1];
    const dir = keyToDir(key);
    if (!dir) return NO_EFFECT;

    const a = ARENAS[s.ai];
    if (!hasNeighbor(a, s.focus, dir)) return NO_EFFECT;

    const next = move(a, s.focus, dir);
    if (next === null) return NO_EFFECT;

    return { ...s, focus: next, steps: s.steps + 1, done: null };
  }, []);

  /** 到了吗 —— 焦点落在目标窗口 */
  const isSolved = useCallback((s: JumpState) => s.focus === s.to, []);

  /**
   * 接管哪四个键。
   *
   * ⚠️ 只收 `<C-H/J/K/L>`，**不收裸 hjkl** —— 本机 Normal 模式
   *    没有裸 hjkl 的窗口映射，收了会练出用不上的肌肉记忆。
   */
  const firstKeysOf = useCallback(() => new Set(["<C-H>", "<C-J>", "<C-K>", "<C-L>"]), []);

  const d = useDrill<JumpState>({
    boardId: "windows-jump",
    tasks: TASKS,
    init,
    apply,
    isSolved,
    firstKeysOf,
    toPanelKey,
    noEffectText: (seq) =>
      `${seq.join("")} —— 那个方向没有窗口（这套布局里这个键是空的）`,
  });

  const s = d.state;
  const arena: Arena = ARENAS[s.ai];
  const target = arena.wins[s.to];

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
        <div className="text-neutral-300">
          把焦点移到{" "}
          <b className="text-yellow-400">{target?.label ?? "?"}</b>
        </div>
        <div className="mt-1 text-[11px] text-neutral-600">
          按 <kbd className="rounded bg-neutral-800 px-1">&lt;C-H/J/K/L&gt;</kbd>{" "}
          在窗口间走 —— <b className="text-neutral-500">裸 hjkl 本机没有映射，不收</b>
        </div>
        {/* 终态模式没有固定解，所以不画 KeySequence，只显示已走步数 */}
        <div className="mt-2 text-[11px] text-neutral-500">
          已走 <b className="text-neutral-300">{s.steps}</b> 步
          {s.opt > 0 && <span className="text-neutral-700"> · 最优 {s.opt} 步</span>}
        </div>
      </TaskBox>

      <WindowGrid arena={arena} focus={s.focus} target={s.to} />

      <KeyLog log={d.log} hint="按 <C-H/J/K/L> 走 —— 到了会自动结算" />
      <FlashLine flash={d.flash} />

      <Provenance>
        判据是<b>焦点最终落在哪个窗口</b>，不是「按了什么键」——
        因为从 A 到 B 的路径不唯一（先右后下、先下后右都对），
        枚举不完。所以这一族用引擎的 <code>isSolved</code> 钩子判终态。
        <br />
        布局与本机 LazyVim 一致：窗口导航是 <code>&lt;C-H/J/K/L&gt;</code>，
        <b>不是</b>书里的 <code>&lt;C-w&gt;h/j/k/l</code>。
      </Provenance>
    </DrillFlow>
  );
}

/** 面板记法 → 方向 */
function keyToDir(key: string): "h" | "j" | "k" | "l" | null {
  switch (key) {
    case "<C-H>":
      return "h";
    case "<C-J>":
      return "j";
    case "<C-K>":
      return "k";
    case "<C-L>":
      return "l";
    default:
      return null;
  }
}

/** 浏览器事件 → 面板记法（只认 Ctrl + hjkl） */
function toPanelKey(e: KeyboardEvent): string | null {
  const dir = windowNavDir(e);
  if (!dir) return null;
  return `<C-${dir.toUpperCase()}>`;
}

/* ------------------------------------------------------------------ 渲染 */

/** 把 arena 的邻接表画成网格 */
function WindowGrid({ arena, focus, target }: { arena: Arena; focus: number; target: number }) {
  const cols = Math.max(1, ...arena.wins.map((_, i) => i + 1));
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-3 text-[10px] text-neutral-700">
        <span>{arena.note}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />焦点
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-yellow-500" />目标
        </span>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, 3)}, minmax(0, 1fr))` }}
      >
        {arena.wins.map((w, i) => {
          const isFocus = i === focus;
          const isTarget = i === target;
          return (
            <div
              key={i}
              data-win={i}
              data-focus={isFocus ? "1" : undefined}
              data-target={isTarget ? "1" : undefined}
              className={`flex h-16 items-center justify-center rounded border text-[11px] ${
                isFocus
                  ? "border-blue-400 bg-blue-950 text-blue-100"
                  : isTarget
                    ? "border-yellow-600 bg-yellow-950/40 text-yellow-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-500"
              }`}
            >
              {w.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
