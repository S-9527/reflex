"use client";

/**
 * 练习页的公共外壳 —— React 层。
 *
 * 判据逻辑全在 lib/drill.ts(纯函数,已单测)。会话与结算在 lib/session.ts。
 * 这里只负责:挂 keydown、把三态映射到状态、以及暴露逐键反馈。
 *
 * ## ⚠️ 这一版的两个核心改动（qwerty 式打字流）
 *
 * ### 1. 去掉 advanceMs 定时器
 *
 * 旧版答对后 `setTimeout(… , 1500)` 才翻下一题，中间那 1.5 秒
 * 用户只能干等。qwerty 式练习器的节奏是**连续的**：
 *
 * ```
 * 旧：题面 → 你按 → 判分 → 等 1.5 秒 → 下一题     ← 断的
 * 新：题面 → 你连续按 → 逐键反馈 → 同一帧下一题      ← 连续的
 * ```
 *
 * 所以命中即翻页，没有等待。
 *
 * ### 2. 逐键反馈（perKey）
 *
 * 旧版只在整串结束时给一次反馈，`prefix` 分支是**静默收下**的。
 * 现在每按一键都算一次三态，UI 可以立刻上色：
 * 绿 = 这一键对，红 = 错了。
 *
 * 这个几乎是免费拿到的 —— `classify` 本来就返回三态，
 * 只是旧版没把 `prefix` 的结果暴露出去。
 *
 * ## 各板块必须自己提供的东西
 *
 * - `init(task)`    → 该题的起始状态
 * - `apply(seq, s)` → 执行结果;**返回 NO_EFFECT = 按了但状态没变**
 * - `toPanelKey(e)` → 浏览器 key → 面板记法
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  classify,
  mergeFirstKeys,
  pushFeed,
  shouldTake,
  type DrillTask,
  type KeyFeedback,
} from "@/lib/drill";
import * as SRS from "@/lib/srs";
import {
  createSession,
  cursor as sessionCursor,
  currentTaskId,
  isDone as sessionIsDone,
  record as sessionRecord,
  summarize,
  type Result,
  type Session,
  type Summary,
} from "@/lib/session";
import {
  countsForProgress,
  hintedKeys,
  hintUseful,
  loadMode,
  nextHint,
  saveMode,
  type HintLevel,
  type Mode,
} from "@/lib/hints";

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

/** 逐键反馈 —— 类型定义在 lib/drill.ts（纯逻辑），这里 re-export 方便各板块引用 */
export type { KeyFeedback };

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
   * (起始状态已满足条件),引擎会**明确提示**,不会静默吞掉。
   */
  apply: (seq: string[], s: S, task: DrillTask) => S | NoEffect;
  /** 浏览器 KeyboardEvent → 面板记法。返回 null = 这一键不归我管 */
  toPanelKey: (e: KeyboardEvent) => string | null;
  /** 本板块的「非解法但要接管」的键 */
  extraAccept?: string[][];
  /** 命中 extraAccept(不是本题解法)时怎么处理。返回文案作为 flash */
  onOther?: (seq: string[], s: S, task: DrillTask) => { next?: S; text: string };
  /** apply 返回 NO_EFFECT 时的提示文案 */
  noEffectText?: (matched: string[]) => string;
  /** 板子特有:每次换题后清掉的东西(如 hydra 的 zoom 备份) */
  onResetExtra?: () => void;
  /**
   * 换题时**保留**状态?
   *
   * 默认 false —— 绝大多数板块每题都从固定起点重来。
   *
   * ⚠️ `u*` 那一族必须设成 true:那里状态是「哪些开关开着」,
   * 累积才有意义。
   */
  keepStateOnAdvance?: boolean;
  /**
   * 一轮抽几题。
   *
   * 默认 = 全部题目（一个板块一轮打完）。和 Qwerty Learner
   * 「打完一个词库」一致。传数字则随机抽那么多道。
   */
  roundSize?: number;
};

/** 稳定的空数组常量 —— 避免每次渲染都造新数组导致下游 memo 失效 */
const EMPTY_IDS: string[] = [];

export type UseDrill<S> = {
  task: DrillTask;
  /** 本轮第几题（从 0 开始，按会话游标，不是题库下标） */
  taskIndex: number;
  state: S;
  /** 已按但没凑齐的键 */
  buf: string[];
  /** 缓冲的可读形式 */
  pending: string | null;
  log: string[];
  flash: Flash | null;
  /** 逐键反馈 —— 每一键按下去是对是错。UI 用它上色 */
  keyFeed: KeyFeedback[];
  /** 跨会话:这个板块历史上做过的题号 */
  solvedAll: string[];
  /** 清掉这个板块的跨会话进度 */
  clearProgress: () => void;
  /** 统一进度模型（lib/srs.ts）的全量数据 */
  progress: SRS.Progress;
  /** 跳到题库里第 i 题（会重开一轮） */
  setTaskIndex: (i: number) => void;
  reset: () => void;
  /** 本轮会话 */
  session: Session;
  /** 本轮做完了吗 */
  done: boolean;
  /** 重新开始一轮（可指定题目顺序） */
  restart: (order?: string[]) => void;
  /** 本轮结算数据 */
  summary: Summary;
  /** 跳过当前题（记为答错，但不算按键） */
  skip: () => void;
  /** 练习模式：跟打 / 默写 */
  mode: Mode;
  /** 切换模式 */
  setMode: (m: Mode) => void;
  /** 当前题的提示级别 0~3 */
  hint: HintLevel;
  /** 要按 ? 才给提示 —— 这个函数就是 ? 的动作 */
  showHint: () => void;
  /** 这一题有没有提示可给（单键的题给提示等于给答案） */
  canHint: boolean;
  /**
   * 题目区该显示什么键。
   *
   * - 跟打模式：直接给全部（最优解）
   * - 默写模式：按 `hint` 级别渐进给
   *
   * ⚠️ 已按下的键由 `keyFeed` 决定颜色，这里只管「显示什么字」。
   */
  shownKeys: (string | null)[];
};

export function useDrill<S>(opts: UseDrillOpts<S>): UseDrill<S> {
  const {
    tasks,
    init,
    apply,
    toPanelKey,
    extraAccept,
    onOther,
    noEffectText,
    onResetExtra,
    keepStateOnAdvance = false,
    roundSize,
  } = opts;

  /** 本轮题目顺序。默认全部（按题库顺序） */
  const makeOrder = useCallback(
    (custom?: string[]) => custom ?? tasks.map((t) => t.id),
    [tasks],
  );

  const [session, setSession] = useState<Session>(() =>
    createSession(opts.boardId, makeOrder()),
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;

  /** 当前题的题库下标 —— 会话存的是 taskId，要换回 task */
  const currentId = currentTaskId(session);
  const taskIndex = useMemo(() => {
    if (currentId === null) return 0;
    const i = tasks.findIndex((t) => t.id === currentId);
    return i < 0 ? 0 : i;
  }, [currentId, tasks]);
  const task = tasks[taskIndex];

  const [state, setState] = useState<S>(() => init(task));
  const [buf, setBuf] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [keyFeed, setKeyFeed] = useState<KeyFeedback[]>([]);
  /**
   * 统一进度模型（lib/srs.ts）。
   *
   * ⚠️ 初值是 `{}` 而不是从 localStorage 读 —— 后者在服务端是 undefined，
   *    会让 SSR 和客户端首帧不一致（hydration mismatch，这个项目踩过）。
   */
  const [progress, setProgress] = useState<SRS.Progress>({});

  /**
   * 练习模式：跟打 / 默写。
   *
   * ⚠️ 初值用 "recall" 而不是从 localStorage 读 —— 后者在服务端是
   * undefined，会让 SSR 和客户端首帧不一致（hydration mismatch，
   * 这个项目踩过）。挂载后再补上真实值。
   */
  const [mode, setModeState] = useState<Mode>("recall");
  /** 当前题的提示级别。换题时归零 */
  const [hint, setHint] = useState<HintLevel>(0);
  /** 当前题用过提示吗 —— commit 要读它，所以走 ref */
  const usedHintRef = useRef(false);
  /**
   * mode 的 ref 镜像 —— keydown handler 要读最新值。
   *
   * ⚠️ 用 effect 同步而不是在渲染期直接赋值（`modeRef.current = mode`）：
   *    渲染期写 ref 是 React 明确不建议的（并发渲染下可能被丢弃），
   *    eslint 的 `react-hooks/refs` 也会报错。
   *    代价是 handler 在 effect 跑完前读到旧值 —— 对模式切换来说
   *    可接受（切换不是每帧发生的事）。
   */
  const modeRef = useRef<Mode>(mode);

  useEffect(() => {
    setModeState(loadMode());
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  /** 切换模式（落盘 + 重开一轮，因为计分规则变了） */
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    modeRef.current = m;
    saveMode(m);
  }, []);

  /** 这一题第一个键按下的时刻 —— 用来算单题用时 */
  const taskStart = useRef<number | null>(null);

  useEffect(() => {
    setProgress(SRS.load());
  }, []);

  const boardId = opts.boardId;

  /**
   * 这个板块做过的题 id。
   *
   * ⚠️ 新模型不按板块分桶 —— 进度是全局的 `{ [taskId]: Item }`。
   *    所以这里从「本题库的 id 里，哪些在进度里有记录」反推。
   *    好处是**跨板块的复习队列**才有可能（旧的分桶做不到）。
   */
  const solvedAll = useMemo(
    () => tasks.filter((t) => (progress[t.id]?.seen ?? 0) > 0).map((t) => t.id),
    [tasks, progress],
  );

  /**
   * state 放 ref 里 —— keydown handler 要读**最新**的状态才能算 apply,
   * 但把它放进 useEffect 依赖会让 handler 每次渲染都重挂。
   */
  const stateRef = useRef(state);
  stateRef.current = state;
  const taskRef = useRef(task);
  taskRef.current = task;
  /**
   * ⚠️ 序列缓冲也要走 ref。
   *
   * handler 里 `shouldTake(buf, ...)` 要判断「当前是不是在序列中间」,
   * 而 buf 一旦被排除在 effect 依赖外, handler 里读到的就是首次渲染的
   * 空数组 —— 每按第二键都被当成 idle,三键序列全部失效。
   */
  const bufRef = useRef(buf);
  bufRef.current = buf;

  /**
   * 记一次作答 —— 立刻落盘。
   *
   * ⚠️ 带上 `independent`：只有「默写模式 + 没用提示」的答对
   *    才推进 streak 和复习间隔。跟打照抄、按提示抄的算 correct
   *    但不算学会（见 lib/srs.ts 的 record）。
   */
  const persist = useCallback(
    (taskId: string, ok: boolean, independent: boolean, ms: number) => {
      setProgress((prev) => {
        const next = SRS.record(prev, taskId, ok, { board: boardId, independent, ms });
        SRS.save(next);
        return next;
      });
    },
    [boardId],
  );

  /**
   * 清掉这个板块的进度。
   *
   * ⚠️ 新模型不按板块分桶，所以只能清「本题库这些 id」的记录 ——
   *    不会误伤别的板块。
   */
  const clearProgress = useCallback(() => {
    setProgress((prev) => {
      const next = { ...prev };
      for (const t of tasks) delete next[t.id];
      SRS.save(next);
      return next;
    });
  }, [tasks]);

  const firstKeys = useMemo(
    () => mergeFirstKeys(...task.accept, ...(extraAccept ?? [])),
    [task.accept, extraAccept],
  );

  /** 换题时清掉每题的状态 */
  const resetTaskState = useCallback(() => {
    setState(init(taskRef.current));
    setBuf([]);
    setLog([]);
    setFlash(null);
    setKeyFeed([]);
    // ⚠️ 提示级别和「用过提示」必须跟着归零 ——
    //    不归零的话下一题会直接显示答案，而且会被记成「用过提示」，
    //    白白拉低 independent。
    setHint(0);
    usedHintRef.current = false;
    taskStart.current = null;
    onResetExtra?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 重开一轮 */
  const restart = useCallback(
    (order?: string[]) => {
      const q = makeOrder(order);
      setSession(createSession(boardId, q));
      setState(init(taskRef.current));
      setBuf([]);
      setLog([]);
      setFlash(null);
      setKeyFeed([]);
      setHint(0);
      usedHintRef.current = false;
      taskStart.current = null;
      onResetExtra?.();
    },
    [boardId, makeOrder, init, onResetExtra],
  );

  const reset = useCallback(() => {
    resetTaskState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTaskState]);

  /** 要提示 —— 逐级上升，到顶就停 */
  const showHint = useCallback(() => {
    usedHintRef.current = true;
    setHint((h) => nextHint(h));
  }, []);

  /** 跳到题库里第 i 题（重开一轮，只练这一题起步） */
  const setTaskIndex = useCallback(
    (i: number) => {
      const t = tasks[i];
      if (!t) return;
      // 从第 i 题开始的整轮顺序（保持「一轮打完」的语义）
      const order = [...tasks.slice(i), ...tasks.slice(0, i)].map((x) => x.id);
      restart(order);
    },
    [tasks, restart],
  );

  /**
   * 记一道题的结果并推进。
   *
   * ⚠️ 这里**没有 setTimeout** —— 命中即推进，这就是「流」。
   *
   * ⚠️ 带上 `usedHint` 和 `mode`：结算要用它们区分
   *    「按键对了」和「真的记住了」（见 Summary.independent）。
   */
  const commit = useCallback(
    (ok: boolean, wrongKey?: string) => {
      const cur = taskRef.current;
      const started = taskStart.current;
      const ms = started === null ? 0 : Math.max(0, Date.now() - started);

      const r: Result = {
        taskId: cur.id,
        ok,
        ms,
        wrongKey,
        usedHint: usedHintRef.current,
        mode: modeRef.current,
      };
      setSession((s) => sessionRecord(s, r));

      /**
       * ⚠️ 每一次作答都记进 SRS，但**只有独立答对**才推进熟练度。
       *
       * 答错也要记 —— 否则错题不会被回插（dueAt = now），
       * 复习队列就漏掉了最该复习的那些。
       */
      const independent = countsForProgress(modeRef.current, usedHintRef.current);
      persist(cur.id, ok, independent, ms);
      taskStart.current = null;
    },
    [persist],
  );

  /** 跳过当前题 —— 记为答错，但不计按键（用户没按） */
  const skip = useCallback(() => {
    const cur = taskRef.current;
    commit(false, "(跳过)");
    setFlash({ ok: false, text: `已跳过 —— 答案是 ${cur.accept[0]?.join("") ?? "?"}` });
  }, [commit]);

  /**
   * 换题时重置每题状态。
   *
   * ⚠️ 依赖是 `currentId` 而不是 `taskIndex`：会话推进时 taskIndex 可能
   * 因题库查找失败而停在 0，用 currentId 更准。
   */
  useEffect(() => {
    if (keepStateOnAdvance) {
      setBuf([]);
      setLog([]);
      setFlash(null);
      setKeyFeed([]);
      taskStart.current = null;
      onResetExtra?.();
      return;
    }
    resetTaskState();
  }, [currentId, resetTaskState, keepStateOnAdvance, onResetExtra]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return;

      // 本题已经做完（会话推进中）—— 不接管
      if (sessionIsDone(sessionRef.current)) return;

      /**
       * `?` 是提示键。
       *
       * ⚠️ 必须在 `shouldTake` **之前**判 —— 因为 `?` 不在本题解法的
       *    首键集合里（数据集里只有 `<Space>?` 这个键），
       *    `shouldTake` 会返回 false 直接放行，提示就永远按不出来。
       *
       * ⚠️ 而且只在**缓冲为空**时接管：序列按到一半时 `?` 可能是
       *    某条解法的续键，不能抢。
       */
      if (e.key === "?" && bufRef.current.length === 0) {
        e.preventDefault();
        usedHintRef.current = true;
        setHint((h) => nextHint(h));
        return;
      }

      const k = toPanelKey(e);
      if (k === null) return;
      const curBuf = bufRef.current;
      if (!shouldTake(curBuf, firstKeys, k)) return;

      // 第一个键按下 → 开始计时
      if (taskStart.current === null) taskStart.current = Date.now();

      const next = [...curBuf, k];
      const r = classify(task.accept, next);

      if (r.kind === "prefix") {
        e.preventDefault();
        setBuf(next);
        // 逐键反馈：这一键是某条解法的真前缀 → 绿
        setKeyFeed((f) => pushFeed(f, next.length - 1, k, true));
        return;
      }

      if (r.kind === "none") {
        // 本题的解法里没有,再问一次「这是不是本板块的其它命令」
        if (extraAccept) {
          const r2 = classify(extraAccept, next);
          if (r2.kind === "prefix") {
            e.preventDefault();
            setBuf(next);
            setKeyFeed((f) => pushFeed(f, next.length - 1, k, true));
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
        /**
         * 放行:不 preventDefault,浏览器快捷键照常工作。
         *
         * ⚠️ 但**不清缓冲** —— 这是本版的关键改动。
         *
         * 旧版这里 `setBuf([])`，于是用户按错一个键、整串就没了，
         * 得从头再来。qwerty 式的手感是「停住纠错」：
         * 保留已按对的前缀，只把错的那一键标红，等你按对再继续。
         *
         * 理由：Vim 序列按错之后，后面几个键基本没有意义
         * （`<Space>bd` 按成 `<Space>bx`，继续按 d 也不会变对），
         * 所以不学 Qwerty 那样标红继续往下打，而是停在错处。
         */
        e.preventDefault();
        setKeyFeed((f) => pushFeed(f, next.length - 1, k, false));
        setFlash({
          ok: false,
          text: `${k} 不在本题的解法里 —— 已按对的部分保留，接着按`,
        });
        return;
      }

      // hit —— 结算。⚠️ 同一帧推进，没有定时器
      e.preventDefault();
      setBuf([]);
      const shown = r.seq.join("");
      setLog((l) => [...l, shown]);
      setKeyFeed((f) => pushFeed(f, next.length - 1, k, true));

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
      setFlash({ ok: true, text: `✓ ${shown} —— ${cur.desc}` });
      commit(true);
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
    // state / buf / task 故意不进依赖:handler 通过 ref 读最新值。
  }, [firstKeys, toPanelKey, task.accept, extraAccept, onOther, apply, noEffectText, commit]);

  /**
   * 结算数据 —— 直接调 lib/session.ts 的 `summarize`。
   *
   * ⚠️ 不要在 hook 里内联重写一遍算法。我第一版就是那么干的
   * （把 summarize 的公式抄进 useMemo），而那正是这个项目
   * 一直在犯的错：「同一个概念抄四遍 = 四套判据 = 必然不同步」。
   * 判据只有一份，在 lib/session.ts，有单测。
   */
  const summary = useMemo(
    () =>
      summarize(session, (taskId) => {
        const t = tasks.find((x) => x.id === taskId);
        return t?.accept[0]?.length ?? 0;
      }),
    [session, tasks],
  );

  /** 本题最优解，逐键 */
  const bestKeys = useMemo(() => task.accept[0] ?? [], [task]);

  /**
   * 题目区该显示什么字。
   *
   * - 跟打模式：全部显示（就是给人照着按的）
   * - 默写模式：按 `hint` 级别渐进给
   *
   * ⚠️ 已经按下的键不看这里 —— 颜色由 `keyFeed` 决定。
   *    这里只管「格子里写什么」，两者是正交的。
   */
  const shownKeys = useMemo(
    () => (mode === "drill" ? bestKeys.map((k) => k) : hintedKeys(bestKeys, hint)),
    [mode, bestKeys, hint],
  );

  return {
    task,
    taskIndex: sessionCursor(session),
    state,
    buf,
    pending: buf.length ? buf.join(" ") : null,
    log,
    flash,
    keyFeed,
    solvedAll,
    clearProgress,
    progress,
    setTaskIndex,
    reset,
    session,
    done: sessionIsDone(session),
    restart,
    summary,
    skip,
    mode,
    setMode,
    hint,
    showHint,
    canHint: hintUseful(bestKeys),
    shownKeys,
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
