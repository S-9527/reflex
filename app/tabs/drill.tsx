"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TAB_TASKS, stateFrom, applyTabKey, count, current, type TabState, type TabTask } from "@/lib/tabs";

/**
 * 标签页练习 —— 把 tab 画成一条带子。
 *
 * ## 和 buffer 页的区别
 *
 * buffer 是「哪些文件开着」,tab 是「有几组窗口」。
 * 所以这里画的是标签条,每格标注窗口数;
 * `<Tab>d` 关掉的是**整个标签页**(连带里面所有窗口),
 * 这一点和 `<Space>bd` 关单个 buffer 完全不同。
 *
 * ## 一个容易记错的点
 *
 * `<Tab>]` 到最后一个就**停**,不会绕回第一个;
 * 而 buffer 的 `<Space>bb` 是**会绕回**的。
 * 两个都练了,就是为了让这个差别显出来。
 */

/** 键 → 按几下 */
const ARITY: Record<string, number> = {
  "<Tab><Tab>": 2,
  "<Tab>d": 2,
  "<Tab>o": 2,
  "<Tab>]": 2,
  "<Tab>[": 2,
  "<Tab>f": 2,
  "<Tab>l": 2,
};

export default function TabDrill() {
  const [ti, setTi] = useState(0);
  const [v, setV] = useState<TabState>(() => stateFrom(TAB_TASKS[0]));
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 已按下但还没完成的序列("<Tab>" 或 null) */
  const seq = useRef<string | null>(null);

  const task = TAB_TASKS[ti];
  const want = task.key;

  const reset = useCallback((t: TabTask) => {
    setV(stateFrom(t));
    setLog([]);
    setFlash(null);
    seq.current = null;
  }, []);

  useEffect(() => {
    reset(task);
  }, [ti, reset, task]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** 拿到第二键之后判分 */
  const resolve = useCallback(
    (want: string, second: string) => {
      const shown = "<Tab>" + second;
      setLog((l) => [...l, shown]);

      if (!ARITY[shown]) {
        setFlash({ ok: false, text: `${shown} 不在这一页的范围里` });
        return;
      }

      const next = applyTabKey(shown, v);
      if (!next) {
        setFlash({ ok: false, text: `${shown} 按了但状态没变(可能已经在边界上)` });
        return;
      }
      setV(next);

      if (shown === want) {
        setFlash({ ok: true, text: `✓ ${shown}` });
        setSolved((x) => (x.includes(ti) ? x : [...x, ti]));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setTi((i) => (i + 1) % TAB_TASKS.length), 1500);
      } else {
        setFlash({ ok: false, text: `✗ 那是另一条命令,本题要的是 ${want}` });
      }
    },
    [v, want, ti],
  );

  useEffect(() => {
    /**
     * 两键状态机:第一键总是 <Tab>,第二键决定是哪条命令。
     *
     * ⚠️ 别写成"两个 Tab"—— `<Tab>d` 是 Tab 然后 d,
     * 只有 New Tab 才是 Tab Tab。所以第二键要和 `secondKeyOf(want)` 比。
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
      if (e.ctrlKey) return;

      // 已经在序列里 → 这一键是第二键
      if (seq.current) {
        e.preventDefault();
        const second = e.key;
        seq.current = "";
        resolve(want, second);
        return;
      }

      // 序列还没开始:只有 <Tab> 能开始,其余放行
      if (e.key !== "Tab") return;
      e.preventDefault();
      seq.current = "Tab";
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [resolve, want]);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TAB_TASKS.map((t, i) => (
          <button
            key={t.key}
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
            {t.key.replace("<Tab>", "")}
          </button>
        ))}
        <button onClick={() => reset(task)} className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800">
          重来
        </button>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">按出</span>
          <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">&lt;Tab&gt;</kbd>
          <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{secondKeyOf(want)}</kbd>
          <span className="text-neutral-400">{task.desc}</span>
        </div>
      </div>

      {/* 标签条 */}
      <div className="rounded bg-neutral-950 p-3">
        <div className="mb-1.5 text-[10px] text-neutral-700">共 {count(v)} 个标签页 · 每格数字 = 里面几个窗口</div>
        <div className="flex flex-wrap gap-1">
          {v.tabs.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 rounded border px-3 py-1.5 text-[11px] ${
                i === v.cur
                  ? "border-blue-500 bg-blue-950 text-blue-100"
                  : "border-neutral-700 bg-neutral-900 text-neutral-500"
              }`}
            >
              <span className="font-bold">{i + 1}</span>
              <span className="text-neutral-600">{t.wins} 窗口</span>
              {i === v.cur && <span className="text-[10px] text-blue-400">当前</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">按 <kbd className="rounded bg-neutral-800 px-1">&lt;Tab&gt;</kbd> 然后面板上的键,两下</span>
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

      <div className="text-[10px] leading-relaxed text-neutral-700">
        键位实测自 <code>nvim_get_keymap("n")</code>。注意 <code>&lt;Tab&gt;]</code> /{" "}
        <code>&lt;Tab&gt;[</code> 是<b>不会环绕</b>的(到头就停),
        而 buffer 的 <code>&lt;Space&gt;bb</code> 会绕 —— 两页都练就是为了记住这个差别。
      </div>
    </div>
  );
}

/** 从 "<Tab>d" 里取出第二个键;返回 "<Tab>" 那种双 Tab 的特殊处理 */
function secondKeyOf(want: string): string {
  if (want === "<Tab><Tab>") return "<Tab>";
  return want.slice(5);
}