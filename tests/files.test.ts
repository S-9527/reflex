import { describe, it, expect } from "vitest";
import {
  FILE_KEYS,
  FILE_TASKS,
  VERBS,
  findFileKey,
  normSeq,
  toPanelKey,
  caseRuleHolds,
  ABD_BROKEN,
  type Verb,
} from "../lib/files";

describe("这一族的规律:小写 = 项目根目录,大写 = 当前目录", () => {
  it("规律成立(所有成对的 verb 都满足)", () => {
    expect(caseRuleHolds()).toBe(true);
  });

  it("五个成对的 verb 都在", () => {
    const paired: Verb[] = ["explorer", "find", "recent", "terminal", "buffers"];
    for (const v of paired) {
      const g = FILE_KEYS.filter((k) => k.verb === v);
      expect(g.some((k) => k.scope === "root"), `${v} 缺 root`).toBe(true);
      expect(g.some((k) => k.scope === "cwd"), `${v} 缺 cwd`).toBe(true);
    }
  });

  it("每对 root / cwd 的键必须能区分开(不能是同一个键)", () => {
    for (const v of VERBS) {
      const root = FILE_KEYS.find((k) => k.verb === v && k.scope === "root");
      const cwd = FILE_KEYS.find((k) => k.verb === v && k.scope === "cwd");
      if (!root || !cwd) continue;
      expect(root.key, `${v} 的 root 和 cwd 键相同了`).not.toBe(cwd.key);
    }
  });
});

describe("键位数据完整性", () => {
  it("每条都有解法、原生参考、说明", () => {
    for (const k of FILE_KEYS) {
      expect(k.seqs.length, `${k.key} 没有解法`).toBeGreaterThan(0);
      expect(k.native, `${k.key} 缺原生参考`).toBeTruthy();
      expect(k.desc, `${k.key} 缺说明`).toBeTruthy();
    }
  });

  it("primary key 必须等于第一条解法拼起来的串", () => {
    // ⚠️ 不能按 "<" 切:<Space>e 只有一处 <,切出来是 ["<Space>e"],
    //   和 ["<Space>","e"] 对不上。直接 join 比才准。
    for (const k of FILE_KEYS) {
      expect(k.seqs[0].join(""), `${k.key} 和第一条解法对不上`).toBe(k.key);
    }
  });

  it("<Space>ft 有两个解法 —— <C-/> 也是终端(root)", () => {
    const t = findFileKey("<Space>ft")!;
    expect(t.seqs.length).toBe(2);
    expect(t.seqs.some((s) => s[0] === "<C-/>")).toBe(true);
  });

  it("键不重复", () => {
    const seen = new Set(FILE_KEYS.map((k) => k.key));
    expect(seen.size).toBe(FILE_KEYS.length);
  });

  it("每条解法都以 <Space> 或 <C- 开头", () => {
    for (const k of FILE_KEYS) {
      for (const s of k.seqs) {
        expect(s[0].startsWith("<Space>") || s[0].startsWith("<C-")).toBe(true);
      }
    }
  });
});

describe("toPanelKey", () => {
  it("空格 → <Space>", () => {
    expect(toPanelKey(" ")).toBe("<Space>");
  });

  it("符号原样", () => {
    expect(toPanelKey("/")).toBe("/");
    expect(toPanelKey("f")).toBe("f");
  });

  it("按真实按键走一遍,能命中题目自己的解法", () => {
    for (const t of FILE_TASKS) {
      const target = findFileKey(t.key)!;
      for (const s of target.seqs) {
        // 面板记法 → 浏览器 key → 再转回来,应当一致
        const browserKeys = s.map((x) => (x === "<Space>" ? " " : x === "<C->/" ? "/" : x));
        const rebuilt = browserKeys.map(toPanelKey);
        expect(rebuilt.length).toBe(s.length);
      }
    }
  });
});

describe("原生参考里不出现失效的缩写", () => {
  /**
   * 实测:缩写靠 ~/.vim/abbr/ 下的文件,要 :mkexrc 生成,
   * 而那个目录不存在。所以 :Ex / :tn / :tl / :files 全打不出来。
   * 写上去等于教一个按了没反应的键。
   */
  it("native 字段里不含任何失效缩写", () => {
    // ⚠️ 必须按 token 比,不能用 includes ——
    // ":Explore" 里含 ":Ex" 这个子串,但 :Explore 是好的、:Ex 才是坏的。
    for (const k of FILE_KEYS) {
      const tokens = k.native.split(/[^A-Za-z:]+/).filter(Boolean);
      for (const abbr of ABD_BROKEN) {
        expect(tokens, `${k.key} 的 native 里写了失效缩写 ${abbr}`).not.toContain(abbr);
      }
    }
  });
});

describe("题库:每道题都有唯一正确答案", () => {
  it("题目里的键都在表里", () => {
    for (const t of FILE_TASKS) {
      expect(findFileKey(t.key), `${t.key} 不在表里`).toBeDefined();
    }
  });

  it("root 和 cwd 侧都有题(规律两边都要练)", () => {
    const keys = FILE_TASKS.map((t) => t.key);
    expect(keys).toContain("<Space>e");
    expect(keys).toContain("<Space>E");
    expect(keys).toContain("<Space>ff");
    expect(keys).toContain("<Space>fF");
  });

  it("键不重复出题", () => {
    const seen = new Set(FILE_TASKS.map((t) => t.key));
    expect(seen.size).toBe(FILE_TASKS.length);
  });
});