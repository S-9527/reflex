"use client";

import { useEffect, useState } from "react";
import { toGrid, validate, type Layout } from "@/lib/layout";

/**
 * 窗口布局图。
 *
 * 画三样东西,刻意分开,因为第 9 章的混淆点正是它们被混为一谈:
 *   1. Tab    —— 右上角,只有真正多个 tab 才出现
 *   2. 窗口网格 —— 中间,按真实 row/col 摆
 *   3. Buffer 条 —— 底部一条,**不管有几个窗口都只有一条**(这是关键)
 */
export default function LayoutView({ layout }: { layout: Layout }) {
  const errs = validate(layout);
  const activeTab = layout.tabs.find((t) => t.active) ?? layout.tabs[0];
  const { grid, rowHeights, colWidths } = activeTab ? toGrid(activeTab) : { grid: [], rowHeights: [], colWidths: [] };
  const listed = layout.buffers.filter((b) => b.listed);
  // 用真实列宽比例分配宽度,让"不等宽分屏"一眼看出来
  const fr = (n: number) => `${(colWidths[n] / (colWidths.reduce((a, b) => a + b, 0) || 1)) * 100}%`;

  if (errs.length > 0) {
    return (
      <div className="rounded border border-red-900 bg-red-950/30 p-3 text-xs text-red-400">
        <div>布局数据自相矛盾,画出来的图不可信:</div>
        <ul className="mt-1 list-disc pl-5">
          {errs.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab 条:只有真多个 tab 才有 */}
      {layout.tabs.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500">Tab(整套布局):</span>
          {layout.tabs.map((t) => (
            <span
              key={t.tabnr}
              className={`rounded px-2 py-0.5 ${
                t.active ? "bg-yellow-500/20 text-yellow-300" : "bg-neutral-800 text-neutral-500"
              }`}
            >
              Tab {t.tabnr}
              <span className="ml-1 text-neutral-600">({t.wins.length} 窗口)</span>
            </span>
          ))}
        </div>
      )}

      {/* 窗口网格。列宽按真实比例,不等宽分屏一眼能看出来 */}
      <div
        className="grid gap-px rounded bg-neutral-800 p-px"
        style={{
          gridTemplateColumns: colWidths.map((_, i) => fr(i)).join(" ") || "1fr",
          gridTemplateRows: rowHeights.length ? rowHeights.map((h) => `${(h / rowHeights.reduce((a, b) => a + b, 0)) * 100}%`).join(" ") : undefined,
        }}
      >
        {grid.flat().map((w, i) =>
          w === null ? (
            <div key={i} className="bg-neutral-950" />
          ) : (
            <div
              key={i}
              className={`flex min-h-12 flex-col justify-between overflow-hidden p-1.5 text-[10px] ${
                w.active ? "bg-blue-950 ring-1 ring-blue-500" : "bg-neutral-900"
              }`}
            >
              <div className="truncate text-neutral-300" title={w.name}>
                {shortName(w.name)}
              </div>
              <div className="flex shrink-0 gap-2 text-neutral-600">
                <span>buf {w.buf}</span>
                <span>
                  {w.colspan}×{w.rowspan}
                </span>
                {w.active && <span className="text-blue-400">焦点</span>}
              </div>
            </div>
          ),
        )}
      </div>

      {/* Buffer 条:全局一条。窗口再多也只有这一条 */}
      <div className="text-xs">
        <div className="mb-1 text-neutral-500">
          Buffer(打开的文件)—— <span className="text-neutral-600">整个会话只有这一条,{layout.buffers.length} 个</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {listed.length === 0 && <span className="text-neutral-700">没有已列出的 buffer</span>}
          {listed.map((b) => {
            const inActive = activeTab?.wins.some((w) => w.buf === b.id) ?? false;
            const n = b.winids.length;
            return (
              <span
                key={b.id}
                title={b.name}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
                  inActive ? "bg-blue-950 text-blue-300" : "bg-neutral-900 text-neutral-500"
                }`}
              >
                {shortName(b.name)}
                {n > 1 && <span className="text-yellow-400">×{n} 窗口</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function shortName(p: string): string {
  if (p === "[No Name]") return p;
  const parts = p.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || p;
}
