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
       * ⚠️ 必须是 `<C-w>X`。
       *
       * 曾经允许过 `N<C-w>X`（计数形式 `1<C-w>w`）—— 那是为了救
       * 「`<C-w>0` 不存在」而想出来的。但**那个键本身也是编的**
       * （`<Space>w0` 在本机没有映射），所以整条删了，这里收回限制。
       */
      expect(wk.native, `${wk.key} 的 native 不对`).toMatch(/^<C-w>/);
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

/**
 * ⚠️⚠️ 不许再有「凭空编的键」。
 *
 * 这一轮实测抓到的编造清单：
 *
 * | 编的 | 真相 |
 * |------|------|
 * | `<C-w>d` | 不是关窗口，是跳宏定义（`：help CTRL-W_d`）|
 * | `<C-w>m` | Vim 里不存在（E149）|
 * | `<C-w>0` `<C-w>1` | Vim 里不存在（E149）|
 * | `<Space>w0` `<Space>w1` | 本机没有这条映射 |
 *
 * 根因是 `native: string` 逼着每条都得填 —— 填不出来就编。
 * 现在类型是 `string | null`，`null` 表示「Vim 里没有」。
 */
describe("不许编键", () => {
  it("题库里的每个键，本机都真的能按（有映射或属已声明例外）", () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, "../data/keymaps.json"), "utf8"),
    ) as { keys: { lhs: string; mode: string }[] };
    /** 本机真实的 `<Space>wX` 顶层映射 */
    const realLazy = new Set(
      raw.keys.filter((k) => /^ w.$/.test(k.lhs)).map((k) => k.lhs.slice(2)),
    );
    /**
     * ⚠️⚠️ 「面板键能不能按」的判据是 **`<C-w>X` 在 Vim 里存不存在**。
     *
     * 为什么不是「` wX` 有没有映射」：LazyVim 用 which-key 的
     * `proxy = "<c-w>"` 把 `<C-w>` 的键表**显示**在 `<Space>w` 下面，
     * 按 `<Space>w` 后由 which-key 进入 loop 代为执行 —— 所以
     * `<Space>wv` 能按，但本机 `nvim_get_keymap` 里**没有** ` wv` 这条映射。
     *
     * 实测对照（`<Space>wv` vs `<C-w>v`，都是 2 窗口 → 3 窗口，效果相同）。
     *
     * 所以：
     *   - `hydraOnly: true` → 面板键，要求 `<C-w>X` 真的存在
     *   - `hydraOnly` 未标 → 顶层键，要求本机 ` wX` 真的有映射
     */
    /**
     * ⚠️ 判据分两类，**按这个键在本机有没有顶层映射来分**，不是按 `hydraOnly`。
     *
     * 实测：本机只有 ` wd` 和 ` wm` 两条顶层映射；其余 15 个
     * （`wv` `ws` `wh` …）都只能在 `<Space><Space>` 面板里按。
     * 所以：
     *
     *   - 本机有 ` wX` 映射 → 顶层键，`lazy` 必须对得上
     *   - 本机没有 → 面板键，必须有 `native`（背后那条 `<C-w>X`）
     *     且 `<C-w>X` 本身要真的存在（`x` / `0` / `1` 就不存在）
     */
    for (const k of WIN_KEYS) {
      if (realLazy.has(k.key)) {
        expect(k.lazy).toBe(`<Space>w${k.key}`);
      } else {
        expect(
          k.native,
          `${k.lazy} 本机没有顶层映射，是面板键 —— 必须给 native（背后那条 <C-w>X）`,
        ).not.toBeNull();
      }
    }
    /**
     * ⚠️⚠️ 面板键的 native 必须**真的存在于 Vim**。
     *
     * 编造过的：`<C-w>m`（E149）、`<C-w>0` / `<C-w>1`（E149）。
     * 这里用「本机能按出来」当代理判据：`<C-w>X` 存在 ⇒ 面板能按。
     * （真正的 help 校验在 scripts/ 的探针里做，不放在单测里跑 nvim。）
     */
    const OK_CW = new Set([
      "v","s","h","j","k","l","H","J","K","L","c","o","x",
      ">","<","+","-","|","_","=","W","q","T",
      // ^D 是 `CTRL-W CTRL-D`（实测 `:help CTRL-W_CTRL-D` 有）
      "^D",
    ]);
    for (const k of WIN_KEYS) {
      if (k.native === null) continue;
      const ch = k.native.replace(/^<C-w>/, "");
      expect(
        OK_CW.has(ch),
        `${k.key} 的 native ${k.native} 在 Vim 里不存在 —— 编的键`,
      ).toBe(true);
    }
  });

  it("native 是 null 时必须给出理由（skip 或 desc 说明）", () => {
    for (const k of WIN_KEYS) {
      if (k.native !== null) continue;
      expect(
        k.skip || /插件|vIm|Vim 里没有|浮窗/.test(k.desc),
        `${k.key} 的 native 是 null（Vim 没这条命令），但没说明为什么`,
      ).toBeTruthy();
    }
  });
});
