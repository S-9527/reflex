"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUF_TASKS,
  stateFrom,
  applyBufKey,
  count,
  current,
  SOLUTIONS,
  normSeq,
  type BufState,
  type BufTask,
} from "@/lib/bufs";

/**
 * 缓冲区练习 —— 把 buffer 列表当一条带子画出来。
 *
 * ## 为什么是「带子」而不是窗口
 *
 * buffer 在真 vim 里就是 buffer line:一条横排。
 * 而 `<Space>b` 那一族键几乎全是「在这条带子上删/移/标」——
 * 删左边的、删右边的、只留当前、清掉看不见的、删未固定的。
 * 带子模型直接对应这个心智,练的就是「看带子 → 按对应键」。
 *
 * ## 判分
 *
 * 和窗口页一致:要求**状态真的变了**才算过。
 * 键按对了但没东西可删(比如 `bl` 而当前已在最左)会明确提示,
 * 而不是静默吞掉 —— 这类"按了没反应"是最难查的。
 */

/**
 * ⚠️ 容易记混的一对,每题都提醒一次:
 *   裸 `H` / `L`      → 换 buffer(BufferLineCyclePrev/Next,实测)
 *   `<C-H>` / `<C-L>` → 跳窗口(<C-W>h / <C-W>l,实测)
 * 长得几乎一样,按错后果完全不同。
 */
const LOOKALIKE: Record<string, string> = {
  H: "别和 <C-H> 搞混:那个是跳到左边窗口",
  L: "别和 <C-L> 搞混:那个是跳到右边窗口",
};

type View = { s: BufState };

export default function BufferDrillInner() {
  const [ti, setTi] = useState(0);
  const [v, setV] = useState<View>(() => ({ s: stateFrom(BUF_TASKS[0]) }));
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 序列缓冲 */
  const seq = useRef<string[]>([]);

  const task = BUF_TASKS[ti];
  const want = task.key;
  /** 这一题的全部解法 —— 来自 lib/bufs 的 SOLUTIONS(按 rhs 聚合实测得出) */
  const accept = SOLUTIONS[want]?.seqs ?? [];

  const reset = useCallback((t: BufTask) => {
    setV({ s: stateFrom(t) });
    setLog([]);
    setFlash(null);
    setPending(null);
    seq.current = [];
  }, []);

  useEffect(() => {
    reset(task);
  }, [ti, reset, task]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** 拿到完整解法后判分 */
  const settle = useCallback(
    (typed: string[], matched: string[]) => {
      const shown = matched.join("");
      setLog((l) => [...l, shown]);

      // 找到这道题对应的操作键(解法表的主键)
      const opKey = task.key;
      const next = applyBufKey(opKey, v.s);
      if (!next) {
        setFlash({ ok: false, text: `${shown} 按了但状态没变(当前没有可操作的对象)` });
        return;
      }
      setV({ s: next });

      if (typed.length === 1 || SOLUTIONS[opKey]?.seqs.some((x) => x.length === typed.length)) {
        setFlash({ ok: true, text: `✓ ${shown} —— ${task.desc}` });
        setSolved((x) => (x.includes(ti) ? x : [...x, ti]));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setTi((i) => (i + 1) % BUF_TASKS.length), 1500);
      } else {
        setFlash({ ok: false, text: `✗ 那是另一条命令,本题要的是「${task.desc}」` });
      }
    },
    [v, task, ti],
  );
  /**
   * 收下任意一条解法。
   *
   * ⚠️ 为什么不能只按题目那一个键判:同一件事本机有多个键
   * (`L` / `]b` / `<Space>bb` / `<Space>b\`` 都是"下一个 buffer")。
   * 少收几条就等于**惩罚用户按更快的那个键** —— 训练器比真实环境
   * 挑剔,是这类工具最要命的毛病。
   *
   * 所以这里判的是「按出来的序列 ∈ 这道题的全部解法」,
   * 命中哪条就显示哪条,让他知道刚才那下等价于什么。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return;
      if (e.ctrlKey) return;

      // 维护一个"裸键缓冲":单键解法(H / L / [b / ]b)按一下就该结算,
      // 三键解法(<Space> b x)要等凑齐。所以先把键 push 进来再判长度。
      const k = e.key === " " ? "<Space>" : e.key;
      const buf = [...seq.current, k];

      // 命中任意一条完整解法?
      const hit = accept.find((a) => normSeq(a) === normSeq(buf));
      if (hit) {
        e.preventDefault();
        seq.current = [];
        setPending(null);
        settle(buf, hit);
        return;
      }

      // 还没凑齐?看看是不是某条解法的**前缀**,是就留着继续等
      const partial = accept.find((a) => {
        if (a.length <= buf.length) return false;
        return a.slice(0, buf.length).every((x, i) => x === buf[i]);
      });
      if (partial) {
        e.preventDefault();
        seq.current = buf;
        setPending(buf.join(" "));
        return;
      }

      // 不在任何解法的前缀上 —— 放行,别劫持普通按键
      seq.current = [];
      setPending(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [accept, settle]);



  const cur = current(v.s);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {BUF_TASKS.map((t, i) => (
          <button
            key={t.key + i}
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
        <button onClick={() => reset(task)} className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800">
          重来
        </button>
      </div>

      {/* 题目区:列出这道题的全部解法,按哪条都算过 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-neutral-300">{task.desc}</span>
        </div>
        <div className="mt-1.5 space-y-1">
          {accept.map((seq, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-[10px] text-neutral-700">{i === 0 ? "任选" : "或"}</span>
              {seq.map((x, j) => (
                <kbd key={j} className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{x}</kbd>
              ))}
            </div>
          ))}
        </div>
        {SOLUTIONS[want]?.native && (
          <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
            <span className="w-8 shrink-0 text-neutral-700">原生</span>
            <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
              {SOLUTIONS[want].native}
            </code>
            <span className="text-neutral-700">Ex 命令,本机实测过;它没绑键,要手打 :</span>
          </div>
        )}
        {SOLUTIONS[want]?.note && (
          <div className="mt-1 text-[11px] text-neutral-600">{SOLUTIONS[want].note}</div>
        )}
        {LOOKALIKE[want] && (
          <div className="mt-1 text-[11px] text-amber-500/90">⚠ {LOOKALIKE[want]}</div>
        )}
        {pending && <div className="mt-1 text-[11px] text-amber-300">等下一个键… {pending}</div>}
      </div>

      {/* buffer 带子 */}
      <BufLine s={v.s} />

      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">按上面任意一条解法 —— 哪条都快</span>
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
        解法表按 <b>rhs 聚合</b> <code>nvim_get_keymap("n")</code> 得出:rhs 相同 = 底层执行同一条命令,
        所以是实测的同义键,不是猜的。
        <code>bj</code> / <code>?</code> 弹 UI,不在这个模型里。
      </div>
    </div>
  );
}

/** 画 buffer 带子 */
function BufLine({ s }: { s: BufState }) {
  const cur = current(s);
  return (
    <div className="rounded bg-neutral-950 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-3 text-[10px] text-neutral-700">
        <span>共 {count(s)} 个 buffer</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />当前</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-neutral-600" />看不见</span>
        <span>P = 已固定</span>
      </div>
      {s.bufs.length === 0 ? (
        <div className="py-4 text-center text-xs text-neutral-700">(空)</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {s.bufs.map((b) => {
            const isCur = b.id === s.cur;
            return (
              <div
                key={b.id}
                className={`rounded border px-2 py-1 text-[11px] ${
                  isCur
                    ? "border-blue-500 bg-blue-950 text-blue-100"
                    : b.visible
                      ? "border-neutral-700 bg-neutral-900 text-neutral-400"
                      : "border-neutral-800 bg-neutral-900 text-neutral-600"
                }`}
              >
                {b.name}
                {b.pinned && <span className="ml-1 font-bold text-amber-400">P</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 text-[10px] text-neutral-600">
        当前:{cur ? cur.name : "(无)"} · 左边 {s.bufs.filter((b) => b.id < s.cur).length} 个 · 右边{" "}
        {s.bufs.filter((b) => b.id > s.cur).length} 个
      </div>
    </div>
  );
}