"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BUF_TASKS,
  stateFrom,
  applyBufKey,
  count,
  current,
  type BufState,
  type BufTask,
} from "@/lib/bufs";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, NO_EFFECT, useDrill } from "@/lib/use-drill";
import { COMMANDS } from "@/lib/bindings";
import { taskIdOf } from "@/lib/task-id";
import { formatMs } from "@/lib/session";
import {
  FlashLine,
  KeyLog,
  KeySequence,
  SolutionDetail,
  PendingHint,
  Provenance,
  DrillFlow,
  TaskBar,
  TaskBox,
  streakOf,
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
 *
 * ## 解法不再来自手写表
 *
 * 旧版用 `SOLUTIONS[t.key].seqs`（lib/bufs.ts 里的手写表）。
 * 那张表实测**既多又少**：它把 `<Space>bb` 当成 `L` 的等价解，
 * 但两者 rhs 不同（`<Cmd>e #<CR>` vs `<Cmd>BufferLineCycleNext<CR>`），
 * 是两条不同的命令。
 *
 * 现在解法来自 `COMMANDS`（build 阶段按 rhs 聚合，见 scripts/build-dataset.mjs），
 * 按 **desc** 把题目对到命令上。
 */
const CMD_BY_DESC = new Map(COMMANDS.map((c) => [c.desc, c]));

/**
 * 题目 key → 数据集里的命令。
 *
 * ## ⚠️⚠️ 匹配顺序不能反
 *
 * 我第一版先试 `` `<Space>${t.key}` `` 再试 `t.key`，于是：
 *
 * ```
 * BUF_TASKS[0].key = "L"        （「下一个 buffer」，单键）
 * 先试 "<Space>L"  → 命中！
 * ```
 *
 * 而数据集里**真的有一个 `<Space>L`** —— 它是
 * **「LazyVim Changelog」**，跟「下一个 buffer」完全是两回事。
 *
 * 后果：`/buffers` 第 1 题变成练「看更新日志」，而且**不报错** ——
 * 界面上只是题面看着有点怪。这类「匹配到错的但看起来正常」的 bug
 * 是最难发现的，所以顺序必须**先精确、再退化**。
 *
 * 判据：题目 key 里已经带了 `<Space>` 的（如 `bd` 对应 `<Space>bd`），
 * 和裸键（如 `L`）要分开处理，不能一律加前缀。
 */
function commandFor(t: BufTask) {
  const bare = t.key; // "L" / "H" / "]B"
  const withLeader = `<Space>${t.key}`; // "<Space>bd"

  // 1. 精确匹配题目 key 本身（裸键走这条）
  const exact = COMMANDS.find((c) => c.display === bare);
  // 2. 再试带 leader 的（`bd` → `<Space>bd`）
  const led = COMMANDS.find((c) => c.display === withLeader);

  /**
   * ⚠️ 两条都命中时，**按 desc 判谁对**。
   *
   * `L` 和 `<Space>L` 都存在，靠 key 分不出来 —— 但 desc 能：
   * 题目说「切到下一个 buffer」，而 `<Space>L` 是「LazyVim Changelog」。
   */
  if (exact && led) {
    const want = t.desc;
    const hitExact = descMatches(exact.desc, want);
    const hitLed = descMatches(led.desc, want);
    if (hitLed && !hitExact) return led;
    if (hitExact && !hitLed) return exact;
  }

  return exact ?? led ?? CMD_BY_DESC.get(t.desc) ?? null;
}

/**
 * 命令的英文 desc 和题目的中文 desc 对不对得上。
 *
 * 数据集里是英文（`Next Buffer`），题库里是中文（`切到下一个 buffer`），
 * 所以只能靠关键词粗判 —— 这里**不是精确判据**，只用来在
 * 「两条都命中」时挑一个，判不出来就保持原顺序（更保守）。
 */
function descMatches(cmdDesc: string, taskDesc: string): boolean {
  const d = cmdDesc.toLowerCase();
  if (taskDesc.includes("下一个") && d.includes("next")) return true;
  if (taskDesc.includes("上一个") && d.includes("prev")) return true;
  if (taskDesc.includes("关闭") && d.includes("delete")) return true;
  if (taskDesc.includes("只留") && d.includes("other")) return true;
  if (taskDesc.includes("标记") && d.includes("pin")) return true;
  if (taskDesc.includes("挪") && d.includes("move")) return true;
  if (taskDesc.includes("清理") && d.includes("invisible")) return true;
  return false;
}

const TASKS: DrillTask[] = BUF_TASKS.map((t, i) => {
  const cmd = commandFor(t);
  /**
   * ⚠️ 用**全局 id**（lib/task-id.ts）—— 让同一条命令在 `/buffers`
   * 和 `/seq` 共享同一条进度。
   *
   * 但 BUF_TASKS 里有两道题的 key 都是 `L`（故意考「从末尾切回第一个
   * 会绕回」），起始状态不同、是两道题。所以**只在真的有重复时**
   * 才加后缀，其余保持全局 id 以便跨板块共享。
   */
  const dupCount = BUF_TASKS.filter((x) => x.key === t.key).length;
  const id = taskIdOf("buffers", cmd?.display ?? `<Space>${t.key}`, dupCount > 1 ? i : undefined);
  // 最优解 + 次解。没有对应命令时退回手写表的主键，保证题目仍可做
  const accept = cmd
    ? [[...splitSeq(cmd.display)], ...cmd.alternates.map((a) => [...splitSeq(a)])]
    : [[...splitSeq(`<Space>${t.key}`)]];
  return {
    id,
    short: t.key,
    desc: t.desc,
    accept,
  };
});

/** Vim 记法 → 逐键数组。`<Space>bd` → ["<Space>","b","d"] */
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

/** DrillTask.id → 原题(BUF_TASKS 那一项),init/apply 要用 */
const TASK_OF = new Map<string, BufTask>(TASKS.map((t, i) => [t.id, BUF_TASKS[i]]));
/** DrillTask.id → 数据集里的命令（取 native / 等价信息用） */
const CMD_OF = new Map<string, (typeof COMMANDS)[number] | null>(
  TASKS.map((t, i) => [t.id, commandFor(BUF_TASKS[i])]),
);

export default function BufferDrillInner() {
  const router = useRouter();
  const init = useCallback((t: DrillTask) => stateFrom(TASK_OF.get(t.id)!), []);

  const apply = useCallback((_seq: string[], s: BufState, t: DrillTask) => {
    // ⚠️ apply 收的是**命中的那条解法**，但操作由题目组的主键决定 ——
    //   同一组的两条解法（L / ]b）rhs 相同，底层就是同一条命令。
    // applyBufKey 返回 null = 这一族模型不了（比如按键弹 UI），
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
  const cmd = CMD_OF.get(d.task.id) ?? null;
  /** 本题最优解，逐键 */
  const bestKeys = d.task.accept[0] ?? [];

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
      onRetryMistakes={() =>
        d.restart(d.session.results.filter((r) => !r.ok).map((r) => r.taskId))
      }
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

      {/* 题目区：只给题面 + 逐键上色，不再列答案 */}
      <TaskBox>
        <div className="text-neutral-300">{d.task.desc}</div>

        {/*
          ⚠️ 这里不再无条件渲染 AcceptList。
          逐键上色才是主要反馈 —— 按一个键变一次色。
          AcceptList 挪到「按 ? 看解法」的提示之后（本轮先不做展开，
          因为数据已经就位，UI 展开留到阶段 4）。
        */}
        <div className="mt-3">
          <KeySequence keys={d.shownKeys} feed={d.keyFeed} />
        </div>

        <PendingHint pending={d.pending} />
        {cmd && (
          <SolutionDetail
            best={cmd.display}
            alternates={cmd.alternates}
            equivBy={cmd.equivBy}
            native={cmd.native}
            nativeVerified={cmd.nativeVerified}
            warn={LOOKALIKE[want]}
          />
        )}
      </TaskBox>

      <BufLine s={d.state} />

      <KeyLog log={d.log} hint="按上面那条解法 —— 每个键会立刻上色" />
      <FlashLine flash={d.flash} />

      <Provenance>
        解法按 <b>rhs 聚合</b> <code>nvim_get_keymap</code> 得出：rhs 相同 = 底层执行同一条命令，
        所以是实测的同义键，不是猜的。
      </Provenance>
    </DrillFlow>
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