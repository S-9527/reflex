"use client";

import { useMemo } from "react";
import {
  levelStats,
  modeTotals,
  prefixTree,
  progressByLevel,
  MODE_LABEL,
  type ProgressView,
} from "@/lib/stats";
import type { Binding } from "@/lib/matcher";

/**
 * 数据集全貌 —— 三个视图:关卡条形图 / 模式分布 / leader 树。
 *
 * 存在的理由:之前想知道"分屏键在哪一关""第 4 关为什么 79 条",
 * 只能读代码或临时跑脚本。数据一散,就得反推。
 */
export default function StatsView({
  bindings,
  levelNames,
  progress,
}: {
  bindings: Binding[];
  levelNames: Record<number, string>;
  progress: Record<string, { seen: number; correct: number; streak: number; lastAt: number }>;
}) {
  const levels = useMemo(() => levelStats(bindings, levelNames), [bindings, levelNames]);
  const modes = useMemo(() => modeTotals(bindings), [bindings]);
  const tree = useMemo(() => prefixTree(bindings), [bindings]);
  const prog = useMemo(() => progressByLevel(bindings, progress), [bindings, progress]);

  const maxTotal = Math.max(...levels.map((l) => l.total), 1);
  const maxTree = Math.max(...tree.map((n) => n.count), 1);

  return (
    <div className="space-y-8">
      <Section title="关卡分布" hint="条形长度 = 该关条目数。灰色尾巴是还没练过的">
        <div className="space-y-1">
          {levels.map((l) => {
            const p = prog.find((x) => x.level === l.level);
            const done = p ? p.mastered + p.shaky : 0;
            const mastered = p ? p.mastered : 0;
            return (
              <div key={l.level} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-right text-neutral-500">{l.name}</span>
                <div className="relative h-4 flex-1 rounded bg-neutral-900">
                  {/* 分三段叠在同一条上:已掌握 / 已见过 / 没见过。
                      不用两个 div 叠加 —— 那样后半段会盖住前半段。 */}
                  <div className="absolute inset-0 overflow-hidden rounded">
                    <div
                      className="absolute inset-y-0 left-0 bg-blue-600"
                      style={{ width: `${(mastered / maxTotal) * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-blue-900"
                      style={{ width: `${(done / maxTotal) * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-neutral-700"
                      style={{ width: `${(l.total / maxTotal) * 100}%` }}
                    />
                  </div>
                  <span className="absolute inset-y-0 left-1 flex items-center text-[10px] text-neutral-100 mix-blend-difference">
                    {l.total}
                  </span>
                </div>
                <span className="w-24 shrink-0 truncate text-neutral-600">{l.groupLabel}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="模式分布" hint="日常主要在 Normal 模式,那一行最粗是正常的">
        <div className="flex h-8 overflow-hidden rounded">
          {modes.map((m) => (
            <div
              key={m.mode}
              className="flex items-center justify-center text-[10px] text-black"
              style={{
                width: `${(m.count / bindings.length) * 100}%`,
                background: modeColor(m.mode),
              }}
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
      </Section>

      <Section title="leader 子树" hint="一格 = 一个唯一键。同一个键的 4 个模式只画一次">
        <div className="space-y-1">
          {tree.map((n) => (
            <div key={n.prefix} className="flex items-start gap-2 text-xs">
              <span className="w-20 shrink-0 pt-0.5 font-bold text-neutral-300">{n.prefix}</span>
              <div className="flex-1">
                <div className="mb-0.5 h-1 rounded bg-neutral-800" style={{ width: `${(n.count / maxTree) * 100}%` }} />
                <div className="flex flex-wrap gap-1">
                  {n.children.map((c) => (
                    <span
                      key={c.key}
                      className="rounded border border-neutral-800 px-1 text-[10px] text-neutral-400"
                      title={`关卡 ${c.levels.join(", ")}`}
                    >
                      {c.key.slice(7)}
                      {c.levels.length > 1 && <span className="ml-0.5 text-neutral-600">×{c.levels.length}</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="按键长度" hint="序列越长越难记。平均 2 以上就该警惕">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-600">
              <th className="text-left font-normal">关卡</th>
              <th className="text-right font-normal">条数</th>
              <th className="text-right font-normal">唯一键</th>
              <th className="text-right font-normal">平均按键</th>
              <th className="text-right font-normal">最长</th>
            </tr>
          </thead>
          <tbody className="text-neutral-400">
            {levels.map((l) => (
              <tr key={l.level}>
                <td className="truncate">{l.name}</td>
                <td className="text-right">{l.total}</td>
                <td className="text-right text-neutral-600">{l.uniqueKeys}</td>
                <td className={`text-right ${l.avgKeys > 2.5 ? "text-amber-400" : ""}`}>{l.avgKeys}</td>
                <td className="text-right text-neutral-600">{l.longest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-bold text-neutral-300">{title}</h2>
      {hint && <p className="mb-2 text-[11px] text-neutral-600">{hint}</p>}
      {children}
    </section>
  );
}

const MODE_COLORS: Record<string, string> = {
  n: "#3b82f6",
  v: "#8b5cf6",
  x: "#a855f7",
  o: "#ec4899",
  c: "#f59e0b",
};

function modeColor(m: string): string {
  return MODE_COLORS[m] ?? "#6b7280";
}
