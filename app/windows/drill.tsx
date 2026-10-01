"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ARENAS, move, hasNeighbor, shortestSteps, makeTask, type Arena } from "@/lib/arena";

/**
 * 窗口方向键练习。
 *
 * ## 为什么单独一页
 *
 * 训练主页是"给描述 → 敲键序列",判分靠键序列匹配。
 * 但窗口方向键不一样:<C-J> 本身没有描述(它是"往下"),判分只能靠
 * "焦点最终落在哪个格子"。所以这里需要一套完全不同的判分方式。
 *
 * ## 布局怎么画
 *
 * 不用 row/col —— 那是终端坐标。这里只用邻接表(leftOf/rightOf/...),
 * 格子位置由布局形状硬编码(CSS grid),因为 5 套布局形状是固定的。
 */
type Shape = "1x2" | "2x1" | "2x2" | "1x3" | "left-split";

const SHAPES: Record<string, Shape> = {
  "左右两栏": "1x2",
  "上下两栏": "2x1",
  "四宫格": "2x2",
  "不等宽": "1x2",
  "嵌套(竖切再横切)": "left-split",
};

export default function WindowsDrill() {
  const [ai, setAi] = useState(2); // 默认四宫格
  const [focus, setFocus] = useState(0);
  const [task, setTask] = useState<{ to: number; hint: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [steps, setSteps] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [solved, setSolved] = useState(0);

  const arena: Arena = ARENAS[ai];
  const shape = SHAPES[arena.name] ?? "2x2";

  const newTask = useCallback(() => {
    const t = makeTask(arena, focus);
    setTask({ to: t.to, hint: t.hint });
    setSteps(0);
    setMsg(null);
  }, [arena, focus]);

  // 换布局 → 重置焦点和题目
  useEffect(() => {
    setFocus(arena.start);
    setSteps(0);
    setMsg(null);
    setBest(null);
    const t = makeTask(arena, arena.start);
    setTask({ to: t.to, hint: t.hint });
  }, [arena]);

  const onDir = useCallback(
    (dir: "h" | "j" | "k" | "l") => {
      if (!task) return;
      if (!hasNeighbor(arena, focus, dir)) {
        const w = arena.wins[focus].label;
        setMsg({ kind: "info", text: `「${w}」那个方向没有窗口 —— 这个键在这套布局里是空的` });
        setSteps((s) => s + 1); // 按了空键也算一步,不然可以无限乱按
        return;
      }
      const next = move(arena, focus, dir);
      if (next === null) return;
      setFocus(next);
      const used = steps + 1;
      setSteps(used);

      if (next === task.to) {
        const opt = shortestSteps(arena, arena.start, task.to);
        setSolved((s) => s + 1);
        setMsg({
          kind: "ok",
          text:
            used === opt
              ? `✓ ${used} 步,最优解`
              : `✓ ${used} 步(最优 ${opt} 步,绕了 ${used - opt} 步)`,
        });
        setBest((b) => (b === null ? used : Math.min(b, used)));
        setTimeout(newTask, 1200);
      }
    },
    [arena, focus, steps, task, newTask],
  );

  // 键盘:方向键 + hjkl 都收
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) return;
      const map: Record<string, "h" | "j" | "k" | "l"> = {
        ArrowLeft: "h", ArrowRight: "l", ArrowUp: "k", ArrowDown: "j",
        h: "h", j: "j", k: "k", l: "l",
        H: "h", J: "j", K: "k", L: "l",
      };
      // 训练的是 <C-H> 系列。Ctrl 也接受,方便你用真实习惯练。
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      onDir(d);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onDir]);

  return (
    <div className="space-y-4">
      {/* 布局选择 */}
      <div className="flex flex-wrap gap-1.5">
        {ARENAS.map((a, i) => (
          <button
            key={a.name}
            onClick={() => setAi(i)}
            className={`rounded border px-2 py-0.5 text-xs ${
              i === ai ? "border-blue-400 bg-blue-400 text-black" : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-neutral-500">{arena.note}</p>

      {/* 窗口格子 */}
      <div className={gridClass(shape)}>
        {arena.wins.map((w, i) => {
          const isFocus = i === focus;
          const isTarget = task?.to === i;
          return (
            <div
              key={i}
              style={cellStyle(shape, i)}
              className={`relative flex min-h-24 items-center justify-center rounded border text-sm ${
                isFocus
                  ? "border-blue-500 bg-blue-950 text-blue-200"
                  : "border-neutral-800 bg-neutral-900 text-neutral-500"
              } ${isTarget && !isFocus ? "border-dashed border-yellow-600 text-yellow-500/70" : ""}`}
            >
              {w.label}
              {isFocus && (
                <span className="absolute -top-2 left-2 rounded bg-blue-500 px-1 text-[10px] text-black">
                  焦点
                </span>
              )}
              {isTarget && !isFocus && (
                <span className="absolute -top-2 right-2 rounded bg-yellow-600 px-1 text-[10px] text-black">
                  目标
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 题目 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        {task && (
          <div className="mb-2 text-neutral-300">
            目标:把焦点移到 <b className="text-yellow-400">{arena.wins[task.to].label}</b>
            <div className="mt-1 text-neutral-500">{task.hint}</div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-neutral-500">
          <span>
            已走 <b className="text-neutral-300">{steps}</b> 步
          </span>
          {best !== null && (
            <span>
              最好 <b className="text-green-400">{best}</b> 步
            </span>
          )}
          <span>
            已过 <b className="text-neutral-300">{solved}</b> 关
          </span>
          <button
            onClick={newTask}
            className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
          >
            换一题
          </button>
        </div>
        {msg && (
          <div
            className={`mt-2 ${
              msg.kind === "ok" ? "text-green-400" : msg.kind === "bad" ? "text-red-400" : "text-neutral-500"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* 键位提示:哪些方向键在这套布局里有效 */}
      <div className="flex flex-wrap gap-2 text-[11px] text-neutral-600">
        {(["k", "h", "j", "l"] as const).map((d) => {
          const ok = hasNeighbor(arena, focus, d);
          const arrow = { k: "<C-K> ↑", h: "<C-H> ←", j: "<C-J> ↓", l: "<C-L> →" }[d];
          return (
            <span
              key={d}
              className={`rounded border px-1.5 py-0.5 ${
                ok ? "border-blue-800 text-blue-300" : "border-neutral-800 text-neutral-700 line-through"
              }`}
            >
              {arrow}
            </span>
          );
        })}
        <span className="ml-2">划掉的 = 当前焦点那个方向没有窗口</span>
      </div>
    </div>
  );
}

function gridClass(shape: Shape): string {
  switch (shape) {
    case "1x2":
      return "grid grid-cols-2 gap-2";
    case "2x1":
      return "grid grid-rows-2 gap-2";
    case "2x2":
      return "grid grid-cols-2 grid-rows-2 gap-2";
    case "1x3":
      return "grid grid-cols-3 gap-2";
    case "left-split":
      return "grid grid-cols-[2fr_3fr] grid-rows-2 gap-2";
  }
}

/**
 * 单个格子的显式位置。
 *
 * 只有「嵌套」需要:3 个格子不能靠自动流排 —— 布局是
 *   左上 | 右侧
 *   左下 | (右侧跨两行)
 * 自动流会把「右侧」排到第 2 行第 1 列,变成第三个独立格子,图就错了。
 * 这和 lib/layout.ts 里那个「横跨两列的窗口被画两遍」是同一类问题:
 * 视觉上要显式控制,不能指望默认行为。
 */
function cellStyle(shape: Shape, i: number): React.CSSProperties | undefined {
  if (shape !== "left-split") return undefined;
  if (i === 0) return { gridColumn: 1, gridRow: 1 };
  if (i === 1) return { gridColumn: 1, gridRow: 2 };
  return { gridColumn: 2, gridRow: "1 / span 2" };
}
