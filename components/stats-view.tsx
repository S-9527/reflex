"use client";

import { useMemo } from "react";
import { groupStats, modeTotals, prefixTree, progressByGroup } from "@/lib/stats";
import type { Binding } from "@/lib/matcher";
import { COMMANDS } from "@/lib/bindings";
import { BOARDS as BOARD_DEFS } from "@/lib/boards";
import * as SRS from "@/lib/srs";
import Link from "next/link";

/**
 * 数据集统计视图。
 *
 * ## 为什么用「渲染函数数组」而不是条件 JSX
 *
 * 上一版用 `{!only && <>...</>}` 包了三层,括号配平就出了语法错。
 * 这里改成:每个 section 是一个返回 JSX 的函数,渲染时 filter 掉不显示的。
 * 扁平,而且加 section 不用改括号。
 *
 * ## ⚠️ 从「关卡」改成「分组」
 *
 * 旧版按手编的「第 x 关」统计,而那个 level 是前缀规则猜的,
 * 和 which-key 的真实分组无关。现在直接按 `b.group` ——
 * 分类名和你在 nvim 里按 `<Space>` 看到的 which-key 面板一致。
 */
/** ⚠️ 进度类型统一用 lib/srs.ts 的 —— 不要再各定义一套 */
type Progress = import("@/lib/srs").Progress;

export type StatsSection = "boards" | "groups" | "modes" | "tree" | "length";

export default function StatsView({
  bindings,
  groupNames,
  progress,
  only,
}: {
  bindings: Binding[];
  groupNames: Record<string, string>;
  progress: Progress;
  /** 只显示某几节。不传 = 全显示 */
  only?: StatsSection[];
}) {
  const groups = useMemo(() => groupStats(bindings, groupNames), [bindings, groupNames]);
  const modes = useMemo(() => modeTotals(bindings), [bindings]);
  const tree = useMemo(() => prefixTree(bindings), [bindings]);
  /**
   * binding id → 命令 id 的映射。
   *
   * ⚠️ 没有它，次解那几条 binding 会被算成「没见过」——
   *    因为进度是按命令记的（见 lib/stats.ts 的说明）。
   */
  const cmdIdOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of COMMANDS) {
      m.set(c.id, c.id);
      for (const a of c.alternates) {
        // 次解的 binding id 形如 `n|]b`，指向所属命令
        const mode = c.id.split("|")[0];
        m.set(`${mode}|${a}`, c.id);
      }
    }
    return m;
  }, []);
  const prog = useMemo(
    () => progressByGroup(bindings, progress, groupNames, cmdIdOf),
    [bindings, progress, groupNames, cmdIdOf],
  );

  const maxTotal = Math.max(1, ...groups.map((g) => g.total));
  const maxTree = Math.max(1, ...tree.map((n) => n.count));
  const show = (s: StatsSection) => !only || only.includes(s);

  const sections: { id: StatsSection; title: string; hint?: string; render: () => React.ReactNode }[] = [
    {
      /**
       * ⚠️ 「按板块」和「按 which-key 分组」是**两个维度**，都要有。
       *
       * 首页按板块算进度（`buffers`），而 `/stats` 原来只有 which-key 分组
       * （`L` 属于 `bare` 而不是 `buffer`）—— 于是同一个「缓冲区」
       * 两处两个数，用户看着像 bug。
       *
       * 这一节用**和首页同一个函数**（`SRS.byBoard`）统计，
       * 所以两边的数字必然一致。
       */
      id: "boards",
      title: "按板块",
      hint: "和首页同一套口径（分母 = 各板块题库长度）。点板块名进对应练习页",
      render: () => {
        const byBoard = SRS.byBoard(progress);
        const max = Math.max(1, ...BOARD_DEFS.map((b) => b.total));
        return (
          <div className="space-y-1">
            {BOARD_DEFS.map((b) => {
              const st = byBoard[b.id] ?? { mastered: 0, shaky: 0, fresh: b.total, total: 0 };
              return (
                <div key={b.id} className="flex items-center gap-2 text-xs">
                  <Link
                    href={b.href}
                    className="w-24 shrink-0 truncate text-right text-neutral-400 hover:text-blue-400"
                  >
                    {b.name}
                  </Link>
                  <div className="relative h-4 flex-1 rounded bg-neutral-950">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-neutral-700"
                      style={{ width: `${(b.total / max) * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-blue-900"
                      style={{
                        width: `${((st.mastered + st.shaky) / max) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-blue-600"
                      style={{ width: `${(st.mastered / max) * 100}%` }}
                    />
                    <span className="absolute inset-y-0 left-1.5 flex items-center text-[10px] text-white mix-blend-difference">
                      {st.mastered}/{b.total}
                    </span>
                  </div>
                  <span className="w-20 shrink-0 text-right text-[10px] text-neutral-600">
                    {st.fresh > 0 ? `没见过 ${st.fresh}` : "全见过"}
                  </span>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      id: "groups",
      title: "分组分布",
      hint: "分组名来自 which-key 的 group 声明,和 nvim 里按 <Space> 看到的一致。条形长度 = 该组条数",
      render: () => (
        <div className="space-y-1">
          {groups.map((g) => {
            const p = prog.find((x) => x.group === g.group);
            const mastered = p?.mastered ?? 0;
            const seen = p ? p.mastered + p.shaky : 0;
            return (
              <div key={g.group} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-right text-neutral-500">{g.name}</span>
                <div className="relative h-4 flex-1 rounded bg-neutral-950">
                  {/* 三段从宽到窄画,窄的压在上面 —— 反过来会被盖住 */}
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-neutral-700"
                    style={{ width: `${(g.total / maxTotal) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-blue-900"
                    style={{ width: `${(seen / maxTotal) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-blue-600"
                    style={{ width: `${(mastered / maxTotal) * 100}%` }}
                  />
                  <span className="absolute inset-y-0 left-1.5 flex items-center text-[10px] text-white mix-blend-difference">
                    {g.total}
                  </span>
                </div>
                {/* 有多少条真的落在 which-key 分组树里 —— 其余是按形态兜底归的 */}
                <span className="w-28 shrink-0 truncate text-[10px] text-neutral-600">
                  {g.inWhichKey === g.total ? "which-key" : `${g.inWhichKey}/${g.total} 有分组`}
                </span>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      id: "modes",
      title: "模式分布",
      hint: "日常主要在 Normal 模式,那一段最宽是正常的",
      render: () => (
        <>
          <div className="flex h-7 overflow-hidden rounded">
            {modes.map((m) => (
              <div
                key={m.mode}
                className="flex items-center justify-center text-[10px] text-black"
                style={{ width: `${(m.count / bindings.length) * 100}%`, background: modeColor(m.mode) }}
                title={`${m.label}: ${m.count}`}
              >
                {m.count}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-500">
            {modes.map((m) => (
              <span key={m.mode} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: modeColor(m.mode) }} />
                {m.label} {m.count}
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      id: "tree",
      title: "leader 子树",
      hint: "一格 = 一个唯一键。同一个键的多个模式只画一次",
      render: () => (
        <div className="space-y-2">
          {tree.map((n) => (
            <div key={n.prefix} className="flex items-start gap-2 text-xs">
              <span className="w-16 shrink-0 pt-0.5 font-bold text-neutral-300">{n.prefix}</span>
              <div className="min-w-0 flex-1">
                <div
                  className="mb-1 h-0.5 rounded bg-neutral-800"
                  style={{ width: `${(n.count / maxTree) * 100}%` }}
                />
                <div className="flex flex-wrap gap-1">
                  {n.children.map((c) => (
                    <span
                      key={c.key}
                      className="rounded border border-neutral-800 px-1 text-[10px] text-neutral-400"
                      title={c.groups.map((g) => groupNames[g] ?? g).join(" / ")}
                    >
                      {c.key.slice(7) || "␣"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "length",
      title: "按键长度",
      hint: "序列越长越难记。平均 2.5 以上标黄",
      render: () => (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-600">
              <th className="text-left font-normal">分组</th>
              <th className="text-right font-normal">条数</th>
              <th className="text-right font-normal">唯一键</th>
              <th className="text-right font-normal">平均按键</th>
              <th className="text-right font-normal">最长</th>
            </tr>
          </thead>
          <tbody className="text-neutral-400">
            {groups.map((g) => (
              <tr key={g.group}>
                <td className="truncate">{g.name}</td>
                <td className="text-right">{g.total}</td>
                <td className="text-right text-neutral-600">{g.uniqueKeys}</td>
                <td className={`text-right ${g.avgKeys > 2.5 ? "text-amber-400" : ""}`}>{g.avgKeys}</td>
                <td className="text-right text-neutral-600">{g.longest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {sections.filter((s) => show(s.id)).map((s) => (
        <section key={s.id}>
          <h2 className="mb-1 text-sm font-bold text-neutral-300">{s.title}</h2>
          {s.hint && <p className="mb-2 text-[11px] text-neutral-600">{s.hint}</p>}
          {s.render()}
        </section>
      ))}
    </div>
  );
}

const MODE_COLORS: Record<string, string> = {
  n: "#3b82f6",
  v: "#8b5cf6",
  x: "#a855f7",
  o: "#ec4899",
  c: "#f59e0b",
  i: "#10b981",
  s: "#14b8a6",
  t: "#6b7280",
};

function modeColor(m: string): string {
  return MODE_COLORS[m] ?? "#6b7280";
}
