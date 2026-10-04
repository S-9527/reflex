import { describe, it, expect } from "vitest";
import { SRC, SPEC, locate, slice, findSpec, INNER_AROUND_PAIRS, OPERATORS } from "../lib/textobj";

/**
 * 关键约束:这一族的模型必须**和实测一致**。
 * 实测数据在 SPEC 的 measured 字段里 —— 那是跑 `:normal! d{key}` 得到的,
 * 所以这里断言「模型算出的范围」必须等于「实测删掉的东西」。
 */
describe("实测数据完整性", () => {
  it("SRC 就是探针用的那段(改了它 measured 就不作数了)", () => {
    expect(SRC[0]).toBe("local total = compute(a, b) + 1");
    expect(SRC[1]).toBe('local name = "hello world"');
    expect(SRC.length).toBe(10);
  });

  it("带 measured 的条目,doc 必须就是 SRC(不能偷偷换文档)", () => {
    for (const s of SPEC) {
      if (!s.measured) continue;
      expect(s.measured.doc, `${s.key} 的实测用了别的文档`).toBe(SRC);
    }
  });

  it("带 measured 的条目,line / col 必须在 SRC 范围内", () => {
    for (const s of SPEC) {
      if (!s.measured) continue;
      expect(s.measured.line, `${s.key} 行号越界`).toBeGreaterThanOrEqual(1);
      expect(s.measured.line).toBeLessThanOrEqual(SRC.length);
      const lineText = SRC[s.measured.line - 1];
      expect(lineText.length, `${s.key} 列号越界`).toBeGreaterThanOrEqual(s.measured.col - 1);
    }
  });
});

describe("locate —— word", () => {
  it("iw 不含尾随空白(实测:local| total,dw 后留一个空格)", () => {
    const r = locate(SRC, "word", "inner", 1, 1)!;
    expect(slice(SRC, r)).toBe("local");
  });

  it("aw 含尾随空白(实测:|total,空格一起删)", () => {
    const r = locate(SRC, "word", "around", 1, 1)!;
    // around 从词首吃到空白之后
    expect(r.c1).toBe(1);
    expect(slice(SRC, r)).toBe("local ");
  });

  it("⚠️ inner 和 around 的差别就是那些空白 —— 这一族唯一的考点", () => {
    const inner = locate(SRC, "word", "inner", 1, 1)!;
    const around = locate(SRC, "word", "around", 1, 1)!;
    expect(inner.c2).toBe(around.c2 - 1); // around 多吃一个字符(那个空格)
  });

  it("光标在词中间,范围不变", () => {
    const a = locate(SRC, "word", "inner", 1, 3)!;
    const b = locate(SRC, "word", "inner", 1, 5)!;
    expect(a).toEqual(b);
  });
});

describe("locate —— 引号 / 括号 / 花括号", () => {
  it('i" 是内容不含引号(实测:local name = "|"', () => {
    const r = locate(SRC, "quote", "inner", 2, 15)!;
    expect(slice(SRC, r)).toBe("hello world");
  });

  it('a" 连引号一起(实测:local name =|)', () => {
    const r = locate(SRC, "quote", "around", 2, 15)!;
    expect(slice(SRC, r)).toBe('"hello world"');
  });

  it("i( 是括号内内容(实测:compute(|))", () => {
    const r = locate(SRC, "paren", "inner", 1, 21)!;
    expect(slice(SRC, r)).toBe("a, b");
  });

  it("a( 连括号(实测:compute |)", () => {
    const r = locate(SRC, "paren", "around", 1, 21)!;
    expect(slice(SRC, r)).toBe("(a, b)");
  });

  it("i{ 是花括号内(实测:return {})", () => {
    const r = locate(SRC, "brace", "inner", 5, 12)!;
    expect(slice(SRC, r)).toBe(" key = 'val' ");
  });

  it("a{ 连花括号", () => {
    const r = locate(SRC, "brace", "around", 5, 12)!;
    expect(slice(SRC, r)).toBe("{ key = 'val' }");
  });
});

describe("locate —— 找不到就返回 null,绝不瞎猜", () => {
  it("这一行没有引号 → null", () => {
    expect(locate(SRC, "quote", "inner", 1, 1)).toBeNull();
  });

  it("这一行没有括号 → null", () => {
    expect(locate(SRC, "paren", "inner", 2, 1)).toBeNull();
  });

  it("行号越界 → null", () => {
    expect(locate(SRC, "word", "inner", 999, 1)).toBeNull();
  });

  it("⚠️ para / indent / line / sentence 不硬算,返回 null", () => {
    // 这些依赖 Vim 内部的段落/缩进规则,算错了比不算更糟
    for (const k of ["para", "indent", "line", "sentence"] as const) {
      expect(locate(SRC, k, "inner", 8, 1), `${k} 不该硬算`).toBeNull();
    }
  });
});

describe("实测和模型一致 —— 这一族最重要的一条", () => {
  it("diw 的范围挖出来,拼回原行等于实测结果", () => {
    const m = findSpec("iw")!.measured!;
    const r = locate(SRC, "word", "inner", m.line, m.col)!;
    // 实测:local total → local| total,即挖掉 "local" 后原位留下空格
    const cut = slice(SRC, r);
    expect(cut).toBe("local");
    expect(m.result.replace("|", "")).toContain(" total = compute(a, b) + 1");
  });

  it("di\" 的范围 = 实测删掉的内容", () => {
    const m = findSpec("i\"")!.measured!;
    const r = locate(SRC, "quote", "inner", m.line, m.col)!;
    expect(slice(SRC, r)).toBe("hello world");
    // 实测后整行变成 local name = "" —— 内容没了,引号还在
    expect(m.result).toContain('local name = "|"');
  });

  it("dip vs dap:实测差一个空行(10→7 / 10→6)", () => {
    const ip = findSpec("ip")!.measured!;
    const ap = findSpec("ap")!.measured!;
    // ap 比 ip 多带一个空行 —— around 的语义
    expect(ap.result).toContain("6 行");
    expect(ip.result).toContain("7 行");
  });
});

describe("数据完整性", () => {
  it("inner/around 成对的都在", () => {
    for (const [inner, around] of INNER_AROUND_PAIRS) {
      expect(findSpec(inner), `缺 ${inner}`).toBeDefined();
      expect(findSpec(around), `缺 ${around}`).toBeDefined();
      expect(findSpec(inner)!.edge).toBe("inner");
      expect(findSpec(around)!.edge).toBe("around");
    }
  });

  it("kind 相同的两个键,edge 必须相反", () => {
    for (const [inner, around] of INNER_AROUND_PAIRS) {
      expect(findSpec(inner)!.kind).toBe(findSpec(around)!.kind);
    }
  });

  it("每个 key 都有说明", () => {
    for (const s of SPEC) expect(s.desc, `${s.key} 缺说明`).toBeTruthy();
  });

  /**
   * ⚠️ React 的 key 只能用 id,不能用 textobject 名 ——
   * 因为 SPEC 里 iw 有两条(光标在词首 / 词中,两次不同的实测)。
   * 用 `key={s.key}` 渲染会撞
   * 「Encountered two children with the same key, `iw`」(用户报过)。
   * 所以 id 必须唯一。
   */
  it("id 唯一(React key 用它)", () => {
    const seen = new Set(SPEC.map((s) => s.id));
    expect(seen.size).toBe(SPEC.length);
  });

  it("key 允许重复 —— 同类对象的多次实测是正常的", () => {
    // 这不是 bug:iw 确实有多条实测记录。所以只能靠 id 去重。
    const iwCount = SPEC.filter((s) => s.key === "iw").length;
    expect(iwCount).toBeGreaterThan(1);
  });

  it("id 要能看出是哪个键 + 哪个位置", () => {
    for (const s of SPEC) {
      expect(s.id.includes(s.key), `${s.id} 里看不出是哪个键`).toBe(true);
    }
  });

  it("四个操作符都在(d/c/y/v)", () => {
    expect(OPERATORS.map((o) => o.key)).toEqual(["d", "c", "y", "v"]);
  });
});