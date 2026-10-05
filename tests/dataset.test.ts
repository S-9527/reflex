import { describe, it, expect } from "vitest";
import { RAW, COMMANDS, GROUPS } from "../lib/bindings";
import { splitLhs } from "../lib/keys";

/**
 * 数据集的护栏。
 *
 * ## ⚠️ 这一版测的东西和旧版完全不同
 *
 * 旧版测「关卡分级」—— 第 1 关要有窗口闭环、降级名单要生效之类。
 * 但那个 level 是 `build-dataset.mjs` 里**手写前缀规则猜的**,
 * 和 which-key 的真实分组无关。实测下来它把「窗口」放第 1 关(其实只有 2 条),
 * 而真实最大的两组 search(40 条)和 goto(30 条)被埋在中间。
 *
 * 关卡概念整个删掉了,所以这些测试换成:
 *   1. 分组来自 which-key(而不是猜的)
 *   2. 按命令聚合的正确性(best / alternates / native)
 *   3. 数据完整性(id 唯一、键能展开、无空描述)
 */

describe("分组来自 which-key", () => {
  it("每个分组都有中文名(否则 UI 上显示英文 key)", () => {
    for (const b of RAW) {
      expect(GROUPS[b.group], `${b.display} 的分组 ${b.group} 没有名字`).toBeDefined();
    }
  });

  it("主要分组确实是 which-key 里那些", () => {
    // 这些名字直接来自 LazyVim 的 `group = "..."`,不是我们编的
    for (const g of ["buffer", "search", "git", "file/find", "ui"]) {
      expect(GROUPS[g], `缺分组 ${g}`).toBeDefined();
    }
  });

  it("归到 which-key 分组的键占多数", () => {
    // 未归组的是顶层裸键、Vim 内建键、Insert 模式键 —— 它们本来就没有分组。
    // 但如果这个比例掉下去,说明分组抽取坏了。
    const inWk = RAW.filter((b) => b.inWhichKey).length;
    expect(inWk / RAW.length, `只有 ${inWk}/${RAW.length} 条落在 which-key 分组里`).toBeGreaterThan(0.4);
  });

  it("窗口分组的键确实在做窗口的事", () => {
    const win = RAW.filter((b) => b.group === "windows" || b.group === "window");
    for (const b of win) {
      expect(
        /Window|Split|Move|Zoom/.test(b.desc),
        `${b.display} 在窗口分组里但描述是「${b.desc}」`,
      ).toBe(true);
    }
  });
});

describe("按命令聚合", () => {
  it("每道题都有最优解和描述", () => {
    for (const c of COMMANDS) {
      expect(c.display, `题目 ${c.id} 没有最优解`).toBeTruthy();
      expect(c.id, `题目 ${c.display} 没有 id`).toBeTruthy();
    }
  });

  it("id 唯一(它是进度存储的键,撞了会串进度)", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size, "有重复 id").toBe(ids.length);
  });

  it("次解里不含最优解自己", () => {
    for (const c of COMMANDS) {
      expect(c.alternates, `${c.display} 把自己列成了次解`).not.toContain(c.display);
    }
  });

  it("次解内部不重复", () => {
    // 同一命令在 n/v/x 各注册一条,去重没做干净就会重复
    for (const c of COMMANDS) {
      expect(new Set(c.alternates).size, `${c.display} 的次解有重复`).toBe(c.alternates.length);
    }
  });

  it("total 等于 1 + 次解数", () => {
    for (const c of COMMANDS) {
      expect(c.total, `${c.display} 的 total 对不上`).toBe(1 + c.alternates.length);
    }
  });

  it("有 rhs 的多解按 rhs 判定(严格)", () => {
    // rhs 相同 = 底层同一条命令,这是最可信的等价判据
    const byRhs = COMMANDS.filter((c) => c.equivBy === "rhs" && c.total > 1);
    expect(byRhs.length, "按 rhs 聚合出的多解一道都没有,判据可能坏了").toBeGreaterThan(0);
  });

  /**
   * ⚠️ 这条是回归测试。
   *
   * 旧手写表把 `<Space>bb` 当成 `L` 的等价解,但它们的 rhs 不同:
   *   L          → <Cmd>BufferLineCycleNext<CR>
   *   <Space>bb  → <Cmd>e #<CR>
   * 是两条不同的命令。而 `<Space>bb` 真正的等价解是 `` ` ``。
   */
  it("L 的次解是 ]b,不是 <Space>bb(旧手写表在这错过)", () => {
    const L = COMMANDS.find((c) => c.display === "L" && c.equivBy === "rhs");
    expect(L, "找不到 L 这道题").toBeDefined();
    expect(L!.alternates).toContain("]b");
    expect(L!.alternates, "L 和 <Space>bb 是两条不同的命令").not.toContain("<Space>bb");
  });

  it("<Space>bb 的等价解是 <Space>`(都是 :e #)", () => {
    const sw = COMMANDS.find((c) => c.alternates.includes("<Space>bb") || c.display === "<Space>bb");
    expect(sw, "找不到 <Space>bb 所属的命令").toBeDefined();
    const all = [sw!.display, ...sw!.alternates];
    // ⚠️ 数据里的写法带 leader 前缀,是 "<Space>`" 不是裸 "`"
    expect(all).toContain("<Space>`");
    expect(sw!.equivBy, "这两个的 rhs 都是 <Cmd>e #<CR>,该按 rhs 判").toBe("rhs");
  });

  it("j/<Down> 和 k/<Up> 被认出是等价(旧手写表完全漏了这两组)", () => {
    const j = COMMANDS.find((c) => c.display === "j" || c.alternates.includes("j"));
    const k = COMMANDS.find((c) => c.display === "k" || c.alternates.includes("k"));
    expect(j, "找不到 j 所属的命令").toBeDefined();
    expect(k, "找不到 k 所属的命令").toBeDefined();
    expect([j!.display, ...j!.alternates]).toContain("<Down>");
    expect([k!.display, ...k!.alternates]).toContain("<Up>");
  });
});

describe("原生 Ex 等价", () => {
  it("标了 verified 的都有具体命令", () => {
    for (const c of COMMANDS) {
      if (c.nativeVerified === true) {
        expect(c.native, `${c.display} 标了已核实却没有命令`).toBeTruthy();
        expect(c.native!.startsWith(":"), `${c.display} 的原生等价「${c.native}」不是 Ex 命令`).toBe(true);
      }
    }
  });

  it("原生等价不会指向自己(那等于没给)", () => {
    for (const c of COMMANDS) {
      if (c.native) expect(c.native).not.toBe(c.display);
    }
  });
});

describe("数据完整性", () => {
  it("每条键都能展开成逐键序列", () => {
    for (const b of RAW) {
      const keys = splitLhs(b.display);
      expect(keys.length, `${b.display} 展开成 0 个键`).toBeGreaterThan(0);
      expect(keys.join(""), `${b.display} 展开后拼不回原串`).toBe(b.display);
    }
  });

  it("每条键都有 id、display、group", () => {
    for (const b of RAW) {
      expect(b.id).toBeTruthy();
      expect(b.display).toBeTruthy();
      expect(b.group).toBeTruthy();
    }
  });

  it("有 rhs 的键不该被标成 lua", () => {
    for (const b of RAW) {
      if (b.rhs) expect(b.lua, `${b.display} 有 rhs 却标成 lua`).toBe(false);
    }
  });

  it("键位条数在预期范围内(防止抽取脚本坏掉后静默变少)", () => {
    expect(RAW.length).toBeGreaterThan(300);
  });
});
