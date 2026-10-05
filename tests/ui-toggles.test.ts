import { describe, expect, it } from "vitest";
import { mergeFirstKeys } from "../lib/drill";
import {
  UI_TOGGLES,
  NATIVE,
  PROBE_LOG,
  isToggle,
  findToggle,
  fullKey,
  groupsOf,
  keySeq,
  type UiToggle,
} from "../lib/ui-toggles";
import {
  MEASURED_API,
  MEASURED_EX,
  MEASURED_OPTIONS,
  NOT_EXISTING_EX,
  ORIGIN_NOTE,
} from "../lib/provenance";

describe("数据完整性", () => {
  it("key 唯一 —— 要当 React key 用", () => {
    const seen = new Set(UI_TOGGLES.map((t) => t.key));
    expect(seen.size).toBe(UI_TOGGLES.length);
  });

  it("每条都有 desc / group / effect", () => {
    for (const t of UI_TOGGLES) {
      expect(t.desc, `${t.key} 缺 desc`).toBeTruthy();
      expect(t.group, `${t.key} 缺 group`).toBeTruthy();
      expect(t.effect, `${t.key} 缺 effect`).toBeTruthy();
    }
  });

  it("key 都是单键 u + 一个字符", () => {
    // 这一族只练 leader + 单键。如果出现 u + 两键,页面会收不到
    for (const t of UI_TOGGLES) {
      expect(t.key, `${t.key} 不是 u+1 字符`).toMatch(/^u.$/);
    }
  });

  /**
   * ⚠️ 反向断言,锁住实测结论。
   *
   * 我原本给每个键都填了「它会改哪个 option」的推断,后来实测发现
   * headless 下测不出来。如果哪天有人又加回一个「实测」的字段,
   * 这个测试会提醒他:那 23 条的效果从来没被验证过。
   */
  it("rhs 为 null 的键占绝大多数 —— 记着这些效果没被实测过", () => {
    const nulls = UI_TOGGLES.filter((t) => t.rhs === null);
    expect(nulls.length).toBe(UI_TOGGLES.length - 1);
    // 唯一有真 rhs 的是 ur
    const withRhs = UI_TOGGLES.filter((t) => t.rhs !== null);
    expect(withRhs.map((t) => t.key)).toEqual(["ur"]);
  });

  it("PROBE_LOG 记着「测不出来」的证据,不是空话", () => {
    expect(PROBE_LOG.length).toBeGreaterThan(0);
    expect(PROBE_LOG.join(" ")).toMatch(/uis|rhs|探针/);
  });

  /**
   * ⚠️ 用户提的问题:测不出来的键,也必须说清「它干什么」和
   * 「这是 Vim 原生还是插件」。只写「未实测」等于什么都没说。
   */
  it("每条都有 origin 和 verified —— 不能因为测不出效果就吞掉作用", () => {
    for (const t of UI_TOGGLES) {
      expect(t.origin, `${t.key} 缺 origin(原生还是插件)`).toBeTruthy();
      expect(t.verified, `${t.key} 缺 verified`).toBeTruthy();
    }
  });

  it("effect 不能只是把 desc 抄一遍 —— 要说清做什么", () => {
    for (const t of UI_TOGGLES) {
      // 太短的说明等于没写
      expect(t.effect.length, `${t.key} 的 effect 太短`).toBeGreaterThan(8);
    }
  });

  it("origin 用的是受控词表,不是自由文本", () => {
    const allowed = new Set(Object.keys(ORIGIN_NOTE));
    for (const t of UI_TOGGLES) {
      expect(allowed.has(t.origin), `${t.key} 的 origin "${t.origin}" 不在词表里`).toBe(true);
    }
  });

  it("verified 只用四档,而且 OPT/RHS 的键确实有对应证据", () => {
    const allowed = new Set(["opt", "rhs", "desc", "none"]);
    for (const t of UI_TOGGLES) {
      expect(allowed.has(t.verified), `${t.key} 的 verified "${t.verified}" 不合法`).toBe(true);
      if (t.verified === "rhs") {
        expect(t.rhs, `${t.key} 标了 rhs 但没填`).toBeTruthy();
      }
      if (t.verified === "desc") {
        // 只有 desc 的,rhs 必然是 null(没拿到真 Ex 字符串)
        expect(t.rhs, `${t.key} 标了只有 desc,却有 rhs`).toBeNull();
      }
    }
  });

  it("verified=opt 的键,它声称的底层必须出现在实测清单里", () => {
    // 这是防「嘴上说核实了,其实没查」的那道闸
    const all = [...MEASURED_OPTIONS, ...MEASURED_EX, ...MEASURED_API];
    for (const t of UI_TOGGLES.filter((x) => x.verified === "opt")) {
      const claims =
        t.effect + t.origin + " " + (NATIVE[t.key] ?? "");
      const mentionsSomething = all.some((m) => claims.includes(m));
      // 至少要提到一个实测过的名字,或者明确说了「纯插件」
      expect(
        mentionsSomething || t.origin === "纯插件功能(无原生等价)",
        `${t.key} 标了 verified=opt,但 effect/native 里没提到任何实测过的 option/命令/API`,
      ).toBe(true);
    }
  });

  it("NOT_EXISTING_EX 里的名字不能被当成原生命令写出去", () => {
    // :getcurpos 不存在(它是函数),我第一版给它写了 Ex 对照
    for (const t of UI_TOGGLES) {
      for (const bad of NOT_EXISTING_EX) {
        expect(NATIVE[t.key] ?? "", `${t.key} 的 native 里出现了不存在的 :${bad}`).not.toMatch(
          new RegExp(`:${bad}\\b`),
        );
      }
    }
  });
});

describe("leader 不能省", () => {
  /**
   * ⚠️ u* 全部 24 条实测 lhs 都带前导空格 = leader 是 <Space>。
   *   用户在 /diag 报过同类问题(Trouble 那几个被省了 leader)。
   */
  it("24 条全都标了 hasLeader", () => {
    expect(UI_TOGGLES.every((t) => t.hasLeader)).toBe(true);
  });

  it("fullKey 拼上 <Space>", () => {
    expect(fullKey(findToggle("uL")!)).toBe("<Space>uL");
    expect(fullKey(findToggle("uz")!)).toBe("<Space>uz");
  });

  it("keySeq 是三键 <Space> u X", () => {
    expect(keySeq(findToggle("uL")!)).toEqual(["<Space>", "u", "L"]);
    expect(keySeq(findToggle("uA")!)).toEqual(["<Space>", "u", "A"]);
  });

  it("firstKeys 里 <Space> 在 —— 否则 leader 按了没反应", () => {
    // ⚠️ 这里传的是「一条条解法」。我第一版写错成多包一层数组,
    //   而 mergeFirstKeys 当时又把参数摊平,两层错叠在一起,
    //   测试红得莫名其妙。查下去才发现是引擎的签名不对。
    const merged = mergeFirstKeys(...UI_TOGGLES.map((t) => keySeq(t)));
    expect(merged.has("<Space>")).toBe(true);
    expect(merged.has("<")).toBe(false);
  });

  it("mergeFirstKeys 每个参数是一条完整解法", () => {
    const one = mergeFirstKeys(["<Space>", "u", "L"]);
    expect(one.has("<Space>")).toBe(true);
    // ⚠️ 回归:坏掉的实现会得到 "<",leader 就接不住了
    expect(one.has("<")).toBe(false);
  });
});

describe("动作 vs 开关", () => {
  /**
   * ⚠️ 这条区分很重要 —— 页面模型必须知道。
   *
   * `un`(关掉通知)、`ur`(重画)这类键没有「开/关」两态,
   * 按一下就执行一次。如果当开关渲染,用户会以为能反复切,
   * 也会以为「关掉通知」能「打开通知」。
   */
  it("四个动作被正确归类为非开关", () => {
    const actions = UI_TOGGLES.filter((t) => !isToggle(t)).map((t) => t.key);
    expect(actions.sort()).toEqual(["uC", "uI", "ui", "un", "ur"].sort());
  });

  it("动作组的键确实没有开/关语义", () => {
    for (const t of UI_TOGGLES.filter((x) => !isToggle(x))) {
      expect(t.group).toBe("动作(不是开关)");
    }
  });

  it("开关里不混入 Dismiss / Redraw 这类词", () => {
    for (const t of UI_TOGGLES.filter(isToggle)) {
      expect(t.desc, `${t.key} 看着不像开关`).not.toMatch(/Dismiss|Redraw|Inspect|Colorschemes/);
    }
  });
});

describe("原生对照", () => {
  it("每个键都有原生字段(哪怕写「无 Ex 等价」)", () => {
    for (const t of UI_TOGGLES) {
      expect(NATIVE[t.key], `${t.key} 缺原生对照`).toBeTruthy();
    }
  });

  it("没有多余的原生条目", () => {
    const keys = new Set(UI_TOGGLES.map((t) => t.key));
    for (const k of Object.keys(NATIVE)) {
      expect(keys.has(k), `NATIVE 里有 ${k} 但数据里没有`).toBe(true);
    }
  });

  it("说「无 Ex 等价」的原因是诚实的 —— 不编一个假命令", () => {
    // 有些确实没有对应 Ex 命令,必须写明而不是编一个
    expect(NATIVE.uh).toBe("(无 Ex 等价)");
    expect(NATIVE.up).toBe("(无 Ex 等价)");
  });
});

describe("查找", () => {
  it("findToggle 按 key 找", () => {
    expect(findToggle("uL")?.desc).toBe("Toggle Relative Number");
    expect(findToggle("zzz")).toBeUndefined();
  });

  it("groupsOf 按出现顺序返回,不重复", () => {
    const g = groupsOf();
    expect(new Set(g).size).toBe(g.length);
    expect(g.length).toBeGreaterThan(1);
  });
});

/**
 * 每道题按下答案键必须改变状态。
 *
 * 这一族模型很简单:状态 = 哪些开关打开了。
 * 按 `u*` 就把它切过来。
 */
describe("每题都可解", () => {
  const stateFrom = (on: string[]): Set<string> => new Set(on);

  const apply = (key: string, s: Set<string>): Set<string> => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  for (const t of UI_TOGGLES as UiToggle[]) {
    it(`${t.key} ${t.desc}: 按下能改变状态`, () => {
      const before = stateFrom([]);
      const after = apply(t.key, before);
      expect(after.has(t.key), `${t.key} 按了没反应`).toBe(true);
    });

    it(`${t.key}: 再按一次能切回来(动作类除外)`, () => {
      const on = stateFrom([t.key]);
      const off = apply(t.key, on);
      if (isToggle(t)) {
        expect(off.has(t.key), `${t.key} 是开关,再按应该关掉`).toBe(false);
      } else {
        // 动作键不该被画成有开/关两态
        expect(t.group).toBe("动作(不是开关)");
      }
    });
  }
});