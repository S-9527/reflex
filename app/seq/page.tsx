"use client";

/**
 * 全键位扫描 —— 其余键位的盲背练习。
 *
 * ## ⚠️ 这一页从第二套引擎迁到了公共引擎
 *
 * 迁移前它自己维护了一整套：
 *   - `lib/matcher.ts` 的前缀树（hit / partial / miss 三态）
 *   - `lib/leader.ts` 的 leader 状态机
 *   - 自己写的 keydown handler
 *   - `lib/progress.ts` 的权重抽题
 *   - 自己的 `TIMEOUT_MS = 1200` 超时
 *   - 答对 700ms / 答错 1800ms 的自动翻页定时器
 *
 * 而其余 6 个板块用的是 `lib/drill.ts` + `use-drill.ts`。
 * **同一个概念两套实现，必然不同步** —— 表现就是这一页没有
 * 逐键反馈、没有数据条、没有会话结算、没有跟打/默写模式，
 * 而别的板块都有。
 *
 * 现在统一：判据用 `lib/drill.ts` 的三态，外壳用 `useDrill`，
 * 会话用 `lib/session.ts`，提示用 `lib/hints.ts`。
 *
 * ## 迁移时不能丢的东西
 *
 * 旧页面的注释里记了三个实测踩出来的坑，都保留在下面：
 *   1. 索引必须建在**全量**绑定上（不能用过滤后的池子）
 *   2. 窗口键不在这儿练（判据按 desc，不按 group 名）
 *   3. `<Tab>` 接管会牺牲键盘焦点导航，做成可选
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMANDS, GROUPS, type Command } from "@/lib/bindings";
import { boardCoveredIds } from "@/lib/boards";
import { splitLhs } from "@/lib/keys";
import { SEQ_GROUPS, shapeOf, type Shape } from "@/lib/seq-groups";
import { translate } from "@/lib/i18n";
import { formatMs } from "@/lib/session";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, useDrill } from "@/lib/use-drill";
import {
  DrillFlow,
  FlashLine,
  KeyLog,
  KeySequence,
  PendingHint,
  Provenance,
  SolutionDetail,
  TaskBox,
  streakOf,
} from "@/lib/drill-ui";

/**
 * 窗口键交给 `/windows` 的可视化页面 —— 那里能画出真实分屏树，
 * 盲背页只能给一行文字。
 *
 * ⚠️ 判据是 **desc**，不是 `group` 名。
 *
 * 旧版写的是 `b.group !== "window"`，而 which-key 里的真实分组名是
 * **`windows`（复数）**，且窗口键大多落在 `ctrl-misc` / `leader-misc`
 * 兜底桶里（`<C-H>`、`<Space>|`、`<Space>-` 都没有 which-key 分组）。
 * 所以那条过滤**从来没生效过** —— 静默失效，不报错。
 */
const WINDOW_NAV =
  /^(Go to (Left|Right|Upper|Lower) Window|Split Window|Delete Window|Move (Up|Down)|(Increase|Decrease) Window)/;

/**
 * 可练的命令池 —— 「其余」键位的盲背。
 *
 * ## ⚠️ 要排除两层
 *
 * ### 1. 窗口键（一直都有）
 *
 * 交给 `/windows` 的可视化页面 —— 那里能画出真实分屏树。
 *
 * ### 2. 已被专门页面覆盖的族（这一版新增）
 *
 * 实测（见 `tests/dedup.test.ts`）这一页和专门页面**重复了 70 条**：
 *
 * ```
 * <Space>u*  界面开关    24 条
 * diag        诊断       18 条
 * <Space>f*   文件查找    10 条
 * buffers     缓冲区       8 条
 * <Space><Tab>*  标签页     7 条
 * ```
 *
 * 同一条命令在两个页面各练一遍 —— 进度 id 已经统一（练哪边都算），
 * 但**题量虚高**，而且这一页叫「其余」就名不副实了。
 *
 * 判据在 `lib/boards.ts` 的 `boardCoveredIds()` —— 那里也定义了
 * 每个板块拥有哪些键，所以加板块不用改这里。
 */
const POOL: Command[] = (() => {
  const covered = boardCoveredIds(COMMANDS);
  return COMMANDS.filter((c) => !WINDOW_NAV.test(c.desc) && !covered.has(c.id));
})();

/**
 * Command → DrillTask。
 *
 * `accept` 是**逐键数组的数组**：最优解 + 次解。
 * 次解也算对 —— 只认第一条就是「训练器比真实环境挑剔」。
 */
function toTask(c: Command): DrillTask {
  return {
    id: c.id,
    short: c.display,
    desc: translate(c.display, c.modes[0] ?? "n", c.desc),
    accept: [splitLhs(c.display), ...c.alternates.map((a) => splitLhs(a))],
  };
}

export default function SeqPage() {
  const router = useRouter();
  const [shape, setShape] = useState<Shape | "all">("leader");

  /** 当前形态下的命令 */
  const filtered = useMemo(
    () => (shape === "all" ? POOL : POOL.filter((c) => shapeOf(c.display) === shape)),
    [shape],
  );
  const tasks = useMemo(() => filtered.map(toTask), [filtered]);

  /**
   * ⚠️ 题目 id → 命令。`useDrill` 的 `task` 只有 id/short/desc/accept，
   * 而解法详情（次解、原生 Ex、等价判据）在 Command 上。
   */
  const cmdOf = useMemo(() => new Map(filtered.map((c) => [c.id, c])), [filtered]);

  const apply = useCallback((_seq: string[], _s: null) => null, []);

  const d = useDrill<null>({
    boardId: `seq-${shape}`,
    tasks,
    init: () => null,
    apply,
    toPanelKey: defaultToPanelKey,
  });

  const cmd = cmdOf.get(d.task.id) ?? null;
  const shapeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of POOL) {
      const s = shapeOf(c.display);
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <h1 className="text-xl font-bold">
        <button onClick={() => router.push("/")} className="hover:text-blue-400">
          ← reflex
        </button>
      </h1>
      <p className="mt-1 text-xs text-neutral-500">
        全键位扫描 · 数据集来自本机 LazyVim 实测抽取（{POOL.length} 条命令；窗口键已移至可视化窗口练习）
      </p>

      {/* 形态分组 —— 按「键长得像什么」分，不按「第 x 关」 */}
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {SEQ_GROUPS.map((g) => (
            <ShapeBtn
              key={g.id}
              active={shape === g.shape}
              onClick={() => {
                setShape(g.shape);
                d.restart(POOL.filter((c) => shapeOf(c.display) === g.shape).map((c) => c.id));
              }}
            >
              {g.name}
              <span className="ml-1.5 text-neutral-600">{shapeCounts[g.shape] ?? 0}</span>
            </ShapeBtn>
          ))}
          <ShapeBtn
            active={shape === "all"}
            onClick={() => {
              setShape("all");
              d.restart(POOL.map((c) => c.id));
            }}
          >
            全部
            <span className="ml-1.5 text-neutral-600">{POOL.length}</span>
          </ShapeBtn>
        </div>
        {shape !== "all" && (
          <div className="text-[11px] text-neutral-500">
            {SEQ_GROUPS.find((g) => g.shape === shape)?.what}
          </div>
        )}
      </div>

      <div className="mt-4">
        <DrillFlow
          cursor={d.taskIndex}
          total={d.session.queue.length}
          accuracy={d.summary.accuracy}
          keysPerMin={d.summary.keysPerMin}
          streak={streakOf(d.session.results)}
          done={d.done}
          summary={d.summary}
          formatMs={formatMs}
          descOf={(id) => tasks.find((t) => t.id === id)?.desc ?? id}
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
          {/*
            ⚠️ 这里原来放 `TaskBar`（每道题一个按钮）。

            1 个形态下有 131 条 leader 键 —— 那是**一面墙的按钮**，
            把题目区和可视化全挤到屏幕外，而它的唯一作用是「跳到某道题」。
            一页 131 个按钮既扫不过来、也想不出该点哪个。

            改成一条轻量的控制行：上一题 / 跳过 / 重来 / 清进度。
            真正需要知道「还剩多少」的时候看上面的会话数据条就够了。
          */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-neutral-600">
              {d.task.short} · {GROUPS[cmd?.group ?? ""] ?? cmd?.groupLabel ?? ""}
            </span>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={d.skip}
                className="rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
                title="跳过这一题（记为答错）"
              >
                跳过
              </button>
              <button
                onClick={d.reset}
                className="rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
              >
                重来
              </button>
              <button
                onClick={d.clearProgress}
                className="rounded border border-neutral-800 px-2 py-0.5 text-neutral-600 hover:bg-neutral-800"
                title="清掉这个形态的进度（localStorage）"
              >
                清进度
              </button>
            </div>
          </div>

          <TaskBox>
            <div className="flex flex-wrap items-baseline gap-2 text-[11px] text-neutral-600">
              <span>{GROUPS[cmd?.group ?? ""] ?? cmd?.groupLabel ?? ""}</span>
              <span>· {cmd?.modes.join("/") ?? "n"} 模式</span>
            </div>
            <div className="mt-2 text-neutral-200">{d.task.desc}</div>

            {/* 逐键上色 —— 迁到公共引擎后新获得的反馈 */}
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
              />
            )}
          </TaskBox>

          <KeyLog log={d.log} hint="按上面那条解法 —— 每个键会立刻上色" />
          <FlashLine flash={d.flash} />
        </DrillFlow>
      </div>

      <div className="mt-8">
        <Provenance>
          判分只看键序列是否匹配。数据来自你本机的 <code>nvim_get_keymap</code>，
          分组来自 which-key 的真实声明。等价键按 <b>rhs 聚合</b>（rhs 相同 = 同一条命令），
          原生 Ex 逐条 <code>exists()</code> 实测过。
          <br />
          ⚠️ 窗口那组是 LazyVim 16 的键（<code>&lt;C-H/J/K/L&gt;</code>），
          <b>不是</b>书第 9 章里的 <code>&lt;C-w&gt;h/j/k/l</code>。
        </Provenance>
      </div>
    </main>
  );
}

function ShapeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs ${
        active
          ? "border-blue-400 bg-blue-400 text-black"
          : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}
