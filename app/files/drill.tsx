"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FILE_KEYS,
  FILE_TASKS,
  VERBS,
  VERB_NAMES,
  SCOPE_NAMES,
  findFileKey,
  normSeq,
  toPanelKey,
  type FileTask,
} from "@/lib/files";

/**
 * 文件浏览器练习 —— 练的是**一条规律**,不是十几个键。
 *
 * ## 为什么不是「模拟文件树」
 *
 * `<Space>e` 弹的是 Snacks 浮动窗,按下去没有可持久渲染的状态。
 * 硬造一棵假树只会教出错误的操作感。所以这页建模的是键位规律本身。
 *
 * ## 核心规律(实测自nvim_get_keymap)
 *
 *     小写 → 项目根目录    大写 → 当前目录
 *
 *     e/Explorer   ff/fF   fr/fR   ft/fT   fb/fB
 *
 * 记住这一条,这一族就全记住了。所以题目问的是
 * 「这个操作要开哪个目录的那个?」,而不是「按 ff 还是 fF」。
 *
 * ## 验证边界
 *
 * headless 下弹窗建不起来(没 UI),所以**浮动窗本身我没验证过**,
 * 只验证了键位映射确实存在且 desc 如表。界面上如实标注了。
 */
export default function FileDrill() {
  const [ti, setTi] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef<string | null>(null);

  const task = FILE_TASKS[ti];
  const target = findFileKey(task.key)!;
  const accept = target.seqs;

  const reset = useCallback(() => {
    setLog([]);
    setFlash(null);
    setPending(null);
    seq.current = null;
  }, []);

  useEffect(() => {
    reset();
  }, [ti, reset]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const settle = useCallback(
    (matched: string[]) => {
      const shown = matched.join("");
      setLog((l) => [...l, shown]);
      setFlash({ ok: true, text: `✓ ${shown}` });
      setSolved((x) => (x.includes(ti) ? x : [...x, ti]));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTi((i) => (i + 1) % FILE_TASKS.length), 1500);
    },
    [ti],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;

      // <C-/> 是终端(root)的同义键 —— 必须单独放行,
      // 否则它会被下面的 "Ctrl 一律忽略" 挡掉。
      // ⚠️ Vim 记法 <C-/> 的浏览器 event.key 是 "/" 且 ctrlKey 为真。
      if (e.ctrlKey && e.key === "/") {
        e.preventDefault();
        seq.current = "";
        setPending(null);
        if (accept.some((s) => normSeq(s) === "<C-/>")) settle(["<C-/>"]);
        return;
      }
      if (e.ctrlKey) return;

      const k = toPanelKey(e.key);
      const buf = seq.current ? [...seq.current.split("|"), k] : [k];

      if (accept.some((s) => normSeq(s) === normSeq(buf))) {
        e.preventDefault();
        seq.current = "";
        setPending(null);
        settle(buf);
        return;
      }

      const partial = accept.find((s) => {
        if (s.length <= buf.length) return false;
        return s.slice(0, buf.length).every((x, i) => x === buf[i]);
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
        {FILE_TASKS.map((t, i) => (
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
            {t.key.replace("<Space>", "S")}
          </button>
        ))}
        <button onClick={reset} className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800">
          重来
        </button>
      </div>

      {/* 规律提示 —— 这页的主角 */}
      <div className="rounded border border-blue-900/60 bg-blue-950/20 p-3 text-xs">
        <div className="text-blue-200">
          规律:<b>小写 = 项目根目录</b>,<b>大写 = 当前目录</b>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-neutral-400">
          {VERBS.filter((v) => FILE_KEYS.some((k) => k.verb === v && k.scope === "root") && FILE_KEYS.some((k) => k.verb === v && k.scope === "cwd")).map((v) => {
            const root = FILE_KEYS.find((k) => k.verb === v && k.scope === "root")!;
            const cwd = FILE_KEYS.find((k) => k.verb === v && k.scope === "cwd")!;
            return (
              <span key={v}>
                <span className="text-neutral-500">{VERB_NAMES[v]}</span>{" "}
                <code className="text-blue-300">{root.key.replace("<Space>", "S")}</code>
                {" / "}
                <code className="text-blue-300">{cwd.key.replace("<Space>", "S")}</code>
              </span>
            );
          })}
        </div>
      </div>

      {/* 题目 */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs">
        <div className="text-neutral-300">
          {VERB_NAMES[target.verb]} · 要开<b>{target.scope ? SCOPE_NAMES[target.scope] : "不分目录的"}</b>那个
        </div>
        <div className="mt-1.5 space-y-1">
          {accept.map((s, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-[10px] text-neutral-700">{i === 0 ? "键位" : "或"}</span>
              {s.map((x, j) => (
                <kbd key={j} className="rounded bg-blue-950 px-1.5 py-0.5 text-blue-200">{x}</kbd>
              ))}
            </div>
          ))}
        </div>
        {target.native && (
          <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
            <span className="w-8 shrink-0 text-neutral-700">原生</span>
            <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{target.native}</code>
            <span className="text-neutral-700">Ex 命令,实测过</span>
          </div>
        )}
        <div className="mt-1 text-[11px] text-neutral-500">{target.desc}</div>
        {pending && <div className="mt-1 text-[11px] text-amber-300">等下一个键… {pending}</div>}
      </div>

      <div className="flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
        {log.length === 0 ? (
          <span className="text-neutral-700">按上面任意一条解法</span>
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

      {/* 全部键位 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">全部键位</div>
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {FILE_KEYS.map((k) => (
            <div key={k.key} className="flex gap-1.5 text-neutral-500">
              <code className="w-16 shrink-0 text-blue-400/80">{k.key.replace("<Space>", "S")}</code>
              <span className="truncate">
                {k.desc}
                {k.scope && (
                  <span className={k.scope === "root" ? "text-neutral-600" : "text-amber-600/70"}>
                    {" "}({SCOPE_NAMES[k.scope]})
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] leading-relaxed text-neutral-700">
        键位实测自 <code>nvim_get_keymap("n")</code>。<b>浮动窗本身没验证过</b> ——
        headless 下 Snacks 弹不出窗,我只能确认键位存在且 desc 如表。
        原生 Ex 逐条 feedkeys 验过;<code>:Ex</code> <code>:tn</code> <code>:tl</code>{" "}
        <code>:files</code> 这些<b>缩写在你机器上不生效</b>(缺 <code>~/.vim/abbr/</code>,
        要 <code>:mkexrc</code> 生成),所以 native 列只给完整写法。
      </div>
    </div>
  );
}