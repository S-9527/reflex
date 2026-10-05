"use client";

import { useState } from "react";
import DrillShell from "@/app/drill-shell";
import JumpDrill from "./jump";
import BuildDrill from "./build";
import HydraDrill from "./hydra";

/**
 * 窗口练习 —— 两个模式。
 *
 * 跳转:在**已有**布局里用 <C-H/J/K/L> 移动焦点。布局写死,练方向感。
 * 搭建:用 <Space>| / <Space>- / <Space>wd 把**目标**布局拼出来。练手感。
 *
 * 分开是因为判分方式完全不同:跳转看「焦点落在哪」,
 * 搭建看「最终形状对不对」。混在一起会互相干扰。
 */
type Mode = "jump" | "build" | "hydra";

export default function WindowsPage() {
  const [mode, setMode] = useState<Mode>("jump");

  return (
    <DrillShell title="窗口练习">
      <div className="flex gap-1.5">
        {(
          [
            ["jump", "跳转", "在已有布局里跳来跳去"],
            ["build", "搭建", "把目标布局拼出来"],
            ["hydra", "键位", "照 which-key 面板练单个键"],
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
            <span className="text-neutral-600">(本机没有裸 hjkl 的映射,不收)</span>
          </>
        ) : mode === "build" ? (
          <>
            用 <kbd>&lt;Space&gt;|</kbd> 竖切、<kbd>&lt;Space&gt;-</kbd> 横切、
            <kbd>&lt;C-H/J/K/L&gt;</kbd> 跳窗口,拼出目标布局
          </>
        ) : (
          <>
            按 <kbd>&lt;Space&gt;</kbd>
            <kbd>w</kbd>
            <kbd>面板上的键</kbd> 三键连着按 —— 只练 LazyVim 这一套。
            每题下面会标出本机实测存在的<b>更省事的等价键</b>和原生写法
          </>
        )}
      </p>

      <div className="mt-4">
        {mode === "jump" ? <JumpDrill /> : mode === "build" ? <BuildDrill /> : <HydraDrill />}
      </div>
    </DrillShell>
  );
}
