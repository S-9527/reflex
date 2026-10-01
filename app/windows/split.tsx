"use client";

import { useCallback, useEffect, useState } from "react";
import {
  initial,
  split,
  close,
  moveFocus,
  shape,
  countWindows,
  positions,
  run,
  type Layout,
  type Op,
} from "@/lib/split";

/**
 * 分屏搭建训练 —— 给你一个目标布局,用 <Space>| / <Space>- / <Space>wd 拼出来。
 *
 * ## 和 /windows 的分工
 *
 * /windows 练「在已有布局里跳」,那页的布局是写死的。
 * 这一页练「把布局搭出来」—— 后者才是第 9.3 节真正教的东西,
 * 而且更依赖手感:竖切横切的顺序会决定最终的分割比例。
 *
 * ## 判分为什么可靠
 *
 * 页面自己维护窗口状态,按键就是状态转移函数。判据是
 * 「最终形状 == 目标形状」,不猜「你按了什么键」——
 * 所以不存在 dojo 那种「按对键但走错路算不算对」的歧义。
 */

/** 一道题:目标形状 + 达成它的操作序列(用于「看答案」) */
type Task = {
  name: string;
  hint: string;
  target: string;
  solution: Op[];
};

const TASKS: Task[] = [
  {
    name: "左右两栏",
    hint: "竖着切一刀",
    target: shape(run([{ dir: "v" }]).layout),
    solution: [{ dir: "v" }],
  },
  {
    name: "上下两栏",
    hint: "横着切一刀",
    target: shape(run([{ dir: "h" }]).layout),
    solution: [{ dir: "h" }],
  },
  {
    name: "三列并排",
    hint: "切两刀。注意:第二刀要切在<b>刚切出来那个窗口</b>上,不然会变成一宽一窄",
    target: shape(run([{ dir: "v" }, { dir: "v" }]).layout),
    solution: [{ dir: "v" }, { dir: "v" }],
  },
  {
    name: "四宫格",
    hint: "先竖切,再在<b>右边那个</b>上横切。反过来(先横后竖)得到的是另一种形状",
    target: shape(run([{ dir: "v" }, { go: "l" }, { dir: "h" }]).layout),
    solution: [{ dir: "v" }, { go: "l" }, { dir: "h" }],
  },
  {
    name: "上下之后再左右",
    hint: "先横切两行,再在<b>下面那行</b>里竖切。和上一题形状相同但切法不同 —— 这就是「顺序影响比例」",
    target: shape(run([{ dir: "h" }, { go: "j" }, { dir: "v" }]).layout),
    solution: [{ dir: "h" }, { go: "j" }, { dir: "v" }],
  },
  {
    name: "L 形:左边一竖,右边上下两半",
    hint: "竖切之后,在右边那个窗口里横切",
    target: shape(run([{ dir: "v" }, { go: "l" }, { dir: "h" }]).layout),
    solution: [{ dir: "v" }, { go: "l" }, { dir: "h" }],
  },
];

type View = { layout: Layout; focus: number };

export default function SplitDrill() {
  const [ti, setTi] = useState(0);
  const [v, setV] = useState<View>({ layout: initial(), focus: 1 });
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [showAns, setShowAns] = useState(false);

  const task = TASKS[ti];
  const done = shape(v.layout) === task.target;

  const reset = useCallback(() => {
    setV({ layout: initial(), focus: 1 });
    setLog([]);
    setShowAns(false);
  }, []);

  useEffect(() => {
    reset();
  }, [ti, reset]);

  const act = useCallback((fn: (cur: View) => View | null, label: string) => {
    setV((cur) => {
      const next = fn(cur);
      if (!next) return cur;
      setLog((l) => [...l, label]);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) return;
      // 只拦这三个键,其余全放行(不劫持浏览器快捷键)
      const isSplitV = e.ctrlKey ? e.key === "|" : e.key === "|" || e.key === "\\";
      const isSplitH = e.key === "-";
      const isClose = e.ctrlKey && (e.key === "w" || e.key === "W");
      const isMove = ["h", "j", "k", "l", "H", "J", "K", "L"].includes(e.key) && !e.ctrlKey;
      if (!isSplitV && !isSplitH && !isClose && !isMove) return;
      e.preventDefault();

      if (done) {
        reset();
        return;
      }
      if (isSplitV) {
        act(
          (cur) => {
            const l = split(cur.layout, cur.focus, "v");
            return l ? { layout: l, focus: l.nextId - 1 } : null;
          },
          "<Space>|",
        );
      } else if (isSplitH) {
        act(
          (cur) => {
            const l = split(cur.layout, cur.focus, "h");
            return l ? { layout: l, focus: l.nextId - 1 } : null;
          },
          "<Space>-",
        );
      } else if (isClose) {
        act((cur) => {
          const l = close(cur.layout, cur.focus);
          if (!l) return null;
          const alive = countWindows(l.root) > 0;
          return { layout: l, focus: alive ? cur.focus : 1 };
        }, "<Space>wd");
      } else if (isMove) {
        const d = e.key.toLowerCase() as "h" | "j" | "k" | "l";
        act((cur) => {
          const n = moveFocus(cur.layout, cur.focus, d);
          return n === null ? null : { layout: cur.layout, focus: n };
        }, `<C-${d.toUpperCase()}>`);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [act, done, reset]);

  // 刚达成 → 记一次并停一下
  useEffect(() => {
    if (!done) return;
    setSolved((s) => (s.includes(ti) ? s : [...s, ti]));
    const t = setTimeout(() => setTi((i) => (i + 1) % TASKS.length), 1100);
    return () => clearTimeout(t);
  }, [done, ti]);

  const pos = positions(v.layout.root);
  const n = countWindows(v.layout.root);

  return (
    <div className="space-y-4">
      {/* 选题 */}
      <div className="flex flex-wrap gap-1.5">
        {TASKS.map((t, i) => (
          <button
            key={t.name}
            onClick={() => setTi(i)}
            className={`rounded border px-2 py-0.5 text-xs ${
              i === ti
                ? "border-blue-400 bg-blue-400 text-black"
                : solved.includes(i)
                  ? "border-green-800 text-green-500"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {solved.includes(i) && i !== ti ? "✓ " : ""}
            {t.name}
          </button>
        ))}
      </div>

      {/* 目标示意 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="mb-1.5 flex items-baseline gap-2 text-neutral-300">
          <span>目标:{task.name}</span>
          <span className="text-[11px] text-neutral-600">
            当前 {n} 个窗口,目标 {countWindows(run(task.solution).layout.root)} 个
          </span>
        </div>
        <div className="text-neutral-500" dangerouslySetInnerHTML={{ __html: task.hint }} />
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-600">
          <span className="text-blue-300">&lt;Space&gt;| 竖切</span>
          <span className="text-blue-300">&lt;Space&gt;- 横切</span>
          <span className="text-blue-300">&lt;C-H/J/K/L&gt; 跳窗口</span>
          <span className="text-blue-300">hjkl 也能跳</span>
          <button onClick={() => setShowAns((s) => !s)} className="ml-auto underline">
            {showAns ? "收起答案" : "看答案"}
          </button>
          <button onClick={reset} className="underline">
            重来
          </button>
        </div>
        {showAns && (
          <div className="mt-2 rounded bg-neutral-950 p-2 text-[11px] text-neutral-400">
            {task.solution
              .map((op) => (op.dir === "v" ? "<Space>|" : op.dir === "h" ? "<Space>-" : op.go ? `<C-${op.go.toUpperCase()}>` : "<Space>wd"))
              .join("  →  ")}
          </div>
        )}
      </div>

      {/* 舞台:按实际位置画 */}
      <Stage pos={pos} focus={v.focus} done={done} />

      {/* 已按的键 */}
      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">
            按 <kbd>&lt;Space&gt;|</kbd> <kbd>&lt;Space&gt;-</kbd> 分屏,
            <kbd>&lt;C-H/J/K/L&gt;</kbd> 跳窗口
          </span>
        ) : (
          <>
            {log.map((k, i) => (
              <span key={i} className="rounded bg-neutral-800 px-1 text-blue-300">
                {k}
              </span>
            ))}
            {done && <span className="ml-2 text-green-400">✓ 形状对了</span>}
          </>
        )}
      </div>

      {/* 形状对比:把「你的」和「目标的」并排画出来,这是唯一的判据 */}
      <ShapeCompare mine={shape(v.layout)} target={task.target} solution={task.solution} />
    </div>
  );
}

/** 按归一化位置画当前布局 */
function Stage({
  pos,
  focus,
  done,
}: {
  pos: Map<number, { r0: number; r1: number; c0: number; c1: number }>;
  focus: number;
  done: boolean;
}) {
  const H = 150;
  return (
    <div className="relative w-full rounded bg-neutral-950" style={{ height: H }}>
      {[...pos.entries()].map(([id, p]) => {
        const isF = id === focus;
        return (
          <div
            key={id}
            className={`absolute flex items-center justify-center border text-[10px] ${
              isF
                ? done
                  ? "border-green-500 bg-green-950 text-green-200"
                  : "border-blue-500 bg-blue-950 text-blue-200"
                : "border-neutral-800 bg-neutral-900 text-neutral-500"
            }`}
            style={{
              left: `${p.c0 * 100}%`,
              top: `${p.r0 * 100}%`,
              width: `${(p.c1 - p.c0) * 100}%`,
              height: `${(p.r1 - p.r0) * 100}%`,
            }}
          >
            {isF ? "焦点" : id}
          </div>
        );
      })}
    </div>
  );
}

/** 你的形状 vs 目标形状 —— 判分完全基于这个对比 */
function ShapeCompare({ mine, target, solution }: { mine: string; target: string; solution: Op[] }) {
  const goal = run(solution);
  const gp = positions(goal.layout.root);
  return (
    <div className="grid grid-cols-2 gap-3 text-[11px]">
      <div>
        <div className="mb-1 text-neutral-500">你的</div>
        <Mini pos={new Map()} label={mine.split("|")[0] + " 个窗口"} />
      </div>
      <div>
        <div className="mb-1 text-neutral-500">目标</div>
        <Mini pos={gp} label={target.split("|")[0] + " 个窗口"} />
      </div>
    </div>
  );
}

function Mini({ pos, label }: { pos: Map<number, { r0: number; r1: number; c0: number; c1: number }>; label: string }) {
  return (
    <div className="rounded border border-neutral-800 p-1">
      <div className="relative w-full" style={{ height: 60 }}>
        {[...pos.entries()].map(([id, p]) => (
          <div
            key={id}
            className="absolute border border-neutral-700 bg-neutral-900"
            style={{
              left: `${p.c0 * 100}%`,
              top: `${p.r0 * 100}%`,
              width: `${(p.c1 - p.c0) * 100}%`,
              height: `${(p.r1 - p.r0) * 100}%`,
            }}
          />
        ))}
        {pos.size === 0 && <div className="text-neutral-700">1 个窗口</div>}
      </div>
      <div className="mt-0.5 text-center text-neutral-600">{label}</div>
    </div>
  );
}
