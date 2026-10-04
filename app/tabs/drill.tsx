"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TAB_TASKS,
  stateFrom,
  applyTabKey,
  count,
  current,
  SOLUTIONS,
  normSeq,
  toPanelKey,
  type TabState,
  type TabTask,
} from "@/lib/tabs";

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

export default function TabDrill() {
  const [ti, setTi] = useState(0);
  const [v, setV] = useState<TabState>(() => stateFrom(TAB_TASKS[0]));
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  /** 已按下但还没完成的序列前缀,如 "<Tab>" */
  const [pending, setPending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 已按下但还没完成的序列("<Tab>" 或 null) */
  const seq = useRef<string | null>(null);

  const task = TAB_TASKS[ti];
  const want = task.key;
  /** 这一题的全部解法 —— 来自 lib/tabs 的 SOLUTIONS */
  const accept = SOLUTIONS[want]?.seqs ?? [];

  const reset = useCallback((t: TabTask) => {
    setV(stateFrom(t));
    setLog([]);
    setFlash(null);
    setPending(null);
    seq.current = null;
  }, []);

  useEffect(() => {
    reset(task);
  }, [ti, reset, task]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** 拿到完整解法后判分 */
  const settle = useCallback(
    (matched: string[]) => {
      const shown = matched.join("");
      setLog((l) => [...l, shown]);

      const next = applyTabKey(want, v);
      if (!next) {
        setFlash({ ok: false, text: `${shown} 按了但状态没变(已经在边界上了)` });
        return;
      }
      setV(next);

      setFlash({ ok: true, text: `✓ ${shown} —— ${task.desc}` });
      setSolved((x) => (x.includes(ti) ? x : [...x, ti]));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTi((i) => (i + 1) % TAB_TASKS.length), 1500);
    },
    [v, want, task, ti],
  );

  /**
   * 收下任意一条解法(和 /buffers 同一套逻辑)。
   *
   * ⚠️ tab 这一族实测**每个操作只绑了一个键**,所以 accept 通常只有一条;
   * 但仍走「前缀匹配 + 命中结算」而不是硬按题目那个键 ——
   * 以后加了同义键就不会又漏收。训练器挑剔用户按的键是要命的。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
      if (e.ctrlKey) return;

      // ⚠️ 必须先转成面板记法。浏览器里 <Tab> 的 key 是 "Tab"(无尖括号),
      // 直接拼会得到 "<Tab>Tab",查表必然 miss —— 实测踩过:
      // 「新开标签页」那题永远报"不在这一页的范围里"。
      const k = toPanelKey(e.key);
      const buf = seq.current ? [...seq.current.split("|"), k] : [k];

      const hit = accept.find((a) => normSeq(a) === normSeq(buf));
      if (hit) {
        e.preventDefault();
        seq.current = "";
        setPending(null);
        settle(hit);
        return;
      }

      // 是某条解法的前缀就留着继续等
      const partial = accept.find((a) => {
        if (a.length <= buf.length) return false;
        return a.slice(0, buf.length).every((x, i) => x === buf[i]);
      });
      if (partial) {
        e.preventDefault();
        seq.current = normSeq(buf);
        setPending(buf.join(" "));
        return;
      }

      seq.current = "";
      setPending(null);
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [accept, settle]);


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

      {/* 题目区:全部解法 + Vim 原生参考 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">{task.desc}</span>
        </div>
        <div className="mt-1.5 space-y-1">
          {accept.map((seq, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-[10px] text-neutral-700">{i === 0 ? "键位" : "或"}</span>
              {seq.map((x, j) => (
                <kbd key={j} className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{x}</kbd>
              ))}
            </div>
          ))}
          {accept.length === 0 && (
            <div className="text-neutral-700">这一题没有对应的键位解法</div>
          )}
        </div>
        {SOLUTIONS[want]?.native && (
          <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
            <span className="w-8 shrink-0 text-neutral-700">原生</span>
            <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
              {SOLUTIONS[want].native}
            </code>
            <span className="text-neutral-700">Ex 命令,本机实测过;没绑键,要手打 :</span>
          </div>
        )}
        {SOLUTIONS[want]?.note && (
          <div className="mt-1 text-[11px] text-amber-500/90">⚠ {SOLUTIONS[want].note}</div>
        )}
        {pending && <div className="mt-1 text-[11px] text-amber-300">等下一个键… {pending}</div>}
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
        键位按 <b>rhs 聚合</b> <code>nvim_get_keymap("n")</code> 得出 —— tab 这七个操作
        每个 rhs 下面都只有<b>一个</b>键,所以没有同义键可挑,不像 buffer 那边。
        原生 Ex 命令逐条在真 nvim 里feedkeys 验过;
        <code>:tn</code> / <code>:tl</code> 在本机<b>不生效</b>,所以没写进去。
      </div>
    </div>
  );
}