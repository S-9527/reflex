"use client";

import { useCallback } from "react";
import {
  TAB_TASKS,
  stateFrom,
  applyTabKey,
  count,
  SOLUTIONS,
  type TabState,
} from "@/lib/tabs";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, NO_EFFECT, useDrill } from "@/lib/use-drill";
import {
  AcceptList,
  FlashLine,
  KeyLog,
  NativeRef,
  PendingHint,
  Provenance,
  TaskBar,
  TaskBox,
} from "@/lib/drill-ui";

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

const TASKS: DrillTask[] = TAB_TASKS.map((t, i) => ({
  id: `${t.key}#${i}`,
  short: t.key,
  desc: t.desc,
  accept: SOLUTIONS[t.key]?.seqs ?? [],
}));
const TASK_OF = new Map<string, (typeof TAB_TASKS)[number]>(
  TAB_TASKS.map((t, i) => [`${t.key}#${i}`, t]),
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
    advanceMs: 1500,
    noEffectText: (seq) => `${seq.join("")} 按了但状态没变(已经在边界上了)`,
  });

  const want = TASK_OF.get(d.task.id)!.key;

  return (
    <div className="space-y-4">
      <TaskBar
        tasks={TASKS}
        current={d.taskIndex}
        solved={d.solved}
        solvedAll={d.solvedAll}
        onClear={d.clearProgress}
        onPick={d.setTaskIndex}
        onReset={d.reset}
        labelOf={label}
      />

      {/* 题目区:全部解法 + Vim 原生参考 */}
      <TaskBox>
        <div className="text-neutral-300">{d.task.desc}</div>
        <AcceptList task={d.task} />
        <NativeRef native={SOLUTIONS[want]?.native} note={SOLUTIONS[want]?.note} />
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
        原生 Ex 命令逐条在真 nvim 里feedkeys 验过;
        <code>:tn</code> / <code>:tl</code> 在本机<b>不生效</b>,所以没写进去。
      </Provenance>
    </div>
  );
}