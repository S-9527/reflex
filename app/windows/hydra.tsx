"use client";

import { useCallback, useRef } from "react";
import {
  initial,
  split,
  close,
  closeOthers,
  moveFocus,
  moveToEdge,
  swapNext,
  resize,
  maxOut,
  equalize,
  zoomIn,
  cycleFocus,
  focusIndex,
  positions,
  run,
  RESIZE_STEP,
  type Layout,
  type Op,
} from "@/lib/split";
import { WIN_KEYS, findKey, GROUPS, TASKS, type Task } from "@/lib/winkeys";
import type { DrillTask } from "@/lib/drill";
import { NO_EFFECT, useDrill } from "@/lib/use-drill";
import {
  DrillFlow,
  FlashLine,
  KeyLog,
  KeySequence,
  PendingHint,
  Provenance,
  TaskBar,
  TaskBox,
  streakOf,
} from "@/lib/drill-ui";
import { formatMs } from "@/lib/session";

/**
 * 窗口键位训练 —— 只练 LazyVim 的 `<Space>wX`,原生写法只作对照展示。
 *
 * ## 为什么只练一条路
 *
 * 原本每个键收两种解法(`<C-w>v` 和 `<Space>wv`),
 * 用户明确说「只想专门练 lazyvim 的键」——
 * 那套键才是他平时真按的,原生写法在键表里看着当参照就够了。
 *
 * 好处不只是少练一半:序列长度统一成 3 键,
 * 少一条前缀分支就少一类 bug。
 *
 * ## 判分要求按出效果
 *
 * 单键反射 + 必须真的改变布局 —— 光按对键但布局没变
 * (比如没有窗口可关)不算过,并且**明确提示**,不静默吞掉。
 *
 * ## extraAccept:这一页和其它四页不一样
 *
 * 面板里有 20 个键,每道题只对其中一个。按了别的键时不能放行
 * (那会掉进浏览器,用户看不到任何反馈),也不能判对 ——
 * 要明确说「那是另一个命令」并**演示它的效果**,让人看见差别。
 * 这就是引擎 `extraAccept` + `onOther` 的用武之地。
 */

type View = { layout: Layout; focus: number };

const LEADER = "<Space>";
const HYDRA = "w";

/**
 * ⚠️ 解法是**完整三键** `<Space>wX`,不是裸面板键。
 *
 * 这一页的练习目标就是「进 hydra 面板 → 按面板键」。
 * 如果 accept 写成 `[["v"]]`,那裸 `v` 也会被判对 ——
 * 而真 nvim 里裸 `v` 是字符级可视模式,和 hydra 里的 `v`(竖着切一刀)
 * 完全是两回事。那就是**训练器比真实环境宽松**,练出来的反射用不上。
 *
 * 这类「善意地多收几个键」比 bug 更危险:通过率好看,练的东西是废的。
 */
const DRILL_TASKS: DrillTask[] = TASKS.map((t, i) => ({
  id: `${t.key}#${i}`,
  short: t.key,
  desc: t.desc,
  accept: [[LEADER, HYDRA, t.key]],
}));
/** DrillTask.id → 原题 */
const TASK_OF = new Map<string, Task>(TASKS.map((t, i) => [`${t.key}#${i}`, t]));

/**
 * 从 task.start 重放出起始布局。
 *
 * ⚠️ 直接复用 lib/split 的 run(),不要在这里手写执行器。
 * 原来这里自己写了一遍只认 `dir` 和 `go` 的循环,于是给 `=` 题
 * 加上 `{resize:"v+"}` 之后它**静默跳过**了这一步 ——
 * 起始布局还是对半的,`=` 又变成无解题。
 *
 * 同概念两套实现,必然不同步 —— 这个坑这轮已经踩了三次
 * (leader 判据 / parseSeq / buildStart)。
 */
const buildStart = (t: Task): View => run(t.start);

/** 执行一个面板键的效果 */
function applyKey(key: string, cur: View, zoomedRef: { current: View | null }): View | null {
  switch (key) {
    case "v": {
      const l = split(cur.layout, cur.focus, "v");
      return l ? { layout: l, focus: l.nextId - 1 } : null;
    }
    case "s": {
      const l = split(cur.layout, cur.focus, "h");
      return l ? { layout: l, focus: l.nextId - 1 } : null;
    }
    case "h":
    case "j":
    case "k":
    case "l": {
      const n = moveFocus(cur.layout, cur.focus, key);
      return n === null ? null : { layout: cur.layout, focus: n };
    }
    case "H":
    case "J":
    case "K":
    case "L": {
      const d = key.toLowerCase() as "h" | "j" | "k" | "l";
      const l = moveToEdge(cur.layout, cur.focus, d);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "d": {
      const l = close(cur.layout, cur.focus);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "o": {
      const l = closeOthers(cur.layout, cur.focus);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "x": {
      const l = swapNext(cur.layout, cur.focus);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case ">": {
      const l = resize(cur.layout, cur.focus, "v", RESIZE_STEP);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "<": {
      const l = resize(cur.layout, cur.focus, "v", -RESIZE_STEP);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "+": {
      const l = resize(cur.layout, cur.focus, "h", -RESIZE_STEP);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "-": {
      const l = resize(cur.layout, cur.focus, "h", RESIZE_STEP);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "|": {
      const l = maxOut(cur.layout, cur.focus, "v");
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "_": {
      const l = maxOut(cur.layout, cur.focus, "h");
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "=": {
      const l = equalize(cur.layout, cur.focus);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    case "m": {
      // 缩放要能"再按一次恢复",所以退出走 zoomedRef —— 只进不出等于半个功能。
      if (zoomedRef.current) {
        const prev = zoomedRef.current;
        zoomedRef.current = null;
        return prev;
      }
      const l = zoomIn(cur.layout, cur.focus);
      if (!l) return null;
      zoomedRef.current = cur;
      return { layout: l, focus: cur.focus };
    }
    case "W": {
      const n = cycleFocus(cur.layout, cur.focus);
      return n === null ? null : { layout: cur.layout, focus: n };
    }
    case "0":
    case "1": {
      const n = focusIndex(cur.layout, Number(key));
      return n === null ? null : { layout: cur.layout, focus: n };
    }
    // q 和 T 在「窗口数量」上的效果都是当前窗口离开本标签页,
    // 所以按 close 建模。差异(q 会跳 Alternate File、T 会开新标签页)
    // 不在这个模型里,界面上已注明。
    case "q":
    case "T": {
      const l = close(cur.layout, cur.focus);
      return l ? { layout: l, focus: cur.focus } : null;
    }
    default:
      return null;
  }
}

/** 面板里所有键(除了本题的),作为 extraAccept —— 同样是完整三键 */
const PANEL = WIN_KEYS.filter((k) => !k.skip).map((k) => [LEADER, HYDRA, k.key]);

/**
 * 这一页只收 `<Space>` + `w` + 一个面板键。
 *
 * 带 Ctrl 的一律放行 —— 这一页不劫持 Ctrl+W / Ctrl+R 那些浏览器快捷键。
 */
function toPanelKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey) return null;
  return e.key === " " ? LEADER : e.key;
}

export default function HydraDrill() {
  /** 缩放前的样子,再按一次 m 用来恢复 */
  const zoomedRef = useRef<View | null>(null);

  const init = useCallback((t: DrillTask) => buildStart(TASK_OF.get(t.id)!), []);

  const apply = useCallback(
    (seq: string[], s: View, t: DrillTask) => {
      // 命中的就是完整三键的最后一位 —— 这一页每题只有一条解法
      const key = seq[seq.length - 1];
      if (key !== TASK_OF.get(t.id)!.key) return NO_EFFECT;
      // applyKey 返回 null = 当前布局下这个键无效(焦点已在最左之类)
      return applyKey(key, s, zoomedRef) ?? NO_EFFECT;
    },
    [],
  );

  /**
   * 按了面板里的**其它**键:演示它的效果,并说明本题要的是哪个。
   *
   * 关键是必须演示 —— 只说「错了」的话用户永远建立不起两个键的差别。
   */
  const onOther = useCallback((seq: string[], s: View, t: DrillTask) => {
    const key = seq[seq.length - 1];
    const w = findKey(key);
    // 面板外的键不该走到这里 —— 引擎只在 extraAccept 命中时才调 onOther
    if (!w) return { text: `✗ ${key} 不在这一页的范围里` };
    if (!w.modeled) return { text: `${key}(${w.desc})—— 这一页还没建模它的效果` };
    const next = applyKey(key, s, zoomedRef);
    return {
      next: next ?? s,
      text: next
        ? `✗ ${key} 是「${w.desc}」,本题要的是 ${t.short} —— ${t.desc}`
        : `${key} 按了但布局没变(当前布局下这个键无效)`,
    };
  }, []);

  const d = useDrill<View>({
    boardId: "windows-hydra",
    tasks: DRILL_TASKS,
    init,
    apply,
    toPanelKey,
    extraAccept: PANEL,
    onOther,
    // 延迟给够看反馈:判对后立刻翻页重置会让人看不出那下生效没有
    noEffectText: (seq) => `${seq.join("")} 按了但布局没变(当前布局下这个键无效)`,
    onResetExtra: () => {
      zoomedRef.current = null;
    },
  });

  const task = TASK_OF.get(d.task.id)!;
  const wk = findKey(task.key);
  const pos = positions(d.state.layout.root);

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
      descOf={(id) => DRILL_TASKS.find((t) => t.id === id)?.desc ?? id}
      onRetry={() => d.restart()}
      onRetryMistakes={() => d.restart(d.session.results.filter((r) => !r.ok).map((r) => r.taskId))}
      mode={d.mode}
      onMode={d.setMode}
      hint={d.hint}
      canHint={d.canHint}
      onHint={d.showHint}
    >
      <TaskBar
        tasks={DRILL_TASKS}
        current={DRILL_TASKS.findIndex((t) => t.id === d.task.id)}
        solvedAll={d.solvedAll}
        onClear={d.clearProgress}
        onPick={d.setTaskIndex}
        onReset={d.reset}
      />

      {/* 本题:一键两解 */}
      <TaskBox>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">按出</span>
          <span className="text-neutral-400">{task.desc}</span>
        </div>

        {/*
          ⚠️ 旧版这里直接写出 `task.key`（= 面板键，也就是答案）。
          改成逐键上色：`<Space>` `w` `X` 三个格子，按对一个绿一个。
          这样仍然保留了「这一页要按三键」的信息，但不给答案。
        */}
        <div className="mt-3">
          <KeySequence keys={d.shownKeys} feed={d.keyFeed} />
        </div>

        {wk && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-neutral-600">要按的</span>
              <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{wk.lazy}</kbd>
            </div>
            {wk.alt ? (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-neutral-600">更省事</span>
                <kbd className="rounded bg-green-950 px-1.5 py-0.5 text-green-300">{wk.alt}</kbd>
                <span className="text-neutral-600">
                  实测本机有这个等价键,{wk.alt.length < wk.lazy.length ? "更短" : "不用进面板"} —— 哪个顺手用哪个
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-neutral-600">更省事</span>
                <span className="text-neutral-700">没有更短的等价键</span>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-neutral-600">原生等价</span>
              <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{wk.native}</kbd>
              <span className="text-neutral-600">只作对照,不作解法</span>
            </div>
          </div>
        )}
        <PendingHint pending={d.pending} />
      </TaskBox>

      <Stage pos={pos} focus={d.state.focus} />

      <KeyLog
        log={d.log}
        hint={
          <>
            按 <kbd className="rounded bg-neutral-800 px-1">&lt;Space&gt;</kbd>
            <kbd className="rounded bg-neutral-800 px-1">w</kbd>
            <kbd className="rounded bg-neutral-800 px-1">{task.key}</kbd>
            三键连着按
          </>
        }
      />
      <FlashLine flash={d.flash} />

      <KeyTable highlight={task.key} />
    </DrillFlow>
  );
}

/**
 * 键位对照表。
 *
 * 只列**键的写法**:面板键 / LazyVim 写法 / 原生等价。
 * 每行的中文作用说明去掉了 —— 那是「这键干什么」,属于讲解,
 * 而这一页练的是反射,照着面板把三个键按出来就够。
 * 作用说明在题目区显示当前题那一条,需要时看得到。
 */
function KeyTable({ highlight }: { highlight: string }) {
  return (
    <div className="rounded border border-neutral-800 p-2 text-[11px]">
      {GROUPS.map((g) => {
        const rows = WIN_KEYS.filter((k) => k.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g} className="mb-2 last:mb-0">
            <div className="mb-0.5 text-neutral-600">{g}</div>
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {rows.map((k) => (
                <div
                  key={k.key}
                  className={`flex gap-1.5 ${
                    k.key === highlight ? "rounded bg-blue-950 px-1 text-blue-200" : "text-neutral-500"
                  }`}
                >
                  <span className="w-9 shrink-0 font-bold text-purple-300">{k.key}</span>
                  <span className="w-28 shrink-0 text-blue-400/80">{k.lazy}</span>
                  <span className="w-24 shrink-0 text-neutral-600">{k.native}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="mt-2 border-t border-neutral-800 pt-1.5 text-[10px] text-neutral-700">
        <div>
          <span className="text-blue-400">蓝</span> = 本页要练的 ·{" "}
          <span className="text-neutral-500">灰</span> = 原生等价写法,只作对照
        </div>
        {WIN_KEYS.filter((k) => k.skip).map((k) => (
          <div key={k.key} className="mt-0.5">
            <code>{k.key}</code> 不练 —— {k.skip}
          </div>
        ))}
        <Provenance>
          键位实测自 <code>nvim_get_keymap("n")</code>。lhs 原文带前导空格(leader 是
          <code>&lt;Space&gt;</code>),所以 <code>&lt;Space&gt;wd</code> 在原文里是{" "}
          <code> wd</code>。hydra 入口实测是 <code>&lt;C-W&gt;&lt;Space&gt;</code>;
          headless 下进不去面板,leader 那一列按你口述收录,未由我实测。
        </Provenance>
      </div>
    </div>
  );
}

function Stage({
  pos,
  focus,
}: {
  pos: Map<number, { r0: number; r1: number; c0: number; c1: number }>;
  focus: number;
}) {
  return (
    <div className="relative w-full rounded bg-neutral-950" style={{ height: 150 }}>
      {[...pos.entries()].map(([id, p]) => {
        const isF = id === focus;
        return (
          <div
            key={id}
            className={`absolute flex items-center justify-center border text-[10px] ${
              isF ? "border-blue-500 bg-blue-950 text-blue-200" : "border-neutral-800 bg-neutral-900 text-neutral-500"
            }`}
            style={{
              left: `${p.c0 * 100}%`,
              top: `${p.r0 * 100}%`,
              width: `${(p.c1 - p.c0) * 100}%`,
              height: `${(p.r1 - p.r0) * 100}%`,
            }}
          >
            {isF ? "焦点" : id}
          </div>
        );
      })}
    </div>
  );
}