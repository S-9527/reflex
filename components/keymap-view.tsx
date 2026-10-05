"use client";

import { useMemo, useState } from "react";
import type { Binding } from "@/lib/matcher";
import { prefixOf } from "@/lib/stats";

/**
 * 键位位置图 —— 把 290 个键画在物理键盘上。
 *
 * ## 为什么要画位置而不是列表
 *
 * Vim 的键位有强空间结构:`hjkl` 十字、`fdt` 一排、`gr` 同一格不同层。
 * 列成清单看不出"这些键在手指下挨着",画在键盘上能看出分组和距离 ——
 * 这正是形成肌肉记忆时大脑用的东西。
 *
 * ## 只画能被物理键表达的
 *
 * `<leader>ff` 这种多键序列画不出来(第一键是空格,后面才是 f)。
 * 所以这里只画**单键**和**两键**里那个有意义的单键,并标注它属于哪些序列。
 */

/** QWERTY 主键区(不含功能键区)。行 → 每行的键 */
const ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];

/** 非字母的键单独列 */
const SPECIAL: { key: string; label: string; hint: string }[] = [
  { key: "<Space>", label: "Space", hint: "leader 前缀" },
  { key: "<CR>", label: "Enter", hint: "回车" },
  { key: "<Esc>", label: "Esc", hint: "回 Normal" },
  { key: "<Tab>", label: "Tab", hint: "" },
  { key: "<BS>", label: "Bksp", hint: "" },
  { key: "<Up>", label: "↑", hint: "" },
  { key: "<Down>", label: "↓", hint: "" },
  { key: "<Left>", label: "←", hint: "" },
  { key: "<Right>", label: "→", hint: "" },
];

/** 一个键上挂的东西 */
type Cell = {
  /** 实际键(小写可打印) */
  ch: string;
  /** 绑定的完整 display,如 "<Space>ff" */
  displays: string[];
  /** 这些键分别属于哪些分组(which-key 的名字) */
  groups: string[];
  count: number;
};

export default function KeymapView({
  bindings,
  groupNames = {},
}: {
  bindings: Binding[];
  groupNames?: Record<string, string>;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const cells = useMemo(() => {
    const map = new Map<string, Cell>();
    for (const b of bindings) {
      // 只看序列的最后一个键 —— <Space>ff 归到 f
      const last = b.display.replace(/^<Space>/, "");
      // 剥掉可能的尾部修饰标记,只留主字符
      const m = last.match(/^([a-zA-Z0-9,.;'/\[\]\\`<>-])$/);
      const ch = m ? m[1].toLowerCase() : "";
      if (!ch) continue;
      if (!map.has(ch)) map.set(ch, { ch, displays: [], groups: [], count: 0 });
      const c = map.get(ch)!;
      if (!c.displays.includes(b.display)) c.displays.push(b.display);
      const label = groupNames[b.group] ?? b.group;
      if (!c.groups.includes(label)) c.groups.push(label);
      c.count++;
    }
    return map;
  }, [bindings, groupNames]);

  const maxCount = Math.max(1, ...[...cells.values()].map((c) => c.count));

  const cellCls = (c: Cell | undefined) => {
    if (!c) return "border-neutral-900 bg-neutral-950 text-neutral-800";
    const t = c.count / maxCount;
    if (t > 0.6) return "border-blue-600 bg-blue-900 text-blue-100";
    if (t > 0.3) return "border-blue-800 bg-blue-950 text-blue-200";
    return "border-neutral-700 bg-neutral-900 text-neutral-400";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1" style={{ paddingLeft: `${ri * 6}px` }}>
            {row.map((k) => {
              const c = cells.get(k);
              return (
                <button
                  key={k}
                  onMouseEnter={() => setHover(k)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex h-11 w-10 items-center justify-center rounded border text-sm font-bold uppercase transition-colors ${cellCls(c)}`}
                  title={c ? `${c.displays.join("  ")}\n${c.groups.join(" / ")}` : "数据集里没有这个键"}
                >
                  {k}
                  {c && <span className="ml-0.5 text-[9px] font-normal opacity-60">{c.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SPECIAL.map((s) => {
          const c = cells.get(s.key);
          return (
            <span
              key={s.key}
              className={`rounded border px-2 py-1 text-[11px] ${cellCls(c)}`}
              title={c ? `${c.displays.join("  ")}\n${c.groups.join(" / ")}` : s.hint}
            >
              {s.label}
              {c && <span className="ml-1 opacity-60">{c.count}</span>}
            </span>
          );
        })}
      </div>

      <div className="space-y-1 text-[11px] text-neutral-600">
        <p>
          颜色深浅 = 该键在数据集里出现的次数。鼠标悬停看具体是哪几个序列。
          多键序列只把最后一个键画在这里(<code>&lt;Space&gt;ff</code> 记在 <code>f</code> 上)。
        </p>
        <p className="rounded border border-amber-900 bg-amber-950/20 p-2 text-amber-300/90">
          ⚠️ <b>这张图有个重要局限,别被它误导。</b>
          数据集只来自 <code>nvim_get_keymap</code>,也就是 <b>LazyVim 插件注册的映射</b>。
          Vim/Neovim 内建的键(移动 <code>hjkl</code>、<code>w/b/e</code>、<code>0/$</code>、
          计数 <code>3dd</code>、<code>.</code> 重复)不在里面 ——
          所以它们在图上是黑的,<b>不是"不用练",是"根本没采集"</b>。
          <br />
          你真正要练的内建键在书第 2、6、7、8、13 章,那张图管不着。
        </p>
      </div>

      {hover && cells.has(hover) && (
        <div className="rounded border border-neutral-800 bg-neutral-900/50 p-3 text-xs">
          <div className="mb-1 font-bold text-neutral-300">
            {hover}({cells.get(hover)!.count} 条)
          </div>
          <div className="flex flex-wrap gap-1">
            {cells.get(hover)!.displays.map((d) => (
              <span key={d} className="rounded bg-neutral-800 px-1 text-blue-300">
                {d}
              </span>
            ))}
          </div>
          <div className="mt-1 text-neutral-600">{cells.get(hover)!.groups.join(" / ")}</div>
        </div>
      )}
    </div>
  );
}
