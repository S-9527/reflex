"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initial,
  split,
  close,
  closeOthers,
  moveFocus,
  moveToEdge,
  swapNext,
  resize,
  maxOut,
  equalize,
  topology,
  countWindows,
  positions,
  RESIZE_STEP,
  type Layout,
  type Op,
} from "@/lib/split";
import { HYDRA, GROUPS, type HydraKey } from "@/lib/winkeys";
import { windowNavDir } from "@/lib/keys";

/**
 * hydra 训练 —— 照着 which-key `+windows` 面板练 `<C-w>*` 家族。
 *
 * ## 和「搭建」模式的分工
 *
 * 搭建练**结构**(目标布局怎么切出来);这里练**单个键的肌肉记忆**
 * —— 按 `>` 窗口就变宽,按 `H` 窗口就贴到最左。
 *
 * ## 为什么不给这页出「目标状态」判分
 *
 * 因为这页练的不是状态,是**按键反射**。所以判分方式是
 * 「你按的键对不对」,而不是「结果对不对」——
 * 这是整个项目里唯一一处置���方向相反的:
 * 前缀树训练判键序列,这一页判单键。
 *
 * 好处是零歧义:按 `>` 就是 `>`,不需要模拟任何东西。
 */

type View = { layout: Layout; focus: number };

/** 一道题:指定按哪个 hydra 键 */
type Task = {
  /** 面板上显示的键 */
  key: string;
  /** 中文提示 */
  desc: string;
  /** 起始布局(每次重置) */
  start: Op[];
  /** 期望按下的 hydra 键 */
  want: string;
};

const TASKS: Task[] = [
  { key: "v", desc: "竖着切一刀", start: [], want: "v" },
  { key: "s", desc: "横着切一刀", start: [], want: "s" },
  { key: "h", desc: "跳到左边的窗口", start: [{ dir: "v" }, { dir: "v" }], want: "h" },
  { key: "l", desc: "跳到右边的窗口", start: [{ dir: "v" }, { dir: "v" }], want: "l" },
  { key: ">", desc: "把右边那个窗口变宽", start: [{ dir: "v" }], want: ">" },
  { key: "<", desc: "把右边那个窗口变窄", start: [{ dir: "v" }], want: "<" },
  { key: "_", desc: "高度拉满", start: [{ dir: "h" }], want: "_" },
  { key: "=", desc: "恢复等高等宽", start: [{ dir: "v" }], want: "=" },
  { key: "d", desc: "关掉当前窗口", start: [{ dir: "v" }, { dir: "h" }], want: "d" },
  { key: "o", desc: "只留当前窗口", start: [{ dir: "v" }, { dir: "h" }], want: "o" },
  { key: "x", desc: "和下一个窗口换位置", start: [{ dir: "v" }, { dir: "v" }], want: "x" },
  { key: "H", desc: "把当前窗口贴到最左", start: [{ dir: "v" }, { dir: "v" }], want: "H" },
];

export default function HydraDrill() {
  const [ti, setTi] = useState(0);
  const [v, setV] = useState<View>({ layout: initial(), focus: 1 });
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const task = TASKS[ti];

  /** 从 task.start 重放出起始布局 */
  const buildStart = useCallback((t: Task): View => {
    // 从 initial 跑一串固定操作。同步完成,不用异步
    let layout = initial();
    let focus = 1;
    for (const op of t.start) {
      if (op.dir) {
        const nl = split(layout, focus, op.dir);
        if (nl) {
          layout = nl;
          focus = layout.nextId - 1;
        }
      } else if (op.go) {
        const n = moveFocus(layout, focus, op.go);
        if (n !== null) focus = n;
      }
    }
    return { layout, focus };
  }, []);

  const reset = useCallback(() => {
    setV(buildStart(task));
    setLog([]);
    setFlash(null);
  }, [buildStart, task]);

  useEffect(() => {
    reset();
  }, [ti, reset]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  /** 执行一个 hydra 键 */
  const applyKey = useCallback((h: HydraKey, cur: View): View | null => {
    switch (h.command) {
      case "<C-w>v": { const l = split(cur.layout, cur.focus, "v"); return l ? { layout: l, focus: l.nextId - 1 } : null; }
      case "<C-w>s": { const l = split(cur.layout, cur.focus, "h"); return l ? { layout: l, focus: l.nextId - 1 } : null; }
      case "<C-w>h": case "<C-w>j": case "<C-w>k": case "<C-w>l": {
        const d = h.command.slice(-1).toLowerCase() as "h" | "j" | "k" | "l";
        const n = moveFocus(cur.layout, cur.focus, d);
        return n === null ? null : { layout: cur.layout, focus: n };
      }
      case "<C-w>H": case "<C-w>J": case "<C-w>K": case "<C-w>L": {
        const d = h.command.slice(-1).toLowerCase() as "h" | "j" | "k" | "l";
        const l = moveToEdge(cur.layout, cur.focus, d);
        return l ? { layout: l, focus: cur.focus } : null;
      }
      case "<C-w>c": { const l = close(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>o": { const l = closeOthers(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>x": { const l = swapNext(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>>": { const l = resize(cur.layout, cur.focus, "v", RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w><": { const l = resize(cur.layout, cur.focus, "v", -RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>+": { const l = resize(cur.layout, cur.focus, "h", -RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>-": { const l = resize(cur.layout, cur.focus, "h", RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>|": { const l = maxOut(cur.layout, cur.focus, "v"); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>_": { const l = maxOut(cur.layout, cur.focus, "h"); return l ? { layout: l, focus: cur.focus } : null; }
      case "<C-w>=": { const l = equalize(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      default: return null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // 纯修饰键放行(按 Shift+> 时浏览器会先派发 key="Shift")
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;

      const k = e.key;
      // 只有面板上真实存在的键才接管,免得打字被判错
      const hit = HYDRA.find((h) => h.key === k);
      if (!hit) return;
      e.preventDefault();

      if (!hit.op) {
        setFlash({ ok: false, text: `${hit.key} = ${hit.command}(${hit.desc})—— 这一页还没建模` });
        return;
      }

      // 本机真正绑了顶层键的,h 和 大写H 都能直接按
      const wantIsNav = ["h", "j", "k", "l"].includes(task.want);
      const pressedIsNav = ["h", "j", "k", "l"].includes(hit.key);
      const correct =
        hit.key === task.want ||
        // 导航键同时接受 <C-H> 形式(本机绑定的等价键)
        (wantIsNav && pressedIsNav);

      setLog((l) => [...l, hit.key]);

      const next = applyKey(hit, v);
      if (next) setV(next);

      if (correct) {
        setFlash({ ok: true, text: `✓ ${hit.key} = ${hit.command} ${hit.desc}` });
        setSolved((s) => (s.includes(ti) ? s : [...s, ti]));
        if (flashTimer.current) clearTimeout(flashTimer.current);
        // 跳题延迟要给够看反馈的时间。
        // 实测踩到:900ms 太短,判对后立刻翻页、布局重置,
        // 肉眼看不出「刚才那下到底生效没有」—— 一度以为按键失灵。
        flashTimer.current = setTimeout(() => setTi((i) => (i + 1) % TASKS.length), 1600);
      } else {
        setFlash({ ok: false, text: `✗ 按了 ${hit.key}(${hit.desc}),本题要的是 ${task.key} —— ${task.desc}` });
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [applyKey, task, ti, v]);

  const pos = positions(v.layout.root);
  const cur = HYDRA.find((h) => h.key === task.key);

  return (
    <div className="space-y-4">
      {/* 选题 */}
      <div className="flex flex-wrap gap-1.5">
        {TASKS.map((t, i) => (
          <button
            key={t.key + t.desc}
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
            {t.key}
          </button>
        ))}
        <button onClick={reset} className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800">
          重来
        </button>
      </div>

      {/* 本题要按什么 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">按下</span>
          <kbd className="rounded bg-blue-950 px-2 py-0.5 text-sm text-blue-200">{task.key}</kbd>
          <span className="text-neutral-400">{task.desc}</span>
          {cur && <span className="text-neutral-600">= {cur.command}</span>}
        </div>
        {cur?.alt && (
          <div className="mt-1 text-[11px] text-neutral-600">
            本机更顺手的等价键:<span className="text-neutral-500">{cur.alt}</span>
          </div>
        )}
      </div>

      {/* 舞台 */}
      <Stage pos={pos} focus={v.focus} />

      {/* 已按的键 + 反馈 */}
      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">直接按面板上的键,不用先按 leader</span>
        ) : (
          log.map((k, i) => (
            <span key={i} className="rounded bg-neutral-800 px-1 text-blue-300">{k}</span>
          ))
        )}
      </div>
      {flash && (
        <div className={`text-xs ${flash.ok ? "text-green-400" : "text-red-400"}`}>{flash.text}</div>
      )}

      {/* 完整键表 —— 就是用户截图那个面板 */}
      <KeyTable highlight={task.key} />
    </div>
  );
}

function Stage({ pos, focus }: { pos: Map<number, { r0: number; r1: number; c0: number; c1: number }>; focus: number }) {
  return (
    <div className="relative w-full rounded bg-neutral-950" style={{ height: 150 }}>
      {[...pos.entries()].map(([id, p]) => {
        const isF = id === focus;
        return (
          <div
            key={id}
            className={`absolute flex items-center justify-center border text-[10px] ${
              isF ? "border-blue-500 bg-blue-950 text-blue-200" : "border-neutral-800 bg-neutral-900 text-neutral-500"
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

/** 照抄用户截图的分组面板 */
function KeyTable({ highlight }: { highlight: string }) {
  return (
    <div className="rounded border border-neutral-800 p-2 text-[11px]">
      {GROUPS.map((g) => {
        const rows = HYDRA.filter((h) => h.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g} className="mb-1.5 last:mb-0">
            <div className="mb-0.5 text-neutral-600">{g}</div>
            <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
              {rows.map((h) => (
                <div
                  key={h.command}
                  className={`flex gap-1.5 ${h.key === highlight ? "rounded bg-blue-950 px-1 text-blue-200" : "text-neutral-500"}`}
                >
                  <span className="w-8 shrink-0 font-bold text-purple-300">{h.key}</span>
                  <span className="shrink-0 text-neutral-600">{h.command}</span>
                  <span className="truncate">{h.desc}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="mt-2 border-t border-neutral-800 pt-1.5 text-[10px] text-neutral-700">
        <div>灰色的是本机**没有**顶层映射的键 —— 只在 hydra 内部有效</div>
        <div className="mt-0.5">实测依据:nvim_get_keymap("n")</div>
      </div>
    </div>
  );
}