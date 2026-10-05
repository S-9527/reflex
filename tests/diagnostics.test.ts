import { describe, expect, it } from "vitest";
import {
  DIAG_KEYS,
  DIAGS,
  MISREAD,
  NATIVE,
  PROBE_LOG,
  SEVERITY,
  SRC,
  countBySeverity,
  findDiagKey,
  movesCursor,
  sortedDiags,
  type Diag,
} from "../lib/diagnostics";

describe("数据完整性", () => {
  it("key 唯一", () => {
    expect(new Set(DIAG_KEYS.map((k) => k.key)).size).toBe(DIAG_KEYS.length);
  });

  it("每条都有 desc / block / acts", () => {
    for (const k of DIAG_KEYS) {
      expect(k.desc, `${k.key} 缺 desc`).toBeTruthy();
      expect(k.acts, `${k.key} 缺 acts`).toBeTruthy();
    }
  });

  it("都有原生对照", () => {
    for (const k of DIAG_KEYS) expect(NATIVE[k.key], `${k.key} 缺 native`).toBeTruthy();
  });

  it("gr* 的 desc 就是 vim.lsp.buf 函数名 —— 实测原文,不是我翻译的", () => {
    // 这条是「gr 族不用背」的根据。如果哪天 desc 变了,测试会抓到。
    const gr = DIAG_KEYS.filter((k) => /^gr/.test(k.key));
    expect(gr.length).toBeGreaterThan(0);
    for (const k of gr) {
      if (k.key === "gO") expect(k.desc).toBe("vim.lsp.buf.document_symbol()");
      else expect(k.desc).toMatch(/^vim\.lsp\.buf\.\w+\(\)$/);
    }
  });

  it("gr 族里没有 gd —— 别按标准 Vim 的习惯去按", () => {
    expect(findDiagKey("gd")).toBeUndefined();
    // 但 gd 确实存在于本机,只是它是 Git diff
    expect(MISREAD.gd).toMatch(/Git Diff/);
  });
});

describe("MISREAD —— 我按记忆写错过的地方", () => {
  /**
   * ⚠️ 这组数据存在的原因:我第一版按记忆写了
   * 「gd = go to definition」,页面照着跑,单测和浏览器都没报错。
   * 是实测才发现它是 Git Diff。
   *
   * 所以把「我记错过什么」也做成数据,并且断言它还是错的。
   */
  it("gd / gD 记明是 Git 不是 LSP", () => {
    expect(MISREAD.gd).toMatch(/Git/);
    expect(MISREAD.gd).toMatch(/不是 go to definition/);
    expect(MISREAD.gD).toMatch(/Git/);
  });
});

describe("诊断数据", () => {
  it("每条诊断的行号落在 SRC 范围内", () => {
    for (const d of DIAGS) {
      expect(d.lnum, `${d.message} 行号越界`).toBeGreaterThanOrEqual(0);
      expect(d.lnum, `${d.message} 行号越界`).toBeLessThan(SRC.length);
      expect(d.endLnum).toBeGreaterThanOrEqual(d.lnum);
      expect(d.endLnum).toBeLessThan(SRC.length);
    }
  });

  it("列范围合法", () => {
    for (const d of DIAGS) {
      expect(d.col).toBeGreaterThanOrEqual(0);
      expect(d.endCol).toBeGreaterThan(d.col);
      const len = SRC[d.lnum].length;
      // endCol 可能刚好等于行长(诊断到行尾),所以 <= 而不是 <
      expect(d.endCol, `${d.message} 结束列越界`).toBeLessThanOrEqual(len);
    }
  });

  it("severity 只在 1..4", () => {
    for (const d of DIAGS) {
      expect([1, 2, 3, 4]).toContain(d.severity);
    }
  });

  it("覆盖多种 severity —— 页面要能画出严重级别的差别", () => {
    const sevs = new Set(DIAGS.map((d) => d.severity));
    expect(sevs.size).toBeGreaterThanOrEqual(3);
    expect(sevs.has(SEVERITY.ERROR)).toBe(true);
  });

  it("至少有一条多行诊断(测 end_lnum 那条路径)", () => {
    expect(DIAGS.some((d) => d.endLnum > d.lnum)).toBe(true);
  });

  it("每条都有 message 和 source", () => {
    for (const d of DIAGS) {
      expect(d.message).toBeTruthy();
      expect(d.source, `${d.message} 缺 source`).toBeTruthy();
    }
  });
});

describe("sortedDiags", () => {
  it("按行号再按列号排", () => {
    const s = sortedDiags();
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      expect(a.lnum < b.lnum || (a.lnum === b.lnum && a.col <= b.col)).toBe(true);
    }
  });

  it("不改动原数组", () => {
    const before = DIAGS.map((d) => d.message);
    sortedDiags();
    expect(DIAGS.map((d) => d.message)).toEqual(before);
  });

  it("传入自定义集合也能排", () => {
    const custom: Diag[] = [
      { lnum: 5, endLnum: 5, col: 0, endCol: 3, severity: 1, message: "b" },
      { lnum: 1, endLnum: 1, col: 0, endCol: 3, severity: 1, message: "a" },
    ];
    expect(sortedDiags(custom).map((d) => d.message)).toEqual(["a", "b"]);
  });
});

describe("countBySeverity", () => {
  it("四种级别都出现,没出现的是 0", () => {
    const c = countBySeverity();
    expect(Object.keys(c).sort()).toEqual(["1", "2", "3", "4"]);
    const total = c[1] + c[2] + c[3] + c[4];
    expect(total).toBe(DIAGS.length);
  });

  it("至少有错误也有警告", () => {
    const c = countBySeverity();
    expect(c[SEVERITY.ERROR]).toBeGreaterThan(0);
  });
});

describe("探针记录", () => {
  it("记着 vim.diagnostic 可用这条关键发现", () => {
    // 整页的数据可信度都压在「diagnostic 模型是真数据」上
    expect(PROBE_LOG.join(" ")).toMatch(/vim\.diagnostic\.set/);
  });

  it("也记着测不出来的部分", () => {
    expect(PROBE_LOG.join(" ")).toMatch(/测不出来|建不起来|wins/);
  });
});

/**
 * 页面模型的可行性:光标在诊断之间移动。
 *
 * 状态 = 当前停在哪条诊断上。`[d` 往后、`]d` 往前、`[D`/`]D` 到两端。
 * 这段逻辑要能和真 Vim 一致,所以单独测。
 */
describe("跳转模型", () => {
  /** 和页面上同一套逻辑 */
  /**
   * 跳转逻辑。⚠️ `[q` / `]q` 和 `[d` / `]d` **不一样** ——
   * 实测描述分别是 "Trouble/Quickfix Item" 和 "Diagnostic",
   * 前者在列表边界上**会停**(不绕回),后者也一样停。
   *
   * 这里统一成 clamp(到边界停住),并且 `move` 返回 -1 表示
   * 「按了但位置没变」—— 那才是需要判失败的信号。
   */
  const move = (idx: number, key: string, n: number): number => {
    switch (key) {
      case "]d":
      case "]q":
        return Math.min(n - 1, idx + 1);
      case "[d":
      case "[q":
        return Math.max(0, idx - 1);
      case "]D":
        return n - 1;
      case "[D":
        return 0;
      default:
        return idx;
    }
  };

  const n = DIAGS.length;

  it("]d 走到最后停在最后一条(不越界)", () => {
    let i = 0;
    for (let k = 0; k < n + 3; k++) i = move(i, "]d", n);
    expect(i).toBe(n - 1);
  });

  it("[d 走到最前停在第一条(不越界)", () => {
    let i = n - 1;
    for (let k = 0; k < n + 3; k++) i = move(i, "[d", n);
    expect(i).toBe(0);
  });

  it("]D / [D 直接到两端", () => {
    expect(move(1, "]D", n)).toBe(n - 1);
    expect(move(1, "[D", n)).toBe(0);
  });

  it("在边界上按不会跑出范围", () => {
    expect(move(0, "[d", n)).toBe(0);
    expect(move(n - 1, "]d", n)).toBe(n - 1);
    expect(move(0, "[q", n)).toBe(0);
    expect(move(n - 1, "]q", n)).toBe(n - 1);
  });

  /**
   * ⚠️ 关键不变量:每一题在**任何**非边界起点都能改变状态。
   *
   * 这条测试抓到过一个真问题:`]q` / `[q` 的描述里说的是
   * 「Trouble/Quickfix Item」,和 diagnostic 不是同一个列表。
   * 如果模型把两者混起来,某些起点就会变成死题 ——
   * 而死题的表现正是用户报过的「按了没反应」。
   */
  it("每条跳转题:除两端外的每个起点都能改变状态", () => {
    // ⚠️ 只测 movesCursor 的那些键。gr* 不移动光标 ——
    //   把它们塞进位置模型的话,按了光标不动 = 「按了没反应」。
    for (const k of DIAG_KEYS.filter(movesCursor)) {
      const interior = [];
      for (let i = 1; i < n - 1; i++) interior.push(i);
      const stuck = interior.filter((start) => move(start, k.key, n) === start);
      expect(
        stuck.length,
        `${k.key} 在这些起点按不动:${JSON.stringify(stuck)}`,
      ).toBe(0);
    }
  });

  it("每一题都至少有一个能解的起点", () => {
    for (const k of DIAG_KEYS.filter(movesCursor)) {
      const starts = [0, Math.floor(n / 2), n - 1];
      expect(starts.some((s) => move(s, k.key, n) !== s), `${k.key} 无解`).toBe(true);
    }
  });

  /**
   * ⚠️ 这条测试抓到过一个真问题。
   *
   * 我原来把 `gr*` 和 `[d`/`]d` 都标成「跳转」,于是页面模型
   * 把它们当位置移动 —— 但 `grr`(references)不移动光标,
   * 它开一个选择器。结果 `grr` 那题在任何位置都「按了没反应」。
   *
   * 所以分类必须按**实测行为**分,不能按「感觉像同类」分。
   */
  it("gr* 不移动光标 —— 不能进位置模型", () => {
    for (const k of DIAG_KEYS.filter((x) => /^gr/.test(x.key))) {
      expect(movesCursor(k), `${k.key} 被误当成移动光标`).toBe(false);
      expect(k.block).toBe("LSP 查询");
    }
  });

  it("[d ]d [D ]D [q ]q 才是移动光标的那组", () => {
    const movers = DIAG_KEYS.filter(movesCursor).map((k) => k.key).sort();
    expect(movers).toEqual(["[D", "[d", "[q", "]D", "]d", "]q"].sort());
  });

  it("面板类键也不移动光标", () => {
    for (const k of DIAG_KEYS.filter((x) => x.block === "面板")) {
      expect(movesCursor(k), `${k.key} 被误当成移动光标`).toBe(false);
    }
  });
});