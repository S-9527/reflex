"use client";

/**
 * 练习页的公共 UI 片段。
 *
 * 这几个组件存在的意义不是「省代码」,是**让五个板块长得一样**。
 * 之前每页各写一遍题目区/反馈区,结果 `<Tab>` 那一页的解法列表
 * 标签写着「键位」、buffer 那一页写着「任选」,同一个意思两种说法 ——
 * 用户要重新适应每换一页就换一套 UI。
 */

import type { DrillTask } from "@/lib/drill";
import { HINT_LABEL, MODE_HINT, MODE_LABEL } from "@/lib/hints";
import type { Flash } from "./use-drill";

/**
 * 顶部的题号按钮条。
 *
 * `solvedAll` 是跨会话做过的（题 id）—— 让按钮在**一打开页面**就是绿的。
 *
 * ## ⚠️ 不再有 `solved`（本次会话的下标数组）
 *
 * 旧版用 `solved: number[]` 记「本次会话解开了哪几题」，靠 `advanceMs`
 * 定时器逐题推进。现在改成了**会话游标**（lib/session.ts）：
 * 做题顺序是会话的 `queue`，进度是 `results.length`。
 * 所以按钮条只需要「跨会话做过」这一个状态。
 */
export function TaskBar({
  tasks,
  current,
  solvedAll = [],
  onPick,
  onReset,
  onClear,
  labelOf,
}: {
  tasks: DrillTask[];
  current: number;
  solvedAll?: string[];
  onPick: (i: number) => void;
  onReset: () => void;
  /** 清掉跨会话进度。不给就不显示这个按钮 */
  onClear?: () => void;
  labelOf?: (t: DrillTask) => string;
}) {
  const done = (id: string) => solvedAll.includes(id);
  return (
    <div className="flex flex-wrap gap-1.5">
      {tasks.map((t, i) => (
        <button
          key={t.id}
          data-task={t.id}
          onClick={() => onPick(i)}
          className={`rounded border px-2 py-0.5 text-xs ${
            i === current
              ? "border-blue-400 bg-blue-400 text-black"
              : done(t.id)
                ? "border-green-800 text-green-500"
                : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          {done(t.id) && i !== current ? "✓ " : ""}
          {labelOf ? labelOf(t) : t.short}
        </button>
      ))}
      <button
        onClick={onReset}
        className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800"
      >
        重来
      </button>
      {onClear && (
        <button
          onClick={onClear}
          className="rounded border border-neutral-800 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-800"
          title="清掉这个板块的进度(localStorage)"
        >
          清进度
        </button>
      )}
    </div>
  );
}

/**
 * 一道题的全部解法。
 *
 * 统一写成「任选 / 或」—— 因为同一件事本机往往有多个等价键,
 * 按哪条都算过。写死「键位」会让人以为只能按第一条。
 */
export function AcceptList({ task }: { task: DrillTask }) {
  return (
    <div className="mt-1.5 space-y-1">
      {task.accept.map((seq, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="w-8 shrink-0 text-[10px] text-neutral-700">{i === 0 ? "任选" : "或"}</span>
          {seq.map((k, j) => (
            <kbd key={j} className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">
              {k}
            </kbd>
          ))}
        </div>
      ))}
      {task.accept.length === 0 && (
        <div className="text-neutral-700">这一题没有对应的键位解法</div>
      )}
    </div>
  );
}

/** Vim 原生 Ex 参考 + 备注 + 易混键提醒 */
export function NativeRef({
  native,
  note,
  warn,
  noteClass = "text-amber-500/90",
}: {
  native?: string;
  note?: string;
  warn?: string;
  noteClass?: string;
}) {
  if (!native && !note && !warn) return null;
  return (
    <>
      {native && (
        <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
          <span className="w-8 shrink-0 text-neutral-700">原生</span>
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{native}</code>
          <span className="text-neutral-700">Ex 命令,本机实测过;它没绑键,要手打 :</span>
        </div>
      )}
      {note && <div className={`mt-1 text-[11px] ${noteClass}`}>⚠ {note}</div>}
      {warn && <div className="mt-1 text-[11px] text-amber-500/90">⚠ {warn}</div>}
    </>
  );
}

/** 「等下一个键…」提示 —— 序列中间的可见反馈 */
export function PendingHint({ pending }: { pending: string | null }) {
  if (!pending) return null;
  return (
    <div data-pending={pending} className="mt-1 text-[11px] text-amber-300">
      等下一个键… {pending}
    </div>
  );
}

/** 已按下的键。hint 允许 JSX —— 有的板块要显示 <kbd> */
export function KeyLog({ log, hint }: { log: string[]; hint?: React.ReactNode }) {
  return (
    <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
      {log.length === 0 ? (
        <span className="text-neutral-700">{hint ?? "按上面任意一条解法"}</span>
      ) : (
        log.map((k, i) => (
          <span key={i} data-keylog={i} className="rounded bg-neutral-800 px-1 text-blue-300">
            {k}
          </span>
        ))
      )}
    </div>
  );
}

/** 判分反馈 */
export function FlashLine({ flash }: { flash: Flash | null }) {
  if (!flash) return null;
  return (
    <div data-flash={flash.ok ? "ok" : "bad"} className={`text-xs ${flash.ok ? "text-green-400" : "text-red-400"}`}>
      {flash.text}
    </div>
  );
}

/** 题目区的外框 —— 统一视觉 */
export function TaskBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
      {children}
    </div>
  );
}

/** 页面底部那句「数据从哪来」 */
export function Provenance({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] leading-relaxed text-neutral-700">{children}</div>;
}
/* ─────────────────────────── qwerty 式打字流的三个新组件 ─────────────────────────── */

/**
 * 会话进度条 —— 实时数据条。
 *
 * Qwerty Learner 让人一练一小时，靠的就是这条一直在跳的数据：
 * 进度、正确率、速度、连击。旧版只有静态的「已掌握 n」。
 */
export function SessionBar({
  cursor,
  total,
  accuracy,
  keysPerMin,
  streak,
}: {
  cursor: number;
  total: number;
  accuracy: number;
  keysPerMin: number;
  streak: number;
}) {
  const pct = total > 0 ? Math.min(100, (cursor / total) * 100) : 0;
  return (
    <div data-session-bar className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-neutral-400">
          第 <b className="text-neutral-200">{Math.min(cursor + 1, total)}</b>
          <span className="text-neutral-600"> / {total}</span>
        </span>
        <span className="flex gap-3 text-neutral-500">
          <span>
            正确率{" "}
            <b className={accuracy >= 0.9 ? "text-green-400" : "text-amber-400"}>
              {Math.round(accuracy * 100)}%
            </b>
          </span>
          <span>
            <b className="text-blue-300">{keysPerMin}</b> 键/分
          </span>
          {streak > 0 && <span className="text-amber-400">×{streak}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
        <div
          className="h-full bg-blue-500 transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 逐键上色 —— qwerty 式的核心反馈。
 *
 * 每一键按下去立刻上色：绿 = 对，红 = 错。
 * 这是本版相对旧版最重要的改动 —— 旧版只在整串结束时判一次，
 * 而且 `prefix` 分支是静默收下的，用户看不到「这一键对了」。
 */
export function KeySequence({
  keys,
  feed,
}: {
  /**
   * 每个格子显示什么。
   *
   * ⚠️ 这个数组**已经由引擎按模式/提示级别算好了**（`useDrill.shownKeys`）：
   *
   * - 跟打模式 → 全部是真键
   * - 默写模式 0 级 → 全是 `null`（空格子）
   * - 默写模式 1 级 → 首键 + 其余 `null`
   * - 默写模式 2 级 → 首键 + 其余 `"·"`（键数可见）
   * - 默写模式 3 级 → 全部真键
   *
   * 这样「显示什么」和「按了什么」是正交的两件事，
   * 组件本身不需要知道模式是什么 —— 判据在 lib/hints.ts，有单测。
   */
  keys: (string | null)[];
  /** 逐键反馈（按过的键） */
  feed: { index: number; key: string; ok: boolean }[];
}) {
  return (
    <div data-key-seq className="flex flex-wrap items-center gap-2">
      {keys.map((k, i) => {
        const f = feed.find((x) => x.index === i);
        const cls = f
          ? f.ok
            ? "border-green-600 bg-green-950 text-green-300"
            : "border-red-600 bg-red-950 text-red-300"
          : "border-neutral-700 bg-neutral-900 text-neutral-500";
        return (
          <span key={i} className="flex items-center gap-1">
            <kbd
              data-key={i}
              data-ok={f ? String(f.ok) : undefined}
              data-hidden={!f && k === null ? "1" : undefined}
              className={`rounded border px-2 py-1 font-mono text-sm ${cls}`}
            >
              {/*
                已按下的键优先显示**实际按的键**（而不是应显示的）——
                按错时要让用户看见自己按了什么。
                没按过则显示引擎给的内容；null 是空格子。
              */}
              {f ? f.key : (k ?? "＿")}
            </kbd>
            {f && !f.ok && <span className="text-[10px] text-red-400">✗</span>}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 模式切换 + 提示按钮 —— 练习页顶部的一条。
 *
 * ## ⚠️ 为什么模式切换放在这里而不是设置页
 *
 * 学新键和巩固旧键是**交替发生**的：遇到不会的族想切跟打看一眼，
 * 会了就切回默写。藏在设置里等于每次都要跳出去。
 */
export function ModeBar({
  mode,
  onMode,
  hint,
  canHint,
  onHint,
}: {
  mode: "drill" | "recall";
  onMode: (m: "drill" | "recall") => void;
  hint: number;
  canHint: boolean;
  onHint: () => void;
}) {
  return (
    <div data-mode-bar className="flex flex-wrap items-center gap-2 text-[11px]">
      <div className="flex overflow-hidden rounded border border-neutral-700">
        {(["drill", "recall"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            data-mode={m}
            data-active={mode === m ? "1" : undefined}
            title={MODE_HINT[m]}
            className={`px-2.5 py-1 ${
              mode === m
                ? "bg-blue-500 text-black"
                : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === "drill" && <span className="text-neutral-600">照着按 · 不计入熟练度</span>}

      {mode === "recall" && canHint && (
        <button
          onClick={onHint}
          data-hint-level={hint}
          className={`ml-auto rounded border px-2.5 py-1 ${
            hint === 0
              ? "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
              : "border-amber-700 text-amber-400 hover:bg-amber-950/40"
          }`}
        >
          {HINT_LABEL[hint as 0 | 1 | 2 | 3]}
        </button>
      )}
    </div>
  );
}

/**
 * 会话结算屏 —— 旧版**完全缺失**的一屏。
 *
 * 没有它，练完一轮没有任何「完成感」，也没有「再来一轮」的入口 ——
 * 用户只能一直按「下一题」，永远停不下来。
 */
export function SummaryScreen({
  summary,
  onRetry,
  onRetryMistakes,
  onExit,
  formatMs,
  descOf,
}: {
  summary: {
    total: number;
    correct: number;
    wrong: number;
    /**
     * 其中「独立答对」—— 没用提示、且在默写模式下。
     *
     * ⚠️ 这个数比 `correct` 有意义得多：`correct` 是「按键对了」，
     *    它才是「真的记住了」。跟打模式或按提示抄对的都不算。
     */
    independent: number;
    accuracy: number;
    elapsedMs: number;
    keysPerMin: number;
    mistakes: { taskId: string; wrongKey?: string }[];
  };
  /** 错题的展示信息（题 id → 描述） */
  descOf: (taskId: string) => string;
  onRetry: () => void;
  onRetryMistakes: () => void;
  onExit?: () => void;
  formatMs: (ms: number) => string;
}) {
  const pct = Math.round(summary.accuracy * 100);
  return (
    <div data-summary className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
      <h2 className="text-lg font-bold text-neutral-200">本轮完成</h2>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-neutral-400">
        <span>
          <b className="text-neutral-200">{summary.total}</b> 题
        </span>
        <span>
          正确 <b className="text-green-400">{summary.correct}</b>
        </span>
        {/*
          ⚠️ 「独立答对」单独显示 —— 它是真正有意义的那个数。
          `correct` 含「跟打模式照抄的」和「按提示抄的」，
          而 independent 只算默写模式下没看提示就答对的。
        */}
        <span title="没用提示、在默写模式下答对的题数 —— 这才是真的记住了">
          独立答对 <b className="text-blue-300">{summary.independent}</b>
        </span>
        <span>
          错误{" "}
          <b className={summary.wrong > 0 ? "text-red-400" : "text-neutral-600"}>{summary.wrong}</b>
        </span>
        <span>
          正确率 <b className={pct >= 90 ? "text-green-400" : "text-amber-400"}>{pct}%</b>
        </span>
        <span>
          <b className="text-blue-300">{summary.keysPerMin}</b> 键/分
        </span>
        <span>
          用时 <b className="text-neutral-300">{formatMs(summary.elapsedMs)}</b>
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>

      {summary.mistakes.length > 0 && (
        <div className="mt-4 border-t border-neutral-800 pt-3">
          <div className="mb-1.5 text-[11px] text-neutral-600">需要再看一眼</div>
          <div className="space-y-1 text-[11px]">
            {summary.mistakes.map((m, i) => (
              <div key={`${m.taskId}-${i}`} className="flex items-baseline gap-2">
                <span className="truncate text-neutral-400">{descOf(m.taskId)}</span>
                {m.wrongKey && (
                  <span className="shrink-0 text-red-400/80">你按了 {m.wrongKey}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <button
          onClick={onRetry}
          className="rounded border border-blue-500 bg-blue-500/15 px-3 py-1.5 text-blue-300 hover:bg-blue-500/25"
        >
          再来一轮
        </button>
        {summary.mistakes.length > 0 && (
          <button
            onClick={onRetryMistakes}
            className="rounded border border-amber-700 px-3 py-1.5 text-amber-400 hover:bg-amber-950/40"
          >
            只练错题({summary.mistakes.length})
          </button>
        )}
        {onExit && (
          <button
            onClick={onExit}
            className="rounded border border-neutral-700 px-3 py-1.5 text-neutral-400 hover:bg-neutral-800"
          >
            回首页
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 会话外壳 —— 把「进度条 → 题目区 → 结算屏」这套骨架收在一处。
 *
 * ## 为什么要有它
 *
 * 6 个板块都要「顶部数据条 + 底部结算屏」，如果各写一遍，
 * 就会出现「`/tabs` 的进度条写了、`/files` 的忘了」这种事 ——
 * 这个项目已经因为「同一个概念抄四遍」吃过太多次亏
 * （见 lib/drill.ts 顶部那张 bug 表）。
 *
 * 所以骨架只有一份，各板块只管往里塞自己的题目区与可视化。
 */
export function DrillFlow({
  cursor,
  total,
  accuracy,
  keysPerMin,
  streak,
  done,
  summary,
  descOf,
  onRetry,
  onRetryMistakes,
  onExit,
  formatMs,
  mode,
  onMode,
  hint,
  canHint,
  onHint,
  children,
}: {
  cursor: number;
  total: number;
  accuracy: number;
  keysPerMin: number;
  streak: number;
  done: boolean;
  summary: Parameters<typeof SummaryScreen>[0]["summary"];
  descOf: (taskId: string) => string;
  onRetry: () => void;
  onRetryMistakes: () => void;
  onExit?: () => void;
  formatMs: (ms: number) => string;
  /** 练习模式：跟打 / 默写 */
  mode: "drill" | "recall";
  onMode: (m: "drill" | "recall") => void;
  /** 提示级别 0~3 */
  hint: number;
  canHint: boolean;
  onHint: () => void;
  /** 题目区 + 可视化 */
  children: React.ReactNode;
}) {
  if (done) {
    return (
      <SummaryScreen
        summary={summary}
        descOf={descOf}
        onRetry={onRetry}
        onRetryMistakes={onRetryMistakes}
        onExit={onExit}
        formatMs={formatMs}
      />
    );
  }
  return (
    <div className="space-y-4">
      <SessionBar
        cursor={cursor}
        total={total}
        accuracy={accuracy}
        keysPerMin={keysPerMin}
        streak={streak}
      />
      <ModeBar mode={mode} onMode={onMode} hint={hint} canHint={canHint} onHint={onHint} />
      {children}
    </div>
  );
}

/** 从会话结果尾部数连续答对的次数（连击） */
export function streakOf(results: { ok: boolean }[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].ok) n++;
    else break;
  }
  return n;
}

/**
 * 解法详情 —— 「练最优解，但想看看次解和原生解」。
 *
 * ## 为什么单独一个组件
 *
 * 用户的诉求原话：「我练的是最优解，但是我还想看看次解和原生解，
 * 因为我有时候会用原生 vim」。
 *
 * 所以出题只考 `display`（最优解），但答完/卡住时应该能看到：
 *
 * | 栏 | 内容 | 可信度 |
 * |----|------|--------|
 * | 等价键 | 实测同一条命令的其它键（rhs 相同） | **严格**，从数据算的 |
 * | 原生 | Vim 原生 Ex 等价 | 逐条 `exists()` 实测过 |
 *
 * ## ⚠️ 为什么标出「等价判据」
 *
 * `rhs` 相同是严格判据（底层就是同一条命令）；
 * Lua 回调没有 rhs，只能按 `desc` 弱判定。
 * 两者可信度不同，界面上必须区分 —— 不然用户会把弱判定的结果
 * 当成实测事实。
 */
export function SolutionDetail({
  /** 最优解（本题要按的） */
  best,
  /** 次解：实测等价的其它键 */
  alternates,
  /** 等价判据：rhs = 严格实测，desc = 弱 */
  equivBy,
  /** 原生 Ex 等价。null = 确认没有 */
  native,
  /** 原生等价核实过没有 */
  nativeVerified,
  /** 额外提醒（如易混键） */
  warn,
}: {
  best: string;
  alternates: string[];
  equivBy?: "rhs" | "desc" | "lone";
  native?: string | null;
  nativeVerified?: true | "unchecked";
  warn?: string;
}) {
  const hasAlt = alternates.length > 0;
  const hasNative = Boolean(native);
  if (!hasAlt && !hasNative && !warn) return null;

  return (
    <div data-solution-detail className="mt-2 space-y-1 border-t border-neutral-800 pt-2 text-[11px]">
      {hasAlt && (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="w-14 shrink-0 text-neutral-700">等价键</span>
          {alternates.map((a) => (
            <kbd key={a} className="rounded bg-green-950 px-1.5 py-0.5 text-green-400">
              {a}
            </kbd>
          ))}
          <span className="text-neutral-600">
            和 <kbd className="rounded bg-blue-950 px-1 text-blue-200">{best}</kbd> 是同一条命令，按哪个都算对
            {equivBy === "rhs" ? "（rhs 实测相同）" : "（按描述归类，弱判据）"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="w-14 shrink-0 text-neutral-700">原生</span>
        {hasNative ? (
          <>
            <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{native}</code>
            <span className="text-neutral-600">
              {nativeVerified === true
                ? "Ex 命令，实测存在；没绑键，要手打 :"
                : "Ex 命令（存在性没核实）"}
            </span>
          </>
        ) : (
          <span className="text-neutral-600">插件功能，Vim 里没有原生等价</span>
        )}
      </div>

      {warn && <div className="text-amber-500/90">⚠ {warn}</div>}
    </div>
  );
}

/**
 * 诊断跳转可视化 —— 把「光标在诊断间移动」画出来。
 *
 * ## 为什么这一族值得画
 *
 * 它是唯一一个「状态明确会变、但一直没被可视化」的大族。
 * `]d` / `[d` 按下去什么会变很清楚：**光标在诊断列表里前后移动**。
 *
 * 光看一行文字（「跳到下一个诊断」）记不住两件事：
 *
 * 1. **诊断分布在哪些行** —— 画出来才有位置感
 * 2. **到头会不会绕回** —— 走一遍就看见了
 *
 * ## ⚠️ 光标用「整行高亮」而不是箭头
 *
 * Vim 里光标是一个字符格。但这一族练的是「跳到哪一行」，
 * 整行高亮更贴合实际心智，也更容易看清移动。
 * 当前落在诊断上的那行额外加边框 —— 区分「光标在这」和「这里有诊断」。
 */
export function DiagNavView({
  source,
  diags,
  cursor,
  note,
  kind = "diag",
}: {
  /** 代码行 */
  source: string[];
  /** 列表里的条目（诊断或 quickfix 项） */
  diags: { lnum: number; endLnum: number; severity: 1 | 2 | 3 | 4; message: string }[];
  /** 当前光标行（0-based） */
  cursor: number;
  /** 上一次跳转的反馈 */
  note?: string;
  /**
   * 这是哪个列表。
   *
   * ⚠️ `]d` 和 `]q` 走的是**两个不同的列表**（诊断 vs Trouble/quickfix），
   *    而且到头的行为也不同（绕回 vs 停住）。
   *    画的时候要标出来，否则用户会把两族混成一个心智模型。
   */
  kind?: "diag" | "qf";
}) {
  const legend =
    kind === "diag"
      ? { title: "诊断列表", end: "]d 到头会绕回开头" }
      : { title: "Trouble / quickfix 列表", end: "]q 到头会停住（E553），不绕回" };
  const sevColor: Record<number, string> = {
    1: "bg-red-500",
    2: "bg-amber-500",
    3: "bg-blue-500",
    4: "bg-neutral-500",
  };
  const sevText: Record<number, string> = {
    1: "text-red-400",
    2: "text-amber-400",
    3: "text-blue-400",
    4: "text-neutral-400",
  };

  /** 这一行有诊断吗 */
  const diagOnLine = (ln: number) => diags.find((d) => d.lnum <= ln && ln <= d.endLnum);

  return (
    <div data-diag-nav className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-3 text-[10px] text-neutral-600">
        <span data-nav-kind={kind} className="text-neutral-400">
          {legend.title}
        </span>
        <span>光标在第 {cursor + 1} 行</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-blue-600" />光标
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />错误
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />警告
        </span>
        <span className="ml-auto text-neutral-600">{legend.end}</span>
      </div>

      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
        {source.map((text, ln) => {
          const d = diagOnLine(ln);
          const isCursor = ln === cursor;
          return (
            <div
              key={ln}
              data-line={ln}
              data-cursor={isCursor ? "1" : undefined}
              className={
                isCursor
                  ? "bg-blue-900/40 ring-1 ring-inset ring-blue-500"
                  : d
                    ? "bg-neutral-900/60"
                    : ""
              }
            >
              {/* 行号左侧：有诊断就点一个色块，位置感就靠它 */}
              <span className="mr-1 inline-block w-2 align-middle">
                {d && (
                  <span
                    data-sev={d.severity}
                    className={`inline-block h-1.5 w-1.5 rounded-full ${sevColor[d.severity]}`}
                  />
                )}
              </span>
              <span className="mr-3 inline-block w-4 text-right text-neutral-700">{ln + 1}</span>
              <span>{text}</span>
              {d && (
                <span className={`ml-2 text-[10px] ${sevText[d.severity]}`}>{d.message}</span>
              )}
            </div>
          );
        })}
      </pre>

      {note && (
        <div data-nav-note className="mt-2 text-[11px] text-amber-300">
          {note}
        </div>
      )}
    </div>
  );
}

/**
 * 搜索跳转可视化 —— 把「搜索匹配 + 光标 + 高亮」画出来。
 *
 * ## 为什么这一族值得画
 *
 * `n` / `N` 看着简单，但两件事光看文字看不出来：
 *
 * 1. **`n` 不总是「往后」** —— 本机映射是方向感知的，
 *    用 `?` 倒着搜之后 `n` 反而往前
 * 2. **`<Esc>` 只清高亮、不清搜索寄存器** —— 清完再按 `n` 还能跳
 *
 * 走一遍就明白，比读三行说明有效。
 */
export function SearchNavView({
  source,
  matches,
  index,
  hl,
  note,
}: {
  source: string[];
  matches: { line: number; col: number; endCol: number }[];
  /** 当前在第几个匹配 */
  index: number;
  /** 高亮是否可见 */
  hl: boolean;
  note?: string;
}) {
  const cur = matches[index];
  return (
    <div data-search-nav className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-3 text-[10px] text-neutral-600">
        <span>
          {matches.length} 个匹配
          {cur && ` · 当前第 ${index + 1} 个（第 ${cur.line + 1} 行）`}
        </span>
        <span className={hl ? "text-amber-400" : "text-neutral-700"}>
          {hl ? "高亮:开" : "高亮:关（Esc 清过）"}
        </span>
      </div>

      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
        {source.map((text, ln) => (
          <div key={ln} data-line={ln} className={cur?.line === ln ? "bg-blue-900/30" : ""}>
            <span className="mr-3 inline-block w-4 text-right text-neutral-700">{ln + 1}</span>
            <span>
              {text.split("").map((ch, col) => {
                // 这个字符被哪个匹配覆盖
                const m = matches.find((x) => x.line === ln && col >= x.col && col < x.endCol);
                if (!m) return <span key={col}>{ch}</span>;
                const isCur = hl && m === cur;
                // ⚠️ 高亮关掉时全都不上色 —— 但当前那个仍然有底色，
                //    否则用户看不出光标在哪（Vim 里光标一直在）
                return (
                  <span
                    key={col}
                    data-match={isCur ? "cur" : "other"}
                    className={
                      !hl
                        ? m === cur
                          ? "bg-blue-700/60 text-blue-50"
                          : ""
                        : isCur
                          ? "rounded-sm bg-amber-500/70 text-black"
                          : "rounded-sm bg-amber-900/40 text-amber-200"
                    }
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </pre>

      {note && (
        <div data-nav-note className="mt-2 text-[11px] text-amber-300">
          {note}
        </div>
      )}
    </div>
  );
}
