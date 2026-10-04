import { describe, expect, it } from "vitest";
// ⚠️ 测试里用相对路径 —— 本仓库没有 vitest 配置来解析 `@/` 别名
// (tsconfig 的 paths 只给 tsc / Next 用)。
import { classify, firstKeySet, mergeFirstKeys, normSeq, shouldTake, type DrillTask } from "../lib/drill";

/**
 * 引擎的判据测试。
 *
 * 这里的每条断言都对应一次真实踩过的坑,注释里写了是哪个。
 */

const T = (accept: string[][]): DrillTask => ({
  id: "t",
  short: "t",
  accept,
  desc: "测试题",
});

describe("normSeq", () => {
  it("逐键数组 → 可比对字符串", () => {
    expect(normSeq(["L"])).toBe("L");
    expect(normSeq(["<Space>", "b", "f"])).toBe("<Space>|b|f");
  });

  it("分隔符让 ['a','b'] 和 ['ab'] 不相等", () => {
    // 不加分隔符的话这两者拼出来都是 "ab" —— `<Tab>Tab` 那个 bug 的同类。
    expect(normSeq(["a", "b"])).not.toBe(normSeq(["ab"]));
  });
});

describe("firstKeySet", () => {
  it("收每条解法的第一个键", () => {
    expect(firstKeySet([["<Space>", "b"], ["L"]])).toEqual(new Set(["<Space>", "L"]));
  });

  it("跳过空解法", () => {
    expect(firstKeySet([[]]).size).toBe(0);
  });
});

describe("classify", () => {
  const accept = [
    ["<Space>", "b", "f"],
    ["L"],
    ["<Space>", "b", "j"],
  ];

  it("凑齐完整解法 → hit,且返回那条解法(不是用户敲的串)", () => {
    const r = classify(accept, ["L"]);
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") expect(r.seq).toEqual(["L"]);
  });

  it("还在序列中间 → prefix", () => {
    expect(classify(accept, ["<Space>"]).kind).toBe("prefix");
    expect(classify(accept, ["<Space>", "b"]).kind).toBe("prefix");
  });

  it("prefix 返回的 next 就是当前缓冲", () => {
    const r = classify(accept, ["<Space>", "b"]);
    if (r.kind === "prefix") expect(r.next).toEqual(["<Space>", "b"]);
  });

  it("不在任何解法上 → none", () => {
    expect(classify(accept, ["x"]).kind).toBe("none");
    expect(classify(accept, ["<Space>", "z"]).kind).toBe("none");
  });

  /**
   * ⚠️ 反向断言:锁定 `<C-/>` 的坑。
   * `/files` 的 `ff` 除了 `<Space>ff` 还有 `<C-/>` —— 单键、带斜杠。
   * 如果匹配只按「长度相同」或只看第一条解法,`<C-/>` 就永远收不到,
   * 用户按了会被当成「按了但状态没变」。
   */
  it("单键解法和多键解法混在一起时都能命中", () => {
    const mixed = [
      ["<Space>", "f", "f"],
      ["<C-/>"],
    ];
    expect(classify(mixed, ["<Space>", "f", "f"]).kind).toBe("hit");
    expect(classify(mixed, ["<C-/>"]).kind).toBe("hit");
    expect(classify(mixed, ["<Space>", "f"]).kind).toBe("prefix");
    // <Space> 后面不是 f → 立刻 none,不能继续等
    expect(classify(mixed, ["<Space>", "x"]).kind).toBe("none");
  });

  /**
   * 空缓冲时 classify 不该报 hit —— 否则一个键都没按就可能判对。
   * (引擎只在按下一个键之后才调 classify,这条是防御性的。)
   */
  it("空缓冲不会命中任何解法", () => {
    expect(classify([["L"]], []).kind).not.toBe("hit");
  });
});

describe("shouldTake", () => {
  const fk = new Set(["<Space>", "L"]);

  it("idle 时只接管第一键集合里的键", () => {
    expect(shouldTake([], fk, "<Space>")).toBe(true);
    expect(shouldTake([], fk, "L")).toBe(true);
    expect(shouldTake([], fk, "F5")).toBe(false);
  });

  /**
   * ⚠️ 这条是整个文件最关键的一行。
   * 实测:首页 290 条里 206 条(71%)有续键不在 firstKeySet 里,
   * 一旦 pending 时不放行,`<Space>|` 的 `|` 就被浏览器吃掉,
   * 序列永远卡在 `<Space>`。
   */
  it("pending 时无条件接管,哪怕这个键不在第一键集合里", () => {
    expect(shouldTake(["<Space>"], fk, "|")).toBe(true);
    expect(shouldTake(["<Space>"], fk, "F5")).toBe(true);
    expect(shouldTake(["<Space>"], fk, "Enter")).toBe(true);
  });
});

/**
 * 「按哪条都算过」这条不变量。
 *
 * ⚠️ 这是我自己在抽引擎时差点写错的地方:曾把 `isSolved` 写成
 * 「等于 accept[0]」,那样 `L` 那道题按 `]b` / `<Space>bb` 会被判错 ——
 * 而这四条在真机上是同一条命令(rhs 相同,实测聚合)。
 * **训练器比真实环境挑剔,用户练出来的反射在真机上却判错。**
 *
 * 所以判据只能是:命中 accept 里**任意一条** = 解过。
 * 本测试把这条钉死。
 */
describe("等价解法", () => {
  const nextBuf = T([
    ["L"],
    ["]b"],
    ["<Space>", "b", "b"],
    ["<Space>", "b", "`"],
  ]);

  it("accept 里每一条都能被 classify 命中", () => {
    for (const seq of nextBuf.accept) {
      expect(classify(nextBuf.accept, seq).kind, `${normSeq(seq)} 判不出来`).toBe("hit");
    }
  });

  it("四条解法长度不同,不能只按长度判", () => {
    // 单键 vs 三键。如果判据写成「长度等于 accept[0]」,
    // 三键的 <Space>bb / <Space>b` 会被当成另一条命令。
    expect(classify(nextBuf.accept, ["<Space>", "b", "b"]).kind).toBe("hit");
    expect(classify(nextBuf.accept, ["<Space>", "b", "`"]).kind).toBe("hit");
  });

  it("不在 accept 里的键判 none,不会被误收", () => {
    expect(classify(nextBuf.accept, ["H"]).kind).toBe("none");
    expect(classify(nextBuf.accept, ["<Space>", "b", "x"]).kind).toBe("none");
  });
});

describe("mergeFirstKeys", () => {
  it("合并多组解法的第一键", () => {
    expect(mergeFirstKeys([["v"]], [["h"], ["<Space>", "w", "x"]])).toEqual(
      new Set(["v", "h", "<Space>"]),
    );
  });

  it("只有一组时等于 firstKeySet", () => {
    expect(mergeFirstKeys([["L"], ["]b"]])).toEqual(firstKeySet([["L"], ["]b"]]));
  });
});

/**
 * 不变量:每道题都必须真的可解。
 *
 * 这条测试存在的原因 —— 之前 5 个页面各写一遍判据,
 * 于是出现了 6 道「按什么都不对」的题(焦点已在最左、布局已经对半……)。
 * 现在判据只有一份,这里守住它。
 */
describe("题库可解性", () => {
  const BOARDS: Record<string, DrillTask[]> = {
    windows: [
      { id: "v", short: "v", desc: "竖切", accept: [["v"]] },
      { id: "s", short: "s", desc: "横切", accept: [["s"]] },
    ],
    buffers: [
      { id: "bn", short: "bn", desc: "下一个", accept: [["L"], ["<Space>", "b", "b"]] },
    ],
    tabs: [
      { id: "n", short: "n", desc: "新标签页", accept: [["<Tab>", "<Tab>"]] },
    ],
    files: [
      { id: "ff", short: "ff", desc: "根目录查找", accept: [["<Space>", "f", "f"], ["<C-/>"]] },
    ],
    text: [
      { id: "diw", short: "diw", desc: "删词", accept: [["d", "i", "w"]] },
    ],
  };

  for (const [name, tasks] of Object.entries(BOARDS)) {
    it(`${name}: 每题都有解法`, () => {
      for (const t of tasks) {
        expect(t.accept.length, `${t.id} 没有解法`).toBeGreaterThan(0);
        for (const seq of t.accept) {
          expect(seq.length, `${t.id} 有空解法序列`).toBeGreaterThan(0);
        }
      }
    });

    it(`${name}: 每题按正解都能判过`, () => {
      for (const t of tasks) {
        const r = classify(t.accept, t.accept[0]);
        expect(r.kind, `${t.id} 按正解判不出来`).toBe("hit");
      }
    });

    it(`${name}: 每一键都是某条解法的前缀(没有死键)`, () => {
      for (const t of tasks) {
        for (const seq of t.accept) {
          for (let i = 0; i < seq.length; i++) {
            const buf = seq.slice(0, i + 1);
            const r = classify(t.accept, buf);
            expect(r.kind, `${t.id} 按到 ${normSeq(buf)} 就断了`).not.toBe("none");
            // 完整解法的中间键不能被误判成 hit
            if (i < seq.length - 1) expect(r.kind).toBe("prefix");
          }
        }
      }
    });

    it(`${name}: id 唯一`, () => {
      const seen = new Set(tasks.map((t) => t.id));
      expect(seen.size).toBe(tasks.length);
    });
  }
});