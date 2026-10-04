import { describe, it, expect } from "vitest";
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
  it("native 和 lazy 都以 <C-w> / <Space>w 开头", () => {
    for (const wk of WIN_KEYS) {
      expect(wk.native, `${wk.key} 的 native 不对`).toMatch(/^<C-w>/);
      expect(wk.lazy, `${wk.key} 的 lazy 不对`).toMatch(/^<Space>w/);
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