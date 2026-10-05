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
import {
  OTHER_ID,
  drillablePool,
  filterByGroup,
  groupOf,
  skippedPool,
} from "@/lib/seq-groups";
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
 * 筛选规则在 `lib/seq-groups.ts`（有单测），这里只取结果：
 *
 * 1. **排除窗口键** —— 交给 `/windows`，那里能画出真实分屏树
 * 2. **排除已被专门页面覆盖的** —— 不重复出题（见 lib/boards.ts）
 * 3. **排除不能当题干的** —— 空 desc / help 引用 / auto-pairs
 *
 * 第 3 条是这一版新增的：旧版把空 desc 留在题库里，
 * 于是会出**题干空白**的题 —— 那不是「简洁」，是坏了。
 * 被排掉的在页面底部单独列出来，用户能看到「排除了什么、为什么」。
 */
const POOL: Command[] = drillablePool();

/** 被排掉的（给底部那一栏） */
const SKIPPED = skippedPool();

/** 分组（按 which-key 的真实分类，「其它」兜底） */
const GROUPS_UI = groupOf(POOL);

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

  /**
   * 当前分组（which-key 的 group 名，或 `__other__`）。
   *
   * ⚠️ 默认选**题量最大的真分组**，不是硬编码某个 id ——
   *    以后 which-key 分组变了，默认项跟着变，不会指到一个空组。
   */
  const [groupId, setGroupId] = useState<string>(() => GROUPS_UI[0]?.id ?? OTHER_ID);

  /** 当前分组下的命令 */
  const filtered = useMemo(
    () => (groupId === "all" ? POOL : filterByGroup(POOL, groupId)),
    [groupId],
  );
  const tasks = useMemo(() => filtered.map(toTask), [filtered]);

  /**
   * ⚠️ 题目 id → 命令。`useDrill` 的 `task` 只有 id/short/desc/accept，
   * 而解法详情（次解、原生 Ex、等价判据）在 Command 上。
   */
  const cmdOf = useMemo(() => new Map(filtered.map((c) => [c.id, c])), [filtered]);

  const apply = useCallback((_seq: string[], _s: null) => null, []);

  const d = useDrill<null>({
    boardId: `seq-${groupId}`,
    tasks,
    init: () => null,
    apply,
    toPanelKey: defaultToPanelKey,
  });

  const cmd = cmdOf.get(d.task.id) ?? null;

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

      {/* 分组 —— 按 which-key 的真实分类，和你在 nvim 里按 <Space> 看到的一致 */}
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {GROUPS_UI.map((g) => (
            <GroupBtn
              key={g.id}
              active={groupId === g.id}
              onClick={() => {
                setGroupId(g.id);
                d.restart(
                  filterByGroup(POOL, g.id).map((c) => c.id),
                );
              }}
            >
              {g.name}
              <span className="ml-1.5 text-neutral-600">{g.count}</span>
            </GroupBtn>
          ))}
          <GroupBtn
            active={groupId === "all"}
            onClick={() => {
              setGroupId("all");
              d.restart(POOL.map((c) => c.id));
            }}
          >
            全部
            <span className="ml-1.5 text-neutral-600">{POOL.length}</span>
          </GroupBtn>
        </div>
        <div className="text-[10px] text-neutral-700">
          分组名来自 which-key 的 <code>group</code> 声明（LazyVim 的
          <code>editor.lua</code>），和你在 nvim 里按 <code>&lt;Space&gt;</code>{" "}
          看到的分类一致。「其它」是 which-key 没管的那批。
        </div>
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

      {/*
        ⚠️ 「排除了什么」必须能看到。

        这一版把 30 条不能当题干的键从练习池里排掉了（空 desc / help 引用 /
        auto-pairs）。排掉不等于藏起来 —— 用户应该能核对这个判断，
        而不是发现某些键「莫名其妙不见了」。
      */}
      {SKIPPED.length > 0 && (
        <details data-skipped className="mt-8 rounded border border-neutral-800 bg-neutral-900/30 p-3">
          <summary className="cursor-pointer text-[11px] text-neutral-500">
            已排除 <b className="text-neutral-400">{SKIPPED.length}</b> 条不能当题干的键
            <span className="ml-2 text-neutral-700">（点开看是什么、为什么）</span>
          </summary>
          <div className="mt-2 space-y-2">
            {[
              "没有描述（插件没上报 desc）",
              "desc 是 help 引用，不是人话",
              "auto-pairs 自动配对行为，不是要背的键位",
              "MiniPairs 内部行为",
            ].map((reason) => {
              const list = SKIPPED.filter((x) => x.reason === reason);
              if (list.length === 0) return null;
              return (
                <div key={reason} className="text-[11px]">
                  <div className="text-neutral-500">
                    {reason}
                    <span className="ml-1.5 text-neutral-700">({list.length})</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {list.map((x) => (
                      <kbd
                        key={x.command.id}
                        className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-500"
                        title={x.command.desc || "(没有描述)"}
                      >
                        {x.command.display}
                      </kbd>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

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

function GroupBtn({
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
