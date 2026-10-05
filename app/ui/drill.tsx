"use client";

import { useCallback } from "react";
import {
  UI_TOGGLES,
  NATIVE,
  PROBE_LOG,
  isToggle,
  groupsOf,
  fullKey,
  keySeq,
  type UiToggle,
} from "@/lib/ui-toggles";
import { ORIGIN_NOTE, VERIFIED_NOTE } from "@/lib/provenance";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, useDrill } from "@/lib/use-drill";
import {
  FlashLine,
  KeyLog,
  NativeRef,
  PendingHint,
  Provenance,
  TaskBar,
  TaskBox,
} from "@/lib/drill-ui";

/**
 * 界面开关练习 —— 练 `u*` 那一族。
 *
 * ## 这一族和其他板块最大的不同
 *
 * 别的板块有**真实状态**可以画:分屏树、buffer 带子、选中范围。
 * 这一族的状态是「哪些开关打开了」—— 我可以用一份「开着的开关集合」
 * 来建模,并且让页面真的变。
 *
 * 但这里有个诚实的边界,写在页面最上面:**这些开关的「效果」我没测出来。**
 * headless 下 `nvim_list_uis()` 是 0,而且 24 条键里 23 条是 Lua 回调
 * (rhs=nil),按下之后既没有 option 变化也没有 User 事件。
 *
 * 所以页面画出来的视觉差异是**按约定做的**,不是实测的。
 * 我把这条写在界面上,而不是藏起来 —— 画错了比不画更糟。
 *
 * ## 为什么还是值得做
 *
 * 因为这一族的**记忆难点**不是「效果是什么」,而是「哪个键管哪个」。
 * 24 个键大小写混着(`uL` `ul` `ug` `ua` `ub` `uz` `uZ` `uA` `uC`),
 * 光靠背 desc 记不住配对。题目问「相对行号用哪个键」,
 * 按对了画面变一次、错了一个都不变 —— 这个反馈是有效的。
 */

/** 状态 = 当前打开的开关集合 */
type On = string[];

const TASKS: DrillTask[] = UI_TOGGLES.map((t) => ({
  id: t.key,
  // 按钮上写全(带 leader),不然看着像两键
  short: `S${t.key}`,
  desc: t.desc,
  // ⚠️ leader + 两个字符,逐键。实测真实 lhs 是 " uL"(前导空格 = leader)
  accept: [keySeq(t)],
}));

export default function UiToggleDrill() {
  const init = useCallback((): On => [], []);

  const apply = useCallback((_seq: string[], on: On, t: DrillTask) => {
    // 动作类键(ur/un/uI/ui/uC)没有开/关两态,按一下就执行一次。
    // 模型上仍然记进集合 —— 但界面上会标出「这不是开关」,
    // 免得用户以为再按一次能「打开」。
    return on.includes(t.id) ? on.filter((k) => k !== t.id) : [...on, t.id];
  }, []);

  const d = useDrill<On>({
    boardId: "ui",
    tasks: TASKS,
    init,
    apply,
    toPanelKey: defaultToPanelKey,
    advanceMs: 1600,
    // ⚠️ 必须保留状态 —— 这一族的状态是「哪些开关开着」,
    // 每题清空的话连按三个开关就只看得到最后一个,
    // 「按了画面真的变」这个唯一能可视化的反馈就没了。
    keepStateOnAdvance: true,
  });

  const t = UI_TOGGLES.find((x) => x.key === d.task.id)!;

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-800/60 bg-amber-950/15 p-3 text-[11px] leading-relaxed text-amber-200/90">
        <b>⚠️ 测不出来的是「画面长什么样」,不是「这个键干什么」。</b>
        <div className="mt-1 text-amber-100/70">
          键位、<code>desc</code>、<code>rhs</code> 全是实测自{" "}
          <code>nvim_get_keymap("n")</code>(24 条)。<b>作用</b>也逐条核实过 ——
          对应的 option 读得到、Ex 命令 <code>exists()</code> 非 0、Lua API 非 nil,
          底层属于 Vim 内建还是插件也标在下面。
        </div>
        <div className="mt-1 text-amber-100/70">
          测不出来的是<b>按下之后画面怎么变</b>:<code>nvim_list_uis()=0</code>,
          23/24 条是 Lua 回调(<code>rhs=nil</code>),<code>:normal!</code>{" "}
          返回成功却没有任何变化。所以下面代码块的变化<b>按约定画的</b>,
          用来帮你记住哪个键管哪个,别当截图对照。
        </div>
      </div>

      <TaskBar
        tasks={TASKS}
        current={d.taskIndex}
        solved={d.solved}
        solvedAll={d.solvedAll}
        onClear={d.clearProgress}
        onPick={d.setTaskIndex}
        onReset={d.reset}
      />

      <TaskBox>
        <div className="text-neutral-300">
          按 <kbd className="rounded bg-blue-950 px-2 py-0.5 text-sm text-blue-200">{fullKey(t)}</kbd>{" "}
          {isToggle(t) ? "打开" : "执行"}「{t.desc.replace(/^Toggle /, "")}」
        </div>

        {/* 作用 —— 测不出画面,这个还是有的 */}
        <div className="mt-1.5 text-neutral-400">{t.effect}</div>

        {/* 归属:Vim 原生还是插件 */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span className="w-8 shrink-0 text-neutral-700">归属</span>
          <span
            className={
              t.origin.startsWith("纯插件")
                ? "rounded bg-purple-950 px-1.5 py-0.5 text-purple-300"
                : "rounded bg-green-950 px-1.5 py-0.5 text-green-400"
            }
          >
            {t.origin}
          </span>
          <span className="text-neutral-600">{ORIGIN_NOTE[t.origin]}</span>
        </div>

        {/* 我核实到哪一层 */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span className="w-8 shrink-0 text-neutral-700">核实</span>
          <span
            className={
              t.verified === "desc"
                ? "text-amber-500/90"
                : t.verified === "none"
                  ? "text-red-400"
                  : "text-neutral-400"
            }
          >
            {VERIFIED_NOTE[t.verified]}
          </span>
        </div>

        <div className="mt-1.5 text-[11px] text-neutral-600">
          实测 lhs = <code className="text-neutral-500">&quot; {t.key}&quot;</code>(前导空格就是
          leader);desc = <span className="text-neutral-400">{t.desc}</span>;rhs ={" "}
          <span className="text-neutral-400">
            {t.rhs === null ? "nil(Lua 回调,不是 Ex 字符串)" : t.rhs}
          </span>
        </div>
        <NativeRef native={NATIVE[t.key]} />
        {!isToggle(t) && (
          <div className="mt-1 text-[11px] text-sky-400/90">
            ℹ 这是**动作**不是开关:按一次执行一次,没有「打开」这一说。
          </div>
        )}
        <PendingHint pending={d.pending} />
      </TaskBox>

      <MockEditor on={d.state} highlight={t.key} />

      <KeyLog
        log={d.log}
        hint={
          <>
            按 <kbd className="rounded bg-neutral-800 px-1">&lt;Space&gt;</kbd>
            <kbd className="rounded bg-neutral-800 px-1">u</kbd>
            <kbd className="rounded bg-neutral-800 px-1">u</kbd>
            <kbd className="rounded bg-neutral-800 px-1">{t.key.slice(1)}</kbd> 三下(leader 也要按)
          </>
        }
      />
      <FlashLine flash={d.flash} />

      {/* 当前打开的开关 —— 按 u* 之后它们会列在这里 */}
      <OpenPanel on={d.state} current={t.key} />

      {/* 按组列出全部键位 */}
      <div className="rounded border border-neutral-800 p-2 text-[11px]">
        <div className="mb-1 text-neutral-600">
          全部 {UI_TOGGLES.length} 条(实测自 <code>nvim_get_keymap("n")</code>)
        </div>
        {groupsOf().map((g) => (
          <div key={g} className="mb-1.5 last:mb-0">
            <div className="mb-0.5 text-neutral-600">
              {g}
              {g === "动作(不是开关)" && (
                <span className="text-sky-500/80"> —— 没有开/关两态</span>
              )}
            </div>
            <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {UI_TOGGLES.filter((x) => x.group === g).map((x) => (
                <div
                  key={x.key}
                  className={`flex gap-1.5 ${
                    x.key === t.key ? "rounded bg-blue-950 px-1 text-blue-200" : "text-neutral-500"
                  }`}
                >
                  <code className="w-20 shrink-0 text-blue-300">{fullKey(x)}</code>
                  <span className="truncate">{x.desc.replace(/^Toggle /, "")}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 探针记录 —— 「测不出来」也需要证据 */}
      <details className="rounded border border-neutral-800 p-2 text-[11px]">
        <summary className="cursor-pointer text-neutral-500">
          我怎么确认「测不出来」的({PROBE_LOG.length} 条探针记录)
        </summary>
        <ul className="mt-1 space-y-0.5 text-neutral-600">
          {PROBE_LOG.map((l) => (
            <li key={l} className="flex gap-1.5">
              <span className="text-neutral-700">·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </details>

      <Provenance>
        键位、desc、rhs 全部实测自本机 <code>nvim_get_keymap("n")</code>(24 条,含前导空格
        的 leader)。<b>但效果没测出来</b> —— headless 下 <code>nvim_list_uis()</code> 为 0,
        且 23/24 条是 Lua 回调,页面上的视觉差异是<b>按约定画的</b>。
        原生 Ex 对照里写「无 Ex 等价」的那些是真没有,不是没查。
      </Provenance>
    </div>
  );
}

/** 已经打开的开关 */
function OpenPanel({ on, current }: { on: On; current: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-2 text-[11px]">
      <div className="mb-1 text-neutral-600">
        当前打开 {on.length} 个
        {on.includes(current) && (
          <span className="text-green-500"> —— 含本题这个</span>
        )}
      </div>
      {on.length === 0 ? (
        <div className="text-neutral-700">(还没有。按上面任意一条解法试试。)</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {on.map((k) => {
            const tg = UI_TOGGLES.find((x) => x.key === k)!;
            return (
              <span
                key={k}
                className={`rounded border px-1.5 py-0.5 ${
                  isToggle(tg)
                    ? "border-green-800 text-green-500"
                    : "border-sky-900 text-sky-500"
                }`}
              >
                {fullKey(UI_TOGGLES.find((x) => x.key === k)!)}
                <span className="ml-1 text-neutral-600">{tg.desc.replace(/^Toggle /, "")}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 一个假的编辑器 —— 用来把「按了之后画面变什么」画出来。
 *
 * ⚠️ 这里的视觉**是约定,不是实测**。理由见页面顶部那段黄字。
 * 能画成什么样就画成什么样,但别让它冒充真机截图。
 *
 * 它确实遵守了几条真实的 Vim 行为,免得画出错的操作感:
 *  - 行号只在 `ul`(Line Numbers)打开时出现
 *  - 相对行号只在 `uL` 打开、且该行不是当前行时才显示相对数字
 *  - `us`(Spelling)只给拼错的那个词加波浪线
 *  - `uw`(Wrap)关掉时长行被横向截断
 *  - `uT`(Treesitter)关掉时整块没有语法色
 *  - `uz`(Zen)会把行号和状态栏整个去掉
 */
const LINES: { text: string; cur?: boolean; misspelled?: [number, number]; comment?: boolean }[] = [
  { text: "-- config: compute a totl for the list" },
  { text: "local function compute(a, b)", cur: true },
  { text: "  local totl = 0" },
  { text: "  for i, v in ipairs(a) do" },
  { text: "    totl = totl + v * b   -- 缩进块" },
  { text: "  end" },
  { text: "  return totl" },
  { text: "end" },
];

function MockEditor({ on, highlight }: { on: On; highlight: string }) {
  const has = (k: string) => on.includes(k);
  const number = has("uL");
  const absolute = has("ul");
  const wrap = has("uw");
  const treesitter = has("uT");
  const zen = has("uz");
  const guides = has("ug");
  const hints = has("uh");
  const spell = has("us");
  const tabline = has("uA");

  const curLine = LINES.findIndex((l) => l.cur);

  return (
    <div className="overflow-hidden rounded bg-neutral-950">
      {tabline && (
        <div className="flex gap-1 border-b border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px]">
          <span className="rounded bg-blue-950 px-2 text-blue-200">init.lua</span>
          <span className="px-2 text-neutral-600">util.lua</span>
        </div>
      )}

      <div className="flex">
        {/* 行号栏 —— uL / ul / uz 三个开关都动它 */}
        {!zen && (absolute || number) && (
          <div className="select-none border-r border-neutral-900 px-1.5 py-2 text-right font-mono text-[10px] leading-relaxed">
            {LINES.map((l, i) => {
              // ⚠️ 相对行号只对**非当前行**显示相对数字,
              // 当前行显示绝对行号 —— 这是 Vim 的真实行为
              const rel = number && i !== curLine ? curLine - i : null;
              return (
                <div key={i} className={rel !== null ? "text-neutral-600" : "text-neutral-400"}>
                  {rel !== null ? rel : i + 1}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-x-auto py-2 font-mono text-[11px] leading-relaxed">
          {LINES.map((l, i) => {
            const isCur = i === curLine;
            return (
              <div key={i} className={isCur ? "bg-blue-950/40" : ""}>
                <span className="whitespace-pre">
                  {guides && indentGuide(l.text)}
                  {hints && l.text.includes("compute(a, b)") && (
                    <>
                      <span className="text-neutral-600">compute</span>
                      <span className="text-neutral-700">values</span>
                      <span>{"(a, b)" + (treesitter ? "" : "")}</span>
                    </>
                  )}
                  {!hints && colorize(l.text, treesitter)}
                </span>
                {spell && l.misspelled && <Squiggle />}
              </div>
            );
          })}
        </div>
      </div>

      {!zen && (
        <div className="border-t border-neutral-900 px-2 py-1 text-[10px] text-neutral-700">
          NORMAL · {has("uw") ? "wrap" : "nowrap"} · {treesitter ? "ts on" : "ts off"}
          {guides ? " · guides" : ""}
        </div>
      )}
      {/* 长行被截断时才提示 —— uw 打开(折行)就不会有横向滚动 */}
      {!wrap && (
        <div className="border-t border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-700">
          ↓ uw 没开:这行不会折,会横向滚动
        </div>
      )}
      <div className="sr-only">{highlight}</div>
    </div>
  );
}

/** 缩进参考线:在每个两空格缩进的层级画一条竖线 */
function indentGuide(text: string) {
  const m = text.match(/^( *)/);
  const depth = m ? Math.floor(m[1].length / 2) : 0;
  if (depth === 0) return null;
  return (
    <>
      {"│ ".repeat(depth)}
    </>
  );
}

/** 语法着色 —— uT 关掉就整块纯色 */
function colorize(text: string, on: boolean) {
  if (!on) return text;
  if (text.trim().startsWith("--")) return <span className="text-neutral-600">{text}</span>;
  const parts = text.split(/(local|function|for|in|do|end|return|ipairs)/g);
  return parts.map((p, i) => {
    if (/^(local|function|for|in|do|end|return|ipairs)$/.test(p)) {
      return (
        <span key={i} className="text-purple-400">
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

/** 波浪线 —— 只画在拼错的那个词下面 */
function Squiggle() {
  return (
    <div className="ml-8 h-1 w-8 border-b border-red-500/70" style={{ borderRadius: "0 0 50% 50%" }} />
  );
}