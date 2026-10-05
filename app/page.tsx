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
import { loadBoards, boardSummary, clearBoard, saveBoards, type BoardProgress } from "@/lib/board-progress";
import { load as loadSeq, reset as resetSeq, summarize, type Progress } from "@/lib/progress";

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

type Board = {
  id: string;
  href: string;
  name: string;
  /**
   * 练的是什么东西。
   *
   * ⚠️ 这里**绝不能**塞 HTML 再 dangerouslySetInnerHTML —— 我第一版那么写了,
   * 结果 `<Space>w` 被当成标签解析掉,页面上显示成「w 面板」,
   * 键位写法整个丢了。要强调键就写成 JSX。
   */
  what: React.ReactNode;
  /** 题库条数 */
  total: number;
  /** 进度存哪:可视化板块用 boardId,盲背用 seq */
  kind: "board" | "seq";
};

const K = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-blue-950 px-1 text-[10px] text-blue-300">{children}</code>
);

const BOARDS: Board[] = [
  {
    id: "windows-hydra",
    href: "/windows",
    name: "窗口",
    what: (
      <>
        分屏、切分、缩放、跳焦点。这一族练的是 <K>&lt;Space&gt;w</K> 面板里的反射
      </>
    ),
    total: WIN_TASKS.length,
    kind: "board",
  },
  {
    id: "buffers",
    href: "/buffers",
    name: "缓冲区",
    what: (
      <>
        buffer 带子上的删/移/标,<K>&lt;Space&gt;b</K> 那一族
      </>
    ),
    total: BUF_TASKS.length,
    kind: "board",
  },
  {
    id: "tabs",
    href: "/tabs",
    name: "标签页",
    what: (
      <>
        <K>&lt;Tab&gt;</K> 那一族。注意它关的是<b className="text-amber-500/90">整个标签页</b>,
        不是单个 buffer
      </>
    ),
    total: TAB_TASKS.length,
    kind: "board",
  },
  {
    id: "files",
    href: "/files",
    name: "文件浏览器",
    what: <>只记一条规律:<b className="text-blue-300">小写 = 项目根目录</b>,大写 = 当前目录</>,
    total: FILE_TASKS.length,
    kind: "board",
  },
  {
    id: "text",
    href: "/text",
    name: "文本对象",
    what: (
      <>
        <K>diw</K> <K>daw</K> <K>ip</K> <K>i(</K> …。核心是 inner 带不带边缘空白
      </>
    ),
    total: SPEC.filter((s) => s.measured).length,
    kind: "board",
  },
  {
    id: "ui",
    href: "/ui",
    name: "界面开关",
    what: (
      <>
        <K>&lt;Space&gt;u</K> 那一族,24 条。记号大小写很密(
        <K>uL</K> <K>ul</K> <K>ug</K> <K>uz</K> <K>uZ</K> <K>uA</K> …),
        边按边看画面怎么变
      </>
    ),
    total: UI_TOGGLES.length,
    kind: "board",
  },
  {
    id: "diagnostics",
    href: "/diag",
    name: "诊断与 LSP",
    what: (
      <>
        <K>[d</K> <K>]d</K> <K>[D</K> <K>]D</K> 让光标在诊断间移动,加上{" "}
        <K>gr*</K> 六个 LSP 查询。⚠️ <K>gd</K> 是 Git diff,不是跳定义
      </>
    ),
    total: DIAG_KEYS.length,
    kind: "board",
  },
  {
    id: "seq",
    href: "/seq",
    name: "全键位扫描",
    what: (
      <>
        其余全部键位按序列<b>盲背</b>。按下去只弹面板、没有画面可看的那种,形式上盲背恰好是对的
      </>
    ),
    total: RAW.length,
    kind: "seq",
  },
];

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
  const [boards, setBoards] = useState<BoardProgress | null>(null);
  const [seq, setSeq] = useState<Progress | null>(null);

  useEffect(() => {
    setBoards(loadBoards());
    setSeq(loadSeq());
  }, []);

  const totals = useMemo(() => {
    // seq 还没读出来时先按空进度算 —— 见下面的骨架分支。
    const pool = RAW.map((r) => ({ ...r, keys: [r.display] }));
    return summarize(seq ?? {}, pool as never);
  }, [seq]);

  const overall = useMemo(() => {
    const done = BOARDS.reduce((a, b) => {
      if (b.kind === "board") return a + boardSummary(boards ?? {}, b.id, b.total).done;
      return a + totals.mastered;
    }, 0);
    const total = BOARDS.reduce((a, b) => a + b.total, 0);
    return { done, total };
  }, [boards, totals]);

  const clearOne = (b: Board) => {
    if (!confirm(`清掉「${b.name}」的进度?`)) return;
    if (b.kind === "board") {
      const next = clearBoard(boards ?? {}, b.id);
      setBoards(next);
      saveBoards(next);
    } else {
      if (!confirm("这会清掉全部盲背记录(已掌握/还不熟/没见过),确定?")) return;
      resetSeq();
      setSeq({});
    }
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
  if (boards === null || seq === null) {
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
      </div>

      <div className="mt-4 space-y-2">
        {BOARDS.map((b) => {
          const s =
            b.kind === "board"
              ? boardSummary(boards, b.id, b.total)
              : { done: totals.mastered, total: b.total, left: Math.max(0, b.total - totals.mastered) };
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
              <div className="mt-1 text-[11px] leading-relaxed text-neutral-500">{b.what}</div>
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
                  onClick={() => clearOne(b)}
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