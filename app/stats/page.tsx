"use client";

import { useEffect, useState } from "react";
import StatsView from "@/components/stats-view";
import { splitLhs } from "@/lib/keys";
import { LEVEL_NAMES, RAW } from "@/lib/bindings";
import { load, type Progress } from "@/lib/progress";
import type { Binding } from "@/lib/matcher";

const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) })) as Binding[];

export default function StatsPage() {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    setProgress(load());
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <a href="/" className="text-xs text-neutral-600 hover:text-neutral-400">
        ← 回到训练
      </a>
      <h1 className="mt-3 text-xl font-bold">数据集全貌</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {BINDINGS.length} 条 · 从本机 LazyVim 16.0.1 的 nvim_get_keymap 实测抽取
      </p>
      <div className="mt-6">
        {progress && <StatsView bindings={BINDINGS} levelNames={LEVEL_NAMES} progress={progress} />}
      </div>
    </main>
  );
}
