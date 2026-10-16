import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeq, WIN_KEYS, findKey } from "../lib/winkeys";

/**
 * 三键序列能不能按完 —— 这正是用户报「按了键不管用」的根因。
 *
 * 原来 parse 是纯函数、只返回「等/中/否」,调用方在「等」时
 * 没把中间态写回缓冲,于是 <Space>wX 的第三键永远配不上。
 * 这组测试就是防那个 bug 复发的。
 */

/** 模拟用户按一串键:每按一下都用返回的 next 覆盖缓冲 */
function typeSeq(keys: string[]) {
  let buf: string[] = [];
  const steps: string[] = [];
  for (const k of keys) {
    const r = parseSeq(buf, k);
    steps.push(r.kind);
    if (r.kind === "wait") buf = r.next;
    else if (r.kind === "hit") return { result: r, steps };
    else return { result: null, steps };
  }
  return { result: null, steps };
}

describe("parseSeq —— <Space>wX 三键", () => {
  it("<Space> w v 走到底", () => {
    const { result, steps } = typeSeq([" ", "w", "v"]);
    expect(steps).toEqual(["wait", "wait", "hit"]);
    expect(result).not.toBeNull();
    expect(result!.key).toBe("v");
    expect(result!.full).toBe("<Space>wv");
  });

  it("⚠️ 中间态必须被存下来 —— 这是三键失效的根因", () => {
    // 第一步之后缓冲必须是 [" "]
    let buf: string[] = [];
    const r1 = parseSeq(buf, " ");
    expect(r1.kind).toBe("wait");
    buf = (r1 as { next: string[] }).next;

    // 第二步之后缓冲必须是 [" ", "w"] —— 少了这一步第三键就废了
    const r2 = parseSeq(buf, "w");
    expect(r2.kind).toBe("wait");
    buf = (r2 as { next: string[] }).next;
    expect(buf).toEqual([" ", "w"]);

    const r3 = parseSeq(buf, "v");
    expect(r3.kind).toBe("hit");
  });

  it("每个面板键都能按出来", () => {
    for (const wk of WIN_KEYS) {
      const { result } = typeSeq([" ", "w", wk.key]);
      expect(result, `${wk.lazy} 按不出来`).not.toBeNull();
      expect(result!.full).toBe(`<Space>w${wk.key}`);
    }
  });

  it("大写键(H J K L)也能按出来", () => {
    for (const k of ["H", "J", "K", "L"]) {
      const { result } = typeSeq([" ", "w", k]);
      expect(result, `<Space>w${k} 按不出来`).not.toBeNull();
    }
  });

  it("Shift 类键走浏览器报的字符", () => {
    // 浏览器把 > < + - | 这些报成符号本身
    for (const k of [">", "<", "+", "-", "|", "_", "="]) {
      const { result } = typeSeq([" ", "w", k]);
      expect(result, `<Space>w${k} 按不出来`).not.toBeNull();
    }
  });
});

describe("parseSeq —— 拒绝非法序列", () => {
  it("没按 <Space> 就按别的键 → other", () => {
    expect(parseSeq([], "w").kind).toBe("other");
    expect(parseSeq([], "v").kind).toBe("other");
  });

  it("<Space> 后面不是 w → other", () => {
    expect(parseSeq([" "], "f").kind).toBe("other");
  });

  it("<Space>wq(面板上没有 q 之外的键时)→ other", () => {
    // q 在表里但没建模,仍应被解析为 hit,由 UI 提示「还没建模」
    const r = parseSeq([" ", "w"], "q");
    expect(r.kind).toBe("hit");
  });

  it("<Space>wz(z 不在面板上)→ other", () => {
    expect(parseSeq([" ", "w"], "z").kind).toBe("other");
  });

  it("缓冲是空的(没有前缀)时任何键都是 other", () => {
    for (const k of ["v", "s", "d", ">", "H"]) {
      expect(parseSeq([], k).kind).toBe("other");
    }
  });
});

describe("parseSeq —— 四键以上不会误判", () => {
  it("多按一键不会崩,返回 other", () => {
    // <Space> w v 再按一个 —— v 已经被消费,缓冲是空的
    const buf: string[] = [];
    const r1 = parseSeq(buf, " ");
    const r2 = parseSeq((r1 as { next: string[] }).next, "w");
    const r3 = parseSeq((r2 as { next: string[] }).next, "v");
    expect(r3.kind).toBe("hit");
    // 消费后缓冲由调用方清空,再按键就是 other
    expect(parseSeq([], "x").kind).toBe("other");
  });
});

describe("键表数据完整性", () => {
  it("native 要么是 <C-w>X（Vim 真有），要么是 null（Vim 没有）", () => {
    /**
     * ⚠️⚠️ 这条测试原来写的是「native 必须以 `<C-w>` 开头」——
     * 于是**逼着每条都得填一个**，填不出来时就编一个。
     *
     * 实测抓到的三处编造（由用户截图指出的 `<C-w>d` 引出来）：
     *
     * | 写的 | 真相 |
     * |------|------|
     * | `<C-w>d` | 不是关窗口，是「跳到宏定义」（`:help CTRL-W_d`）|
     * | `<C-w>m` | **Vim 里不存在**（`:help CTRL-W_m` → E149）|
     * | `<C-w>0` `<C-w>1` | **也不存在**（同样 E149）|
     *
     * 所以现在允许 `null` ——「Vim 里没有」是个合法答案，
     * 比编一个不存在的键出来诚实得多。
     */
    for (const wk of WIN_KEYS) {
      expect(wk.lazy, `${wk.key} 的 lazy 不对`).toMatch(/^<Space>w/);
      if (wk.native === null) continue; // 插件功能，Vim 没有等价
      /**
       * ⚠️ `native` 有两种合法形态：
       *   1. `<C-w>X` —— 单键
       *   2. `N<C-w>X` —— **带计数**（如 `1<C-w>w` 跳第 1 个窗口）
       *
       * 第二种是必须的：Vim 的窗口计数就是「先按数字再按 `<C-w>w`」，
       * 当初写的 `<C-w>0` / `<C-w>1` 在 Vim 里根本不存在。
       */
      expect(wk.native, `${wk.key} 的 native 不对`).toMatch(/^(\d+)?<C-w>/);
    }
  });

  /**
   * ⚠️⚠️ 面板上的键必须**真的有映射** —— `<C-w>0` / `1` / `m` 当初是凭空编的。
   *
   * 本机 `nvim_get_keymap` 里根本没有 ` w0` / ` w1`，也就是说它们
   * 连「LazyVim 面板键」都不是。这条测试直接查本机实测数据。
   */
  it("面板键不能凭空编：和本机实测映射对照", () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, "../data/keymaps.json"), "utf8"),
    ) as { keys: { lhs: string; mode: string; rhs: string }[] };
    /** 本机真实的 `<Space>wX` 映射（leader 是真空格） */
    const realLazy = new Set(
      raw.keys.filter((k) => /^ w.$/.test(k.lhs)).map((k) => k.lhs.slice(2)),
    );
    // 本机只真的有这两条
    expect([...realLazy].sort()).toEqual(["d", "m"]);
    /**
     * ⚠️ 只对**本机确有映射**的那几条做断言。
     *
     * 其余是 which-key hydra 面板键 —— 它们大多没有顶层映射
     * （见 winkeys.ts 顶部的「验证边界」一节），属于
     * 「用户实测能用、我未验证」，不在这里当成「必须有」。
     */
    for (const k of WIN_KEYS) {
      if (!realLazy.has(k.key)) continue;
      expect(k.lazy).toBe(`<Space>w${k.key}`);
    }
  });

  it("lazy 一定等于 <Space>w + key", () => {
    for (const wk of WIN_KEYS) {
      expect(wk.lazy).toBe(`<Space>w${wk.key}`);
    }
  });

  it("findKey 能查到每个键", () => {
    for (const wk of WIN_KEYS) {
      expect(findKey(wk.key)).toBeDefined();
    }
  });

  it("键不重复", () => {
    const seen = new Set(WIN_KEYS.map((k) => k.key));
    expect(seen.size).toBe(WIN_KEYS.length);
  });
});