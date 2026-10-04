import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 练习页的公共外壳。
 *
 * ## 为什么要抽出来
 *
 * root layout 只有 `<body>`,没有容器,所以每个页面都得自己写
 * `mx-auto max-w-2xl px-5 py-8 font-mono`。
 * 之前 /windows 各写各的还好,新加 /buffers 和 /tabs 时忘了写,
 * 结果内容顶到左边缘、铺满全宽 —— 截图一眼就看出来了。
 *
 * 抽出来之后:外壳只有这一份,再加页面不会再漏。
 */
export default function DrillShell({
  title,
  children,
  intro,
}: {
  title: string;
  children: ReactNode;
  /** 标题下面那段说明(按键提示之类) */
  intro?: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <Link href="/" className="text-xs text-neutral-600 hover:text-neutral-400">
        ← 回到训练
      </Link>
      <h1 className="mt-3 text-xl font-bold">{title}</h1>
      {intro && <p className="mt-2 text-xs text-neutral-500">{intro}</p>}
      <div className="mt-5">{children}</div>
    </main>
  );
}