"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LayoutView from "@/components/layout-view";
import KeymapView from "@/components/keymap-view";
import StatsView, { type StatsSection } from "@/components/stats-view";
import { splitLhs } from "@/lib/keys";
import { LEVEL_NAMES, RAW } from "@/lib/bindings";
import { load, type Progress } from "@/lib/progress";
import type { Binding } from "@/lib/matcher";
import type { Layout } from "@/lib/layout";

const BINDINGS = RAW.map((r) => ({ ...r, keys: splitLhs(r.display) })) as Binding[];

const TABS = [
  { id: "live", label: "我的 nvim" },
  { id: "keys", label: "键位位置" },
  { id: "levels", label: "关卡分布" },
  { id: "modes", label: "模式" },
  { id: "tree", label: "leader 子树" },
  { id: "length", label: "按键长度" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function StatsPage() {
  const [tab, setTab] = useState<TabId>("live");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [err, setErr] = useState("");
  const [path, setPath] = useState("");

  useEffect(() => setProgress(load()), []);

  const loadLayout = useCallback(async () => {
    try {
      const r = await fetch(`/api/layout?t=${Date.now()}`);
      const j = await r.json();
      if (j.layout) {
        setLayout(j.layout);
        setPath(j.file ?? "");
        setErr("");
      } else {
        setLayout(null);
        setErr(j.error ?? "未知错误");
        setPath(j.path ?? "");
      }
    } catch (e) {
      setLayout(null);
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    if (tab !== "live") return;
    loadLayout();
    const t = setInterval(loadLayout, 2000);
    return () => clearInterval(t);
  }, [tab, loadLayout]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <Link href="/" className="text-xs text-neutral-600 hover:text-neutral-400">
        ← 回到训练
      </Link>
      <h1 className="mt-3 text-xl font-bold">数据集全貌</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {BINDINGS.length} 条 · 从本机 LazyVim 16.0.1 的 nvim_get_keymap 实测抽取
      </p>

      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs ${
              tab === t.id
                ? "border-blue-400 text-blue-300"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "live" && <LivePanel layout={layout} err={err} path={path} />}
        {tab === "keys" && <KeymapView bindings={BINDINGS} />}
        {progress && tab !== "live" && tab !== "keys" && (
          <StatsView
            bindings={BINDINGS}
            levelNames={LEVEL_NAMES}
            progress={progress}
            only={[tab as StatsSection]}
          />
        )}
      </div>
    </main>
  );
}

function LivePanel({ layout, err, path }: { layout: Layout | null; err: string; path: string }) {
  if (!layout) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-amber-400">○ 没读到 nvim 的数据</p>
        {err && <p className="text-[11px] text-neutral-600">{err}</p>}
        <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-[11px] text-neutral-400">
          <p className="mb-2 text-neutral-300">接上的方法:在 nvim 配置里加一行</p>
          <pre className="overflow-x-auto rounded bg-neutral-950 p-2 text-neutral-300">
            {`# ~/.config/nvim/lua/plugins/reflex-layout.lua
return { "${process.env.NEXT_PUBLIC_REFLEX_DIR ?? "~/workspace/reflex"}/scripts/reflex-layout-plugin.lua" }`}
          </pre>
          <p className="mt-2 text-neutral-500">
            重启 nvim,随便切几个窗口,回来看这里。它只读 —— 不接管任何键位,
            删掉那行就彻底断开。
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-green-400">● 你的 nvim 真实布局(每 2 秒刷新)</p>
      <LayoutView layout={layout} />
      <p className="text-[10px] text-neutral-700">来源:{path}</p>
    </div>
  );
}
