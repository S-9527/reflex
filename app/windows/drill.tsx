"use client";

import { useCallback, useEffect, useState } from "react";
import { ARENAS, move, hasNeighbor, shortestSteps, makeTask, type Arena } from "@/lib/arena";
import { windowNavDir } from "@/lib/keys";

/**
 * 窗口方向键练习。
 *
 * ## 为什么单独一页
 *
 * 训练主页是"给描述 → 敲键序列",判分靠键序列匹配。
 * 但窗口方向键不一样:<C-J> 本身没有描述(它就是"往下"),判分只能靠
 * "焦点最终落在哪个格子"。所以这里需要一套完全不同的判分方式。
 */
type Shape = "1x2" | "2x1" | "2x2" | "left-split";

const SHAPES: Record<string, Shape> = {
  "左右两栏": "1x2",
  "上下两栏": "2x1",
  "四宫格": "2x2",
  "不等宽": "1x2",
  "嵌套(竖切再横切)": "left-split",
};

/**
 * 全部练习状态放在**一个** state 里。
 *
 * ## 为什么不是分开放
 *
 * 实测踩过:切布局时 `ai` 已经变成两栏(2 个窗口),但 `task.to` 还是
 * 上一套四宫格的值(3)。渲染时 `arena.wins[3]` → undefined,
 * 读 `.label` 就崩 —— 四宫格(4 个窗口)恰好正常,其他全炸。
 *
 * 分开存就意味着"存在一个中间状态,新旧数据不匹配"。合并成一个对象
 * 之后,`set` 一次全换,**结构上不可能不同步**。
 */
type State = {
  /** 布局下标 */
  ai: number;
  /** 当前焦点窗口 */
  focus: number;
  /** 出题时的起点。最优步数要从这里算,不是从 arena.start */
  from: number;
  /** 目标窗口下标。恒与 ai/focus 同源 */
  to: number;
  /** 已走步数 */
  steps: number;
  /** 历史最好步数 */
  best: number | null;
  /** 累计过关数 */
  solved: number;
  /**
   * 刚答对、正在显示反馈中。
   *
   * 之前答对就直接换题(to 立刻随机成新的),于是屏幕上
   * 「✓ 1 步,最优解」配着一个**已经换掉**的黄色目标框 —— 视觉上自相矛盾。
   * 答对时先冻结题目,让反馈和目标对得上,再进下一题。
   */
  justSolved: boolean;
  /** 反馈信息 */
  msg: { kind: "ok" | "info"; text: string } | null;
};

/**
 * ⚠️ 这里必须**确定性**,不能随机。
 *
 * 实测踩到:原来 `makeTask` 内部随机挑目标,而这段跑在 `useState(initial)` 里 ——
 * SSR 算一次、客户端 hydration 又算一次,两次结果不同,
 * 于是 `isTarget` 不匹配 → hydration failed → React 丢弃整棵树重新生成
 * → **所有按键 handler 全部失效**(表现为「按什么键都没反应」),
 * 而且我加的任何新属性都会被丢掉,极难定位。
 *
 * 所以:初始题目固定挑一个确定的目标,随机只发生在用户点「换一题」时
 * (那是纯客户端事件,不会有 SSR/CSR 不一致)。
 */
const initial = (): State => {
  const arena = ARENAS[2]; // 四宫格
  // 固定挑 index 1(右上):离 start(左上)一步之遥,首题简单且有意义。
  // ⚠️ 不能用随机 —— 见上面的注释。
  const to = arena.wins.length > 1 ? 1 : 0;
  return {
    ai: 2, focus: arena.start, from: arena.start, to,
    steps: 0, best: null, solved: 0, justSolved: false, msg: null,
  };
};

export default function WindowsDrill() {
  const [s, setS] = useState<State>(initial);

  const arena: Arena = ARENAS[s.ai];
  const shape = SHAPES[arena.name] ?? "2x2";

  /** 目标标签。从 arena 现场算,不单独存 —— 避免和 ai 不同步 */
  const target = arena.wins[s.to];

  const newTask = useCallback((ai: number, focus: number) => {
    const a = ARENAS[ai];
    const t = makeTask(a, focus);
    setS((prev) => ({ ...prev, ai, focus, from: focus, to: t.to, steps: 0, msg: null, justSolved: false }));
  }, []);

  /** 答对后的下一题 —— 从当前焦点继续出题 */
  const advance = useCallback((s: State) => {
    const a = ARENAS[s.ai];
    const t = makeTask(a, s.focus);
    return { ...s, from: s.focus, to: t.to, steps: 0, msg: null, justSolved: false };
  }, []);

  const onDir = useCallback(
    (dir: "h" | "j" | "k" | "l") => {
      setS((prev) => {
        // 刚答对还在显示反馈:任意方向键直接进下一题
        if (prev.justSolved) return advance(prev);

        const a = ARENAS[prev.ai];
        if (!hasNeighbor(a, prev.focus, dir)) {
          return {
            ...prev,
            // 按了空键也算一步,否则可以无限乱按
            steps: prev.steps + 1,
            msg: { kind: "info", text: `「${a.wins[prev.focus].label}」那个方向没有窗口 —— 这个键在这套布局里是空的` },
          };
        }
        const next = move(a, prev.focus, dir);
        if (next === null) return prev;
        const used = prev.steps + 1;
        if (next !== prev.to) return { ...prev, focus: next, steps: used };

        // 到达目标。**冻结题目** —— to 保持为刚到达的那个,
        // 让「✓ 1 步」和屏幕上的黄色目标框指的是同一件事。
        const opt = shortestSteps(a, prev.from, prev.to);
        return {
          ...prev,
          focus: next,
          steps: used,
          justSolved: true,
          best: prev.best === null ? used : Math.min(prev.best, used),
          solved: prev.solved + 1,
          msg: {
            kind: "ok",
            text: used === opt ? `✓ ${used} 步,最优解` : `✓ ${used} 步(最优 ${opt} 步,绕了 ${used - opt} 步)`,
          },
        };
      });
    },
    [advance],
  );

  // 答对后停 1.4 秒自动进下一题
  useEffect(() => {
    if (!s.justSolved) return;
    const t = setTimeout(() => setS(advance), 1400);
    return () => clearTimeout(t);
  }, [s.justSolved, advance]);

  // 键盘:只收 <C-H/J/K/L>。裸 hjkl 和方向键**不收** —— 本机没有这些映射,
  // 收了会练出用不上的肌肉记忆。判定逻辑见 lib/keys.ts 的 windowNavDir。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) return;
      const d = windowNavDir(e);
      if (!d) return;
      e.preventDefault();
      onDir(d);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onDir]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {ARENAS.map((a, i) => (
          <button
            key={a.name}
            onClick={() => newTask(i, a.start)}
            className={`rounded border px-2 py-0.5 text-xs ${
              i === s.ai ? "border-blue-400 bg-blue-400 text-black" : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-neutral-500">{arena.note}</p>

      <div className={gridClass(shape)}>
        {arena.wins.map((w, i) => {
          const isFocus = i === s.focus;
          const isTarget = s.to === i;
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

      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="mb-2 text-neutral-300">
          目标:把焦点移到 <b className="text-yellow-400">{target?.label ?? "?"}</b>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-neutral-500">
          <span>
            已走 <b className="text-neutral-300">{s.steps}</b> 步
          </span>
          {s.best !== null && (
            <span>
              最好 <b className="text-green-400">{s.best}</b> 步
            </span>
          )}
          <span>
            已过 <b className="text-neutral-300">{s.solved}</b> 关
          </span>
          <button
            onClick={() => newTask(s.ai, s.focus)}
            className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
          >
            换一题
          </button>
        </div>
        {s.msg && (
          <div className={`mt-2 ${s.msg.kind === "ok" ? "text-green-400" : "text-neutral-500"}`}>
            {s.msg.text}
            {s.msg.kind === "ok" && <span className="ml-2 text-neutral-600">按任意方向键继续</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-neutral-600">
        {(["k", "h", "j", "l"] as const).map((d) => {
          const ok = hasNeighbor(arena, s.focus, d);
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
 */
function cellStyle(shape: Shape, i: number): React.CSSProperties | undefined {
  if (shape !== "left-split") return undefined;
  if (i === 0) return { gridColumn: 1, gridRow: 1 };
  if (i === 1) return { gridColumn: 1, gridRow: 2 };
  return { gridColumn: 2, gridRow: "1 / span 2" };
}
