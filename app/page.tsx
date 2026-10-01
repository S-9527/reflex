"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalize, splitLhs } from "@/lib/keys";
import { buildIndex, match, type Binding } from "@/lib/matcher";
import { load, save, record, pickNext, summarize, reset, type Progress } from "@/lib/progress";
import { RAW, GROUPS, LEVEL_NAMES } from "@/lib/bindings";

// 数据集里 keys 留空(运行时用 splitLhs 展开)
const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) })) as Binding[];
const INDEX = buildIndex(BINDINGS);

/** 按了半个键之后停多久算放弃 */
const TIMEOUT_MS = 1200;

type Phase = "idle" | "correct" | "wrong";

export default function Page() {
  // 进度从 localStorage 读。注意用 useState 的懒初始化而不是 useEffect:
  // 用 useEffect 会先渲染一帧"没加载完"的空态,再补数据 —— 那帧里
  // 「已掌握 0 / 没见过 300」会闪一下,而且判分逻辑读不到已存进度。
  const [progress, setProgress] = useState<Progress>(() => load());
  const [current, setCurrent] = useState<Binding | null>(null);
  const [typed, setTyped] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [candidates, setCandidates] = useState<Binding[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recent = useRef<string[]>([]);
  // progressRef:让 next()/commit() 读到最新 progress 而不重建闭包
  const progressRef = useRef<Progress>(progress);

  const [stats, setStats] = useState(() => summarize(load(), BINDINGS));
  const [level, setLevel] = useState<number | "all">(1);

  const pool = useMemo(
    () => (level === "all" ? BINDINGS : BINDINGS.filter((b) => b.level === level)),
    [level],
  );
  // poolRef:让 next() 读最新 pool,同时保持 next 的引用稳定。
  //
  // ⚠️ 不这么做的后果:useEffect([level, next]) 里 next 依赖 pool,
  // 而 pool 是 useMemo 出来的数组 —— 一旦 next 的引用每渲染都变,
  // effect 就在每次渲染后重新执行 → setCurrent(null) → 重新出题 →
  // 又触发渲染 → 死循环,界面停在"点上面的关卡开始"。
  const poolRef = useRef<Binding[]>(pool);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  const next = useCallback(() => {
    const b = pickNext(poolRef.current, progressRef.current, recent.current.slice(-4));
    if (!b) return;
    setCurrent(b);
    setTyped([]);
    setPhase("idle");
    setMsg("");
    setCandidates([]);
    recent.current = [...recent.current, b.id];
  }, []);

  // 首次挂载 + 切关卡时出题。next 引用稳定,所以这个 effect 只在 level 变时跑。
  useEffect(() => {
    setCurrent(null);
    next();
  }, [level, next]);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const commit = useCallback(
    (ok: boolean, text: string, cands: Binding[] = []) => {
      if (!current) return;
      const np = record(progressRef.current, current.id, ok);
      progressRef.current = np;
      setProgress(np);
      setStats(summarize(np, BINDINGS));
      save(np);
      setPhase(ok ? "correct" : "wrong");
      setMsg(text);
      setCandidates(cands);
      clearTimer();
      timer.current = setTimeout(next, ok ? 700 : 1800);
    },
    [current, next],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) return; // Cmd 系留给浏览器

      const k = normalize(e);
      if (!k) return; // 纯修饰键

      // 必须拦,否则 Ctrl+W 关标签页、Ctrl+T 开新页
      e.preventDefault();

      if (phase === "correct" || phase === "wrong") return;

      clearTimer();
      const nowTyped = [...typed, k.vim];
      setTyped(nowTyped);

      const r = match(INDEX, nowTyped, pool);

      if (r.kind === "hit") {
        if (r.binding.id === current?.id) {
          commit(true, `✓ ${r.binding.display} — ${r.binding.desc}`);
        } else {
          commit(
            false,
            `这个键是「${r.binding.desc}」,但本题要的是「${current?.desc}」`,
            [r.binding],
          );
        }
      } else if (r.kind === "partial") {
        setCandidates(r.candidates);
        timer.current = setTimeout(() => {
          commit(
            false,
            `超时。你按了 ${nowTyped.join("")},正确答案是 ${current?.display}`,
            r.candidates,
          );
        }, TIMEOUT_MS);
      } else if (r.kind === "miss") {
        commit(false, `按到 ${k.vim} 就断了。本题答案:${current?.display}`, r.expected);
      }
      // r.kind === "idle" 在这里不可能:nowTyped 至少有一个键。
      //   故意不写 else 兜底 —— 万一 matcher 改了语义,这里应该炸出来,
      //   而不是静默吞掉(静默吞掉的 bug 查起来最费时间)。
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      clearTimer();
    };
  }, [typed, current, phase, pool, commit]);

  const levels = useMemo(() => [...new Set(BINDINGS.map((b) => b.level))].sort((a, b) => a - b), []);

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <h1 className="text-xl font-bold">reflex</h1>
      <p className="mt-1 text-xs text-neutral-500">
        按键序列训练 · 数据集来自本机 LazyVim 16.0.1 实测抽取({BINDINGS.length} 条)
      </p>

      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <span>
          已掌握 <b className="text-green-400">{stats.mastered}</b>
        </span>
        <span>
          还不熟 <b className="text-amber-400">{stats.shaky}</b>
        </span>
        <span>
          没见过 <b className="text-neutral-500">{stats.fresh}</b>
        </span>
        <button
          className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
          onClick={() => {
            if (!confirm("清空全部练习进度?")) return;
            reset();
            const empty: Progress = {};
            progressRef.current = empty;
            setProgress(empty);
            setStats(summarize(empty, BINDINGS));
            setCurrent(null);
            next();
          }}
        >
          清空
        </button>
      </div>

      <div className="mt-4 mb-6 flex flex-wrap gap-1.5">
        {levels.map((l) => (
          <LevelBtn key={l} active={level === l} onClick={() => setLevel(l)}>
            {LEVEL_NAMES[l] ?? `第 ${l} 关`}
          </LevelBtn>
        ))}
        <LevelBtn active={level === "all"} onClick={() => setLevel("all")}>
          全部({BINDINGS.length})
        </LevelBtn>
      </div>

      {current ? (
        <div
          className={`min-h-64 rounded-lg border p-6 transition-colors ${
            phase === "correct"
              ? "border-green-900 bg-green-950/30"
              : phase === "wrong"
                ? "border-red-900 bg-red-950/30"
                : "border-neutral-800 bg-neutral-900"
          }`}
        >
          <div className="text-[11px] text-neutral-600">
            {GROUPS[current.group]} · {current.mode} 模式
          </div>
          <div className="mt-2 text-lg">{current.desc}</div>

          <div className="mt-6 mb-4 min-h-10 text-2xl tracking-widest">
            {typed.length === 0 ? (
              <span className="text-sm text-neutral-700">按下正确的键序列…</span>
            ) : (
              typed.map((k, i) => (
                <span key={i} className={i === typed.length - 1 ? "text-blue-400" : "text-neutral-500"}>
                  {k}
                </span>
              ))
            )}
          </div>

          {msg && (
            <div className={`text-xs ${phase === "correct" ? "text-green-400" : "text-red-400"}`}>{msg}</div>
          )}

          {phase === "idle" && typed.length > 0 && candidates.length > 0 && (
            <div className="mt-4 border-t border-neutral-800 pt-3 text-xs">
              <div className="mb-1.5 text-neutral-600">这个前缀下:</div>
              {candidates.slice(0, 10).map((c) => (
                <div key={c.id} className="py-0.5">
                  <span className="mr-3 inline-block w-24 text-blue-400">{c.display}</span>
                  <span className="text-neutral-400">{c.desc}</span>
                </div>
              ))}
            </div>
          )}

          {phase === "wrong" && (
            <div className="mt-4 border-t border-neutral-800 pt-3 text-sm">
              正确答案 <b className="text-blue-400">{current.display}</b> — {current.desc}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-800 p-16 text-center text-neutral-600">
          点上面的关卡开始
        </div>
      )}

      <div className="mt-8 space-y-1.5 text-[11px] leading-relaxed text-neutral-600">
        <p>
          <b className="text-neutral-500">判分</b>:只看键序列是否匹配。数据来自你本机的{" "}
          <code className="text-neutral-500">nvim_get_keymap</code>,全部{" "}
          <code className="text-neutral-500">status=&quot;mapped&quot;</code>(键确实存在,含义取自插件 desc)。
        </p>
        <p>
          <b className="text-neutral-500">注意</b>:窗口那组是 LazyVim 16 的键(
          <code>&lt;C-H/J/K/L&gt;</code>),<b className="text-neutral-400">不是</b>书第 9 章里的{" "}
          <code>&lt;C-w&gt;h/j/k/l</code>。
        </p>
      </div>
    </main>
  );
}

function LevelBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs ${
        active
          ? "border-blue-400 bg-blue-400 text-black"
          : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}
