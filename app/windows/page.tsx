"use client";

import { useState } from "react";
import Link from "next/link";
import WindowsDrill from "./drill";
import SplitDrill from "./split";

/**
 * 窗口练习 —— 两个模式。
 *
 * 跳转:在**已有**布局里用 <C-H/J/K/L> 移动焦点。布局写死,练方向感。
 * 搭建:用 <Space>| / <Space>- / <Space>wd 把**目标**布局拼出来。练手感。
 *
 * 分开是因为判分方式完全不同:跳转看「焦点落在哪」,
 * 搭建看「最终形状对不对」。混在一起会互相干扰。
 */
type Mode = "jump" | "build";

export default function WindowsPage() {
  const [mode, setMode] = useState<Mode>("jump");

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <Link href="/" className="text-xs text-neutral-600 hover:text-neutral-400">
        ← 回到训练
      </Link>
      <h1 className="mt-3 text-xl font-bold">窗口练习</h1>

      <div className="mt-4 flex gap-1.5">
        {(
          [
            ["jump", "跳转", "在已有布局里跳来跳去"],
            ["build", "搭建", "把目标布局拼出来"],
          ] as const
        ).map(([id, label, desc]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`rounded border px-3 py-1.5 text-xs ${
              mode === id
                ? "border-blue-400 bg-blue-400 text-black"
                : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            }`}
            title={desc}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {mode === "jump" ? (
          <>
            按 <kbd>&lt;C-H&gt;</kbd> <kbd>&lt;C-J&gt;</kbd> <kbd>&lt;C-K&gt;</kbd> <kbd>&lt;C-L&gt;</kbd>{" "}
            让焦点在窗口间跳
            <span className="text-neutral-600">
              (本机没有裸 hjkl 的映射,不收)
            </span>
          </>
        ) : (
          <>
            用 <kbd>&lt;Space&gt;|</kbd> 竖切、<kbd>&lt;Space&gt;-</kbd> 横切、<kbd>&lt;C-H/J/K/L&gt;</kbd>{" "}
            跳窗口,拼出目标布局
          </>
        )}
      </p>

      <div className="mt-5">{mode === "jump" ? <WindowsDrill /> : <SplitDrill />}</div>
    </main>
  );
}
