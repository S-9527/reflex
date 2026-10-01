"use client";

import WindowsDrill from "./drill";

/**
 * 窗口方向键练习。
 *
 * 按 <C-H/J/K/L>(或方向键 / hjkl),页面上的窗口格子焦点跟着跳。
 * 练的是「方向感」和「我现在在哪个窗口」,不是记键位表。
 */
export default function WindowsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <a href="/" className="text-xs text-neutral-600 hover:text-neutral-400">
        ← 回到训练
      </a>
      <h1 className="mt-3 text-xl font-bold">窗口练习</h1>
      <p className="mt-1 text-xs text-neutral-500">
        按 <kbd>&lt;C-H&gt;</kbd> <kbd>&lt;C-J&gt;</kbd> <kbd>&lt;C-K&gt;</kbd> <kbd>&lt;C-L&gt;</kbd> 让焦点在窗口间跳
        (方向键和 hjkl 也行)
      </p>
      <div className="mt-5">
        <WindowsDrill />
      </div>
    </main>
  );
}
