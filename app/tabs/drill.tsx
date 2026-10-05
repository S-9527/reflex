"use client";

import { useCallback } from "react";
import { TAB_TASKS, stateFrom, applyTabKey, count, type TabState } from "@/lib/tabs";
import { COMMANDS } from "@/lib/bindings";
import { taskIdOf } from "@/lib/task-id";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, NO_EFFECT, useDrill } from "@/lib/use-drill";
import {
  DrillFlow,
  FlashLine,
  KeyLog,
  KeySequence,
  SolutionDetail,
  PendingHint,
  Provenance,
  TaskBar,
  TaskBox,
  streakOf,
} from "@/lib/drill-ui";
import { formatMs } from "@/lib/session";

/**
 * 标签页练习 —— 把 tab 画成一条带子。
 *
 * ## 和 buffer 页的区别
 *
 * buffer 是「哪些文件开着」,tab 是「有几组窗口」。
 * 所以这里画的是标签条,每格标注窗口数;
 * `<Tab>d` 关掉的是**整个标签页**(连带里面所有窗口),
 * 这一点和 `<Space>bd` 关单个 buffer 完全不同。
 *
 * ## 一个容易记错的点
 *
 * `<Tab>]` 到最后一个就**停**,不会绕回第一个;
 * 而 buffer 的 `<Space>bb` 是**会绕回**的。
 * 两个都练了,就是为了让这个差别显出来。
 *
 * ## ⚠️ <Tab> 记法
 *
 * 浏览器里 `<Tab>` 的 key 是 `"Tab"`(没尖括号),直接拼会得到
 * `"<Tab>Tab"` —— 查表必然 miss。实测踩过:「新开标签页」那题永远报
 * 「不在这一页的范围里」。转换在 defaultToPanelKey 里。
 */

/** ⚠️ 按钮上把 <Tab> 去掉,只留面板键 —— 一格显示得下 */
const label = (t: DrillTask) => t.short.replace("<Tab>", "");

/**
 * ⚠️ 解法不再来自手写表（`lib/tabs.ts` 的 `SOLUTIONS`）。
 *
 * 那张表把键写成了 `<Tab>d` —— **漏了 leader 前缀**，
 * 而本机实测的真实 lhs 是 `<Space><Tab>d`（`nvim_get_keymap` 原文，
 * leader 是一个真实空格）。少一个 `<Space>` 就意味着训练器教的键
 * 在真 nvim 里按不出来。
 *
 * 现在从 `COMMANDS` 取（build 阶段按 rhs 聚合，见 scripts/build-dataset.mjs）：
 * 键位、次解、原生 Ex 全部是实测数据。
 */
const CMD_BY_DISPLAY = new Map(COMMANDS.map((c) => [c.display, c]));

/** 题目 key（`<Tab>d`）→ 数据集里的完整键（`<Space><Tab>d`） */
function commandFor(t: (typeof TAB_TASKS)[number]) {
  return CMD_BY_DISPLAY.get(`<Space>${t.key}`) ?? CMD_BY_DISPLAY.get(t.key) ?? null;
}

/** Vim 记法 → 逐键数组 */
function splitSeq(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "<") {
      const end = s.indexOf(">", i);
      if (end > i) {
        out.push(s.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    out.push(s[i]);
    i++;
  }
  return out;
}

const TASKS: DrillTask[] = TAB_TASKS.map((t, i) => {
  const cmd = commandFor(t);
  const accept = cmd
    ? [[...splitSeq(cmd.display)], ...cmd.alternates.map((a) => [...splitSeq(a)])]
    : [[...splitSeq(t.key)]];
  return {
    // ⚠️ 全局 id —— 同一条命令在 /seq 里练过就不重复记（见 lib/task-id.ts）
    id: taskIdOf("tabs", cmd?.display ?? t.key),
    short: t.key,
    desc: t.desc,
    accept,
  };
});

const TASK_OF = new Map<string, (typeof TAB_TASKS)[number]>(
  TASKS.map((t, i) => [t.id, TAB_TASKS[i]]),
);
/** DrillTask.id → 数据集里的命令（取 native / 等价信息用） */
const CMD_OF = new Map<string, (typeof COMMANDS)[number] | null>(
  TASKS.map((t, i) => [t.id, commandFor(TAB_TASKS[i])]),
);

export default function TabDrill() {
  const init = useCallback((t: DrillTask) => stateFrom(TASK_OF.get(t.id)!), []);

  const apply = useCallback((_seq: string[], s: TabState, t: DrillTask) => {
    return applyTabKey(TASK_OF.get(t.id)!.key, s) ?? NO_EFFECT;
  }, []);

  const d = useDrill<TabState>({
    boardId: "tabs",
    tasks: TASKS,
    init,
    apply,
    toPanelKey: defaultToPanelKey,
    noEffectText: (seq) => `${seq.join("")} 按了但状态没变(已经在边界上了)`,
  });

  const cmd = CMD_OF.get(d.task.id) ?? null;

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
        labelOf={label}
      />

      {/* 题目区:全部解法 + Vim 原生参考 */}
      <TaskBox>
        <div className="text-neutral-300">{d.task.desc}</div>
        {/* 逐键上色取代了常驻的解法列表 */}
        <div className="mt-3">
          <KeySequence keys={d.shownKeys} feed={d.keyFeed} />
        </div>
        {cmd && (
          <SolutionDetail
            best={cmd.display}
            alternates={cmd.alternates}
            equivBy={cmd.equivBy}
            native={cmd.native}
            nativeVerified={cmd.nativeVerified}
          />
        )}
        <PendingHint pending={d.pending} />
      </TaskBox>

      {/* 标签条 */}
      <div className="rounded bg-neutral-950 p-3">
        <div className="mb-1.5 text-[10px] text-neutral-700">
          共 {count(d.state)} 个标签页 · 每格数字 = 里面几个窗口
        </div>
        <div className="flex flex-wrap gap-1">
          {d.state.tabs.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 rounded border px-3 py-1.5 text-[11px] ${
                i === d.state.cur
                  ? "border-blue-500 bg-blue-950 text-blue-100"
                  : "border-neutral-700 bg-neutral-900 text-neutral-500"
              }`}
            >
              <span className="font-bold">{i + 1}</span>
              <span className="text-neutral-600">{t.wins} 窗口</span>
              {i === d.state.cur && <span className="text-[10px] text-blue-400">当前</span>}
            </div>
          ))}
        </div>
      </div>

      <KeyLog
        log={d.log}
        hint={
          <>
            按 <kbd className="rounded bg-neutral-800 px-1">&lt;Tab&gt;</kbd> 然后面板上的键,两下
          </>
        }
      />
      <FlashLine flash={d.flash} />

      <Provenance>
        键位按 <b>rhs 聚合</b> <code>nvim_get_keymap("n")</code> 得出 —— tab 这七个操作
        每个 rhs 下面都只有<b>一个</b>键,所以没有同义键可挑,不像 buffer 那边。
        原生 Ex 命令逐条在真 nvim 里 feedkeys 验过;
        <code>:tn</code> / <code>:tl</code> 在本机<b>不生效</b>,所以没写进去。
        <br />
        ⚠️ 另一个实测差别:<code>:tabnext</code> 在末尾<b>会绕回第一个</b>(实测 cur 4→1),
        而键位 <code>&lt;Tab&gt;]</code> 是<b>到头就停</b>。同一件事,两种行为。
      </Provenance>
    </DrillFlow>
  );
}
