"use client";

/**
 * 分屏搭建练习 —— 同化到公共引擎后的版本。
 *
 * ## 判据：最终形状对不对，不看你按了什么
 *
 * 题目给一个目标布局，你用 `<Space>|`（竖切）/ `<Space>-`（横切）/
 * `<Ctrl 方向>`（跳焦点）拼出来。判据是
 * **`shape(你的布局) === 目标形状`** —— 不猜「你按了什么键」。
 *
 * 所以同一道题**有多条解法**（先竖后横、先横后竖可能都对），
 * 枚举不完 → 和 jump 一样用引擎的 `isSolved` 判终态。
 *
 * ## ⚠️ 两个实测踩过的坑（都保留在逻辑里）
 *
 * 1. **必须按真正的 `<Space>` 序列**，不能把裸 `|` / `-` 当分屏键。
 *    之前直接收 `e.key === "|"`，结果打一个竖线就分屏 ——
 *    而真实 LazyVim 里 `<Space>|` 才是 Split Window Right。
 *    训练器比真实环境宽松 = 练出用不上的肌肉记忆。
 *
 * 2. **纯修饰键要在序列逻辑之前放行**。按 `Shift+|` 时浏览器先派发
 *    一个 `key="Shift"` 的 keydown，它被当成序列的下一个键 →
 *    匹配不上 → 序列被清空 → 紧接着真正的 `|` 到达时序列已经没了。
 *    表现是「按了 `<Space>|` 没反应」，而且只在用 Shift 敲竖线时出现。
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  close,
  initial,
  moveFocus,
  positions,
  run,
  shape,
  split,
  countWindows,
  type Layout,
  type Op,
} from "@/lib/split";
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
 * 状态 = 布局 + 焦点。
 *
 * ⚠️ 两者必须放在**同一个** state 对象里，不能分开两个 `useState`。
 *
 * 理由和 jump 那边一样（实测踩过）：分开存就意味着「存在一个中间状态，
 * 新旧数据不匹配」—— 比如布局已经是 2 个窗口，而 focus 还指着
 * 已删掉的第 3 个，渲染时索引越界。合并成一个对象后 `set` 一次全换，
 * **结构上不可能不同步**。
 */
type BuildState = { layout: Layout; focus: number };

type BuildTask = DrillTask & {
  hint: string;
  /** 目标的形状串（判分用） */
  target: string;
  /**
   * 目标的**实际布局**（画对比图用）。
   *
   * ⚠️ 只有 `target` 那个字符串是**不够**的 —— 用户看不见形状串，
   *    而搭建模式的核心反馈就是「你的 vs 目标的」并排对比。
   *
   * 我同化这一页时只画了「你的布局」，把目标那半丢了 ——
   * 用户根本不知道要拼成什么样（你报的就是这个）。
   */
  targetLayout: Layout;
  /** 示范解法（用于「看答案」，不是唯一解） */
  solution: Op[];
};

const TASKS: BuildTask[] = [
  {
    id: "build:两栏",
    short: "两栏",
    desc: "搭出左右两栏",
    hint: "竖着切一刀",
    target: shape(run([{ dir: "v" }]).layout),
    targetLayout: run([{ dir: "v" }]).layout,
    solution: [{ dir: "v" }],
    accept: [],
  },
  {
    id: "build:上下",
    short: "上下",
    desc: "搭出上下两栏",
    hint: "横着切一刀",
    target: shape(run([{ dir: "h" }]).layout),
    targetLayout: run([{ dir: "h" }]).layout,
    solution: [{ dir: "h" }],
    accept: [],
  },
  {
    id: "build:三列",
    short: "三列",
    desc: "搭出三列并排",
    hint: "切两刀。第二刀要切在刚切出来那个窗口上，不然会变成一宽一窄",
    target: shape(run([{ dir: "v" }, { dir: "v" }]).layout),
    targetLayout: run([{ dir: "v" }, { dir: "v" }]).layout,
    solution: [{ dir: "v" }, { dir: "v" }],
    accept: [],
  },
  {
    id: "build:四宫格",
    short: "四宫格",
    desc: "搭出四宫格",
    hint: "先竖切，再横切一刀。反过来（先横后竖）得到的是另一种形状",
    target: shape(run([{ dir: "v" }, { go: "l" }, { dir: "h" }]).layout),
    targetLayout: run([{ dir: "v" }, { go: "l" }, { dir: "h" }]).layout,
    /**
     * ⚠️⚠️ 示范解法是 `| -`，**不是** `| C-l -`。
     *
     * 目标形状来自 `run([{dir:"v"},{go:"l"},{dir:"h"}])`，但 `run()`
     * 的语义是「分屏后焦点**不跟进**」，而**页面的实际按键**
     * 是「焦点**跟到新窗口**」（和原 split.tsx 实现一致）。
     *
     * 两者不一致 → 原题库写的 `[{dir:"v"},{go:"l"},{dir:"h"}]`
     * 照到页面上按**会卡住**：竖切后焦点已经在新窗口（右边），
     * 再按 `<C-L>` 右边没有窗口，走不动。
     *
     * 正确解法是竖切后**直接横切** —— 因为焦点已经在新窗口上了。
     */
    solution: [{ dir: "v" }, { dir: "h" }],
    accept: [],
  },
];

const TASK_OF = new Map(TASKS.map((t) => [t.id, t]));

export default function BuildDrill() {
  const router = useRouter();

  /** 每题都从「一个窗口」开始 */
  const init = useCallback((): BuildState => ({ layout: initial(), focus: 1 }), []);

  /**
   * 执行一串键。
   *
   * ⚠️ 收的是**完整序列**（终态模式可能给单键，也可能给 `<Space>` + `|`），
   *    所以这里按序列判定，不是按单键。
   */
  const apply = useCallback(
    (seq: string[], s: BuildState): BuildState | typeof NO_EFFECT => {
      const joined = seq.join("");

      // 窗口导航：任何时候都能按，不受 leader 影响
      if (seq.length === 1) {
        const dir = navDirOf(seq[0]);
        if (dir) {
          const n = moveFocus(s.layout, s.focus, dir);
          return n === null ? NO_EFFECT : { layout: s.layout, focus: n };
        }
      }

      // 分屏：<Space>| 竖切 / <Space>- 横切
      if (joined === "<Space>|" || joined === "<Space>\\" || joined === "<Space>/") {
        const l = split(s.layout, s.focus, "v");
        return l ? { layout: l, focus: l.nextId - 1 } : NO_EFFECT;
      }
      if (joined === "<Space>-") {
        const l = split(s.layout, s.focus, "h");
        return l ? { layout: l, focus: l.nextId - 1 } : NO_EFFECT;
      }

      // 关窗口：<Space>wd
      if (joined === "<Space>wd") {
        const l = close(s.layout, s.focus);
        return l ? { layout: l, focus: s.focus } : NO_EFFECT;
      }

      /**
       * ⚠️ `<Space>w` 是**中间态**，不是终态。
       *
       * 实测踩到：如果这里返回 NO_EFFECT，引擎会当「这一键走不动」
       * 报错并**清空缓冲** —— 于是紧接着的 `d` 到的时侯序列已经没了，
       * `<Space>wd`（关窗口）永远按不出来。
       *
       * 所以中间态要**原样返回状态**（表示「收到了，继续等」）。
       * 引擎的终态模式里，`apply` 不返回 NO_EFFECT 就是「有效果」，
       * 会把它收进缓冲继续等下一键。
       */
      if (joined === "<Space>w") {
        return s;
      }

      return NO_EFFECT;
    },
    [],
  );

  /**
   * 到了吗 —— 形状对上就行，不管你怎么搭的。
   *
   * ⚠️ 目标形状从**传入的 task** 取，不走 ref。
   *    引擎的 `isSolved(s, task)` 会把当前题目一起给过来 ——
   *    这样不用在渲染期写 ref（那是我第一版的做法，eslint 直接报了
   *    `Cannot access refs during render`）。
   */
  const isSolved = useCallback((s: BuildState, t: DrillTask) => {
    const task = TASK_OF.get(t.id);
    return task ? shape(s.layout) === task.target : false;
  }, []);

  /**
   * 接管哪些键。
   *
   * ⚠️ 只收 `<Space>`（序列开头）和四个 Ctrl 方向键 ——
   *    **不收裸 `|` / `-`**（那会让打竖线就分屏，是错的）。
   */
  const firstKeysOf = useCallback(
    () => new Set(["<Space>", "<C-H>", "<C-J>", "<C-K>", "<C-L>"]),
    [],
  );

  const d = useDrill<BuildState>({
    boardId: "windows-build",
    tasks: TASKS,
    init,
    apply: (seq, s) => apply(seq, s),
    isSolved,
    firstKeysOf,
    toPanelKey,
    noEffectText: (seq) => `${seq.join("")} —— 这一步在当前布局下走不动`,
  });

  const task = TASK_OF.get(d.task.id)!;
  const solvedShape = shape(d.state.layout) === task.target;

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
        <div className="text-neutral-300">
          搭出「<b className="text-yellow-400">{task.short}</b>」
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">{task.hint}</div>
        <div className="mt-2 text-[11px] text-neutral-600">
          用 <kbd className="rounded bg-neutral-800 px-1">&lt;Space&gt;|</kbd> 竖切、
          <kbd className="ml-1 rounded bg-neutral-800 px-1">&lt;Space&gt;-</kbd> 横切、
          <kbd className="ml-1 rounded bg-neutral-800 px-1">&lt;C-H/J/K/L&gt;</kbd> 跳焦点
        </div>
        <div className="mt-2">
          <KeySequence keys={d.shownKeys} feed={d.keyFeed} />
        </div>
        <div className="mt-2 text-[11px] text-neutral-500">
          当前 {countWindows(d.state.layout.root)} 个窗口
          {solvedShape && <span className="ml-2 text-green-400">形状已对上</span>}
        </div>
      </TaskBox>

      <CompareView mine={d.state.layout} focus={d.state.focus} target={task.targetLayout} />

      <KeyLog log={d.log} hint="先按 <Space> 再按 | 或 -" />
      <FlashLine flash={d.flash} />

      <Provenance>
        判据是<b>最终形状</b>（<code>shape(layout) === target</code>），
        不是「按了什么键」—— 所以同一道题**有多条解法**。
        形状含比例，取整到 3 位小数。
        <br />
        ⚠️ 分屏必须按完整的 <code>&lt;Space&gt;|</code>，
        <b>裸 <code>|</code> 不是分屏键</b> —— 训练器不能比真实环境宽松。
      </Provenance>
    </DrillFlow>
  );
}

/** 面板记法 → 方向 */
function navDirOf(key: string): "h" | "j" | "k" | "l" | null {
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

/** 浏览器事件 → 面板记法 */
function toPanelKey(e: KeyboardEvent): string | null {
  const dir = windowNavDir(e);
  if (dir) return `<C-${dir.toUpperCase()}>`;
  if (e.key === " ") return "<Space>";
  if (e.key.length === 1) return e.key.toLowerCase();
  return null;
}

/**
 * 并排对比：**你的布局 vs 目标布局**。
 *
 * ## ⚠️ 这一半不能丢
 *
 * 搭建模式练的是「把布局拼成目标那样」—— 用户必须**看得见目标**，
 * 否则就是盲拼。
 *
 * 我同化这一页时只画了「你的布局」，目标只剩下 `task.target`
 * 那个形状字符串（用户看不见）—— 这是把核心反馈弄丢了。
 *
 * 原实现（`577b2e1` 删掉的 `split.tsx`）里有个 `ShapeCompare`
 * 就是做这个的，我在重写时漏掉了。
 */
function CompareView({
  mine,
  focus,
  target,
}: {
  mine: Layout;
  focus: number;
  target: Layout;
}) {
  const matched = shape(mine) === shape(target);
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-3 text-[10px]">
        <span className="text-neutral-500">你的</span>
        <span className="text-neutral-700">vs</span>
        <span className="text-yellow-400/90">目标</span>
        {matched && <span className="text-green-400">✓ 形状已对上</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Mini label="你的" layout={mine} focus={focus} tone="mine" />
        <Mini label="目标" layout={target} tone="target" />
      </div>
    </div>
  );
}

/** 画一个小的布局缩略图 */
function Mini({
  layout,
  focus,
  label,
  tone,
}: {
  layout: Layout;
  focus?: number;
  label: string;
  tone: "mine" | "target";
}) {
  const pos = positions(layout.root);
  const ids = [...pos.keys()];
  return (
    <div data-mini={tone}>
      <div className="relative h-32 w-full rounded border border-neutral-800 bg-neutral-900/40">
        {ids.map((id) => {
          const p = pos.get(id)!;
          const isFocus = id === focus;
          return (
            <div
              key={id}
              data-pane={id}
              data-focus={isFocus ? "1" : undefined}
              className={`absolute flex items-center justify-center border text-[9px] ${
                tone === "target"
                  ? "border-yellow-800 bg-yellow-950/30 text-yellow-600/80"
                  : isFocus
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
      <div className="mt-1 text-center text-[10px] text-neutral-600">
        {label} · {ids.length} 个窗口
      </div>
    </div>
  );
}
