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
  zoomIn,
  cycleFocus,
  focusIndex,
  countWindows,
  positions,
  run,
  RESIZE_STEP,
  type Layout,
  type Op,
} from "@/lib/split";
import { WIN_KEYS, findKey, GROUPS, parseSeq, TASKS, type ParseResult, type Task } from "@/lib/winkeys";

/**
 * 窗口键位训练 —— 只练 LazyVim 的 `<Space>wX`,原生写法只作对照展示。
 *
 * ## 为什么只练一条路
 *
 * 原本每个键收两种解法(`<C-w>v` 和 `<Space>wv`),
 * 用户明确说「只想专门练 lazyvim 的键」——
 * 那套键才是他平时真按的,原生写法在键表里看着当参照就够了。
 *
 * 好处不只是少练一半:序列长度统一成 3 键,
 * 少一条前缀分支就少一类 bug(见 parseSeq 里记的那个三键失效的坑)。
 *
 * ## 判分要求按出效果
 *
 * 单键反射 + 必须真的改变布局 —— 光按对键但布局没变
 * (比如没有窗口可关)不算过。
 */

type View = { layout: Layout; focus: number };

// 题库在 lib/winkeys.ts —— 放在 lib 是为了让单测能守住
// 「每道题都可解」这条不变量(见 winkeys.test.ts)。

/** 一次按键的解析结果 */
type Parsed = ParseResult;

export default function HydraDrill() {
  const [ti, setTi] = useState(0);
  const [v, setV] = useState<View>({ layout: initial(), focus: 1 });
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  /** 已按下但还没完成的前缀,如 "<Space>" / "<Space>w" */
  const [pending, setPending] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** <Space>w 序列缓冲 */
  const seq = useRef<string[]>([]);

  const task = TASKS[ti];
  const wk = findKey(task.key);

  /**
 * 从 task.start 重放出起始布局。
 *
 * ⚠️ 直接复用 lib/split 的 run(),不要在这里手写执行器。
   * 原来这里自己写了一遍只认 `dir` 和 `go` 的循环,于是给 `=` 题
   * 加上 `{resize:"v+"}` 之后它**静默跳过**了这一步 ——
   * 起始布局还是对半的,`=` 又变成无解题。
   *
   * 同概念两套实现,必然不同步 —— 这个坑这轮已经踩了三次
   * (leader 判据 / parseSeq / buildStart)。
 */
  const buildStart = useCallback((t: Task): View => run(t.start), []);

  const reset = useCallback(() => {
    setV(buildStart(task));
    setLog([]);
    setFlash(null);
    setPending(null);
    seq.current = [];
    zoomedRef.current = null;
  }, [buildStart, task]);

  useEffect(() => {
    reset();
  }, [ti, reset]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  /** 把一个键接到序列缓冲上 —— 逻辑全在 lib/winkeys 的 parseSeq 里 */
  const parse = useCallback((k: string): ParseResult => parseSeq(seq.current, k), []);

  /** 缩放前的样子,再按一次 m 用来恢复 */
  const zoomedRef = useRef<View | null>(null);

  /** 执行一个面板键的效果 */
  const applyKey = useCallback((key: string, cur: View): View | null => {
    switch (key) {
      case "v": { const l = split(cur.layout, cur.focus, "v"); return l ? { layout: l, focus: l.nextId - 1 } : null; }
      case "s": { const l = split(cur.layout, cur.focus, "h"); return l ? { layout: l, focus: l.nextId - 1 } : null; }
      case "h": case "j": case "k": case "l": {
        const n = moveFocus(cur.layout, cur.focus, key);
        return n === null ? null : { layout: cur.layout, focus: n };
      }
      case "H": case "J": case "K": case "L": {
        const d = key.toLowerCase() as "h" | "j" | "k" | "l";
        const l = moveToEdge(cur.layout, cur.focus, d);
        return l ? { layout: l, focus: cur.focus } : null;
      }
      case "d": { const l = close(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      case "o": { const l = closeOthers(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      case "x": { const l = swapNext(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      case ">": { const l = resize(cur.layout, cur.focus, "v", RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "<": { const l = resize(cur.layout, cur.focus, "v", -RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "+": { const l = resize(cur.layout, cur.focus, "h", -RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "-": { const l = resize(cur.layout, cur.focus, "h", RESIZE_STEP); return l ? { layout: l, focus: cur.focus } : null; }
      case "|": { const l = maxOut(cur.layout, cur.focus, "v"); return l ? { layout: l, focus: cur.focus } : null; }
      case "_": { const l = maxOut(cur.layout, cur.focus, "h"); return l ? { layout: l, focus: cur.focus } : null; }
      case "=": { const l = equalize(cur.layout, cur.focus); return l ? { layout: l, focus: cur.focus } : null; }
      // ---- 其他组 ----
      case "m": {
        // 缩放要能"再按一次恢复",所以退出走 prevRef —— 只进不出等于半个功能。
        if (zoomedRef.current) {
          const prev = zoomedRef.current;
          zoomedRef.current = null;
          return prev;
        }
        const l = zoomIn(cur.layout, cur.focus);
        if (!l) return null;
        zoomedRef.current = cur;
        return { layout: l, focus: cur.focus };
      }
      case "W": {
        const n = cycleFocus(cur.layout, cur.focus);
        return n === null ? null : { layout: cur.layout, focus: n };
      }
      case "0": case "1": {
        const n = focusIndex(cur.layout, Number(key));
        return n === null ? null : { layout: cur.layout, focus: n };
      }
      // q 和 T 在「窗口数量」上的效果都是当前窗口离开本标签页,
      // 所以按 close 建模。差异(q 会跳 Alternate File、T 会开新标签页)
      // 不在这个模型里,界面上已注明。
      case "q": case "T": {
        const l = close(cur.layout, cur.focus);
        return l ? { layout: l, focus: cur.focus } : null;
      }
      default: return null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;

      // 纯修饰键:浏览器在按 Shift+X 时会先派发 key="Shift"。
      // 不放行的话它会被当成序列的下一个键,把缓冲清掉。
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return;
      // Ctrl 系一律放行:这一页只练 <Space>w,不劫持 Ctrl+W 等浏览器快捷键
      if (e.ctrlKey) return;

      // <Space> 开序列
      if (e.key === " ") {
        e.preventDefault();
        seq.current = [" "];
        setPending("<Space>");
        return;
      }

      const p = parse(e.key);
      if (p.kind === "wait") {
        // ⚠️ 这里必须把 p.next 写回缓冲 —— 三键序列全靠这一步。
        // 见 lib/winkeys.parseSeq 顶部的注释:漏掉它的话
        // <Space>w 之后的按键永远配不上,而 <C-w>x 两键却正常。
        e.preventDefault();
        seq.current = p.next;
        setPending(p.shown);
        return;
      }
      if (p.kind === "other") {
        seq.current = [];
        setPending(null);
        return; // 放行,别劫持普通按键
      }

      e.preventDefault();
      seq.current = [];
      setPending(null);
      setLog((l) => [...l, p.full]);

      const w = findKey(p.key)!;
      if (!w.modeled) {
        setFlash({ ok: false, text: `${p.full}(${w.desc})—— 这一页还没建模它的效果` });
        return;
      }

      const next = applyKey(p.key, v);
      if (!next) {
        setFlash({ ok: false, text: `${p.full} 按了但布局没变(当前布局下这个键无效)` });
        return;
      }
      setV(next);

      if (p.key === task.key) {
        setFlash({ ok: true, text: `✓ ${p.full} — ${w.desc}` });
        setSolved((s) => (s.includes(ti) ? s : [...s, ti]));
        if (flashTimer.current) clearTimeout(flashTimer.current);
        // 延迟给够看反馈:判对后立刻翻页重置会让人看不出那下生效没有
        flashTimer.current = setTimeout(() => setTi((i) => (i + 1) % TASKS.length), 1600);
      } else {
        setFlash({ ok: false, text: `✗ 那是「${w.desc}」,本题要的是 ${task.key} —— ${task.desc}` });
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [applyKey, parse, task, ti, v]);

  const pos = positions(v.layout.root);

  return (
    <div className="space-y-4">
      {/* 选题 */}
      <div className="flex flex-wrap gap-1.5">
        {TASKS.map((t, i) => (
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
            {t.key}
          </button>
        ))}
        <button onClick={reset} className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800">
          重来
        </button>
      </div>

      {/* 本题:一键两解 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">按出</span>
          <kbd className="rounded bg-blue-950 px-2 py-0.5 text-sm text-blue-200">{task.key}</kbd>
          <span className="text-neutral-400">{task.desc}</span>
        </div>
        {wk && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-neutral-600">要按的</span>
              <kbd className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{wk.lazy}</kbd>
            </div>
            {wk.alt ? (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-neutral-600">更省事</span>
                <kbd className="rounded bg-green-950 px-1.5 py-0.5 text-green-300">{wk.alt}</kbd>
                <span className="text-neutral-600">实测本机有这个等价键,{wk.alt.length < wk.lazy.length ? "更短" : "不用进面板"} —— 哪个顺手用哪个</span>
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-neutral-600">更省事</span>
                <span className="text-neutral-700">没有更短的等价键</span>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 text-neutral-600">原生等价</span>
              <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{wk.native}</kbd>
              <span className="text-neutral-600">只作对照,不作解法</span>
            </div>
          </div>
        )}
        {pending && (
          <div className="mt-1 text-[11px] text-amber-300">等下一个键… {pending}</div>
        )}
      </div>

      {/* 舞台 */}
      <Stage pos={pos} focus={v.focus} />

      {/* 已按的键 */}
      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">
            按 <kbd className="rounded bg-neutral-800 px-1">&lt;Space&gt;</kbd>
            <kbd className="rounded bg-neutral-800 px-1">w</kbd>
            <kbd className="rounded bg-neutral-800 px-1">{task.key}</kbd>
            三键连着按
          </span>
        ) : (
          log.map((k, i) => (
            <span key={i} data-keylog={i} className="rounded bg-neutral-800 px-1 text-blue-300">{k}</span>
          ))
        )}
      </div>
      {flash && (
        <div data-flash={flash.ok ? "ok" : "bad"} className={`text-xs ${flash.ok ? "text-green-400" : "text-red-400"}`}>
          {flash.text}
        </div>
      )}

      <KeyTable highlight={task.key} />
    </div>
  );
}

/**
 * 键位对照表。
 *
 * 只列**键的写法**:面板键 / LazyVim 写法 / 原生等价。
 * 每行的中文作用说明去掉了 —— 那是「这键干什么」,属于讲解,
 * 而这一页练的是反射,照着面板把三个键按出来就够。
 * 作用说明在题目区显示当前题那一条,需要时看得到。
 */
function KeyTable({ highlight }: { highlight: string }) {
  return (
    <div className="rounded border border-neutral-800 p-2 text-[11px]">
      {GROUPS.map((g) => {
        const rows = WIN_KEYS.filter((k) => k.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g} className="mb-2 last:mb-0">
            <div className="mb-0.5 text-neutral-600">{g}</div>
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {rows.map((k) => (
                <div
                  key={k.key}
                  className={`flex gap-1.5 ${k.key === highlight ? "rounded bg-blue-950 px-1 text-blue-200" : "text-neutral-500"}`}
                >
                  <span className="w-9 shrink-0 font-bold text-purple-300">{k.key}</span>
                  <span className="w-28 shrink-0 text-blue-400/80">{k.lazy}</span>
                  <span className="w-24 shrink-0 text-neutral-600">{k.native}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="mt-2 border-t border-neutral-800 pt-1.5 text-[10px] text-neutral-700">
        <div>
          <span className="text-blue-400">蓝</span> = 本页要练的 ·{" "}
          <span className="text-neutral-500">灰</span> = 原生等价写法,只作对照
        </div>
        {WIN_KEYS.filter((k) => k.skip).map((k) => (
          <div key={k.key} className="mt-0.5">
            <code>{k.key}</code> 不练 —— {k.skip}
          </div>
        ))}
        <div className="mt-0.5">
          键位实测自 <code>nvim_get_keymap("n")</code>。lhs 原文带前导空格(leader 是
          <code>&lt;Space&gt;</code>),所以 <code>&lt;Space&gt;wd</code> 在原文里是{" "}
          <code> wd</code>。
          hydra 入口实测是 <code>&lt;C-W&gt;&lt;Space&gt;</code>;
          headless 下进不去面板,leader 那一列按你口述收录,未由我实测。
        </div>
      </div>
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
