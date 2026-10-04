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
import type { Flash } from "./use-drill";

/** 顶部的题号按钮条 */
export function TaskBar({
  tasks,
  current,
  solved,
  onPick,
  onReset,
  labelOf,
}: {
  tasks: DrillTask[];
  current: number;
  solved: number[];
  onPick: (i: number) => void;
  onReset: () => void;
  labelOf?: (t: DrillTask) => string;
}) {
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
              : solved.includes(i)
                ? "border-green-800 text-green-500"
                : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
          }`}
        >
          {solved.includes(i) && i !== current ? "✓ " : ""}
          {labelOf ? labelOf(t) : t.short}
        </button>
      ))}
      <button
        onClick={onReset}
        className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800"
      >
        重来
      </button>
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

/** 已按下的键 */
export function KeyLog({ log, hint }: { log: string[]; hint?: string }) {
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