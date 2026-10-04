"use client";

import { useCallback } from "react";
import {
  FILE_KEYS,
  FILE_TASKS,
  VERBS,
  VERB_NAMES,
  SCOPE_NAMES,
  findFileKey,
  type FileKey,
} from "@/lib/files";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, useDrill } from "@/lib/use-drill";
import {
  AcceptList,
  FlashLine,
  KeyLog,
  NativeRef,
  PendingHint,
  Provenance,
  TaskBar,
  TaskBox,
} from "@/lib/drill-ui";

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
 *
 * ## ⚠️ <C-/> 的特殊处理
 *
 * `<Space>ft` 有个同义键 `<C-/>`(root 侧是终端)。但它带 Ctrl,
 * 而引擎的 toPanelKey 收不了 Ctrl —— 所以这里单独把 Ctrl+`/` 翻译成
 * `<C-/>`,其余带 Ctrl 的键照旧返回 null 放行(不劫持 Ctrl+R / F12)。
 */
const TASKS: DrillTask[] = FILE_TASKS.map((t, i) => ({
  id: `${t.key}#${i}`,
  short: t.key,
  desc: "",
  accept: findFileKey(t.key)?.seqs ?? [],
}));
const KEY_OF = new Map<string, FileKey | undefined>(
  FILE_TASKS.map((t, i) => [`${t.key}#${i}`, findFileKey(t.key)]),
);

/** 按钮上把 <Space> 缩成 S,一格显示得下 */
const label = (t: DrillTask) => t.short.replace("<Space>", "S");

/** ⚠️ <C-/> 是这一族唯一的 Ctrl 系解法,必须单独放行 */
function toPanelKey(e: KeyboardEvent): string | null {
  // Vim 记法 <C-/> 的浏览器 event.key 是 "/" 且 ctrlKey 为真。
  // 不在这里拦,它会被 defaultToPanelKey 之后的「其余 Ctrl 放行」挡掉。
  if (e.ctrlKey && e.key === "/") return "<C-/>";
  if (e.ctrlKey) return null;
  return defaultToPanelKey(e);
}

export default function FileDrill() {
  /**
   * 这一族 apply 永远是「状态不变」—— 弹窗没有可持久渲染的状态,
   * 所以状态本身是 null。
   *
   * ⚠️ 所以这里**不能**用 `return null` 表示失败:引擎分不清
   * 「失败」和「状态就是 null」,会把按对的键误报成
   * 「按了但状态没变」。返回 NO_EFFECT 才是失败,而这一族永不失败。
   */
  const apply = useCallback((_seq: string[], s: null) => s, []);

  const d = useDrill<null>({
    boardId: "files",
    tasks: TASKS,
    init: () => null,
    apply,
    toPanelKey,
    advanceMs: 1500,
  });

  const target = KEY_OF.get(d.task.id)!;

  return (
    <div className="space-y-4">
      <TaskBar
        tasks={TASKS}
        current={d.taskIndex}
        solved={d.solved}
        onPick={d.setTaskIndex}
        onReset={d.reset}
        labelOf={label}
      />

      {/* 规律提示 —— 这页的主角 */}
      <div className="rounded border border-blue-900/60 bg-blue-950/20 p-3 text-xs">
        <div className="text-blue-200">
          规律:<b>小写 = 项目根目录</b>,<b>大写 = 当前目录</b>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-neutral-400">
          {VERBS.filter(
            (v) =>
              FILE_KEYS.some((k) => k.verb === v && k.scope === "root") &&
              FILE_KEYS.some((k) => k.verb === v && k.scope === "cwd"),
          ).map((v) => {
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
      <TaskBox>
        <div className="text-neutral-300">
          {VERB_NAMES[target.verb]} · 要开<b>{target.scope ? SCOPE_NAMES[target.scope] : "不分目录的"}</b>那个
        </div>
        <AcceptList task={d.task} />
        <NativeRef native={target.native} note={target.desc} noteClass="text-neutral-500" />
        <PendingHint pending={d.pending} />
      </TaskBox>

      <KeyLog log={d.log} hint="按上面任意一条解法" />
      <FlashLine flash={d.flash} />

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

      <Provenance>
        键位实测自 <code>nvim_get_keymap("n")</code>。<b>浮动窗本身没验证过</b> ——
        headless 下 Snacks 弹不出窗,我只能确认键位存在且 desc 如表。
        原生 Ex 逐条 feedkeys 验过;<code>:Ex</code> <code>:tn</code> <code>:tl</code>{" "}
        <code>:files</code> 这些<b>缩写在你机器上不生效</b>(缺 <code>~/.vim/abbr/</code>,
        要 <code>:mkexrc</code> 生成),所以 native 列只给完整写法。
      </Provenance>
    </div>
  );
}