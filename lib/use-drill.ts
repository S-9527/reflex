"use client";

/**
 * 练习页的公共外壳 —— React 层。
 *
 * 判据逻辑全在 lib/drill.ts(纯函数,已单测)。这里只负责:
 * 挂 keydown、把 lib/drill 的三态映射到状态、以及画公共 UI。
 *
 * ## 各板块必须自己提供的东西
 *
 * - `init(task)`    → 该题的起始状态
 * - `apply(seq, s)` → 执行结果;**返回 null = 按了但状态没变**
 * - `toPanelKey(e)` → 浏览器 key → 面板记法
 *
 * ## ⚠️ 为什么 toPanelKey 由每个板块自己给
 *
 * `/tabs` 的 `<Tab>` 在浏览器里 key 是 `"Tab"`(没尖括号),
 * 直接拼会得到 `"<Tab>Tab"` 查表必然 miss —— 实测踩过,
 * 「新开标签页」那题永远报「不在这一页的范围里」。
 *
 * 但 `/windows` 那一族刻意**不收**裸 `hjkl` 和方向键(实测 Normal 模式
 * 没有这些映射,收下会练出用不上的肌肉记忆)。
 *
 * 两个板块对同一批键的处理不一样,这不是不一致 —— 是实测结果不一样。
 * 所以判据统一在引擎里,键的**范围**留给板块自己定。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classify, mergeFirstKeys, shouldTake, type DrillTask } from "@/lib/drill";
import { loadBoards, markSolved, saveBoards, type BoardProgress } from "@/lib/board-progress";

export type Flash = { ok: boolean; text: string };

/**
 * 「按了但状态没变」的哨兵。
 *
 * ⚠️ 不要用 `S | null` 当返回值 —— `/files` 的状态本身**就是** `null`
 * (那一族弹的是浮动窗,没有可持久渲染的状态)。用 `null` 当失败信号,
 * 引擎分不清「失败」和「状态就是 null」,于是每次都误报
 * 「按了但状态没变」。实测踩到:`<Space>ft` 按对了却显示失败。
 *
 * 所以失败用一个**独立符号**表示,不可能和任何状态值混淆。
 */
export const NO_EFFECT = Symbol("drill.noEffect");
export type NoEffect = typeof NO_EFFECT;

export type UseDrillOpts<S> = {
  /** 板块 id,进度存储用 */
  boardId: string;
  /** 题库 */
  tasks: DrillTask[];
  /** 这道题的起始状态 */
  init: (task: DrillTask) => S;
  /**
   * 执行一条完整解法。
   *
   * ⚠️ 返回 {@link NO_EFFECT} 的语义是「按了但状态没变」
   * (起始状态已满足条件),引擎会**明确提示**,不会静默吞掉 ——
   * 静默无反应最难查。返回新状态就是成功。
   */
  apply: (seq: string[], s: S, task: DrillTask) => S | NoEffect;
  /** 浏览器 KeyboardEvent → 面板记法。返回 null = 这一键不归我管 */
  toPanelKey: (e: KeyboardEvent) => string | null;
  /**
   * 本板块的「非解法但要接管」的键。
   *
   * `/windows` 需要:面板里 20 个键,每题只对一个。按了另一个键时
   * 应该明确说「那是另一个命令」并演示它的效果 —— 静默吞掉最难查。
   *
   * ⚠️ 注意 prefix 也要从这里判:`<Space>` 之后按了面板里的任何键
   * 都应该被接管并反馈,而不是落到 classify 的 `none` 分支被放行。
   */
  extraAccept?: string[][];
  /** 命中 extraAccept(不是本题解法)时怎么处理。返回文案作为 flash */
  onOther?: (seq: string[], s: S, task: DrillTask) => { next?: S; text: string };
  /** 判对后等多久自动翻到下一题(ms) */
  advanceMs?: number;
  /** apply 返回 null 时的提示文案 */
  noEffectText?: (matched: string[]) => string;
  /** 板子特有:每次换题后清掉的东西(如 hydra 的 zoom 备份) */
  onResetExtra?: () => void;
};

/** 稳定的空数组常量 —— 避免每次渲染都造新数组导致下游 memo 失效 */
const EMPTY_IDS: string[] = [];

export type UseDrill<S> = {
  task: DrillTask;
  taskIndex: number;
  state: S;
  /** 已按但没凑齐的键,如 ["<Space>", "b"] */
  buf: string[];
  /** 缓冲的可读形式 */
  pending: string | null;
  log: string[];
  flash: Flash | null;
  /**
   * 已解开的题的**题号**(从 0 开始)。
   *
   * ⚠️ 这是本次会话的进度。跨会话的持久化在 `solvedAll` ——
   * 两个都要:前者让按钮变绿(需要立即反映),后者让首页仪表盘
   * 知道「你上周做了多少」。
   */
  solved: number[];
  /** 跨会话:这个板块历史上做过的题号(从 localStorage 读) */
  solvedAll: string[];
  /** 清掉这个板块的跨会话进度(页面上的「清进度」按钮用) */
  clearProgress: () => void;
  setTaskIndex: (i: number) => void;
  reset: () => void;
};

export function useDrill<S>(opts: UseDrillOpts<S>): UseDrill<S> {
  const {
    tasks,
    init,
    apply,
    toPanelKey,
    extraAccept,
    onOther,
    advanceMs = 1500,
    noEffectText,
    onResetExtra,
  } = opts;

  const [taskIndex, setTaskIndex] = useState(0);
  const task = tasks[taskIndex];
  const [state, setState] = useState<S>(() => init(task));
  const [buf, setBuf] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [solved, setSolved] = useState<number[]>([]);
  /**
   * 跨会话进度。
   *
   * ⚠️ 必须在 useEffect 里读,不能用 `useState(() => loadBoards())`。
   * lazy initializer 在服务端求值时 localStorage 是 undefined,
   * 服务端渲染出「全灰」而客户端是「全绿」→ **Hydration failed**
   * (首页仪表盘踩过这个坑,控制台实测报错)。
   *
   * 初始为 `{}` = 服务端和客户端首屏一致(都没进度),
   * 挂载后再补上。代价是按钮会先灰一下,可接受。
   */
  const [boards, setBoards] = useState<BoardProgress>({});

  useEffect(() => {
    setBoards(loadBoards());
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * state 放 ref 里 —— keydown handler 要读**最新**的状态才能算 apply,
   * 但把它放进 useEffect 依赖会让 handler 每次渲染都重挂。
   * ref 是这里唯一能同时满足这两点的做法。
   */
  const stateRef = useRef(state);
  stateRef.current = state;
  const taskRef = useRef(task);
  taskRef.current = task;
  const taskIndexRef = useRef(taskIndex);
  taskIndexRef.current = taskIndex;
  /**
   * 序列缓冲也要走 ref。
   *
   * ⚠️ 这一条不是洁癖 —— handler 里 `shouldTake(buf, ...)` 要判断
   * 「当前是不是在序列中间」,而 buf 一旦被排除在 effect 依赖外,
   * handler 里读到的就是**首次渲染时的空数组**。那样每按第二键都会被
   * 当成 idle 处理,三键序列全部失效 —— 和 leader 那个 bug 一模一样。
   */
  const bufRef = useRef(buf);
  bufRef.current = buf;

  const boardId = opts.boardId;
  const solvedAll = boards[boardId] ?? EMPTY_IDS;

  /** 记一道题做过了 —— 立刻落盘,不给「关掉标签页就没了」留机会 */
  const persist = useCallback(
    (taskId: string) => {
      setBoards((prev) => {
        const next = markSolved(prev, boardId, taskId);
        saveBoards(next);
        return next;
      });
    },
    [boardId],
  );

  /** 清掉本板块进度 */
  const clearProgress = useCallback(() => {
    setBoards((prev) => {
      const next = { ...prev };
      delete next[boardId];
      saveBoards(next);
      return next;
    });
  }, [boardId]);

  const firstKeys = useMemo(
    () => mergeFirstKeys(task.accept, ...(extraAccept ? [extraAccept] : [])),
    [task.accept, extraAccept],
  );

  const reset = useCallback(() => {
    setState(init(taskRef.current));
    setBuf([]);
    setLog([]);
    setFlash(null);
    onResetExtra?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reset();
  }, [taskIndex, reset]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return;

      const k = toPanelKey(e);
      // toPanelKey 返回 null = 这个键不归我管(如本板块只收 Ctrl 系键时)
      if (k === null) return;
      const curBuf = bufRef.current;
      if (!shouldTake(curBuf, firstKeys, k)) return;

      const next = [...curBuf, k];
      const r = classify(task.accept, next);

      if (r.kind === "prefix") {
        e.preventDefault();
        setBuf(next);
        return;
      }

      if (r.kind === "none") {
        // 本题的解法里没有,再问一次「这是不是本板块的其它命令」。
        // ⚠️ 必须在这里判,不能只在 idle 判:前缀阶段就得知道
        //   「<Space> 已经按了,后面按什么都要接管并反馈」。
        if (extraAccept) {
          const r2 = classify(extraAccept, next);
          if (r2.kind === "prefix") {
            e.preventDefault();
            setBuf(next);
            return;
          }
          if (r2.kind === "hit") {
            e.preventDefault();
            setBuf([]);
            const shown2 = r2.seq.join("");
            setLog((l) => [...l, shown2]);
            const res = onOther?.(r2.seq, stateRef.current, taskRef.current);
            if (res?.next !== undefined) setState(res.next);
            setFlash({
              ok: false,
              text: res?.text ?? `✗ ${shown2} —— 本题要的是「${taskRef.current.desc}」`,
            });
            return;
          }
        }
        // 放行:不 preventDefault,浏览器快捷键照常工作。
        // 但要清缓冲 —— 用户大概率是想放弃这一串。
        setBuf([]);
        return;
      }

      // hit —— 结算
      e.preventDefault();
      setBuf([]);
      const shown = r.seq.join("");
      setLog((l) => [...l, shown]);

      const cur = taskRef.current;
      const out = apply(r.seq, stateRef.current, cur);
      if (out === NO_EFFECT) {
        setFlash({
          ok: false,
          text: noEffectText
            ? noEffectText(r.seq)
            : `${shown} 按了但状态没变(当前状态没东西可操作)`,
        });
        return;
      }
      setState(out);

      // ⚠️ 这里不再比 accept[0] —— accept 里每一条都是等价解法,
      // 命中任意一条都算解过。只认第一条就是「训练器比真实环境挑剔」。
      setFlash({ ok: true, text: `✓ ${shown} —— ${cur.desc}` });
      const ti = taskIndexRef.current;
      setSolved((x) => (x.includes(ti) ? x : [...x, ti]));
      persist(cur.id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTaskIndex((i) => (i + 1) % tasks.length), advanceMs);
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
    // state / buf / task 故意不进依赖:handler 通过 ref 读最新值。
    // 放进依赖会导致每按一键就重挂监听,丢键。
  }, [firstKeys, toPanelKey, task.accept, extraAccept, onOther, apply, advanceMs, noEffectText, tasks.length]);

  return {
    task,
    taskIndex,
    state,
    buf,
    pending: buf.length ? buf.join(" ") : null,
    log,
    flash,
    solved,
    solvedAll,
    clearProgress,
    setTaskIndex,
    reset,
  };
}

/** 浏览器 key → 面板记法的默认实现。各板块可覆盖。 */
export function defaultToPanelKey(e: KeyboardEvent): string | null {
  const NAMED: Record<string, string> = {
    " ": "<Space>",
    Tab: "<Tab>",
    Enter: "<CR>",
    Escape: "<Esc>",
    Backspace: "<BS>",
  };
  return NAMED[e.key] ?? e.key;
}