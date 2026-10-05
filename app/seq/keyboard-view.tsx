"use client";

/**
 * 键盘图 —— 把 Vim 记号画成键盘上的**位置**。
 *
 * ## 为什么要画
 *
 * 盲背练的是「看到描述 → 按出序列」。光看文字记不住的是位置:
 * `<Space>uL` 三个键分别在键盘哪儿、手指怎么走过去。
 * qwerty 练习器就是这个思路 —— 把「记忆」变成「空间定位」。
 *
 * ## 高亮怎么走
 *
 * 逐键前进:当前该按的那块亮 → 按对了推进到下一块。
 * 这样练的是**顺序 + 位置**,不只是「记起三个键」。
 */

import { useEffect, useState } from "react";
import {
  KEY_ROWS,
  OFF_BOARD,
  ROW_ARROWS,
  resolve,
  rowWidth,
  U,
  type KeyDef,
  type Mod,
} from "@/lib/keyboard";

const MOD_NAME: Record<Mod, string> = { C: "Ctrl", M: "Alt", S: "Shift" };

/**
 * React key 用「行号 + 列号」,不能只用 id。
 *
 * ⚠️ 底排的 Ctrl / Alt / Meta 左右各有一块,Shift 键帽上也有两块 ——
 *   这在真键盘上是对的(左手 Ctrl、右手 Alt)。
 *   但我第一版用 `key={def.id + def.cap}`,于是 `<C-Ctrl>Ctrl` 出现两次,
 *   React 直接报 duplicate key(实测刷了 182 条错误)。
 *
 *   id 只用来判断「该不该高亮」,不用来做 React key。
 */
function keyOf(rowIdx: number, colIdx: number): string {
  return `k${rowIdx}-${colIdx}`;
}

/** 把一个键的 id 列表(可能重复,比如 Shift 左右都有)映射到每块键 */
function highlightFor(tokens: string[], at: number): { mods: Set<Mod>; keyIds: Set<string> } {
  const mods = new Set<Mod>();
  const keyIds = new Set<string>();
  if (at < 0 || at >= tokens.length) return { mods, keyIds };
  const r = resolve(tokens[at]);
  keyIds.add(r.keyId);
  for (const m of r.mods) mods.add(m);
  return { mods, keyIds };
}

export default function KeyboardView({
  /** 逐键记号,如 ["<Space>", "u", "L"] */
  tokens,
  /** 高亮到第几键;-1 = 不高亮 */
  at,
  /** 已按下的键数(画成绿色) */
  done,
}: {
  tokens: string[];
  at: number;
  done?: number;
}) {
  const { mods, keyIds } = highlightFor(tokens, at);
  const doneIds = new Set<string>();
  const doneMods = new Set<Mod>();
  for (let i = 0; i < Math.min(done ?? 0, tokens.length); i++) {
    const r = resolve(tokens[i]);
    doneIds.add(r.keyId);
    for (const m of r.mods) doneMods.add(m);
  }

  const render = (def: KeyDef, rkey: string) => {
    const isNow = keyIds.has(def.id);
    const isDone = !isNow && doneIds.has(def.id);
    return (
      <div
        key={rkey}
        className={`flex shrink-0 items-center justify-center rounded border text-center font-mono text-[10px] leading-none transition-colors ${
          isNow
            ? "border-blue-400 bg-blue-500/40 text-blue-50 shadow-[0_0_0_1px] shadow-blue-400"
            : isDone
              ? "border-green-900 bg-green-950/60 text-green-400"
              : "border-neutral-800 bg-neutral-900/70 text-neutral-600"
        }`}
        style={{
          width: `${((def.w ?? 1) / U) * 100}%`,
          height: "26px",
        }}
      >
        {/*
          ⚠️ 空格键的 cap 是空字符串,直接渲染就是个空白块 ——
          高亮它的时候用户根本看不出亮的是哪。给个 `␣` 占位。
          (之前 <Space>gp 那题高亮出来是个空框,就是这里。)
        */}
        {def.cap || (def.id === "<Space>" ? "␣" : def.id)}
      </div>
    );
  };

  return (
    <div className="space-y-1 select-none">
      {/* 要按住哪个修饰键 —— 在键盘上方明确写出来 */}
      <div className="flex min-h-4 flex-wrap items-center gap-1.5 text-[10px]">
        {mods.size > 0 ? (
          <>
            <span className="text-neutral-600">按住</span>
            {[...mods].map((m) => (
              <kbd
                key={m}
                className="rounded bg-purple-950 px-1.5 py-0.5 font-bold text-purple-300"
              >
                {MOD_NAME[m]}
              </kbd>
            ))}
          </>
        ) : (
          <span className="text-neutral-700">不需要修饰键</span>
        )}
      </div>

      {/* 不在主区块上的键 */}
      <div className="flex gap-1">
        {OFF_BOARD.map((d, i) => render(d, keyOf(-1, i)))}
        <div className="text-[10px] leading-[26px] text-neutral-700">
          ↑ 这些在键盘主区块外
        </div>
      </div>

      {/* 键盘主体 */}
      {KEY_ROWS.map((row, ri) => (
        <div key={keyOf(ri, -1)} className="flex gap-[2px]">
          {row.map((d, ci) => render(d, keyOf(ri, ci)))}
        </div>
      ))}

      {/* 方向键簇,右对齐 */}
      <div
        className="flex gap-[2px]"
        style={{ paddingLeft: `${((U - rowWidth(ROW_ARROWS)) / U) * 100}%` }}
      >
        {ROW_ARROWS.map((d, i) => render(d, keyOf(99, i)))}
      </div>
    </div>
  );
}

/**
 * 自动逐键高亮 —— 答完之后演示一遍「手指怎么走过去」。
 *
 * ⚠️ 按 qwerty 练习器的习惯:每个键停一下再进下一个,
 *   让人看清顺序。间隔不能太短,否则等于没停留。
 */
export function useAutoAdvance(tokens: string[], run: boolean, stepMs = 520): number {
  const [at, setAt] = useState(-1);
  useEffect(() => {
    if (!run || tokens.length === 0) {
      setAt(-1);
      return;
    }
    setAt(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < tokens.length; i++) {
      timers.push(setTimeout(() => setAt(i), i * stepMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [tokens, run, stepMs]);
  return at;
}