/**
 * 「reflex 到底练了哪些键」—— 把各板块的题库拼成一份。
 *
 * ## ⚠️ 为什么要单独一个文件
 *
 * 覆盖率对照需要**全量**题目，而各板块的题库散在 9 个模块里
 * （`bindings` 的 COMMANDS、`winkeys`、`bufs`、`tabs`、`files`、
 * `ui-toggles`、`diagnostics`、`core-vim`、`textobj`）。
 *
 * 在测试里拼一遍、在页面里再拼一遍 = 两套逻辑必然不同步
 * （这个项目在这上面吃过很多次亏）。所以只留这一份。
 */

import type { Command } from "./bindings";
import { COMMANDS } from "./bindings";
import { CORE_ITEMS } from "./core-vim";
import { TASKS as WIN_TASKS, WIN_KEYS } from "./winkeys";
import { BUF_TASKS } from "./bufs";
import { TAB_TASKS } from "./tabs";
import { FILE_TASKS } from "./files";
import { UI_TOGGLES } from "./ui-toggles";
import { DIAG_KEYS } from "./diagnostics";
import { SPEC } from "./textobj";

/** 造一条「伪 Command」—— 覆盖率只关心 display / alternates / desc */
function mk(
  board: string,
  display: string,
  desc: string,
  alternates: string[] = [],
  native: string | null = null,
): Command {
  return {
    id: `${board}:${display}`,
    display,
    desc,
    alternates,
    modes: ["n"],
    group: board,
    groupLabel: board,
    inWhichKey: false,
    wkGroup: null,
    equivBy: "lone",
    native,
    nativeVerified: "unchecked",
    total: 1 + alternates.length,
  };
}

/** 全部板块的题目（覆盖率对照用） */
export function allDrilled(): Command[] {
  const out: Command[] = [];

  // /seq —— 只取可练池（和页面一致）
  for (const c of COMMANDS) out.push(c);

  // /core —— Vim 内建操作
  for (const it of CORE_ITEMS) out.push(mk("core", it.key, it.desc, it.alts));

  // /windows —— 三段式（<Space>wX），并把**原生等价**一起登记
  for (const k of WIN_TASKS) {
    const wk = WIN_KEYS.find((w) => w.key === k.key);
    out.push(mk("windows", `<Space>w${k.key}`, k.desc, [], wk?.native ?? null));
  }

  // /buffers
  for (const t of BUF_TASKS) {
    out.push(mk("buffers", t.key, t.desc));
    if (t.key.length > 1 && !t.key.startsWith("<")) {
      out.push(mk("buffers", `<Space>${t.key}`, t.desc));
    }
  }

  // /tabs
  for (const t of TAB_TASKS) out.push(mk("tabs", `<Space>${t.key}`, t.desc));

  // /files
  for (const t of FILE_TASKS) out.push(mk("files", t.key, ""));

  // /ui
  for (const t of UI_TOGGLES) {
    out.push(mk("ui", t.hasLeader ? `<Space>${t.key}` : t.key, t.desc));
  }

  // /diag
  for (const k of DIAG_KEYS) {
    out.push(mk("diag", k.hasLeader ? `<Space>${k.key}` : k.key, k.desc));
  }

  // /text —— 四种 operator × 每个对象
  for (const s of SPEC) {
    for (const op of ["d", "c", "y", "v"]) {
      out.push(mk("text", `${op}${s.key}`, s.desc));
    }
  }

  return out;
}
