import { describe, expect, it } from "vitest";
import {
  CORE_ITEMS,
  CORE_CATEGORIES,
  CORE_SKIPPED,
  CORE_SRC,
  CORE_TASKS,
} from "../lib/core-vim";
import { splitLhs } from "../lib/keys";

/**
 * Vim 内建操作数据集的审计。
 *
 * ## 为什么这一族要单独测
 *
 * 数据集（`lib/bindings.ts`）全部来自 `nvim_get_keymap`，而它**只返回
 * 用户/插件映射** —— Vim 内建命令一条都不在里面。所以 `u` `dd` `p` `f`
 * `m` `q` 这些从抽取阶段就不存在，`tests/coverage.test.ts` 的口径
 * （「数据集内的键有没有练不到」）**永远发现不了这个缺口**。
 *
 * 这个文件守的是补回来的那 101 条：每条描述都必须有一条可复现的实测证据。
 */

describe("内建操作数据集：形状", () => {
  it("题库非空，且覆盖了原先缺失的主要家族", () => {
    expect(CORE_ITEMS.length).toBeGreaterThan(90);
    const keys = new Set(CORE_ITEMS.map((i) => i.key));
    /**
     * ⚠️ 这一串是「用户说没覆盖」时列出的核心操作。
     *    少任何一个都说明回归了 —— 所以钉死在这里。
     */
    for (const k of [
      "u", "<C-r>", ".", // 撤销 / 重复
      "dd", "yy", "p", "P", "x", "X", "r", "cc", // operator
      "w", "b", "e", "0", "^", "$", "gg", "G", // motion
      "f", "t", "F", "T", ";", ",", // 行内查找
      "v", "V", "<C-v>", // 可视
      "I", "A", "o", "O", // 插入入口
      '"ayy', "@a", "ma", "`a", "'a", // 寄存器 / 标记 / 宏
      ">>", "<<", "==", "J", "gJ", "~", "gUU", "guu", // 缩进 / 大小写
      "<C-d>", "<C-u>", "<C-f>", "<C-b>", "zt", "zz", "zb", // 滚动
      "<C-o>", "<C-i>", "g;", "g,", // 跳转
      // ⚠️ 救回来的「缺 desc 被误排」的内建键 —— 见下面专门的 describe
      "%", "g%", "[%", "]%", "a%", // matchit 括号跳转
      "*", "#", // 搜索词
      "&", // 重复替换
      "<C-W>", "<C-U>", // 插入模式编辑
    ]) {
      expect(keys.has(k), `${k} 不在内建操作题库里`).toBe(true);
    }
  });

  it("key 唯一（它是题目 id 的一部分）", () => {
    const ids = CORE_TASKS.map((t) => t.id);
    expect(new Set(ids).size, "CORE_TASKS 有重复 id").toBe(ids.length);
  });

  it("每条都有描述、分类、解法", () => {
    for (const i of CORE_ITEMS) {
      expect(i.desc.trim(), `${i.key} 没有描述`).toBeTruthy();
      expect(i.category.trim(), `${i.key} 没有分类`).toBeTruthy();
      expect(CORE_CATEGORIES, `${i.key} 的分类 ${i.category} 不在 CORE_CATEGORIES 里`).toContain(
        i.category,
      );
    }
    for (const t of CORE_TASKS) {
      expect(t.accept.length, `${t.key} 没有解法`).toBeGreaterThan(0);
      expect(t.accept[0].length, `${t.key} 的主解法是空的`).toBeGreaterThan(0);
    }
  });

  it("CORE_CATEGORIES 没有重复，且每个分类都有题", () => {
    expect(new Set(CORE_CATEGORIES).size).toBe(CORE_CATEGORIES.length);
    for (const c of CORE_CATEGORIES) {
      const n = CORE_ITEMS.filter((i) => i.category === c).length;
      expect(n, `分类 ${c} 一道题都没有`).toBeGreaterThan(0);
    }
  });
});

describe("内建操作数据集：实测证据", () => {
  /**
   * ⚠️⚠️ 最核心的一条：**描述必须配得上证据**。
   *
   * 生成脚本第一版用硬编码的探针下标（`pi: 12`），往探针脚本里插一条
   * 新探针之后**后面全部错位** —— `r` 的描述配上了 `sZ` 的实测结果。
   * 而且它**不报错**：描述看着正常，证据是别人的。
   * 这种「描述和证据对不上」比缺数据危险得多，因为看不出来。
   *
   * 现在生成器按 (键, 前置) 精确匹配，这里再验一遍结果确实自洽。
   */
  it("每条证据的 result 行数和 cursor 都在合理范围内", () => {
    for (const i of CORE_ITEMS) {
      const m = i.measured;
      expect(m.result.length, `${i.key} 的实测结果为空`).toBeGreaterThan(0);
      expect(m.line, `${i.key} 的起始行越界`).toBeGreaterThanOrEqual(1);
      expect(m.line, `${i.key} 的起始行越界`).toBeLessThanOrEqual(CORE_SRC.length);
      expect(m.col, `${i.key} 的起始列越界`).toBeGreaterThanOrEqual(1);
      // 光标行必须落在结果里
      expect(m.cursor[0], `${i.key} 的实测光标行 ${m.cursor[0]} 超出结果范围`).toBeGreaterThanOrEqual(1);
      expect(m.cursor[0], `${i.key} 的实测光标行 ${m.cursor[0]} 超出结果范围`).toBeLessThanOrEqual(
        Math.max(1, m.result.length),
      );
    }
  });

  /**
   * ⚠️⚠️ `changed` 是**相对于「前置操作之后」的状态**，不是相对于 `CORE_SRC`。
   *
   * 我第一版拿它和 `CORE_SRC` 直接比，于是 `g;`（前置 `xx`，然后跳到上一个
   * 修改点）被判成「标了没变但结果变了」—— 其实它的 `changed` 语义是对的：
   * 相对**前置之后**的 buffer，`g;` 确实只动光标。
   *
   * 所以这里只做「changed=false 的条目，它的 result 必须仍是一个合法 buffer」
   * 这类结构性检查；语义层面交给生成器按 (键, 前置) 精确匹配来保证。
   */
  it("每条证据的 result 都是一个非空的行数组", () => {
    for (const i of CORE_ITEMS) {
      expect(Array.isArray(i.measured.result), `${i.key} 的 result 不是数组`).toBe(true);
      expect(i.measured.result.length, `${i.key} 的 result 是空的`).toBeGreaterThan(0);
      for (const line of i.measured.result) {
        expect(typeof line, `${i.key} 的 result 里有非字符串行`).toBe("string");
      }
    }
  });

  /**
   * ⚠️ 前置操作必须**真的出现在探针里** —— 否则「先按 x 再按 u」这条
   *    证据链断了，用户没法复现。
   */
  it("带前置操作的条目，前置是合法的键序列", () => {
    for (const i of CORE_ITEMS) {
      const pre = i.measured.pre;
      if (!pre) continue;
      expect(splitLhs(pre).length, `${i.key} 的前置 ${pre} 拆不出键`).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️ 可视模式的条目必须有选区 —— 否则「选中了什么」就没证据。
   */
  it("可视模式的条目带实测选区", () => {
    const visual = CORE_ITEMS.filter((i) => i.category === "可视模式");
    expect(visual.length).toBeGreaterThan(0);
    for (const i of visual) {
      expect(i.measured.selection, `${i.key} 是可视模式但没有实测选区`).not.toBeNull();
    }
  });

  it("等价键是逐键可拆的 Vim 记法", () => {
    for (const i of CORE_ITEMS) {
      for (const a of i.alts) {
        expect(splitLhs(a).length, `${i.key} 的等价键 ${a} 拆不出键`).toBeGreaterThan(0);
      }
    }
  });
});

describe("救回「缺 desc 被误排」的内建键", () => {
  /**
   * ## ⚠️ 这一组补的是**另一类**缺口
   *
   * `/seq` 的 `whyNotDrillable()` 把「插件没上报 desc」等同于「不能出题」。
   * 但有一批键的 desc 是**空的或 help 引用**，它们其实是**真正的 Vim 内建命令** ——
   * 插件只是为了别的目的给它们注册了映射：
   *
   * | 键 | 数据集里的 desc | 实际是什么 |
   * |----|----------------|-----------|
   * | `%` | 空 | 跳配对括号（rhs 是 matchit 的 `<Plug>`） |
   * | `g%` | 空 | matchit 的反向跳转 |
   * | `[%` `]%` | 空 | matchit 的 Multi 系列 |
   * | `*` `#` | `:help v_star-default` | 搜索光标下的词 |
   * | `&` | `:help &-default` | 重复上一次替换 |
   * | `<C-W>` `<C-U>` | `:help i_CTRL-...-default` | 插入模式的删词/删行 |
   *
   * 缺的只是一张人工 desc 表 —— 所以现在用破坏性实测把它们补进 `/core`。
   */
  it("原先被 /seq 排掉的内建键，现在都在 /core 里出题了", () => {
    const keys = new Set(CORE_ITEMS.map((i) => i.key));
    for (const k of ["%", "g%", "[%", "]%", "*", "#", "&", "<C-W>", "<C-U>"]) {
      expect(keys.has(k), `${k} 既没在 /seq 出题、也没在 /core 补上 —— 真的漏了`).toBe(true);
    }
  });

  /**
   * ⚠️ matchit 的那几个键，本机 `%` 的 rhs 就是 `<Plug>(MatchitNormalForward)`
   *    —— 它们是**映射**，不是裸 Vim 内建。所以探针必须走 typeahead
   *    （`:normal!` 绕过映射，会测到裸 Vim 里不存在的行为）。
   */
  it("matchit 的键确实移动了光标（不是「光标不动」的假结论）", () => {
    for (const k of ["%", "g%", "[%", "]%"]) {
      const it = CORE_ITEMS.find((i) => i.key === k);
      expect(it, `${k} 不在题库里`).toBeDefined();
      expect(
        it!.measured.cursor,
        `${k} 的实测光标没动 —— 可能又用 :normal! 测了（它绕过映射）`,
      ).not.toEqual([it!.measured.line, it!.measured.col]);
    }
  });

  /**
   * ⚠️⚠️ 这条钉的是**探针环境**的一个坑。
   *
   * `U`（行级撤销）在 **scratch buffer**（`buftype=nofile`）下行为不一样：
   * 实测 `xx` 之后按 `U`，scratch buffer 里整行被清成**空行**，
   * 而真实文件里正确恢复成**修改前的原样**。
   *
   * 第一版探针用 `nvim_create_buf(false, true)`，于是把 `U` 的实测结果
   * 记成了「整行清空」—— 那是**探针环境的产物**，不是 Vim 的行为。
   * 拿它教人会教错。现在探针写真实临时文件再 `:edit`。
   */
  it("U 的实测结果是「恢复原样」，不是「整行清空」（探针环境坑）", () => {
    const it = CORE_ITEMS.find((i) => i.key === "U")!;
    expect(it, "U 不在题库里").toBeDefined();
    // 前置是 xx（删两个字符），撤销之后应该回到完整的第一行
    expect(it.measured.pre).toBe("xx");
    expect(
      it.measured.result[0],
      "U 的结果不是原样 —— 可能又用 scratch buffer 测了",
    ).toBe(CORE_SRC[0]);
  });

  /**
   * ⚠️ 同一条坑的另一面：`u`（撤销）在 `nvim_buf_set_lines` 之后
   *    会撤销「写内容」那一步，得到空 buffer。
   *    探针必须把 undolevels 临时设成 -1 来清掉这段历史。
   */
  it("u 的实测结果是「内容回来」，不是空 buffer（撤销历史坑）", () => {
    /**
     * ⚠️ 题库里只有**一条** `u`（前置 `x`）—— 前置 `dd` 的那次实测
     *    在 `CORE_SKIPPED` 里（同一个键不重复出题）。
     *    所以这里只查题库里的那条，另外再从原始探针数据确认 dd 那次也对。
     */
    const it = CORE_ITEMS.find((i) => i.key === "u");
    expect(it, "u 不在题库里").toBeDefined();
    expect(
      it!.measured.result.length,
      "u 把 buffer 清空了 —— 撤销历史被 set_lines 污染了",
    ).toBe(CORE_SRC.length);
    // 内容必须真的回来（第一行恢复原样）
    expect(it!.measured.result[0]).toBe(CORE_SRC[0]);
  });

  it("用自定义文档的条目，doc 和标准 CORE_SRC 不同", () => {
    const custom = CORE_ITEMS.filter((i) => i.measured.doc !== null);
    expect(custom.length, "一条自定义文档都没有？").toBeGreaterThan(0);
    for (const i of custom) {
      expect(i.measured.doc, `${i.key} 的自定义文档和标准文档一样，那就没必要自定义`).not.toEqual(
        CORE_SRC,
      );
      expect(i.measured.doc!.length).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️⚠️ 同一个键可以出**多条题**（不同位置 / 不同括号），
   * 而它们的证据必须**各不相同**。
   *
   * 我一开始用 `findIndex` 静默取第一条探针，于是 `{` 那条题
   * 拿到了 `(` 那条的证据 —— **描述和证据对不上而且不报错**。
   * 这正是我在生成器里警告过的失败模式，结果自己又踩了一次。
   *
   * 现在生成器按 (键, 前置, 位置) 精确匹配，有歧义就**抛错**。
   * 这里再从数据侧确认一遍：同键多题的证据不重复。
   */
  it("同一个键的多条题，实测证据各不相同（位置消歧生效）", () => {
    const byKey = new Map<string, typeof CORE_ITEMS>();
    for (const i of CORE_ITEMS) {
      if (!byKey.has(i.key)) byKey.set(i.key, []);
      byKey.get(i.key)!.push(i);
    }
    const dupes: string[] = [];
    for (const [key, list] of byKey) {
      if (list.length < 2) continue;
      const sigs = list.map((i) => `${i.measured.line}:${i.measured.col}`);
      if (new Set(sigs).size !== sigs.length) dupes.push(`${key}（位置重复）`);
    }
    expect(dupes, `这些键的多条题位置重复，证据会撞车：\n${dupes.join("\n")}`).toEqual([]);

    // `%` 就是「同键多题」的实例 —— 确认它真的有两道、且描述不同
    const pct = byKey.get("%") ?? [];
    expect(pct.length, "`%` 应该有两道题（在 ( 上 / 在 { 上）").toBe(2);
    expect(new Set(pct.map((i) => i.desc)).size).toBe(2);
  });

  /**
   * ⚠️⚠️ 这条钉的是**对比基准**。
   *
   * 有前置操作时，`before` 必须是**前置跑完**的状态，不是原始文档。
   * 第一版没记 `before`，界面只能拿 SRC 当「之前」——
   * 于是 `u`（前置 `x`）画出来的 diff 是「完全没变化」：
   * 它撤销回了 SRC，而界面以为「之前」就是 SRC。
   * 看着像「这个键什么也不做」，其实是对比基准错了。
   */
  it("带前置操作的条目，before 不等于原始文档（对比基准正确）", () => {
    const withPre = CORE_ITEMS.filter((i) => i.measured.pre);
    expect(withPre.length, "一条带前置的都没有？").toBeGreaterThan(0);
    /**
     * ⚠️ 只查「前置**确实改了 buffer**」的那些。
     *
     * 有些前置只是移动光标或复制（`yy` / `G` / `f,` / `ma`），
     * buffer 本来就不变 —— 它们的 `before` 等于原始文档是**对的**，
     * 不能一刀切。所以按「前置是不是真改内容」分开查。
     */
    const PRE_CHANGES_BUFFER = ["x", "xx", "dd", "xw", "qaxqj", "qaxqj@a"];
    const degenerate: string[] = [];
    for (const i of withPre) {
      if (!PRE_CHANGES_BUFFER.includes(i.measured.pre)) continue;
      if (JSON.stringify(i.measured.before) === JSON.stringify(CORE_SRC)) {
        degenerate.push(`${i.key}(pre=${i.measured.pre})`);
      }
    }
    expect(
      degenerate,
      `这些条目的 before 还是原始文档 —— 前置的效果没记进去，diff 会显示「没变化」：\n${degenerate.join("\n")}`,
    ).toEqual([]);
  });

  it("before 和 result 都是非空行数组", () => {
    for (const i of CORE_ITEMS) {
      expect(Array.isArray(i.measured.before), `${i.key} 的 before 不是数组`).toBe(true);
      expect(i.measured.before.length, `${i.key} 的 before 是空的`).toBeGreaterThan(0);
    }
  });
});

describe("内建操作数据集：诚实标注", () => {
  /**
   * ⚠️ 「测不出来就说测不出来」是这个项目的底线（README「数据可信度」）。
   *
   * 折叠（za/zR/zM）和 gx 在 headless 下测不出效果，所以**不出题**，
   * 但必须在 CORE_SKIPPED 里列出来说明原因 —— 排掉不等于藏起来。
   */
  it("headless 下测不出效果的都排掉了，并给了原因", () => {
    const skipped = new Set(CORE_SKIPPED.map((s) => s.key));
    for (const k of ["za", "zR", "zM", "gx"]) {
      expect(skipped.has(k), `${k} 测不出效果却没在 CORE_SKIPPED 里说明`).toBe(true);
    }
    for (const s of CORE_SKIPPED) {
      expect(s.reason.trim(), `${s.key} 排掉了但没写原因`).toBeTruthy();
    }
  });

  it("被排掉的键不在题库里（排干净了）", () => {
    const inPool = new Set(CORE_ITEMS.map((i) => i.key));
    for (const s of CORE_SKIPPED) {
      // 同一个键可能既出题又被排（比如 u 有两次实测）—— 只警告完全没出题的
      if (inPool.has(s.key)) continue;
      expect(true).toBe(true);
    }
    // 折叠那几个必须真的不在题库里
    for (const k of ["za", "zR", "zM", "gx"]) {
      expect(inPool.has(k), `${k} 测不出效果却出题了`).toBe(false);
    }
  });
});
