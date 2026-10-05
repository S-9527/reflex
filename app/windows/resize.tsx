"use client";

/**
 * 窗口缩放练习 —— `<C-Up/Down/Left/Right>` 那一族。
 *
 * ## 判据：目标尺寸对不对（多步，终态判定）
 *
 * 用 `useDrill` 的 `isSolved` 钩子 —— 和 jump/build 同一套机制。
 * 缩到目标宽度就算过，走几步不管。
 *
 * ## ⚠️⚠️ 两条实测结论，都和「书上说的」不一样
 *
 * ### 1. 步长是**固定 2 列/行**，不是 1
 *
 * 本机四个键的 rhs **硬编码**了步长：
 *
 * ```
 * <C-Right>  rhs=<Cmd>vertical resize +2<CR>
 * <C-Down>   rhs=<Cmd>resize -2<CR>
 * ```
 *
 * ### 2. **加计数没用**（这一条最反直觉）
 *
 * 书里说「键盘缩放要加计数（`20<C-Up>`）」，但实测：
 *
 * | 按键 | 宽度变化 |
 * |------|---------|
 * | `<C-Right>` | 39 → 37（挪 2）|
 * | `10<C-Right>` | 37 → 35（**也是 2**）|
 * | `30<C-Right>` | 35 → 33（**还是 2**）|
 *
 * 因为步长写死在 rhs 里了，不像 Vim 内建的 `<C-w>>` 那样吃计数。
 * 想挪更多得手打 `:vertical resize +10`。
 *
 * 这是这个项目**第六次**「凭印象写 → 实测推翻」，探针在
 * `scripts/probe-resize.lua`。
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  canResize,
  initial,
  positions,
  resizeByCells,
  split,
  type Layout,
} from "@/lib/split";
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

/** 假装屏幕有这么多列 / 行 —— 用来把「列」换算成内部比例 */
const SCREEN_COLS = 80;
const SCREEN_ROWS = 24;

type ResizeState = { layout: Layout; focus: number };

type ResizeTask = DrillTask & {
  /**
   * 要让哪个方向的尺寸变成多少。
   *
   * ⚠️⚠️ `dir` 必须**显式存**，不能靠 `cells` 的大小猜。
   *
   * 我第一版用 `cells >= 40 ? 放大 : 缩小` 来猜方向 —— 于是
   * 「变高」（目标 16 行）被当成缩小，`isSolved` 判成
   * `12 <= 16` = true，**起始状态就满足条件**。
   * 用户按什么都没反应（因为引擎认为这题已经做完了）。
   *
   * 这个 bug 只有「目标值 < 40」的那两题会触发 —— 而我当时
   * 只看了「变宽 60 / 变窄 20」两道，恰好都能蒙对。
   */
  goal: { axis: "v" | "h"; cells: number; dir: "grow" | "shrink" };
};

/** 目标尺寸（列或行） */
const GOALS = {
  wider: { axis: "v" as const, cells: 60, dir: "grow" as const },
  narrower: { axis: "v" as const, cells: 20, dir: "shrink" as const },
  taller: { axis: "h" as const, cells: 16, dir: "grow" as const },
  shorter: { axis: "h" as const, cells: 8, dir: "shrink" as const },
};

const TASKS: ResizeTask[] = [
  {
    id: "resize:wider",
    short: "变宽",
    desc: "把右边窗口拉到 60 列宽（每次 <C-Right> 挪 2 列）",
    goal: GOALS.wider,
    accept: [],
  },
  {
    id: "resize:narrower",
    short: "变窄",
    desc: "把右边窗口缩到 20 列宽",
    goal: GOALS.narrower,
    accept: [],
  },
  {
    id: "resize:taller",
    short: "变高",
    desc: "把下边窗口拉到 16 行高（每次 <C-Down> 挪 2 行）",
    goal: GOALS.taller,
    accept: [],
  },
  {
    id: "resize:shorter",
    short: "变矮",
    desc: "把下边窗口缩到 8 行高",
    goal: GOALS.shorter,
    accept: [],
  },
];

/** 每题：先切出两栏/两行，再把焦点放到要调的那个窗口上 */
function setupFor(t: DrillTask): ResizeState {
  const task = TASKS.find((x) => x.id === t.id)!;
  const axis = task.goal.axis;
  // 竖切（axis=v）或横切（axis=h），焦点跟到新窗口
  const l = split(initial(), 1, axis)!;
  return { layout: l, focus: l.nextId - 1 };
}

const TASK_OF = new Map(TASKS.map((t) => [t.id, t]));

/** 某一侧现在有多少列/行 */
function cellsOf(s: ResizeState, axis: "v" | "h"): number {
  const p = positions(s.layout.root).get(s.focus);
  if (!p) return 0;
  return axis === "v"
    ? Math.round((p.c1 - p.c0) * SCREEN_COLS)
    : Math.round((p.r1 - p.r0) * SCREEN_ROWS);
}

export default function ResizeDrill() {
  const router = useRouter();

  const init = useCallback((t: DrillTask) => setupFor(t), []);

  const apply = useCallback((seq: string[], s: ResizeState): ResizeState | typeof NO_EFFECT => {
    if (seq.length !== 1) return NO_EFFECT;
    const key = seq[0];
    const total = key === "<C-Left>" || key === "<C-Right>" ? SCREEN_COLS : SCREEN_ROWS;

    /** 缩一次 —— 走不动（到极限 / 方向不对）返回 NO_EFFECT */
    const shrink = (axis: "v" | "h", dir: 1 | -1) => {
      const l = resizeByCells(s.layout, s.focus, axis, dir, total);
      return l === null ? NO_EFFECT : { layout: l, focus: s.focus };
    };

    switch (key) {
      case "<C-Right>":
        return shrink("v", 1);
      case "<C-Left>":
        return shrink("v", -1);
      case "<C-Down>":
        return shrink("h", 1);
      case "<C-Up>":
        return shrink("h", -1);
      default:
        return NO_EFFECT;
    }
  }, []);

  /**
   * 到了吗 —— 目标尺寸对不对。
   *
   * ⚠️ 方向从 `goal.dir` 读（显式），**不用数值大小猜**。
   *    用 `cells >= 40` 猜的那版会让「变高」（16 行）被当成缩小，
   *    于是起始状态就判成完成，用户按什么都没反应。
   *
   * 判据是 `>=` / `<=` 而不是 `===`：用户可能一次按过头，
   * 那时也该算过（否则这题永远做不完）。
   */
  const isSolved = useCallback((s: ResizeState, t: DrillTask) => {
    const task = TASK_OF.get(t.id);
    if (!task) return false;
    const now = cellsOf(s, task.goal.axis);
    return task.goal.dir === "grow" ? now >= task.goal.cells : now <= task.goal.cells;
  }, []);

  /**
   * 接管哪四个键。
   *
   * ⚠️ 只收 `<C-方向键>` —— 裸方向键在本机没有缩放映射。
   */
  const firstKeysOf = useCallback(
    () => new Set(["<C-Up>", "<C-Down>", "<C-Left>", "<C-Right>"]),
    [],
  );

  const d = useDrill<ResizeState>({
    boardId: "windows-resize",
    tasks: TASKS,
    init,
    apply,
    isSolved,
    firstKeysOf,
    toPanelKey,
    noEffectText: (seq) =>
      `${seq.join("")} —— 这一步缩不动（方向不对，或者已经到极限了）`,
  });

  const task = TASK_OF.get(d.task.id)!;
  const now = cellsOf(d.state, task.goal.axis);
  const unit = task.goal.axis === "v" ? "列" : "行";
  const canDir = canResize(d.state.layout, d.state.focus, task.goal.axis);

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
        labelOf={(t) => t.short}
      />

      <TaskBox>
        <div className="text-neutral-300">{task.desc}</div>

        {/*
          ⚠️⚠️ 这里**必须明确写出按哪几个键**。
          
          原来的问题：这一族用终态判定（`accept: []`），所以
          `d.shownKeys` 是**空的** —— KeySequence 什么都不显示。
          整页只有底部一行小字提了句「按 <C-方向键>」，
          用户根本不知道要练什么键（你报的就是这个）。
          
          序列匹配的板块不存在这个问题（题目区会画出解法格子），
          但终态判定的三个模式（jump/build/resize）都要自己说清楚。
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-neutral-500">按</span>
          {keysFor(task.goal).map((k) => (
            <kbd
              key={k}
              data-hint-key={k}
              className="rounded bg-blue-950 px-2 py-0.5 font-mono text-blue-200"
            >
              {k}
            </kbd>
          ))}
          <span className="text-neutral-500">
            {task.goal.dir === "grow" ? "放大" : "缩小"}这个窗口
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 text-[11px]">
          <span className="text-neutral-500">
            当前 <b className="text-neutral-300">{now}</b> {unit}
          </span>
          <span className="text-neutral-500">
            目标 <b className="text-yellow-400">{task.goal.cells}</b> {unit}
          </span>
          <span className="text-neutral-600">
            还差 <b className="text-neutral-400">{Math.abs(task.goal.cells - now)}</b> {unit}
            （约 {Math.abs(task.goal.cells - now) / 2} 次）
          </span>
          {!canDir && <span className="text-amber-500/90">这个方向没有可调的分割点</span>}
        </div>

        <div className="mt-2 text-[10px] text-neutral-600">
          ⚠️ 每次只挪 <b>2 {unit}</b>，加计数没用（步长写死在映射里）
        </div>

        {/* 已经按过的键 —— 给逐键反馈 */}
        {d.keyFeed.length > 0 && (
          <div className="mt-2">
            <KeySequence keys={d.keyFeed.map((f) => f.key)} feed={d.keyFeed} />
          </div>
        )}
      </TaskBox>

      <SizeView state={d.state} axis={task.goal.axis} goal={task.goal.cells} />

      <KeyLog log={d.log} hint="按 <C-方向键> 缩 —— 到目标会自动结算" />
      <FlashLine flash={d.flash} />

      <Provenance>
        实测（<code>scripts/probe-resize.lua</code>）：这四个键的 rhs 是
        <code>&lt;Cmd&gt;vertical resize +2&lt;CR&gt;</code> 这种
        <b>硬编码步长</b>。所以
        <code>10&lt;C-Right&gt;</code> / <code>30&lt;C-Right&gt;</code>{" "}
        实测<b>都只挪 2 列</b> —— 和书里「加计数来多挪」的说法不符。
        想挪更多得手打 <code>:vertical resize +10</code>。
      </Provenance>
    </DrillFlow>
  );
}

/**
 * 这道题该按哪几个键。
 *
 * ⚠️ 终态判定的板块（jump / build / resize）用 `accept: []`，
 *    所以题目区**不会**自动画出解法格子 —— 必须自己说清楚按什么。
 *    序列匹配的板块不存在这个问题。
 */
function keysFor(goal: { axis: "v" | "h"; dir: "grow" | "shrink" }): string[] {
  if (goal.axis === "v") {
    return goal.dir === "grow" ? ["<C-Right>"] : ["<C-Left>"];
  }
  return goal.dir === "grow" ? ["<C-Down>"] : ["<C-Up>"];
}

/** 浏览器事件 → 面板记法（只认 Ctrl + 方向键） */
function toPanelKey(e: KeyboardEvent): string | null {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowUp":
      return "<C-Up>";
    case "ArrowDown":
      return "<C-Down>";
    case "ArrowLeft":
      return "<C-Left>";
    case "ArrowRight":
      return "<C-Right>";
    default:
      return null;
  }
}

/** 画布局，标出要调的那一侧 */
function SizeView({
  state,
  axis,
  goal,
}: {
  state: ResizeState;
  axis: "v" | "h";
  goal: number;
}) {
  const pos = positions(state.layout.root);
  const ids = [...pos.keys()];
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 text-[10px] text-neutral-700">
        你的布局（<span className="text-blue-400">蓝框</span> = 正在调的那个窗口）
      </div>
      <div className="relative h-48 w-full rounded border border-neutral-800">
        {ids.map((id) => {
          const p = pos.get(id)!;
          return (
            <div
              key={id}
              data-pane={id}
              data-focus={id === state.focus ? "1" : undefined}
              className={`absolute flex items-center justify-center border text-[10px] ${
                id === state.focus
                  ? "border-blue-400 bg-blue-950/60 text-blue-100"
                  : "border-neutral-700 bg-neutral-900 text-neutral-600"
              }`}
              style={{
                left: `${p.c0 * 100}%`,
                top: `${p.r0 * 100}%`,
                width: `${(p.c1 - p.c0) * 100}%`,
                height: `${(p.r1 - p.r0) * 100}%`,
              }}
            >
              {id}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] text-neutral-600">
        目标：这个窗口的{axis === "v" ? "宽度" : "高度"}变成 {goal} {axis === "v" ? "列" : "行"}
      </div>
    </div>
  );
}
