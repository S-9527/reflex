"use client";

import {
  SRC,
  SPEC,
  BARE_LETTERS,
  locate,
  slice,
  findSpec,
  type ObjSpec,
  type Range,
} from "@/lib/textobj";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, useDrill } from "@/lib/use-drill";
import {
  AcceptList,
  FlashLine,
  KeyLog,
  PendingHint,
  Provenance,
  TaskBar,
  TaskBox,
} from "@/lib/drill-ui";

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
 * ## 这一页修掉的一个死 bug
 *
 * 原来按键链路上 `q.obj.startsWith(k)` 拿整个 obj 去 startsWith 每次单键,
 * 于是 `iw` 按到 `w` 时 `"iw".startsWith("w")` 恒为 false → 缓冲清空,
 * **任何一题都按不到终点**。而且 `settle` 定义了但全文件从未被调用。
 * 现在换成公共引擎的「前缀匹配 + 命中结算」,和另外四页同一套判据。
 *
 * ## 核心只有一件事:inner vs around
 *
 *   diw → `local| total`   ← 留一个空格
 *   daw → `|total`        ← 连空格一起删
 *
 * 差一个字符,肉眼看不出来,但在真机上会留下多余空格。
 */
type Q = {
  obj: string;
  line: number;
  col: number;
};

const QUESTIONS: Q[] = [
  { obj: "iw", line: 1, col: 1 },
  { obj: "aw", line: 1, col: 1 },
  { obj: "iw", line: 1, col: 7 },
  { obj: 'i"', line: 2, col: 15 },
  { obj: 'a"', line: 2, col: 15 },
  { obj: "i'", line: 5, col: 19 },
  { obj: "a'", line: 5, col: 19 },
  { obj: "i(", line: 1, col: 21 },
  { obj: "a(", line: 1, col: 21 },
  { obj: "i{", line: 5, col: 12 },
  { obj: "a{", line: 5, col: 12 },
];

/**
 * ⚠️ 解法是**三键**:`d` + 操作对象。
 *
 * 不能只收 `["i","w"]` 那种两键 —— 裸 `i` 在可视模式下是
 * "Inside textobject" 前缀(实测),在 Normal 里则是插入命令。
 * 少了 `d` 会让用户以为 `iw` 本身就是个能按的东西。
 *
 * 操作符 `d` / `c` / `y` / `v` 四个都算对:
 * 它们对**选中范围**的影响完全一样(都是作用于范围),
 * 这一页练的是「选中哪一块」,不是「用哪个操作符」。
 */
const OPERATORS = ["d", "c", "y", "v"];

const TASKS: DrillTask[] = QUESTIONS.map((q, i) => ({
  id: `${q.obj}@${q.line}:${q.col}#${i}`,
  short: `${q.obj}`,
  desc: SPEC.find((s) => s.key === q.obj)?.desc ?? q.obj,
  accept: OPERATORS.map((op) => [op, ...q.obj.split("")]),
}));
const Q_OF = new Map<string, Q>(QUESTIONS.map((q, i) => [`${q.obj}@${q.line}:${q.col}#${i}`, q]));

export default function TextObjDrill() {
  const d = useDrill<null>({
    boardId: "text",
    tasks: TASKS,
    init: () => null,
    // 这一页没有可变状态 —— 练的是「选中哪一块」,选完就翻页。
    // apply 永不失败:题目区已经把范围高亮出来了,判据是键本身。
    apply: (_seq, s) => s,
    toPanelKey: defaultToPanelKey,
    advanceMs: 1600,
  });

  const q = Q_OF.get(d.task.id)!;
  const spec = findSpec(q.obj)!;
  const range: Range | null = locate(SRC, spec.kind, spec.edge, q.line, q.col);

  return (
    <div className="space-y-4">
      <TaskBar
        tasks={TASKS}
        current={d.taskIndex}
        solved={d.solved}
        onPick={d.setTaskIndex}
        onReset={d.reset}
      />

      {/* 题目:范围已经高亮出来,练的是「按哪几个键能选中它」 */}
      <TaskBox>
        <div className="flex flex-wrap items-baseline gap-2 text-neutral-300">
          <span>光标在第 {q.line} 行第 {q.col} 列,按</span>
          <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">d</kbd>
          <span>加</span>
          <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{q.obj}</kbd>
          <span>会选中下面高亮的那一块</span>
        </div>
        <div className="mt-1 text-neutral-500">{spec.desc}</div>
        <AcceptList task={d.task} />
        <PendingHint pending={d.pending} />
      </TaskBox>

      <CodeView line={q.line} col={q.col} range={range} />

      <KeyLog log={d.log} hint="按 d(删) c(改) y(拷) v(选),再按对象那几个键" />
      <FlashLine flash={d.flash} />

      {/* inner / around 对照 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">inner vs around(实测对照,差别就在空白)</div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {["iw", 'i"', "i'", "i(", "i{", "ip"].map((inner) => {
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

      {/* 裸字母对照 —— 原来完全没有的一节 */}
      <div className="rounded border border-amber-900/50 bg-amber-950/10 p-2 text-[11px]">
        <div className="mb-1 text-amber-300/90">
          ⚠️ 同一个字母,加不加 <code className="text-blue-300">i</code>/
          <code className="text-blue-300">a</code> 前缀是两回事
        </div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {BARE_LETTERS.map((b) => (
            <div key={b.bare} className="flex gap-1.5 text-neutral-400">
              <code className="w-6 shrink-0 text-amber-300">{b.bare}</code>
              <span className="w-32 shrink-0 truncate text-neutral-500">{b.bareMeans}</span>
              {b.inner && (
                <>
                  <code className="w-8 shrink-0 text-blue-400/80">{b.inner}</code>
                  <code className="w-8 shrink-0 text-blue-400/80">{b.around}</code>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 border-t border-amber-900/40 pt-1.5 text-neutral-500">
          实测(可视模式下 <code>v</code>+键+<code>&lt;Esc&gt;</code>,读两端):
          <code>va</code> 和 <code>vi</code> <b>光标不动</b> —— 它们不是 motion,
          是「等下一个键」的前缀(<code>nvim_get_keymap("v")</code> 里 desc 分别是
          <i>Around textobject</i> / <i>Inside textobject</i>,rhs 为 nil)。
          而 <code>vl</code> 会选中往右一格(<code>lo</code>)——
          字母一样,但 <code>il</code>/<code>al</code> 选的是整行。
        </div>
      </div>

      {/* 实测记录表 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">实测记录(跑 d + 这个键之后,那一行变成什么)</div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {SPEC.filter((s) => s.measured).map((s) => (
            <div key={s.id} className="flex gap-1.5 text-neutral-500">
              <code className="w-10 shrink-0 text-blue-400/80">d{s.key}</code>
              <span className="truncate text-neutral-600">→ {s.measured!.result}</span>
            </div>
          ))}
        </div>
      </div>

      <Provenance>
        这些键在 <code>nvim_get_keymap</code> 里<b>查不到</b> —— 它们是 Vim 内建命令,
        没有 <code>desc</code>,会被 dump 脚本「跳过无描述」的规则滤掉。
        范围是<b>破坏性实测</b>出来的:造已知内容 → 落到指定位置 →
        <code>:normal! d(键)</code> → diff 结果。<code>|</code> 标的是原来光标所在列。
        <code>para</code> / <code>indent</code> / <code>line</code> 这几个依赖 Vim 内部的
        段落与缩进规则,<b>不硬算</b> —— 算错了比不算更糟,只列实测结果。
      </Provenance>
    </div>
  );
}

/** 画代码,高亮出 range */
function CodeView({ line, col, range }: { line: number; col: number; range: Range | null }) {
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 text-[10px] text-neutral-700">
        高亮 = 按这个键会选中的范围
        {range
          ? ` · 第 ${range.l1}-${range.l2} 行 第 ${range.c1}-${range.c2} 列`
          : " · 这个键的范围没建模"}
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