import { describe, expect, it } from "vitest";
import { DIAG_KEYS, keySeq } from "../lib/diagnostics";
import { isNavKey, isQfKey, applyNav, applyQfNav, initial } from "../lib/diag-nav";
import type { Diag } from "../lib/diagnostics";

/**
 * ⚠️ `/diag` 页面的**键位分派**验证。
 *
 * 这一页有两族跳转，**行为不同**（实测）：
 *
 * | 键 | 到头 |
 * |----|------|
 * | `]d` `[d` `]D` `[D` | 绕回 |
 * | `]q` `[q` | 停住（E553） |
 *
 * 如果分派写错（比如 `]q` 走了 `]d` 的路径），页面照跑不报错，
 * 只是**画出来的行为是错的** —— 那比不画更糟。
 */

const D = (lnum: number): Diag => ({
  lnum, endLnum: lnum, col: 0, endCol: 10, severity: 1, message: `d${lnum}`,
});
const LIST = [D(2), D(5), D(8)];

/** 复刻 app/diag/drill.tsx 的分派逻辑 */
function dispatch(key: string, cursor: number) {
  const navState = { cursor, diags: LIST, note: "" };
  const kind = isQfKey(key) ? "qf" : isNavKey(key) ? "diag" : "none";
  if (kind === "none") return { kind, cursor, note: "" };
  const nav = kind === "qf" ? applyQfNav(navState, key) : applyNav(navState, key);
  return { kind, cursor: nav.cursor, note: nav.note };
}

describe("/diag 的键位分派", () => {
  it("DIAG_KEYS 里这两族的键都被认出来", () => {
    const nav = DIAG_KEYS.filter((k) => isNavKey(k.key));
    const qf = DIAG_KEYS.filter((k) => isQfKey(k.key));
    expect(nav.map((k) => k.key).sort()).toEqual(["[D", "[d", "]D", "]d"]);
    expect(qf.map((k) => k.key).sort()).toEqual(["[q", "]q"]);
    // 两族不重叠
    for (const k of qf) expect(isNavKey(k.key)).toBe(false);
  });

  it("`]d` 走诊断路径（到头绕回）", () => {
    const r = dispatch("]d", 8); // 已在最后一条
    expect(r.kind).toBe("diag");
    expect(r.cursor, "绕回第一条").toBe(2);
    expect(r.note).toContain("绕回");
  });

  it("`]q` 走 quickfix 路径（到头停住）", () => {
    const r = dispatch("]q", 8); // 已在最后一项
    expect(r.kind).toBe("qf");
    expect(r.cursor, "停住不动").toBe(8);
    expect(r.note).toContain("E553");
  });

  /**
   * ⚠️ 核心断言：同一份列表、同一个位置，两族给出**不同**结果。
   */
  it("同一位置: ]d 绕回而 ]q 停住", () => {
    const diag = dispatch("]d", 8);
    const qf = dispatch("]q", 8);
    expect(diag.cursor).toBe(2);
    expect(qf.cursor).toBe(8);
    expect(diag.cursor).not.toBe(qf.cursor);
  });

  it("`[d` 走诊断路径（到头绕回）", () => {
    const r = dispatch("[d", 2);
    expect(r.kind).toBe("diag");
    expect(r.cursor).toBe(8);
  });

  it("`[q` 走 quickfix 路径（到头停住）", () => {
    const r = dispatch("[q", 2);
    expect(r.kind).toBe("qf");
    expect(r.cursor).toBe(2);
    expect(r.note).toContain("E553");
  });

  it("`]D` / `[D` 走诊断路径（跳首尾，不涉及绕回）", () => {
    expect(dispatch("]D", 2).cursor).toBe(8);
    expect(dispatch("[D", 8).cursor).toBe(2);
    expect(dispatch("]D", 2).kind).toBe("diag");
  });

  it("不在两族里的键不会被接管", () => {
    for (const k of ["gd", "grr", "<Space>xx", "j"]) {
      expect(dispatch(k, 5).kind, `${k} 不该被跳转逻辑接管`).toBe("none");
    }
  });
});
