import { describe, expect, it } from "vitest";
import { classify, firstKeySet, mergeFirstKeys } from "../lib/drill";
import { splitLhs } from "../lib/keys";
import { DIAG_KEYS, movesCursor, sortedDiags, splitKey } from "../lib/diagnostics";

/**
 * 把题库接到引擎的判据上 —— 这是唯一能抓住
 * 「accept 和实际键位对不上」的测试层。
 *
 * ⚠️ 起因:浏览器实测 /diag 时按键**完全没反应**,
 * 而 UI 正常渲染、控制台 0 error、tsc 干净。
 * 最后发现是 accept 里的键和实际该按的键不一致,
 * 于是 classify 永远返回 none —— 而 none 分支是**放行**,不报错。
 *
 * 这类 bug 只靠「跑起来看看」发现不了,必须有断言。
 */

/** 和 app/diag/drill.tsx 里构造 TASKS 的逻辑一致 —— 逐键数组 */
/**
 * 和 app/diag/drill.tsx 里构造 TASKS 的逻辑一致。
 *
 * ⚠️ `.map(splitKey)` 不能写 —— Array.map 会把 `(value, index)` 都传给回调,
 *   于是 splitLhs 收到的是「数组下标」而不是键字符串,静默返回错的东西。
 *   这类 JS 陷阱靠 tsc 抓不到(参数类型恰好兼容),必须写全箭头函数。
 */
function acceptOf(key: string): string[][] {
  const k = DIAG_KEYS.find((x) => x.key === key)!;
  // alts 已经是逐键数组(见「等价键必须是逐键数组」那个测试),
  // 只有 k.key 需要拆
  return [splitKey(k.key), ...(k.alts ?? [])];
}

const ALL = DIAG_KEYS.map((k) => acceptOf(k.key));

describe("记法字符串 ≠ 逐键序列", () => {
  /**
   * ⚠️⚠️ 这是 /diag 按键完全没反应的根因,单测必须钉死。
   *
   * `[d` 这种双字符键,如果直接 `[[k.key]]` 写成 `[["[d"]]`,
   * 数组里就有**一个元素装了俩字符**。于是:
   *   firstKeySet → {"[d"}
   *   浏览器 e.key → "["
   *   永远配不上 → 落进 none 分支 → **放行**,不报错。
   *
   * 表现:UI 正常、控制台干净、tsc 通过,但键完全没反应。
   * 我在这个 bug 上卡了十几轮探针,最后是回到「浏览器报的到底是什么」
   * 才定位到。
   */
  it("双字符键必须被拆成两个元素", () => {
    const bracketD = splitKey("[d");
    expect(bracketD).toEqual(["[", "d"]);
    expect(bracketD.length).toBe(2);
  });

  it("每个解法的每个元素都只能是**一个**键记号", () => {
    for (const k of DIAG_KEYS) {
      for (const seq of acceptOf(k.key)) {
        for (const part of seq) {
          // 单键记号:长度 1,或完整的 <...>
          const isSingleChar = part.length === 1;
          const isBracketed = part.startsWith("<") && part.endsWith(">");
          expect(
            isSingleChar || isBracketed,
            `${k.key} 的解法里有 "${part}" —— 不是单键记号(会一个元素装俩字符)`,
          ).toBe(true);
        }
      }
    }
  });

  it("firstKeySet 里不会出现多字符的假首键", () => {
    for (const k of DIAG_KEYS) {
      const fk = firstKeySet(acceptOf(k.key));
      for (const key of fk) {
        const ok = key.length === 1 || (key.startsWith("<") && key.endsWith(">"));
        expect(ok, `${k.key} 的 firstKeys 里出现了 "${key}"`).toBe(true);
      }
    }
  });

  it("单字符键拆出来还是它自己", () => {
    expect(splitKey("x")).toEqual(["x"]);
    expect(splitKey("Q")).toEqual(["Q"]);
  });

  it("尖括号记号不会被拆坏", () => {
    expect(splitKey("<C-w>")).toEqual(["<C-w>"]);
    expect(splitKey("<C-w>d")).toEqual(["<C-w>", "d"]);
  });

describe("题库和引擎对得上", () => {
  it("每个键都能被 classify 命中", () => {
    for (const k of DIAG_KEYS) {
      for (const seq of acceptOf(k.key)) {
        expect(classify([seq], seq).kind, `${k.key} 的解法 ${JSON.stringify(seq)} 判不出来`).toBe("hit");
      }
    }
  });

  it("每个键的第一键都进得了 firstKeys", () => {
    for (const k of DIAG_KEYS) {
      const fk = firstKeySet(acceptOf(k.key));
      for (const seq of acceptOf(k.key)) {
        expect(fk.has(seq[0]), `${k.key} 的首键 ${seq[0]} 不在 firstKeys 里`).toBe(true);
      }
    }
  });

  /**
   * ⚠️ 逐步模拟整条按键流,任何一步落到 none 就是「按了没反应」。
   *
   * 这正是浏览器里看到的现象:none 分支不 preventDefault、不报错,
   * 所以看起来就是「键完全没用」。
   */
  it("逐步模拟:每条解法的每一键都被接管,不会落到 none", () => {
    for (const k of DIAG_KEYS) {
      const accept = acceptOf(k.key);
      for (const seq of accept) {
        for (let i = 0; i < seq.length; i++) {
          const buf = seq.slice(0, i + 1);
          const r = classify(accept, buf);
          expect(r.kind, `${k.key}:按到 ${JSON.stringify(buf)} 落到了 none`).not.toBe("none");
          if (i < seq.length - 1) expect(r.kind, `${k.key}:中间键被误判成 hit`).toBe("prefix");
        }
      }
    }
  });

  it("mergeFirstKeys 收的是每个键的**首键**,不是整个键名", () => {
    const merged = mergeFirstKeys(...ALL);
    for (const k of DIAG_KEYS) {
      // ⚠️ ]d 是两键序列,首键是 "]" 不是 "]d"。
      //   早先我写成断言 "]d 在集合里",测试红了 —— 是断言错了,不是代码错了。
      const first = splitKey(k.key)[0];
      expect(merged.has(first), `${k.key} 的首键 ${first} 不在合并集合里`).toBe(true);
    }
  });

  /**
   * ⚠️ 这是把浏览器里那个 bug 钉住的测试。
   *
   * 我第一版把 alt 写成 `"sd / sD"` —— 人类可读的说明,不是键序列。
   * 于是 classify 永远 none,而 none 分支是**放行**,
   * 表现就是「按键完全没反应」,但控制台不报错、UI 正常。
   *
   * 所以等价键必须是逐键数组,每键都能被接管。
   */
  it("等价键必须是逐键数组,不能是 \"sd / sD\" 这种说明文字", () => {
    for (const k of DIAG_KEYS) {
      for (const seq of k.alts ?? []) {
        expect(Array.isArray(seq), `${k.key} 的等价键不是数组`).toBe(true);
        for (const part of seq) {
          expect(typeof part, `${k.key} 的等价键里有非字符串`).toBe("string");
          expect(part, `${k.key} 的等价键里出现了斜杠分隔的说明`).not.toMatch(/[\/\s]/);
        }
        expect(seq.length, `${k.key} 的等价键是空的`).toBeGreaterThan(0);
      }
    }
  });

  it("等价键的首键也要能接管", () => {
    const merged = mergeFirstKeys(...ALL);
    for (const k of DIAG_KEYS) {
      for (const seq of k.alts ?? []) {
        expect(merged.has(seq[0]), `${k.key} 的等价键 ${JSON.stringify(seq)} 首键接不住`).toBe(true);
      }
    }
  });
});

/**
 * ⚠️ 边界行为 —— 这一族的模型必须「不静默」。
 *
 * `[d` 在第一条诊断上按了,位置不变。真 Vim 里这一步不动,
 * 但训练器**必须明确说「已经在边界上了」**,不能静默吞掉 ——
 * 用户看到没反应会以为是页面坏了。
 *
 * 所以 apply 在位置没变时返回 NO_EFFECT,而不是假装成功。
 */
describe("边界时必须明确提示,不能静默", () => {
  /** 和 app/diag/drill.tsx 里 apply 的位置移动部分一致 */
  const moveIdx = (idx: number, key: string, n: number): number | null => {
    let cur = idx;
    switch (key) {
      case "]d":
      case "]q":
        cur = Math.min(n - 1, cur + 1);
        break;
      case "[d":
      case "[q":
        cur = Math.max(0, cur - 1);
        break;
      case "]D":
        cur = n - 1;
        break;
      case "[D":
        cur = 0;
        break;
      default:
        return null;
    }
    return cur === idx ? null : cur; // null = NO_EFFECT
  };

  const n = sortedDiags().length;

  it("[d 在第一条上返回 null(该提示没走动)", () => {
    expect(moveIdx(0, "[d", n)).toBeNull();
  });

  it("]d 在最后一条上返回 null", () => {
    expect(moveIdx(n - 1, "]d", n)).toBeNull();
  });

  it("[D 已经在第一条时返回 null", () => {
    expect(moveIdx(0, "[D", n)).toBeNull();
  });

  it("]D 已经在最后一条时返回 null", () => {
    expect(moveIdx(n - 1, "]D", n)).toBeNull();
  });

  it("不在边界时返回新位置(不是 null)", () => {
    expect(moveIdx(1, "[d", n)).toBe(0);
    expect(moveIdx(n - 2, "]d", n)).toBe(n - 1);
    expect(moveIdx(1, "[D", n)).toBe(0);
    expect(moveIdx(1, "]D", n)).toBe(n - 1);
  });

  it("每题都有「至少一个起点能动」—— 否则是死题", () => {
    for (const k of DIAG_KEYS.filter(movesCursor)) {
      const starts = [0, 1, Math.floor(n / 2), n - 1];
      const alive = starts.filter((s) => moveIdx(s, k.key, n) !== null);
      expect(alive.length, `${k.key} 所有起点都动不了`).toBeGreaterThan(0);
    }
  });
});

describe("页面模型的前提", () => {
  /**
   * ⚠️ 这是 /diag 最关键的一条不变量。
   *
   * 我第一版把 `gr*` 和 `[d`/`]d` 都当「位置移动」,
   * 于是 grr 那题在任何位置按了都不动 —— 而 none 分支放行,
   * 页面看起来就是「键没用」。
   *
   * 模型必须先确认「这个键真的会改变状态」。
   */
  it("只有 movesCursor 的键能进位置模型", () => {
    const movers = DIAG_KEYS.filter(movesCursor).map((k) => k.key);
    expect(movers.length).toBe(6);
    expect(movers).not.toContain("grr");
    expect(movers).not.toContain("xx");
  });

  it("gr* 全都不是位置移动", () => {
    for (const k of DIAG_KEYS.filter((x) => x.key.startsWith("gr"))) {
      expect(movesCursor(k)).toBe(false);
    }
  });
});

});