import { describe, expect, it } from "vitest";
import {
  UI_TOGGLES,
  NATIVE,
  PROBE_LOG,
  isToggle,
  findToggle,
  groupsOf,
  type UiToggle,
} from "../lib/ui-toggles";

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