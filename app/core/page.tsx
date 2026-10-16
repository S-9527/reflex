"use client";

/**
 * Vim 内建操作练习 —— 补上数据集**结构性缺失**的那一大块。
 *
 * ## 为什么需要这一页（这是这个项目最大的一个洞）
 *
 * 数据集全部来自 `nvim_get_keymap`，而它**只返回用户/插件映射** ——
 * Vim 内建命令一条都不在里面。本机实测：
 *
 *     u      n: （没有映射）
 *     dd     n: （没有映射）
 *     p      n: （没有映射）
 *
 * 所以 `u` `p` `dd` `f` `m` `q` `w` `b` `gg` 这些**从抽取阶段就不存在**。
 * 原来的「覆盖率审计」（tests/coverage.test.ts）口径是「数据集内的键
 * 有没有练不到」—— 它是自洽的，但前提「数据集 = 全部要练的东西」不成立。
 *
 * 这一页补的就是那 101 条。
 *
 * ## 数据从哪来：破坏性实测，不是查文档
 *
 * 和 `/text` 一样：造已知内容 → 落到指定位置 → `:normal! {键}` →
 * 记录 buffer 和光标的 diff。探针在 `scripts/probe-core.lua`，
 * 原始结果在 `data/probe-core.json`，每条题目的 `measured` 都是原样引用。
 *
 * 所以这一页能画出**真实的 diff** —— 按下去哪几个字符会消失/出现，
 * 光标会落到哪一格。这是背键位表和看视频都给不了的东西。
 *
 * ## ⚠️ 实测踩过的四个探针 bug（都写在脚本注释里）
 *
 * 1. 宏必须用 `feedkeys(..., "t")`，`:normal!` **录不进寄存器**（还不报错）
 * 2. 寄存器是全局的，跨探针泄漏 —— 每次必须先清
 * 3. `guu` 要挑含大写的行测，否则「无变化」会被误读成「不生效」
 * 4. `;` / `,` 要求样本里有**两个**可查找字符，否则测出假的「光标不动」
 *
 * 「测不出来就说测不出来」是这个项目的底线 —— 折叠（`za`/`zR`/`zM`）和
 * `gx` 在 headless 下测不出效果，所以**不出题**，在页面底部列出并说明。
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CORE_CATEGORIES,
  CORE_ITEMS,
  CORE_SKIPPED,
  CORE_TASKS,
  type CoreItem,
} from "@/lib/core-vim";
import { diffLines, hasChange } from "@/lib/diff";
import { translate } from "@/lib/i18n";
import { formatMs } from "@/lib/session";
import type { DrillTask } from "@/lib/drill";
import { defaultToPanelKey, useDrill } from "@/lib/use-drill";
import {
  DrillFlow,
  FlashLine,
  KeyLog,
  KeySequence,
  PendingHint,
  Provenance,
  TaskBox,
  streakOf,
} from "@/lib/drill-ui";

/**
 * 题库 —— 直接用 `lib/core-vim.ts` 的 `CORE_TASKS`。
 *
 * ⚠️ 不在这里重新 map 一遍：首页分母读的也是 `CORE_TASKS.length`，
 *    两处各写一份就又会「分母和实际题数对不上」（这个项目踩过四次）。
 *    这里只把 `desc` 过一层 i18n。
 */
const TASKS: DrillTask[] = CORE_TASKS.map((t) => ({
  id: t.id,
  short: t.key,
  desc: translate(t.key, "n", t.desc),
  accept: t.accept,
}));

const ITEM_BY_ID = new Map<string, CoreItem>(
  CORE_TASKS.map((t, i) => [t.id, CORE_ITEMS[i]]),
);

export default function CorePage() {
  const router = useRouter();

  /** 当前分类（`all` = 全部） */
  const [cat, setCat] = useState<string>("all");

  /** 当前分类下的题目 —— 引擎用 */
  const tasks = useMemo(
    () => (cat === "all" ? TASKS : TASKS.filter((t) => ITEM_BY_ID.get(t.id)!.category === cat)),
    [cat],
  );

  const d = useDrill<null>({
    boardId: "core",
    tasks,
    init: () => null,
    // 这一页没有可变状态 —— 练的是「按哪几个键」，按完就翻页。
    apply: (_seq, s) => s,
    toPanelKey: defaultToPanelKey,
  });

  const item = ITEM_BY_ID.get(d.task.id) ?? CORE_ITEMS[0];

  /** 切换分类 —— 重开一轮，只练这一组 */
  const pickCat = useCallback(
    (c: string) => {
      setCat(c);
      const ids = (c === "all" ? TASKS : TASKS.filter((t) => ITEM_BY_ID.get(t.id)!.category === c)).map(
        (t) => t.id,
      );
      d.restart(ids);
    },
    [d],
  );

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 font-mono">
      <h1 className="text-xl font-bold">
        <button onClick={() => router.push("/")} className="hover:text-blue-400">
          ← reflex
        </button>
      </h1>
      <p className="mt-1 text-xs text-neutral-500">
        Vim 内建操作 · 数据集里<b className="text-amber-400">没有</b>的那一批（
        {CORE_ITEMS.length} 条）· 全部来自本机 nvim 破坏性实测
      </p>

      {/* 分类 —— 按操作性质，不是 which-key（内建命令本来就不在 which-key 里） */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {CORE_CATEGORIES.map((c) => (
          <CatBtn key={c} active={cat === c} onClick={() => pickCat(c)}>
            {c}
            <span className="ml-1.5 text-neutral-600">
              {CORE_ITEMS.filter((i) => i.category === c).length}
            </span>
          </CatBtn>
        ))}
        <CatBtn active={cat === "all"} onClick={() => pickCat("all")}>
          全部
          <span className="ml-1.5 text-neutral-600">{CORE_ITEMS.length}</span>
        </CatBtn>
      </div>

      <div className="mt-4">
        <DrillFlow
          cursor={d.taskIndex}
          total={d.session.queue.length}
          accuracy={d.summary.accuracy}
          keysPerMin={d.summary.keysPerMin}
          streak={streakOf(d.session.results)}
          done={d.done}
          summary={d.summary}
          formatMs={formatMs}
          descOf={(id) => ITEM_BY_ID.get(id)?.desc ?? id}
          onRetry={() => d.restart()}
          onRetryMistakes={() =>
            d.restart(d.session.results.filter((r) => !r.ok).map((r) => r.taskId))
          }
          onExit={() => router.push("/")}
          mode={d.mode}
          onMode={d.setMode}
          hint={d.hint}
          canHint={d.canHint}
          onHint={d.showHint}
        >
          {/*
            ⚠️⚠️ 这里原来放 `TaskBar`（每道题一个按钮）。

            实测截图看出来的问题：「全部」分类下有 **114 个按钮**，
            铺成一面墙 —— 把题目区、实测 diff 全挤到屏幕外，
            而它的唯一作用是「跳到某道题」。114 个键名既扫不过来、
            也想不出该点哪个。

            `/seq` 早就踩过同一个坑（131 个 leader 键），当时的结论是
            改成一条轻量的控制行。这里沿用那个做法 —— **上一题 / 跳过 /
            重来 / 清进度**。要知道「还剩多少」看上面的会话数据条。
          */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-neutral-600">
              {item.category} · {d.task.short}
            </span>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={d.skip}
                className="rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
                title="跳过这一题（记为答错）"
              >
                跳过
              </button>
              <button
                onClick={d.reset}
                className="rounded border border-neutral-700 px-2 py-0.5 text-neutral-400 hover:bg-neutral-800"
              >
                重来
              </button>
              <button
                onClick={d.clearProgress}
                className="rounded border border-neutral-800 px-2 py-0.5 text-neutral-600 hover:bg-neutral-800"
                title="清掉这个分类的进度（localStorage）"
              >
                清进度
              </button>
            </div>
          </div>

          <TaskBox>
            <div className="flex flex-wrap items-baseline gap-2 text-[11px] text-neutral-600">
              <span>{item.category}</span>
              <span>· 第 {item.measured.line} 行第 {item.measured.col} 列</span>
              {item.measured.pre && (
                <span className="text-amber-600/80">· 先按 {item.measured.pre}</span>
              )}
            </div>
            <div className="mt-2 text-neutral-200">{item.desc}</div>

            <div className="mt-3">
              <KeySequence keys={d.shownKeys} feed={d.keyFeed} />
            </div>

            <PendingHint pending={d.pending} />

            {item.alts.length > 0 && (
              <div className="mt-2 flex flex-wrap items-baseline gap-1.5 text-[11px]">
                <span className="text-neutral-700">实测等价</span>
                {item.alts.map((a) => (
                  <kbd key={a} className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
                    {a}
                  </kbd>
                ))}
              </div>
            )}
          </TaskBox>

          {/* 实测 diff —— 这一页的核心可视化 */}
          <MeasuredDiff item={item} />

          <KeyLog log={d.log} hint="按上面那条键序列 —— 每个键会立刻上色" />
          <FlashLine flash={d.flash} />
        </DrillFlow>
      </div>

      {/* 测了但不出题的 —— 排掉不等于藏起来 */}
      {CORE_SKIPPED.length > 0 && (
        <details
          data-skipped
          className="mt-8 rounded border border-neutral-800 bg-neutral-900/30 p-3"
        >
          <summary className="cursor-pointer text-[11px] text-neutral-500">
            已排除 <b className="text-neutral-400">{CORE_SKIPPED.length}</b> 条
            <span className="ml-2 text-neutral-700">
              （点开看是什么、为什么 —— 排掉不等于藏起来）
            </span>
          </summary>
          <div className="mt-2 space-y-1">
            {CORE_SKIPPED.map((s, i) => (
              <div key={i} className="flex gap-2 text-[11px]">
                <kbd className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-500">
                  {s.key}
                </kbd>
                <span className="text-neutral-600">{s.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-8">
        <Provenance>
          这些键在 <code>nvim_get_keymap</code> 里<b>查不到</b> —— 它是 Vim 内建命令，
          不是映射，所以从数据集的抽取阶段就整个缺失。这一页是
          <b>破坏性实测</b>补回来的：造已知内容 → 落到指定位置 →
          <code>:normal! (键)</code> → diff buffer 和光标。
          <br />
          探针：<code>scripts/probe-core.lua</code> · 原始数据：
          <code>data/probe-core.json</code> · 生成：
          <code>node scripts/build-core.mjs</code>。
          <br />
          ⚠️ 折叠（<code>za</code> <code>zR</code> <code>zM</code>）和{" "}
          <code>gx</code> 在 headless 下<b>测不出效果</b>，所以不出题 ——
          上面「已排除」里说清了原因。
        </Provenance>
      </div>
    </main>
  );
}

/**
 * 实测 diff —— 把「按下去发生了什么」画出来。
 *
 * ## 为什么这个可视化值得单独写
 *
 * 键位表只能告诉你「`dw` 删一个词」。但 `dw` 和 `de` 的差别是
 * **空格留不留**，`0` 和 `^` 的差别是**缩进跳不跳** ——
 * 这些光看文字说不清，画出来一眼就懂。
 *
 * 实测数据里存了整个 buffer 和光标位置，所以能精确渲染：
 * 删掉的字符标红、光标位置标黄。
 */
function MeasuredDiff({ item }: { item: CoreItem }) {
  const { measured } = item;
  /**
   * ⚠️⚠️ 「之前」必须用实测记下来的 `measured.before`。
   *
   * 不能用 `CORE_SRC`，有两个原因：
   *
   * 1. **自定义文档**：`%` / `*` / `&` / 插入模式那几条用的是自己的文档
   *    （标准 SRC 里没有嵌套括号、没有重复的单词）。
   * 2. **前置操作**：`u`（前置 `x`）按键之前的状态是「x 已经删掉一个字符」，
   *    不是原始文档。拿 SRC 当「之前」，`u` 的 diff 会显示
   *    **「完全没变化」** —— 因为它撤销回了 SRC，而界面以为之前就是 SRC。
   *    看着像「这个键什么也不做」，其实是对比基准错了。
   */
  const before = measured.before;
  const after = measured.result;

  /**
   * 行级 diff（LCS）。
   *
   * ⚠️ 第一版这里是**按行号直接比**的，而且改过的行掉进了 `else` 分支被标成
   *    `"same"` —— 后果是 **`→` 箭头一个都不渲染**，界面看起来
   *    「这个键什么也没做」。实测抓 DOM 才看见。
   *
   * 现在用 `diffLines`（纯函数，有单测）：`dd` 删掉第 1 行后，
   * 后面 9 行会被识别成「没动」，而不是「9 行全变了」。
   */
  const rows = useMemo(() => diffLines(before, after), [before, after]);

  const lineCountChanged = before.length !== after.length;

  return (
    <div className="rounded bg-neutral-950 p-3 text-[11px]">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-neutral-700">
        <span>实测：按下去之后 buffer 变成什么</span>
        <span className="text-yellow-500/80">
          光标 → 第 {measured.cursor[0]} 行第 {measured.cursor[1]} 列
        </span>
        {!hasChange(rows) && (
          <span className="text-neutral-600">（buffer 内容不变，只动光标）</span>
        )}
        {lineCountChanged && (
          <span className="text-amber-600/80">
            （行数 {before.length} → {after.length}）
          </span>
        )}
      </div>

      <pre className="overflow-x-auto font-mono leading-relaxed">
        {rows.map((r, idx) => {
          /**
           * 光标画在 `after` 的那一行上。
           *
           * ⚠️ 用 `afterIndex` 而不是 `r.ln` —— 删除行会让行号错位，
           *    拿显示行号去比会把光标画到错误的一行。
           */
          const isCursorLine =
            r.afterIndex !== null && r.afterIndex + 1 === measured.cursor[0];
          return (
            <div
              key={idx}
              data-diff={r.kind}
              className={isCursorLine ? "bg-neutral-900/60" : ""}
            >
              <span className="mr-2 inline-block w-5 text-right text-neutral-700">
                {r.kind === "del" ? "" : r.ln}
              </span>
              {/*
                ⚠️ 三种情况分开画 —— 这就是第一版丢掉的那一支：
                  same → 普通文本
                  del  → 红底删除线（这一行没了）
                  add  → 绿字（这一行是新出现的）
              */}
              {r.kind === "same" && (
                <span className="text-neutral-400">
                  {r.text ? r.text : <span className="text-neutral-700">（空行）</span>}
                </span>
              )}
              {r.kind === "del" && (
                <span className="rounded-sm bg-red-950/60 text-red-400/80 line-through">
                  {r.text ? r.text : "（空行）"}
                </span>
              )}
              {r.kind === "add" && (
                <span className="rounded-sm bg-green-950/50 text-green-400/90">
                  {r.text ? renderCursor(r.text, measured.cursor) : "（空行）"}
                </span>
              )}
            </div>
          );
        })}
      </pre>

      {measured.selection && (
        <div className="mt-2 border-t border-neutral-800 pt-2 text-[10px] text-neutral-600">
          可视选区：第 {measured.selection.l1} 行第 {measured.selection.c1} 列 →{" "}
          {measured.selection.l2 === 2147483647 || measured.selection.c2 > 1000
            ? "行尾"
            : `第 ${measured.selection.l2} 行第 ${measured.selection.c2} 列`}
        </div>
      )}
    </div>
  );
}

/** 把光标位置画成黄色背景 */
function renderCursor(text: string, cursor: [number, number]) {
  const col = cursor[1] - 1;
  if (col < 0 || col >= text.length) {
    // 光标在行尾之后（比如 `$` 之后）
    return (
      <>
        {text}
        <span className="rounded-sm bg-yellow-500/40"> </span>
      </>
    );
  }
  return (
    <>
      {text.slice(0, col)}
      <span className="rounded-sm bg-yellow-500/40 text-yellow-100">{text[col]}</span>
      {text.slice(col + 1)}
    </>
  );
}

function CatBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs ${
        active
          ? "border-blue-400 bg-blue-400 text-black"
          : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}
