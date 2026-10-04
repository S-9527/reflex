"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SRC,
  SPEC,
  OPERATORS,
  locate,
  slice,
  findSpec,
  type ObjSpec,
  type Operator,
  type Range,
} from "@/lib/textobj";

/**
 * 文本对象练习 —— 给你一段代码,高亮出「按这个键会选中哪一块」。
 *
 * ## 这一族在原数据集里是缺失的
 *
 * `iw` `aw` `ip` 这些是 Vim **内建**命令,`nvim_get_keymap` 里没有 `desc`,
 * 被 dump 脚本的「跳过无描述」规则滤掉了。所以整个家族得自己测。
 *
 * 测法是破坏性的:造已知内容 → 落到指定位置 → `:normal! d{textobject}` → diff。
 * 每条实测结果都记在 lib/textobj.ts 的 `measured` 字段里,可复现。
 *
 * ## 核心只有一件事:inner vs around
 *
 *   diw → `local| total`   ← 留一个空格
 *   daw → `|total`        ← 连空格一起删
 *
 * 差一个字符,肉眼看不出来,但在真机上会留下多余空格。
 * 所以页面上永远把这两个并排放着对比。
 */
type Q = {
  /** 要找的 textobject */
  obj: string;
  /** 光标落在第几行第几列 */
  line: number;
  col: number;
};

const QUESTIONS: Q[] = [
  { obj: "iw", line: 1, col: 1 },
  { obj: "aw", line: 1, col: 1 },
  { obj: "iw", line: 1, col: 7 },
  { obj: "iw", line: 2, col: 15 },
  { obj: "a\"", line: 2, col: 15 },
  { obj: "i'", line: 5, col: 17 },
  { obj: "a'", line: 5, col: 17 },
  { obj: "i(", line: 1, col: 21 },
  { obj: "a(", line: 1, col: 21 },
  { obj: "i{", line: 5, col: 12 },
  { obj: "a{", line: 5, col: 12 },
];

export default function TextObjDrill() {
  const [qi, setQi] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buf = useRef<string[]>([]);

  const q = QUESTIONS[qi];
  const spec = findSpec(q.obj)!;

  const reset = useCallback(() => {
    setLog([]);
    setFlash(null);
    buf.current = [];
  }, []);

  useEffect(() => {
    reset();
  }, [qi, reset]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const settle = useCallback(
    (typed: string[], op: Operator) => {
      setLog((l) => [...l, op + typed]);
      setFlash({ ok: true, text: `✓ ${op}${typed}` });
      setSolved((x) => (x.includes(qi) ? x : [...x, qi]));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setQi((i) => (i + 1) % QUESTIONS.length), 1600);
    },
    [qi],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;

      const k = e.key;

      // 第一键是操作符 d/c/y/v
      if (!buf.current.length) {
        if (!OPERATORS.some((o) => o.key === k)) return;
        e.preventDefault();
        buf.current = [k];
        return;
      }

      // 第二键:剩下的 textobject 部分(比如 iw 的先按 i)
      const op = buf.current[0] as Operator;
      const partial = q.obj.startsWith(k);
      if (partial) {
        e.preventDefault();
        buf.current = [...buf.current, k];
        return;
      }
      // 不匹配 —— 放行
      buf.current = [];
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [q.obj]);

  const typed = buf.current.join("");
  const range: Range | null = locate(SRC, spec.kind, spec.edge, q.line, q.col);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {QUESTIONS.map((x, i) => (
          <button
            key={x.obj + i}
            onClick={() => setQi(i)}
            className={`rounded border px-2 py-0.5 text-xs ${
              i === qi
                ? "border-blue-400 bg-blue-400 text-black"
                : solved.includes(i)
                  ? "border-green-800 text-green-500"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {solved.includes(i) && i !== qi ? "✓ " : ""}
            d{x.obj}
          </button>
        ))}
        <button onClick={reset} className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800">
          重来
        </button>
      </div>

      {/* 题目:高亮范围 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">光标在第 {q.line} 行第 {q.col} 列,按</span>
          <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">d</kbd>
          <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{q.obj}</kbd>
          <span className="text-neutral-400">会选中哪一块?</span>
        </div>
        <div className="mt-1 text-neutral-500">{spec.desc}</div>
        {typed && (
          <div className="mt-1 text-[11px] text-amber-300">
            已按 {typed} / {q.obj}
          </div>
        )}
      </div>

      <CodeView line={q.line} col={q.col} range={range} />

      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">按 d(删) 或 c(改) 或 y(拷) 或 v(选),再按 {q.obj}</span>
        ) : (
          log.map((x, i) => (
            <span key={i} data-keylog={i} className="rounded bg-neutral-800 px-1 text-blue-300">{x}</span>
          ))
        )}
      </div>
      {flash && (
        <div data-flash={flash.ok ? "ok" : "bad"} className={`text-xs ${flash.ok ? "text-green-400" : "text-red-400"}`}>
          {flash.text}
        </div>
      )}

      {/* inner / around 对照 —— 这一族唯一需要背的东西 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">inner vs around(实测对照,差别就在空白)</div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {["iw", "i\"", "i'", "i(", "i{", "ip"].map((inner) => {
            const si = findSpec(inner);
            const sa = findSpec(inner.replace(/^i/, "a"));
            if (!si || !sa) return null;
            // ⚠️ 用**各自的实测位置**,不能一律写 1:1 ——
            //   i" 在第 2 行、i' 在第 5 行,在第 1 行找当然找不到。
            const m = si.measured;
            if (!m) return null;
            const r1 = locate(SRC, si.kind, "inner", m.line, m.col);
            const r2 = locate(SRC, sa.kind, "around", m.line, m.col);
            const show = (r: typeof r1) => (r ? JSON.stringify(slice(SRC, r)) : "见下表");
            return (
              <div key={inner} className="flex gap-1.5 text-neutral-500">
                <code className="w-10 shrink-0 text-blue-400/80">{inner}</code>
                <code className="w-10 shrink-0 text-blue-400/80">{sa.key}</code>
                <span className="truncate text-neutral-600">
                  {show(r1)}
                  {r1 && r2 && ` vs ${show(r2)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 实测记录表 —— 数据来源可查 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">实测记录(跑 d + 这个键之后,那一行变成什么)</div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {SPEC.filter((s) => s.measured).map((s) => (
            <div key={s.key} className="flex gap-1.5 text-neutral-500">
              <code className="w-10 shrink-0 text-blue-400/80">d{s.key}</code>
              <span className="truncate text-neutral-600">→ {s.measured!.result}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] leading-relaxed text-neutral-700">
        这些键在 <code>nvim_get_keymap</code> 里<b>查不到</b> —— 它们是 Vim 内建命令,
        没有 <code>desc</code>,会被 dump 脚本「跳过无描述」的规则滤掉。
        范围是<b>破坏性实测</b>出来的:造已知内容 → 落到指定位置 →
        <code>:normal! d(键)</code> → diff 结果。<code>|</code> 标的是原来光标所在列。
        <code>para</code> / <code>indent</code> / <code>line</code> 这几个依赖 Vim 内部的
        段落与缩进规则,<b>不硬算</b> —— 算错了比不算更糟,只列实测结果。
      </div>
    </div>
  );
}

/** 画代码,高亮出 range */
function CodeView({ line, col, range }: { line: number; col: number; range: Range | null }) {
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 text-[10px] text-neutral-700">
        高亮 = 按这个键会选中的范围
        {range ? ` · 第 ${range.l1}-${range.l2} 行 第 ${range.c1}-${range.c2} 列` : " · 这个键的范围没建模"}
      </div>
      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
        {SRC.map((text, i) => {
          const ln = i + 1;
          const isLine = ln === line;
          return (
            <div key={ln} className={isLine ? "bg-neutral-900/60" : ""}>
              <span className="mr-3 inline-block w-5 text-right text-neutral-700">{ln}</span>
              <span>
                {!range || ln < range.l1 || ln > range.l2
                  ? text
                  : renderLine(text, ln, range, col)}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/** 单行内:把 range 覆盖的部分高亮,光标位置标出来 */
function renderLine(text: string, ln: number, range: Range, col: number) {
  const parts: React.ReactNode[] = [];
  const inRange = ln >= range.l1 && ln <= range.l2;
  const from = inRange ? Math.max(1, range.c1) : Infinity;
  const to = inRange ? range.c2 : -1;

  for (let i = 0; i < text.length; i++) {
    const c = i + 1;
    const ch = text[i];
    if (c === col && ch !== " ") {
      parts.push(
        <span key={i} className="rounded-sm bg-yellow-500/40 text-yellow-100">
          {ch}
        </span>,
      );
      continue;
    }
    if (c >= from && c <= to) {
      parts.push(
        <span key={i} className="rounded-sm bg-blue-600/50 text-blue-50">
          {ch}
        </span>,
      );
      continue;
    }
    parts.push(<span key={i}>{ch}</span>);
  }
  return parts;
}