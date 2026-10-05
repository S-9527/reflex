"use client";

import { useCallback } from "react";
import {
  DIAG_KEYS,
  DIAGS,
  MISREAD,
  NATIVE,
  PROBE_LOG,
  SEVERITY_NAME,
  SRC,
  countBySeverity,
  altSeqs,
  fullAlts,
  fullKey,
  keySeq,
  LEADER_AUDIT,
  movesCursor,
  sortedDiags,
  type Diag,
  type DiagKey,
} from "@/lib/diagnostics";
import { ORIGIN_NOTE, VERIFIED_NOTE } from "@/lib/provenance";
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
 * 诊断 / LSP 跳转练习。
 *
 * ## 这一族的核心是**位置移动**
 *
 * `[d` `]d` `[D` `]D` 改变的是「光标停在哪条诊断上」——
 * 这是可以被画出来的状态:一份带严重级别的诊断列表 + 一个高亮游标。
 *
 * ## ⚠️ 但四类键不能混在一个模型里
 *
 * 实测之后分了四类(见 lib/diagnostics.ts 的 DiagKey.block):
 *
 * | 类别 | 键 | 按下去会发生什么 |
 * |------|-----|----------------|
 * | 诊断间跳转 | `[d` `]d` `[D` `]D` | 光标移动 ✅ 能画 |
 * | 列表项跳转 | `[q` `]q` | 在**另一个列表**(Trouble/quickfix)里移动 |
 * | LSP 查询 | `grr` `grn` `gra` `gri` `grt` `gO` | **不开位置**,弹选择器 |
 * | 面板 | `xx` `xQ` `xL` `xX` `xT` `cS` | 弹 Trouble 浮窗 |
 *
 * 我第一版把 `gr*` 和 `[d`/`]d` 都标成「跳转」,单测立刻抓到
 * `grr` 在任何起点都按不动 —— 因为它压根不移动光标。
 * 分类必须按实测行为,不能按「感觉像同类」。
 *
 * ## 数据可信度
 *
 * 诊断**不是编的**:`vim.diagnostic.set/get` 在 headless 下可用(实测
 * 造 2 条读回来行号/列/severity 全对),所以这份列表是照那次实测的形状写的。
 * 测不出来的只有 Trouble 浮窗本身 —— 界面上如实标注。
 */

const sorted = sortedDiags();
const counts = countBySeverity(sorted);

/** 页面状态:游标停在第几条 + 已打开的 LSP 选择器 */
type St = { cur: number; picker: string | null };

/**
 * ⚠️ 每题的起始游标必须**保证这一题有解**。
 *
 * `[d` 那题从第一条起(得往前?不对,是从第一条起就只能往前),
 * `[D` 那题从中间起 —— 每题的起点不同,否则会出死题。
 * 见 tests/diagnostics.test.ts 的「除两端外的每个起点都能改变状态」。
 */
function startFor(k: DiagKey): St {
  const n = sorted.length;
  switch (k.key) {
    case "[d":
      // 从中间起,保证能往上走
      return { cur: Math.floor(n / 2), picker: null };
    case "[D":
      // 从中间起,[D 能跳到第一条
      return { cur: Math.floor(n / 2), picker: null };
    case "]d":
    case "]q":
      // 从第一条起,保证能往下走
      return { cur: 0, picker: null };
    case "]D":
      return { cur: 0, picker: null };
    default:
      return { cur: 0, picker: null };
  }
}

const TASKS: DrillTask[] = DIAG_KEYS.map((k) => ({
  id: k.key,
  // ⚠️ 按钮上也显示完整写法。<Space> 缩写成 S(和 /files 一致),
  //   不然按钮只写 "xx" 会让人以为两键就能按出来。
  short: k.hasLeader ? `S${k.key}` : k.key,
  desc: `${k.acts} —— ${k.desc}`,
  // ⚠️⚠️ 两件事都在这里处理,而且**只有这一处**:
  //   1. leader —— Trouble 族实测有 leader(真实 lhs 是 " xx"),
  //      跳转族没有。漏了 leader 用户就按不出来(你报过)。
  //   2. 逐键拆开 —— 写成 [[k.key]] 的话 [d 会变成一个元素装俩字符,
  //      firstKeySet 得到 "[d" 而浏览器报的是 "[" → 永远配不上,
  //      落进 none 分支放行 → 键完全没反应,而且不报错。
  accept: [keySeq(k), ...altSeqs(k)],
}));

export default function DiagDrill() {
  const init = useCallback((t: DrillTask) => startFor(DIAG_KEYS.find((x) => x.key === t.id)!), []);

  const apply = useCallback((_seq: string[], st: St, t: DrillTask) => {
    const k = DIAG_KEYS.find((x) => x.key === t.id)!;
    const n = sorted.length;

    // 面板类:弹 Trouble,headless 下建不起来 —— 模型上只记「开过」,
    // 并明确告诉用户这部分没验证过浮窗本身。
    if (k.block === "面板") return { cur: st.cur, picker: k.acts };

    // LSP 查询:不移动光标,弹选择器
    if (k.block === "LSP 查询") return { cur: st.cur, picker: `${k.acts}(弹选择器)` };

    // 位置移动。到边界不动 → 返回 NO_EFFECT,页面会明确提示,
    // 不会静默吞掉(静默吞输入最难查)。
    let cur = st.cur;
    switch (k.key) {
      case "]d":
      case "]q":
        cur = Math.min(n - 1, cur + 1);
        break;
      case "[d":
      case "[q":
        cur = Math.max(0, cur - 1);
        break;
      case "]D":
        cur = n - 1;
        break;
      case "[D":
        cur = 0;
        break;
      default:
        return NO_EFFECT;
    }
    if (cur === st.cur) return NO_EFFECT;
    return { cur, picker: null };
  }, []);

  const d = useDrill<St>({
    boardId: "diagnostics",
    tasks: TASKS,
    init,
    apply,
    toPanelKey: defaultToPanelKey,
    advanceMs: 1600,
    keepStateOnAdvance: false,
    noEffectText: (seq) => `${seq.join("")} —— 已经在边界上了,这一步走不动`,
  });

  const k = DIAG_KEYS.find((x) => x.key === d.task.id)!;
  const cur = sorted[d.state.cur];

  return (
    <div className="space-y-4">
      {/* gd 的坑放最上面 —— 这是最容易按错的一个 */}
      <div className="rounded border border-red-900/60 bg-red-950/20 p-3 text-[11px] leading-relaxed">
        <b className="text-red-300">⚠️ 我按记忆写错过一次,记在这免得你也踩:</b>
        <div className="mt-1 space-y-0.5 text-red-100/80">
          <div>
            <code className="text-red-300">gd</code> 是 <b>{MISREAD.gd}</b>
          </div>
          <div>
            <code className="text-red-300">gD</code> 是 <b>{MISREAD.gD}</b>
          </div>
          <div className="text-red-100/60">
            跳定义在 <code>gr</code> 族里(<code>grr</code> 引用 / <code>gri</code> 实现 /{" "}
            <code>grt</code> 类型)。而且这五个键的 desc **实测原文**就是对应的
            <code>vim.lsp.buf.xxx()</code> 函数名 —— 这一族其实不用背。
          </div>
        </div>
      </div>

      <TaskBar
        tasks={TASKS}
        current={d.taskIndex}
        solved={d.solved}
        solvedAll={d.solvedAll}
        onClear={d.clearProgress}
        onPick={d.setTaskIndex}
        onReset={d.reset}
      />

      <TaskBox>
        <div className="text-neutral-300">
          按 <kbd className="rounded bg-blue-950 px-2 py-0.5 text-sm text-blue-200">{fullKey(k)}</kbd>{" "}
          {movesCursor(k) ? "把光标移到下一个位置" : k.block === "面板" ? "打开面板" : "问语言服务器一个问题"}
        </div>
        <div className="mt-1.5 text-neutral-400">{k.acts}</div>

        {/* 归属:Vim 原生还是插件 */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span className="w-8 shrink-0 text-neutral-700">归属</span>
          <span
            className={
              k.origin.startsWith("纯插件")
                ? "rounded bg-purple-950 px-1.5 py-0.5 text-purple-300"
                : "rounded bg-green-950 px-1.5 py-0.5 text-green-400"
            }
          >
            {k.origin}
          </span>
          <span className="text-neutral-600">{ORIGIN_NOTE[k.origin]}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span className="w-8 shrink-0 text-neutral-700">核实</span>
          <span
            className={
              k.verified === "desc"
                ? "text-amber-500/90"
                : k.verified === "none"
                  ? "text-red-400"
                  : "text-neutral-400"
            }
          >
            {VERIFIED_NOTE[k.verified]}
          </span>
        </div>

        <div className="mt-1.5 text-[11px] text-neutral-600">
          实测 lhs ={" "}
          <code className="text-neutral-500">&quot;{k.hasLeader ? " " : ""}{k.key}&quot;</code>
          {k.hasLeader ? "(前导空格 = leader)" : "(不带 leader)"};desc ={" "}
          <span className="text-neutral-400">{k.desc}</span>
          {k.rhs !== null && (
            <>
              ;rhs = <span className="text-green-500/90">{k.rhs}</span>
              <span className="text-neutral-600">(真 Ex 命令,已验证能执行)</span>
            </>
          )}
        </div>
        <AcceptList task={d.task} />
        <NativeRef native={NATIVE[k.key]} />
        {k.block === "面板" && (
          <div className="mt-1 text-[11px] text-amber-500/90">
            ⚠ Trouble 浮窗本身<b>没验证过</b>:headless 下 `nvim_list_uis()=0`,
            浮窗建不起来(实测 wins 恒为 1)。这里只展示它开哪个面板。
          </div>
        )}
        {k.block === "LSP 查询" && (
          <div className="mt-1 text-[11px] text-sky-400/90">
            ℹ 这个键<b>不移动光标</b> —— 它开一个选择器。别按 `[d`/`]d` 的肌肉记忆去用它。
          </div>
        )}
        <PendingHint pending={d.pending} />
      </TaskBox>

      <CodeView cur={cur} />

      {/* 诊断列表 —— 这一页真正可视化的东西 */}
      <DiagList diags={sorted} curIndex={d.state.cur} />

      {d.state.picker && (
        <div className="rounded border border-sky-900/60 bg-sky-950/20 p-2 text-[11px] text-sky-300/90">
          ℹ 按下的键会打开:<b>{d.state.picker}</b>
          <span className="text-sky-100/60">
            {" "}
            —— 选择器内容我没法在 headless 下测(同浮窗那个限制),所以只标出它是什么。
          </span>
        </div>
      )}

      <KeyLog log={d.log} hint="按上面任意一条解法" />
      <FlashLine flash={d.flash} />

      {/* 四个类别的全表 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">
          全部 {DIAG_KEYS.length} 条(实测自 <code>nvim_get_keymap("n")</code>)
        </div>
        {(["诊断间跳转", "列表项跳转", "LSP 查询", "面板"] as const).map((b) => (
          <div key={b} className="mb-1.5 last:mb-0">
            <div className="mb-0.5 text-neutral-600">
              {b}
              {b === "诊断间跳转" && <span className="text-green-600/70"> — 光标真会动</span>}
              {b === "列表项跳转" && <span className="text-neutral-700"> — 另一个列表</span>}
              {b === "LSP 查询" && <span className="text-sky-600/70"> — 不动光标</span>}
            </div>
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {DIAG_KEYS.filter((x) => x.block === b).map((x) => (
                <div
                  key={x.key}
                  className={`flex gap-1.5 ${
                    x.key === k.key ? "rounded bg-blue-950 px-1 text-blue-200" : "text-neutral-500"
                  }`}
                >
                  <code className="w-20 shrink-0 text-blue-300">{fullKey(x)}</code>
                  <span className="truncate">{x.acts}</span>
                  <span
                    className={
                      x.origin.startsWith("纯插件")
                        ? "shrink-0 text-purple-600/70"
                        : "shrink-0 text-green-600/60"
                    }
                  >
                    {x.origin.startsWith("纯插件") ? "插件" : "原生"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <details className="rounded border border-neutral-800 p-2 text-[11px]">
        <summary className="cursor-pointer text-neutral-500">
          实测记录({PROBE_LOG.length + LEADER_AUDIT.length} 条)
        </summary>
        <ul className="mt-1 space-y-0.5 text-neutral-600">
          {[...PROBE_LOG, ...LEADER_AUDIT].map((l) => (
            <li key={l} className="flex gap-1.5">
              <span className="text-neutral-700">·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </details>

      <Provenance>
        键位、desc、rhs 实测自 <code>nvim_get_keymap("n")</code>。诊断数据不是编的 ——
        <code>vim.diagnostic.set/get</code> 在 headless 下可用,这份列表照那次实测的形状写的。
        <b>测不出来的是 Trouble 浮窗和 LSP 选择器</b>(<code>nvim_list_uis()=0</code>),
        界面上已标注。原生 Ex 里那些 <code>vim.lsp.buf.*</code> 写法直接照抄本机 desc 里的函数名,
        不是我翻译的。
      </Provenance>
    </div>
  );
}

const SEV_CLASS: Record<number, string> = {
  1: "border-red-800 bg-red-950/40 text-red-300",
  2: "border-amber-800 bg-amber-950/30 text-amber-300",
  3: "border-blue-900 bg-blue-950/30 text-blue-300",
  4: "border-neutral-800 bg-neutral-900 text-neutral-400",
};

/** 诊断列表 —— 高亮当前游标停在哪一条 */
function DiagList({ diags, curIndex }: { diags: Diag[]; curIndex: number }) {
  const c = countBySeverity(diags);
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-700">
        <span>共 {diags.length} 条</span>
        {[1, 2, 3, 4].map((s) =>
          c[s] > 0 ? (
            <span key={s} className={SEV_CLASS[s].split(" ").pop()}>
              {SEVERITY_NAME[s]} {c[s]}
            </span>
          ) : null,
        )}
      </div>
      <div className="space-y-1">
        {diags.map((dg, i) => {
          const isCur = i === curIndex;
          return (
            <div
              key={`${dg.lnum}:${dg.col}`}
              className={`flex items-baseline gap-2 rounded border px-2 py-1 text-[11px] ${
                isCur
                  ? "border-blue-500 bg-blue-950 text-blue-100"
                  : "border-neutral-800 bg-neutral-900/40 text-neutral-500"
              }`}
            >
              <span className={`shrink-0 rounded border px-1 text-[10px] ${SEV_CLASS[dg.severity]}`}>
                {SEVERITY_NAME[dg.severity]}
              </span>
              <span className="shrink-0 text-neutral-600">
                {dg.lnum + 1}:{dg.col + 1}
              </span>
              <span className="truncate">{dg.message}</span>
              {dg.source && <span className="ml-auto shrink-0 text-[10px] text-neutral-700">{dg.source}</span>}
              {isCur && <span className="shrink-0 text-[10px] text-blue-400">← 光标在这</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 代码 + 当前诊断位置高亮 */
function CodeView({ cur }: { cur: Diag }) {
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 text-[10px] text-neutral-700">
        第 {cur.lnum + 1} 行 · 第 {cur.col + 1}-{cur.endCol} 列 · {SEVERITY_NAME[cur.severity]}
      </div>
      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
        {SRC.map((text, i) => {
          const lnum = i;
          const inRange = lnum >= cur.lnum && lnum <= cur.endLnum;
          const isStart = lnum === cur.lnum;
          return (
            <div key={i} className={inRange ? "bg-blue-950/50" : ""}>
              <span className="mr-3 inline-block w-4 text-right text-neutral-700">{i + 1}</span>
              <span>
                {!inRange ? (
                  text
                ) : (
                  text.split("").map((ch, j) => {
                    const c = j + 1;
                    const inCol = lnum === cur.lnum ? c > cur.col && c <= cur.endCol : true;
                    return inCol ? (
                      <span key={j} className="rounded-sm bg-blue-600/50 text-blue-50">
                        {ch}
                      </span>
                    ) : (
                      <span key={j}>{ch}</span>
                    );
                  })
                )}
              </span>
              {isStart && (
                <span className="ml-2 text-[10px] text-blue-400">← 当前诊断:{cur.message}</span>
              )}
            </div>
          );
        })}
      </pre>
    </div>
  );
}