"use client";

import { useCallback } from "react";
import {
  BUF_TASKS,
  stateFrom,
  applyBufKey,
  count,
  current,
  SOLUTIONS,
  type BufState,
  type BufTask,
} from "@/lib/bufs";
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
 * 缓冲区练习 —— 把 buffer 列表当一条带子画出来。
 *
 * ## 为什么是「带子」而不是窗口
 *
 * buffer 在真 vim 里就是 buffer line:一条横排。
 * 而 `<Space>b` 那一族键几乎全是「在这条带子上删/移/标」——
 * 删左边的、删右边的、只留当前、清掉看不见的、删未固定的。
 * 带子模型直接对应这个心智,练的就是「看带子 → 按对应键」。
 *
 * ## 判分
 *
 * 要求**状态真的变了**才算过。键按对了但没东西可删(比如 `bl` 而当前
 * 已在最左)会明确提示,而不是静默吞掉 —— 这类"按了没反应"是最难查的。
 *
 * ## 输入链路已换成公共引擎(lib/use-drill.ts)
 *
 * 换之前这页自己抄了一份 leader 状态机 + 三态匹配。和另外三页不一致,
 * 这轮所有 bug(leader 三键失效 / `<Tab>` 查不到 / `/text` 键盘死掉)
 * 都出在"同一个概念四份实现"。判据现在只有 lib/drill.ts 一份。
 */

/**
 * ⚠️ 容易记混的一对,每题都提醒一次:
 *   裸 `H` / `L`      → 换 buffer(BufferLineCyclePrev/Next,实测)
 *   `<C-H>` / `<C-L>` → 跳窗口(<C-W>h / <C-W>l,实测)
 * 长得几乎一样,按错后果完全不同。
 */
const LOOKALIKE: Record<string, string> = {
  H: "别和 <C-H> 搞混:那个是跳到左边窗口",
  L: "别和 <C-L> 搞混:那个是跳到右边窗口",
};

/**
 * ⚠️ BUF_TASKS 里有两题的 key 都是 "L"(下一题故意考绕回),
 * 所以 id 必须另给 —— 用它做 React key 会撞重复 key 报错。
 */
const TASKS: DrillTask[] = BUF_TASKS.map((t, i) => ({
  id: `${t.key}#${i}`,
  short: t.key,
  desc: t.desc,
  accept: SOLUTIONS[t.key]?.seqs ?? [],
}));
/** DrillTask.id → 原题(BUF_TASKS 那一项),init/apply 要用 */
const TASK_OF = new Map<string, BufTask>(BUF_TASKS.map((t, i) => [`${t.key}#${i}`, t]));

export default function BufferDrillInner() {
  const init = useCallback((t: DrillTask) => stateFrom(TASK_OF.get(t.id)!), []);

  const apply = useCallback((_seq: string[], s: BufState, t: DrillTask) => {
    // ⚠️ apply 收的是**命中的那条解法**,但操作由 SOLUTIONS 的主键决定 ——
    //   同一组的四条解法(L / ]b / <Space>bb / <Space>b`)底层是同一条命令。
    // applyBufKey 返回 null = 这一族模型不了(比如按键弹 UI),
    // 翻译成 NO_EFFECT 交给引擎提示。
    return applyBufKey(TASK_OF.get(t.id)!.key, s) ?? NO_EFFECT;
  }, []);

  const d = useDrill<BufState>({
    boardId: "buffers",
    tasks: TASKS,
    init,
    apply,
    toPanelKey: defaultToPanelKey,
    noEffectText: (seq) => `${seq.join("")} 按了但状态没变(当前没有可操作的对象)`,
  });

  const want = TASK_OF.get(d.task.id)!.key;
  const cur = current(d.state);

  return (
    <div className="space-y-4">
      <TaskBar
        tasks={TASKS}
        current={d.taskIndex}
        solved={d.solved}
        onPick={d.setTaskIndex}
        onReset={d.reset}
      />

      {/* 题目区:列出这道题的全部解法,按哪条都算过 */}
      <TaskBox>
        <div className="text-neutral-300">{d.task.desc}</div>
        <AcceptList task={d.task} />
        <NativeRef native={SOLUTIONS[want]?.native} note={SOLUTIONS[want]?.note} warn={LOOKALIKE[want]} />
        <PendingHint pending={d.pending} />
      </TaskBox>

      <BufLine s={d.state} />

      <KeyLog log={d.log} hint="按上面任意一条解法 —— 哪条都快" />
      <FlashLine flash={d.flash} />

      <Provenance>
        解法表按 <b>rhs 聚合</b> <code>nvim_get_keymap("n")</code> 得出:rhs 相同 = 底层执行同一条命令,
        所以是实测的同义键,不是猜的。
        <code>bj</code> / <code>?</code> 弹 UI,不在这个模型里。
      </Provenance>
    </div>
  );
}

/** 画 buffer 带子 */
function BufLine({ s }: { s: BufState }) {
  const cur = current(s);
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-3 text-[10px] text-neutral-700">
        <span>共 {count(s)} 个 buffer</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />当前
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-neutral-600" />看不见
        </span>
        <span>P = 已固定</span>
      </div>
      {s.bufs.length === 0 ? (
        <div className="py-4 text-center text-xs text-neutral-700">(空)</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {s.bufs.map((b) => {
            const isCur = b.id === s.cur;
            return (
              <div
                key={b.id}
                className={`rounded border px-2 py-1 text-[11px] ${
                  isCur
                    ? "border-blue-500 bg-blue-950 text-blue-100"
                    : b.visible
                      ? "border-neutral-700 bg-neutral-900 text-neutral-400"
                      : "border-neutral-800 bg-neutral-900 text-neutral-600"
                }`}
              >
                {b.name}
                {b.pinned && <span className="ml-1 font-bold text-amber-400">P</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 text-[10px] text-neutral-600">
        当前:{cur ? cur.name : "(无)"} · 左边 {s.bufs.filter((b) => b.id < s.cur).length} 个 · 右边{" "}
        {s.bufs.filter((b) => b.id > s.cur).length} 个
      </div>
    </div>
  );
}