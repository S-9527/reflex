"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TASKS as WIN_TASKS } from "@/lib/winkeys";
import { BUF_TASKS } from "@/lib/bufs";
import { TAB_TASKS } from "@/lib/tabs";
import { FILE_TASKS } from "@/lib/files";
import { SPEC } from "@/lib/textobj";
import { UI_TOGGLES } from "@/lib/ui-toggles";
import { DIAG_KEYS } from "@/lib/diagnostics";
import { RAW } from "@/lib/bindings";
import { boardCards, type BoardCard } from "@/lib/boards";
import * as SRS from "@/lib/srs";

/**
 * 首页 = 导航仪表盘。
 *
 * ## 为什么不再是「训练器首页」
 *
 * 原来首页是 290 条盲背,15 个关卡按钮挤成一行,出题只给一行文字。
 * 而 `/buffers` 画出了带子、`/windows` 画出了布局 —— 两套体验、
 * 两套进度、互不相通。用户报「太难用了」,这不是错觉。
 *
 * 现在首页只回答一个问题:**该练哪个,还差多少**。
 *
 * ## 板块怎么选
 *
 * 判据是「按下去有没有东西会变」:
 *   - 会变的(窗口布局、buffer 带子、tab 条、选中范围)→ 可视化板块
 *   - 不会变的(弹选择器、弹浮窗)→ 首页那一行按键序列形式恰好是对的
 * 所以 `s*` / `g*` / `f*` 这些留在 `/seq` 盲练,不做可视化。
 */


const K = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-blue-950 px-1 text-[10px] text-blue-300">{children}</code>
);


/**
 * 首页的「在练什么」文案。
 *
 * ⚠️ 板块清单本身来自 `lib/boards.ts`（和 `/stats` 共用一份），
 *    这里只补上首页要用的 JSX 强调 —— 纯文案，不含任何分类逻辑。
 */
const WHAT: Record<string, React.ReactNode> = {
  windows: (
    <>
      分屏、切分、缩放、跳焦点。四个模式：<K>跳转</K> <K>搭建</K> <K>缩放</K>{" "}
      <K>键位</K>（各自记进度）
    </>
  ),
  buffers: (
    <>
      buffer 带子上的删/移/标，<K>&lt;Space&gt;b</K> 那一族
    </>
  ),
  tabs: (
    <>
      <K>&lt;Tab&gt;</K> 那一族。注意它关的是<b className="text-amber-500/90">整个标签页</b>，
      不是单个 buffer
    </>
  ),
  files: (
    <>
      只记一条规律:<b className="text-blue-300">小写 = 项目根目录</b>,大写 = 当前目录
    </>
  ),
  text: (
    <>
      <K>diw</K> <K>daw</K> <K>ip</K> <K>i(</K> …。核心是 inner 带不带边缘空白
    </>
  ),
  core: (
    <>
      数据集里<b className="text-amber-400">没有</b>的那一批：<K>u</K>{" "}
      <K>&lt;C-r&gt;</K> <K>.</K> <K>dd</K> <K>yy</K> <K>p</K> <K>f</K> <K>m</K>{" "}
      <K>q</K> …。它们是 Vim 内建命令，<code>nvim_get_keymap</code> 查不到
    </>
  ),
  ui: (
    <>
      <K>&lt;Space&gt;u</K> 那一族。记号大小写很密（<K>uL</K> <K>ul</K> <K>ug</K>{" "}
      <K>uz</K> <K>uZ</K> <K>uA</K> …），边按边看画面怎么变
    </>
  ),
  diagnostics: (
    <>
      <K>[d</K> <K>]d</K> 在诊断间移动，加上 <K>gr*</K> 六个 LSP 查询。⚠️{" "}
      <K>gd</K> 是 Git diff，不是跳定义
    </>
  ),
  seq: (
    <>
      其余全部键位按序列<b>盲背</b>。按下去只弹面板、没有画面可看的那种
    </>
  ),
};

export default function HomePage() {
  /**
   * ⚠️ 进度必须在 useEffect 里读,不能在 lazy initializer 里读。
   *
   * `useState(() => loadBoards())` 在服务端求值时 localStorage 是
   * undefined → 服务端渲染出「0/353」,客户端 hydration 读到真实值 →
   * **Hydration failed**(控制台实测报了这个错)。
   *
   * 正确做法:初始为 null(首屏占位),挂载后再读。
   * 页面上的 /stats 页早就是这个写法,这里跟着它,不另创一套。
   */
  const [progress, setProgress] = useState<SRS.Progress | null>(null);

  useEffect(() => {
    setProgress(SRS.load());
  }, []);

  /**
   * 按板块统计。
   *
   * ⚠️ 新模型是**全局一张表**，每条记录带 `board` 标记 ——
   *    所以这里不需要「哪些 id 属于哪个板块」的映射。
   */
  const byBoard = useMemo(() => SRS.byBoard(progress ?? {}), [progress]);

  /**
   * 首页要显示的**卡片** —— `/windows` 的四个模式合成一张。
   *
   * ⚠️ 用 `boardCards()` 而不是 `BOARDS`：四个窗口模式各自有独立
   *    boardId 和进度，但在首页并排四张卡会让人以为要去四个地方练。
   */
  const cards = useMemo(() => boardCards(), []);

  /** 总进度：所有板块的「已掌握」之和 */
  const overall = useMemo(() => {
    const done = cards.reduce(
      (a, c) => a + c.ids.reduce((s, id) => s + (byBoard[id]?.mastered ?? 0), 0),
      0,
    );
    const total = cards.reduce((a, c) => a + c.total, 0);
    return { done, total };
  }, [byBoard, cards]);

  /** 现在该复习的条数 */
  const dueCount = useMemo(
    () => (progress ? SRS.summarize(progress).due : 0),
    [progress],
  );

  /** 清掉一张卡（可能是多个板块）的进度 */
  const clearCard = (c: BoardCard) => {
    if (!confirm(`清掉「${c.name}」的进度?`)) return;
    setProgress((prev) => {
      const next = { ...(prev ?? {}) };
      const ids = new Set(c.ids);
      for (const [id, item] of Object.entries(next)) {
        if (ids.has(item.board)) delete next[id];
      }
      SRS.save(next);
      return next;
    });
  };

  /**
   * ⚠️ 骨架分支必须放在**所有 hook 之后**。
   *
   * 原来我把它写在两个 useMemo 之前,于是首屏(boards===null)只调 3 个 hook、
   * 读完进度后调 4 个 → React 报
   * 「Rendered more hooks than during the previous render」直接白屏。
   *
   * 早返回 + 条件 hook 是 React 里最典型的自伤方式之一:
   * 规则不是「hook 要写在最前面」,而是「每次渲染的 hook 数量和顺序必须一致」。
   */
  if (progress === null) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
        <h1 className="text-xl font-bold">reflex</h1>
        <p className="mt-1 text-xs text-neutral-500">
          按键肌肉记忆训练 · 键位数据来自本机 LazyVim 16.0.1 实测抽取
        </p>
        <p className="mt-1 text-[11px] text-neutral-700">正在读进度…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <h1 className="text-xl font-bold">reflex</h1>
      <p className="mt-1 text-xs text-neutral-500">
        按键肌肉记忆训练 · 键位数据来自本机 LazyVim 16.0.1 实测抽取
      </p>

      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-neutral-400">
            总进度 <b className="text-green-400">{overall.done}</b>
            <span className="text-neutral-600"> / {overall.total}</span>
          </span>
          <span className="text-[10px] text-neutral-600">
            进度存在浏览器 localStorage,换设备不同步
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-neutral-800">
          <div
            className="h-full bg-green-500"
            style={{ width: `${overall.total ? (overall.done / overall.total) * 100 : 0}%` }}
          />
        </div>
        {/*
          ⚠️ 「该复习 n 条」是统一进度模型才做得到的事。
          旧版两套存储（「连对3次」+「做过」）量纲不同，
          连时间维度都没有，排不出复习队列。
        */}
        {dueCount > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="rounded bg-amber-950 px-1.5 py-0.5 text-amber-400">
              该复习 {dueCount} 条
            </span>
            <span className="text-neutral-600">答错的会立刻回插，连对越多复习越远</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {cards.map((b) => {
          /**
           * 一张卡的进度 = 它下面所有板块的掌握数之和。
           *
           * ⚠️ 多板块的卡（`/windows` 的四个模式）必须**求和** ——
           *    原来首页只读 `windows-hydra`，于是 jump/build/resize
           *    那 13 题的进度**永远不显示**（实测：练完首页还是 0）。
           */
          const done = b.ids.reduce((s, id) => s + (byBoard[id]?.mastered ?? 0), 0);
          const s = { done, total: b.total, left: Math.max(0, b.total - done) };
          const pct = s.total ? (s.done / s.total) * 100 : 0;
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-neutral-200">{b.name}</span>
                <span className="text-[11px] text-neutral-500">
                  {s.done}/{s.total}
                  {s.left > 0 && <span className="text-neutral-700"> · 还差 {s.left}</span>}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded bg-neutral-800">
                <div className="h-full bg-green-500/70" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                {WHAT[b.id] ?? b.what}
              </div>
            </>
          );

          return (
            <div
              key={b.id}
              className="group rounded border border-neutral-800 bg-neutral-900/30 p-3 hover:border-neutral-700"
            >
              <Link href={b.href} className="block">
                {inner}
              </Link>
              <div className="mt-1.5 flex justify-end gap-2 text-[10px]">
                <button
                  onClick={() => clearCard(b)}
                  className="text-neutral-700 hover:text-red-400"
                  title="清掉这个板块的进度"
                >
                  清进度
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Link href="/stats" className="text-blue-400 hover:underline">
          数据集总览 →
        </Link>
        <Link href="/seq" className="text-blue-400 hover:underline">
          盲背模式 →
        </Link>
        {/*
          ⚠️ 这一页回答「练全了没有」——
          分母是 Vim 官方的 doc/index.txt（479 条命令），
          分子是全部板块的题库，逐条标状态，缺口自己浮出来。
        */}
        <Link href="/coverage" className="text-amber-400 hover:underline">
          覆盖率对照（还差什么）→
        </Link>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-neutral-700">
        板块的划分判据是<b>「按下去有没有东西会变」</b>。窗口布局、buffer 带子、
        选中范围都会变,所以画出来;而 <code className="text-neutral-600">s*</code> 搜索、
        <code className="text-neutral-600">g*</code> Git 这类按下去只是弹一个面板,
        没有可持久渲染的状态 —— 硬造画面只会教出错误的操作感,所以留在盲背里。
      </p>
    </main>
  );
}