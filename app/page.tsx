"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalize, splitLhs, firstKeySet, excludeFirstKeys } from "@/lib/keys";
import { shouldTake, push, type LeaderState } from "@/lib/leader";
import { buildIndex, match, type Binding } from "@/lib/matcher";
import { load, save, record, pickNext, summarize, reset, type Progress } from "@/lib/progress";
import { RAW, GROUPS, LEVEL_NAMES } from "@/lib/bindings";
import { translate } from "@/lib/i18n";

// 数据集里 keys 留空(运行时用 splitLhs 展开),desc 换成中文
const BINDINGS = RAW.map((r) => ({
  ...r,
  keys: splitLhs(r.display),
  // 保留英文原文在 descEn,中文进 desc。答题时只显示 desc。
  descEn: r.desc,
  desc: translate(r.display, r.mode, r.desc),
})) as Binding[];
// ⚠️ 索引必须建在 **全量** BINDINGS 上,不能用 TRAINABLE。
// 匹配是全局的:<Space>ff 之类的序列会走到 f、f 两级,而 f 本身
// 也可能是别的绑定(<Space>f 开头的文件查找)的首键。
// 索引小一号不会立刻报错,只在某些题上突然"按对了却判错" ——
// 这种 bug 只有逐题试才看得出来。
const INDEX = buildIndex(BINDINGS);

/**
 * 首页实际出题的池子:去掉第 1 关(窗口键)。
 *
 * 第 1 关那 8 条交给 /windows 的可视化页面 —— 那里能画出真实分屏树,
 * 首页只能让你盲背序列。**只是不在这儿出题,数据集本身不动**,
 * 所以 /stats 的统计和已记录的进度都不受影响。
 */
const TRAINABLE = BINDINGS.filter((b) => b.level !== 1);

/**
 * 只接管「数据集里可能作为第一键」的按键。
 *
 * ⚠️ 之前是无条件 preventDefault —— 实测按 Tab 焦点被劫持、
 * Ctrl+R 刷新被拦、F12 开发工具被拦,而这些键数据集里根本没有,
 * 按了只会白得一次"判错"顺便丢了浏览器快捷键。
 */
const INTERCEPT = firstKeySet(BINDINGS);

/** 按了半个键之后停多久算放弃 */
const TIMEOUT_MS = 1200;

type Phase = "idle" | "correct" | "wrong";

export default function Page() {
  // 进度从 localStorage 读。
  //
  // ⚠️ 不能用 useState 懒初始化(`useState(() => load())`):
  //    SSR 阶段 localStorage 不存在 → 服务端渲染出「没见过 290」,
  //    客户端读出真实进度 → hydration mismatch,整棵树在客户端重建。
  //    实测踩到:控制台报 Hydration failed。
  //
  // 正确做法:初值恒为 null 表示"还没加载",SSR 和客户端首帧一致;
  // 挂载后再读 localStorage。代价是加载完之前不显示统计数字(而不是
  // 显示错的数字 —— 后者更糟,会让人以为进度丢了)。
  const [progress, setProgress] = useState<Progress | null>(null);
  const [current, setCurrent] = useState<Binding | null>(null);
  // ⚠️ typed 和 pending 必须放在**同一个** state 里。
// 分成两个 useState 会出现"pending 已 true 但 typed 还是旧值"的中间态,
// 而 shouldTake 读的就是 pending —— 那种帧里续键会被放行。
// 实测这类不同步 bug 最难查:界面看不出异常,只是某个键"偶尔"失灵。
const [seq, setSeq] = useState<LeaderState>({ typed: [], pending: false });
const typed = seq.typed;
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [candidates, setCandidates] = useState<Binding[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recent = useRef<string[]>([]);
  // progressRef:让 next()/commit() 读到最新 progress 而不重建闭包
  const progressRef = useRef<Progress>({});

  const [stats, setStats] = useState({
  total: TRAINABLE.length,
  mastered: 0,
  shaky: 0,
  fresh: TRAINABLE.length,
});
  const [level, setLevel] = useState<number | "all">(1);
  // 牺牲 <Tab> 键换键盘焦点导航。数据集里有一条 <Tab>(snippet 跳转),
  // 接管它就意味着 Tab 不再移动焦点 —— 所以做成可选,而不是替你决定。
  const [keepTabNav, setKeepTabNav] = useState(false);
  const interceptSet = useMemo(
    () => (keepTabNav ? excludeFirstKeys(BINDINGS, ["<Tab>"]) : INTERCEPT),
    [keepTabNav],
  );

  useEffect(() => {
    const p = load();
    progressRef.current = p;
    setProgress(p);
    setStats(summarize(p, TRAINABLE));
  }, []);

  // ⚠️ 过滤掉第 1 关(窗口键)。
// 窗口键改由 /windows 的可视化训练负责 —— 那里能画出真实的分屏树,
// 而首页只能让你盲背 <Space>| 这种序列。第 1 关 8 条全部在这里练,
// 对肌肉记忆没有额外收益,反而和可视化页面重复。
// 注意是「过滤」而不是删数据集:/stats 仍会统计它们,进度不丢。
const pool = useMemo(
    () => (level === "all" ? TRAINABLE : TRAINABLE.filter((b) => b.level === level)),
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
    setSeq({ typed: [], pending: false });
    setPhase("idle");
    setMsg("");
    setCandidates([]);
    recent.current = [...recent.current, b.id];
  }, []);

  // 切关卡时出第一题。next 引用稳定,所以这个 effect 只在 level 变时跑。
  // 必须等 progress 加载完 —— 否则第一题是按"空进度"挑的,
  // 而 pickNext 的权重完全依赖 seen/streak,会挑错题。
  const progressReady = progress !== null;
  useEffect(() => {
    if (!progressReady) return;
    setCurrent(null);
    next();
  }, [level, progressReady, next]);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /**
   * 进入"还在等续键"状态后起超时。
   *
   * 抽出来是因为 hit-with-extendable 和 partial 两条分支都要用,
   * 而它们的提示文案不一样:一个是"你按的这个键本身是 X",
   * 一个是"这个前缀下有这些候选"。
   */
  const startPartialTimer = (typedSoFar: string[], shown: Binding | Binding[]) => {
    const cands = Array.isArray(shown) ? shown : [shown];
    clearTimer();
    timer.current = setTimeout(() => {
      if (!current) return;
      setSeq({ typed: [], pending: false });
      commit(
        false,
        `超时。你按了 ${typedSoFar.join("")},正确答案是 ${current.display}`,
        cands,
      );
    }, TIMEOUT_MS);
  };

  const commit = useCallback(
    (ok: boolean, text: string, cands: Binding[] = []) => {
      if (!current) return;
      const np = record(progressRef.current, current.id, ok);
      progressRef.current = np;
      setProgress(np);
      setStats(summarize(np, TRAINABLE));
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

      // 接管判据统一在 lib/leader.ts:
      //   idle    → 只收第一键(不劫持 F5/F12/Ctrl+P)
      //   pending → 无条件收(此刻任何字符都可能是续键)
      //
      // ⚠️ 原来这里用 shouldIntercept(k.vim, firstKeySet) —— 而
      // firstKeySet 只含每个序列的**第一个**键,于是 `<Space>|` 的续键
      // `|` 从来不在集合里,按了就被放行给浏览器,序列卡住。
      // 实测:290 条里 206 条(71%)的多键序列都按不到终点。
      if (!shouldTake(k.vim, seq, interceptSet)) return;
      e.preventDefault();

      // 反馈期间按任意键 → 立刻进下一题,不等自动翻页。
      //
      // ⚠️ 原来这里是 `return`,把键静默吞掉。实测踩到:答对后 700ms 内
      // 按键毫无反应,用户(和我自己)都以为页面卡死了。
      // 静默吞输入是最难查的一类问题 —— 界面上看不出任何异常。
      if (phase === "correct" || phase === "wrong") {
        next();
        return;
      }

      clearTimer();
      const nowTyped = [...seq.typed, k.vim];

      const r = match(INDEX, nowTyped, pool);

      if (r.kind === "hit") {
        // 到了终点。如果这个前缀还能延长(g 既是终点又是 gd 的开头),
        // 不立刻判死 —— 留在 pending,等下一键或超时。
        const nextSeq = push(seq, k.vim, { isTerminal: true, extendable: r.extendable });
        setSeq(nextSeq);

        if (!r.extendable) {
          if (r.binding.id === current?.id) {
            commit(true, `✓ ${r.binding.display} — ${r.binding.desc}`);
          } else {
            commit(
              false,
              `这个键是「${r.binding.desc}」,但本题要的是「${current?.desc}」`,
              [r.binding],
            );
          }
        } else {
          setCandidates([r.binding]);
          startPartialTimer(nextSeq.typed, r.binding);
        }
      } else if (r.kind === "partial") {
        setSeq(push(seq, k.vim, { isTerminal: false, extendable: true }));
        setCandidates(r.candidates);
        startPartialTimer(nowTyped, r.candidates);
      } else if (r.kind === "miss") {
        setSeq({ typed: [], pending: false });
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
  }, [seq, current, phase, pool, commit]);

  // ⚠️ 必须从 **pool** 推,不能从 BINDINGS 推。
// 否则「全部」那一档会把第 1 关的按钮显示出来,点进去发现一道题都没有。
// ⚠️ levels 必须从 **BINDINGS** 算,不能从 pool 算。
// pool 会排除第 1 关(那是刻意的),若 levels 也跟着排除,
// 「全部」那一档就会算成 0 —— 实测踩到:按钮显示「全部(0)」,
// 一道题都没有。关卡列表是"有哪些关卡",和"当前档出哪些题"是两件事。
// ⚠️ 两处刻意用不同的数据源,别"顺手统一":
//   levels ← BINDINGS  (有哪些关卡按钮)
//   pool   ← 过滤掉 1  (实际出题,窗口键交给 /windows)
// 早期版本让 levels 也从 pool 算,结果「全部」显示 0 题。
const levels = useMemo(() => [...new Set(BINDINGS.map((b) => b.level))].sort((a, b) => a - b), []);

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <h1 className="text-xl font-bold">reflex</h1>
      <p className="mt-1 text-xs text-neutral-500">
        按键序列训练 · 数据集来自本机 LazyVim 16.0.1 实测抽取({pool.length} 条;窗口键已移至
        <a href="/windows" className="text-blue-400 hover:underline">
          可视化窗口练习
        </a>)
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
        <a href="/windows" className="text-blue-400 hover:underline">
          窗口练习 →
        </a>
        <a href="/buffers" className="text-blue-400 hover:underline">
          缓冲区 →
        </a>
        <a href="/tabs" className="text-blue-400 hover:underline">
          标签页 →
        </a>
        <a href="/files" className="text-blue-400 hover:underline">
          文件浏览器 →
        </a>
        <a href="/text" className="text-blue-400 hover:underline">
          文本对象 →
        </a>
        <a href="/stats" className="text-blue-400 hover:underline">
          数据集 →
        </a>
        <label className="flex cursor-pointer items-center gap-1 text-neutral-600">
          <input
            type="checkbox"
            checked={keepTabNav}
            onChange={(e) => setKeepTabNav(e.target.checked)}
            className="h-3 w-3"
          />
          保留 Tab 导航
        </label>
        <button
          className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
          onClick={() => {
            if (!confirm("清空全部练习进度?")) return;
            reset();
            const empty: Progress = {};
            progressRef.current = empty;
            setProgress(empty);
            setStats(summarize(empty, TRAINABLE));
            recent.current = [];
            next();
          }}
        >
          清空
        </button>
      </div>

      <div className="mt-4 mb-6 flex flex-wrap gap-1.5">
        {levels.map((l) =>
          l === 1 ? (
            // 第 1 关(窗口键)不在首页出题,按钮换成去可视化页面的入口。
            // 直接删掉按钮会让人以为"少了一关数据丢了",不如指个去处。
            <a
              key={l}
              href="/windows"
              title="窗口键在可视化页面练"
              className="rounded border border-dashed border-neutral-700 px-2 py-1 text-xs text-neutral-600 hover:border-blue-500 hover:text-blue-400"
            >
              窗口键 → /windows
            </a>
          ) : (
            <LevelBtn key={l} active={level === l} onClick={() => setLevel(l)}>
              {LEVEL_NAMES[l] ?? `第 ${l} 关`}
            </LevelBtn>
          ),
        )}
        <LevelBtn active={level === "all"} onClick={() => setLevel("all")}>
          全部({TRAINABLE.length})
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
            <div className={`text-xs ${phase === "correct" ? "text-green-400" : "text-red-400"}`}>
              {msg}
              <span className="ml-3 text-neutral-600">按任意键继续</span>
            </div>
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
