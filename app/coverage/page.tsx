"use client";

/**
 * 覆盖率对照 —— 「Vim 有什么」× 「reflex 练了没有」。
 *
 * ## ⚠️⚠️ 为什么需要这一页（以及为什么它必须是页面，不是文档）
 *
 * 用户问过两次「练全了没有」。我前两次都是**写一段文字回答**，
 * 结果两次都答得不对：
 *
 * 1. 第一次说「补完了 90 条核心操作」—— 那份清单是**我自己凭印象列的**
 * 2. 第二次说「覆盖率 19%」—— 数字对，但**列不出到底缺哪些**
 *
 * 根因是：**没有一张权威的、随时可查的对照表**。
 * 靠人记、靠临时脚本算，都会漏、都会过期。
 *
 * 所以做成页面：分母是 Vim 官方的 `doc/index.txt`（479 条命令），
 * 分子是 reflex 全部板块的题库，逐条标状态 ——
 * **缺口自己浮出来，不依赖我想到没想到**。
 *
 * ## 三种状态怎么分
 *
 * | 状态 | 含义 |
 * |------|------|
 * | ✅ 已练 | 有题在练它（最优解 / 等价键 / 原生等价都算） |
 * | ↪ 别名 | 是别的命令的别名（`<BS>` = `h`）—— 练那条就够 |
 * | ⏳ 等参数 | 带 `{...}` 占位符（`{register}` / `{count}%`）—— 不是独立键 |
 * | 🚫 文档说不用 | index.txt 标记 `not used` |
 * | ❌ **缺口** | 没题、不是别名、不是参数 —— **这才是「还差什么」** |
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VIM_INDEX } from "@/lib/vim-index";
import { allDrilled } from "@/lib/coverage-pool";
import {
  buildReport,
  effectiveTotal,
  type CoverageRow,
  type CoverageState,
} from "@/lib/coverage-report";

/** 章节 → 中文名（index.txt 的 section id） */
const SECTION_NAME: Record<string, string> = {
  normal: "Normal 模式",
  objects: "文本对象",
  window: "窗口命令 <C-w>X",
  bracket: "[ / ] 跳转族",
  g: "g 前缀",
  z: "z 前缀（折叠/滚动/拼写）",
};

const STATE_META: Record<
  CoverageState,
  { label: string; cls: string; badge: string }
> = {
  covered: { label: "已练", cls: "text-green-400", badge: "bg-green-950 text-green-400" },
  alias: { label: "别名", cls: "text-neutral-500", badge: "bg-neutral-800 text-neutral-400" },
  prefix: { label: "前缀", cls: "text-blue-400/80", badge: "bg-blue-950 text-blue-300" },
  needsParam: { label: "等参数", cls: "text-neutral-600", badge: "bg-neutral-800 text-neutral-500" },
  notUsed: { label: "文档说不用", cls: "text-neutral-700", badge: "bg-neutral-900 text-neutral-600" },
  missing: { label: "缺口", cls: "text-red-400", badge: "bg-red-950 text-red-400" },
};

type Filter = CoverageState | "all" | "gaps";

export default function CoveragePage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("gaps");
  const [section, setSection] = useState<string>("all");

  /** ⚠️ 报告只在数据变化时算一次 —— 479 条逐条判定，别每帧跑 */
  const report = useMemo(() => buildReport(VIM_INDEX, allDrilled()), []);

  const eff = effectiveTotal(report);

  const rows = useMemo(() => {
    let r: CoverageRow[] = report.rows;
    if (section !== "all") r = r.filter((x) => x.entry.section === section);
    if (filter === "all") return r;
    if (filter === "gaps") return r.filter((x) => x.state === "missing");
    return r.filter((x) => x.state === filter);
  }, [report, filter, section]);

  /** 按章节统计（给顶部的分组条用） */
  const bySection = useMemo(() => {
    const m = new Map<string, { total: number; covered: number; missing: number }>();
    for (const row of report.rows) {
      const s = row.entry.section;
      const cur = m.get(s) ?? { total: 0, covered: 0, missing: 0 };
      cur.total++;
      if (row.state === "covered") cur.covered++;
      if (row.state === "missing") cur.missing++;
      m.set(s, cur);
    }
    return m;
  }, [report]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 font-mono">
      <h1 className="text-xl font-bold">
        <button onClick={() => router.push("/")} className="hover:text-blue-400">
          ← reflex
        </button>
      </h1>
      <p className="mt-1 text-xs text-neutral-500">
        覆盖率对照 · 分母是 Vim 官方的 <code>doc/index.txt</code>（
        {report.total} 条命令）· 分子是 reflex 全部板块的题库
      </p>

      {/* 总览 */}
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
          <span className="text-neutral-400">
            覆盖率{" "}
            <b className="text-2xl text-green-400">
              {((report.byState.covered / eff) * 100).toFixed(0)}%
            </b>
            <span className="ml-1 text-neutral-600">
              （{report.byState.covered} / {eff}）
            </span>
          </span>
          <span className="text-[10px] text-neutral-600">
            分母已排除别名 / 等参数 / 文档说不用
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-neutral-800">
          <div
            className="h-full bg-green-500"
            style={{ width: `${(report.byState.covered / eff) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {(["covered", "alias", "prefix", "needsParam", "notUsed", "missing"] as CoverageState[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded px-1.5 py-0.5 ${STATE_META[s].badge} ${
                  filter === s ? "ring-1 ring-blue-400" : ""
                }`}
              >
                {STATE_META[s].label} {report.byState[s]}
              </button>
            ),
          )}
        </div>
      </div>

      {/* 章节筛选 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip active={filter === "gaps"} onClick={() => setFilter("gaps")}>
          只看缺口
          <span className="ml-1.5 text-red-400">{report.byState.missing}</span>
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          全部
          <span className="ml-1.5 text-neutral-600">{report.total}</span>
        </Chip>
        <span className="mx-1 text-neutral-800">|</span>
        <Chip active={section === "all"} onClick={() => setSection("all")}>
          所有章节
        </Chip>
        {[...bySection.entries()].map(([s, v]) => (
          <Chip key={s} active={section === s} onClick={() => setSection(s)}>
            {SECTION_NAME[s] ?? s}
            <span className="ml-1.5 text-neutral-600">
              {v.covered}/{v.total}
            </span>
          </Chip>
        ))}
      </div>

      {/* 列表 */}
      <div className="mt-3 text-[11px] text-neutral-600">
        显示 <b className="text-neutral-400">{rows.length}</b> 条
        {filter === "gaps" && rows.length === 0 && (
          <span className="ml-2 text-green-400">—— 这个筛选下没有缺口 🎉</span>
        )}
      </div>

      <div className="mt-2 divide-y divide-neutral-900 rounded border border-neutral-800">
        {rows.slice(0, 400).map((r, i) => (
          <Row key={`${r.entry.vim}-${i}`} row={r} />
        ))}
      </div>

      {rows.length > 400 && (
        <div className="mt-2 text-[11px] text-neutral-600">
          …还有 {rows.length - 400} 条（用上面的筛选缩小范围）
        </div>
      )}

      {/* 数据来源说明 */}
      <div className="mt-8 text-[10px] leading-relaxed text-neutral-700">
        <div className="mb-1 text-neutral-500">数据来源</div>
        <div>
          <b className="text-neutral-400">分母</b>：Vim 官方参考手册的{" "}
          <code>doc/index.txt</code> —— 它列出了每个 mode 的**全部**命令。
          抽取脚本 <code>scripts/build-vim-index.mjs</code>，
          产物 <code>data/vim-index.json</code>。
        </div>
        <div className="mt-1">
          <b className="text-neutral-400">分子</b>：reflex 全部板块的题库
          （<code>lib/coverage-pool.ts</code> 汇总，和页面用的是同一份）。
        </div>
        <div className="mt-1">
          ⚠️ <code>nvim_get_keymap</code> <b>看不见内建命令</b> ——
          实测它里面根本没有 <code>h</code> <code>l</code> <code>m</code>{" "}
          <code>q</code> <code>:</code> <code>ZZ</code>。
          所以只拿它判断覆盖率会系统性漏掉一大块。这一页的分母必须用{" "}
          <code>index.txt</code>。
        </div>
        <div className="mt-1">
          只收了 Normal / 文本对象 / 窗口 / [ ] / g / z 六个章节 ——
          Insert、Command-line、Ex 是另一回事（这一族练的是 Normal 反射）。
        </div>
      </div>
    </main>
  );
}

function Row({ row }: { row: CoverageRow }) {
  const meta = STATE_META[row.state];
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 hover:bg-neutral-900/40">
      <span className={`w-16 shrink-0 rounded px-1 text-center text-[10px] ${meta.badge}`}>
        {meta.label}
      </span>
      <code className={`w-24 shrink-0 truncate ${meta.cls}`} title={row.entry.char}>
        {row.entry.vim}
      </code>
      <span className="flex-1 text-neutral-400">{row.entry.action}</span>
      <span className="w-56 shrink-0 text-right text-[10px] text-neutral-600">
        {row.state === "covered" && row.via[0] && (
          <span title={row.via.join("\n")}>→ {row.via[0].slice(0, 28)}</span>
        )}
        {row.state === "alias" && row.resolvedAlias && <span>→ {row.resolvedAlias}</span>}
        {row.state === "prefix" && row.prefixNote && (
          <span className="text-blue-400/60">{row.prefixNote}</span>
        )}
        {row.state === "missing" && row.resolvedAlias && (
          <span className="text-amber-600/80">缺的是 {row.resolvedAlias}</span>
        )}
      </span>
    </div>
  );
}

function Chip({
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
