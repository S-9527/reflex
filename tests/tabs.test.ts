import { describe, it, expect } from "vitest";
import {
  initial,
  count,
  current,
  newTab,
  closeTab,
  closeOtherTabs,
  nextTab,
  prevTab,
  firstTab,
  lastTab,
  goTo,
  stateFrom,
  applyTabKey,
  TAB_TASKS,
  type TabState,
} from "../lib/tabs";

/** 造一个 n 个 tab、当前在 cur 的状态 */
const st = (n: number, cur = 0): TabState => stateFrom({ key: "", desc: "", tabs: n, curIndex: cur });

describe("initial", () => {
  it("一个标签页,一个窗口", () => {
    const s = initial();
    expect(count(s)).toBe(1);
    expect(current(s)!.wins).toBe(1);
  });
});

describe("newTab", () => {
  it("在当前后面插入,当前移到新的上面", () => {
    const s = newTab(st(2, 0))!;
    expect(count(s)).toBe(2 + 1);
    expect(s.cur).toBe(1);
  });

  it("⚠️ 窗口数跟当前 tab 一样 —— Vim 的 :tab split 会带上当前窗口", () => {
    const s = st(1, 0);
    s.tabs[0].wins = 3;
    expect(newTab(s)!.tabs[s.cur].wins).toBe(3);
  });
});

describe("closeTab", () => {
  it("关掉当前的,当前落到**右边**那个", () => {
    const s = closeTab(st(3, 1))!;
    expect(count(s)).toBe(2);
    expect(s.cur).toBe(1); // 原来 index 2 的那个现在成了 index 1
  });

  it("⚠️ 删掉前面的 tab 后,当前 tab 的下标会前移", () => {
    // cur=0 是第一个,关掉它之后原来 index 1 的成了 index 0
    const s = closeTab(st(2, 0))!;
    expect(s.cur).toBe(0);
    expect(current(s)!.id).toBe(2);
  });

  it("⚠️ 关到最后一个会被拒绝(Vim 行为)", () => {
    expect(closeTab(st(1, 0))).toBeNull();
  });

  it("关掉最后一个但不止一个时是允许的", () => {
    expect(closeTab(st(2, 1))).not.toBeNull();
  });
});

describe("closeOtherTabs", () => {
  it("只留当前", () => {
    const s = closeOtherTabs(st(4, 1))!;
    expect(count(s)).toBe(1);
    expect(s.cur).toBe(0);
  });

  it("⚠️ 当前 tab 没被删,但它的下标会前移 —— 得按 id 重算", () => {
    // 这就是实现里踩的坑:沿用旧 cur=1 会指向不存在的槽位
    const s = closeOtherTabs(st(4, 2))!;
    expect(count(s)).toBe(1);
    expect(s.cur).toBe(0);
    expect(current(s)!.id).toBe(3); // 保住的是原来 index 2 那个
  });
});

describe("nextTab / prevTab —— 到头就停,不环绕", () => {
  it("下一个", () => {
    expect(nextTab(st(3, 0))!.cur).toBe(1);
  });

  it("⚠️ 最后一个再按下一个不动(和 buffer 的轮换不同!)", () => {
    expect(nextTab(st(3, 2))).toBeNull();
  });

  it("第一个再按上一个不动", () => {
    expect(prevTab(st(3, 0))).toBeNull();
  });

  it("⚠️ 对照:buffer 的轮换是会环绕的", () => {
    // 这是两个容易记混的点,这里只标注,不重复测 bufs.ts 的内容
    expect(nextTab(st(3, 2))).toBeNull();
  });
});

describe("firstTab / lastTab", () => {
  it("跳到第一个", () => {
    expect(firstTab(st(3, 2))!.cur).toBe(0);
  });

  it("跳到最后一个", () => {
    expect(lastTab(st(3, 0))!.cur).toBe(2);
  });

  it("已经在第一个时不动", () => {
    expect(firstTab(st(3, 0))).toBeNull();
  });
});

describe("goTo", () => {
  it("跳到指定下标", () => {
    expect(goTo(st(3, 0), 2)!.cur).toBe(2);
  });

  it("越界返回 null", () => {
    expect(goTo(st(3, 0), 5)).toBeNull();
    expect(goTo(st(3, 0), -1)).toBeNull();
  });
});

describe("每道题都可解", () => {
  for (const t of TAB_TASKS) {
    it(`「${t.key}」(${t.desc})按了必须有效果`, () => {
      const before = stateFrom(t);
      const after = applyTabKey(t.key, before);
      expect(after, `按 ${t.key} 返回 null —— 页面无反应`).not.toBeNull();
      const changed = after!.cur !== before.cur || after!.tabs.length !== before.tabs.length;
      expect(changed, `${t.key} 按了但状态没变`).toBe(true);
    });
  }
});

describe("题库前提合法性", () => {
  it("关标签页的题至少要 2 个 tab(最后一个不能关)", () => {
    for (const t of TAB_TASKS) {
      if (t.key === "<Tab>d" || t.key === "<Tab>o") {
        expect(t.tabs, `${t.key} 起始 tab 太少`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("跳转类的题,当前不在目标位置", () => {
    const next = TAB_TASKS.find((t) => t.key === "<Tab>]")!;
    expect(next.curIndex).toBeLessThan(next.tabs - 1);
    const prev = TAB_TASKS.find((t) => t.key === "<Tab>[")!;
    expect(prev.curIndex).toBeGreaterThan(0);
    const first = TAB_TASKS.find((t) => t.key === "<Tab>f")!;
    expect(first.curIndex).toBeGreaterThan(0);
    const last = TAB_TASKS.find((t) => t.key === "<Tab>l")!;
    expect(last.curIndex).toBeLessThan(last.tabs - 1);
  });
});