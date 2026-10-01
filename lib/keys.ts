/**
 * KeyboardEvent → Vim 记法 的归一化。
 *
 * ## 为什么这个文件最容易出错
 *
 * 整个应用的地基。归一化错了,匹配器全错,而且错得很隐蔽:
 * `<Space>ff` 被记成 `<Space>Space>f`,界面上显示"你按了 <Space>Space>f",
 * 用户根本看不出来哪里不对。所以规则全部集中在这里,并且有单测。
 *
 * ## 归一化的两条铁律
 *
 * 1. **只用 `event.key`,不用 `event.code`。** `code` 是物理键位(跟布局走),
 *    `key` 是字符(跟布局走但已经过修饰键处理)。我们要的是"用户以为按了什么",
 *    所以用 `key`。代价:非美式布局下 `,` 和 `<` 之类可能反直觉。
 * 2. **修饰键顺序固定 `<C-a-M>`,先 Ctrl 再 Alt。** Vim 记法就是这个顺序。
 */

/** Vim 模式。刻意不含 `r`(Replace)和 `t`(Terminal)—— 用户日常不在这两个模式工作。 */
export type Mode = "n" | "i" | "v" | "x" | "o" | "c" | "s";

/** 一个归一化后的按键。 */
export type VimKey = {
  /** Vim 记法,如 `<C-w>` `W` `<Esc>` `j` */
  vim: string;
  /** 归一化用的小写可打印字符(用于前缀树查找)。非可打印键为 null */
  ch: string | null;
  /** 归一化用的大写可打印字符。用于区分 `l` / `L` */
  chUpper: string | null;
};

const NAMED: Record<string, string> = {
  " ": "<Space>",
  Escape: "<Esc>",
  Enter: "<CR>",
  Tab: "<Tab>",
  Backspace: "<BS>",
  Delete: "<Del>",
  Insert: "<IC>",
  Home: "<Home>",
  End: "<End>",
  PageUp: "<PageUp>",
  PageDown: "<PageDown>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
};

/**
 * 归一化一个 KeyboardEvent。
 *
 * @returns Vim 记法;若该键不该被采集(如单独的 Ctrl)返回 null
 */
export function normalize(e: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): VimKey | null {
  // 纯修饰键本身:按 Ctrl 不应该算作一次输入
  if (["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock"].includes(e.key)) {
    return null;
  }

  const named = NAMED[e.key];
  // 修饰键前缀。先收集,最后一次性拼 —— 否则会出现 <M-<C-a>> 这种嵌套尖括号
  const mod: string[] = [];
  if (e.ctrlKey) mod.push("C-");
  if (e.altKey) mod.push("M-");
  const modPrefix = mod.join("");

  let core: string;
  let lookupCh: string | null = null;

  if (named) {
    // 特殊键:记号本身是尖括号,修饰键要放在尖括号**里面**
    // <Space> + Ctrl → <C-Space>   <Esc> + Alt → <M-Esc>
    core = `<${modPrefix}${named.slice(1, -1)}>`;
    // <Space> 必须能作为前缀被查到,所以给它一个哨兵字符。
    // 哨兵没有大小写之分,chUpper 留 null(留给匹配器跳过双查)。
    if (e.key === " ") return { vim: core, ch: "␣", chUpper: null };
  } else if (e.key.length === 1) {
    // 可打印字符。
    //
    // ⚠️ 关键:带修饰键时,字母**一律大写**。
    //
    // 实测(真实 Playwright 按键,不是合成事件):
    //   按 Ctrl+H → KeyboardEvent.key = "h"  ctrl=true  shift=false
    //   按 Ctrl+J → KeyboardEvent.key = "j"  ctrl=true  shift=false
    //
    // 而 Vim 记法约定修饰键后是大写:`<C-H>` `<C-J>` `<C-S>`。
    // 不抬这一手,归一化会产出 `<C-h>`,和数据集里的 `<C-H>` 永远对不上 ——
    // 实测踩到:第 1 关 4 条窗口导航键全部无法完成。
    //
    // 注意这和 Shift 的处理是两件事:
    //   Shift+H → key 已经是 "H"(浏览器行为),我们只兜底不抬
    //   Ctrl+H  → key 是 "h",但 Vim 记法要 "H",必须抬
    const ch = e.shiftKey || modPrefix ? e.key.toUpperCase() : e.key;
    core = modPrefix ? `<${modPrefix}${ch}>` : ch;
    lookupCh = ch;
  } else {
    // F1~F12 之类
    core = `<${modPrefix}${e.key}>`;
  }

  return {
    vim: core,
    ch: lookupCh,
    chUpper: lookupCh ? lookupCh.toUpperCase() : null,
  };
}

/**
 * 把 "<Space>ff" 这样的展示串拆成逐键数组,供匹配器建前缀树。
 *
 * ⚠️ 必须逐字符扫描,不能用 `<[^<>]+>` 一次性 replace。
 * 原因:数据里存在 `[<C-L>` 这种「单字符 + 尖括号记号」混合的 lhs
 * (LazyVim 把它映射到 :lpfile)。用正则 replace 会把整个 `[<C-L>`
 * 当成不可拆的整体,keys 长度算成 1,判分时按单键匹配,永远匹配不上。
 * 实测踩过:第一键集合里凭空多出一个 `<C-T>`。
 */
export function splitLhs(lhs: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lhs.length) {
    if (lhs[i] === "<") {
      const end = lhs.indexOf(">", i);
      if (end > i) {
        out.push(lhs.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    // 单个字符(可能是 [ ] < 等)
    out.push(lhs[i]);
    i++;
  }
  return out;
}

/** 便于展示:按键数组 → "<Space>ff" */
export function formatKeys(keys: string[]): string {
  return keys.join("");
}

/**
 * 这个键要不要被训练器接管?
 *
 * ## 为什么要有这个函数
 *
 * 实测踩过:原来在 keydown handler 里**无条件** `preventDefault()`,
 * 结果按 Tab 焦点被劫持、Ctrl+R 刷新被拦、F12 开发工具被拦。
 * 而这些键数据集里根本没有 —— 也就是说用户按它们只会得到一次"判错",
 * 顺便还丢了浏览器快捷键。
 *
 * 判据:**归一化后如果能作为某条绑定的前缀,就接管;否则一律放行。**
 * 这样既不劫持焦点(F5 不在数据集里 → 放行),也不会漏拦
 * Ctrl+W(它在数据集里 → 接管,关不掉标签页)。
 *
 * ## 唯一的取舍:<Tab>
 *
 * 数据集里有一条 <Tab>(snippet 跳转),所以拦它才能练那个键,
 * 代价是**键盘焦点导航不可用**。想用 Tab 导航,把 <Tab> 从
 * firstKeySet 里去掉(见 excludeFirstKeys)。
 */
export function shouldIntercept(vimKey: string, prefixSet: Set<string>): boolean {
  if (prefixSet.size === 0) return false;
  return prefixSet.has(vimKey);
}

/**
 * 窗口导航方向:本机 LazyVim 只有 `<C-H/J/K/L>`。
 *
 * ## 实测依据(不是查文档)
 *
 * 本机 `nvim_get_keymap("n")` 的真实映射:
 *
 * | 显示键| 实际 lhs |右值         | desc|
 * |--------|----------|-------------|------|
 * | `<Space>|` | `\|`| `<C-W>v`   | Split Window Right |
 * | `<Space>-` | `-`  | `<C-W>s`   | Split Window Below |
 * | `<Space>wd`| `wd` | `<C-W>c`   | Delete Window |
 * | `<C-H>`| `<C-H>` | `<C-W>h`   | Go to Left Window |
 * | `<C-J>`| `<C-J>` | `<C-W>j`   | Go to Lower Window |
 * | `<C-K>`| `<C-K>` | `<C-W>k`   | Go to Upper Window |
 * | `<C-L>`| `<C-L>` | `<C-W>l`   | Go to Right Window |
 *
 * ## ⚠️ 裸 `hjkl` 不跳窗口,方向键也不跳
 *
 * 实测Normal 模式下`h` / `l` **没有任何映射**,`j` / `k` 只是 Vim 内建的光标移动
 * (`j`→Down、`k`→Up),方向键同理。
 *
 * 之前 `/windows` 两个页面都把裸 `hjkl` 和方向键当窗口导航收下,这是**错的**:
 * 在这里练会形成错误的肌肉记忆 —— 回到真nvim 里按 `hjkl` 只会移动光标。
 * 这类"善意地多收几个键"是训练器最危险的 bug:它让练习比真实更宽松,
 * 通过率好看,但练的东西用不上。
 *
 * 截图里的 `+windows` hydra 里确实有`h/j/k/l`,容易误导 ——
 * 那是 which-key **hydra 内部**的映射(先按 `<Space><Space>` 进入),
 * Normal 模式下并没有。
 *
 * ## `<C-H>` 的坑
 *
 * 实测 Playwright / Chromium:按 Ctrl+H → `key === "h"`, `ctrlKey === true`,
 * 所以用 `key.toUpperCase()` 就能拿到 "H"。
 * 另外 `Ctrl-H` 和 `Backspace` 是**同一个字节 0x08**,部分浏览器会报
 * `Backspace`,所以一并收下(数据集中窗口导航只有 `<C-H>`,不会误伤别的东西)。
 */
export function windowNavDir(e: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): "h" | "j" | "k" | "l" | null {
  // 只有 Ctrl 才是窗口导航。裸 hjkl / 方向键一律不管,见上面的说明。
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === "Backspace") return "h";
  const k = e.key.length === 1 ? e.key.toUpperCase() : "";
  if (k === "H") return "h";
  if (k === "J") return "j";
  if (k === "K") return "k";
  if (k === "L") return "l";
  return null;
}

/** 从接管集里排除某些键 —— 用户按自己的习惯排除,比如为了保留 Tab 导航 */
export function excludeFirstKeys(bindings: { keys: string[] }[], exclude: string[]): Set<string> {
  const ban = new Set(exclude);
  const s = new Set<string>();
  for (const b of bindings) {
    if (b.keys.length === 0) continue;
    if (ban.has(b.keys[0])) continue;
    s.add(b.keys[0]);
  }
  return s;
}

/**
 * 从数据集里算出「所有可能的第一键」集合。
 *
 * 只收单键形式的多键序列的第一键,以及本身就是单键的绑定。
 * 用 `vim` 记法原文作键,所以 `<Space>`、`<C-H>`、`<Esc>` 都在内。
 */
export function firstKeySet(bindings: { keys: string[] }[]): Set<string> {
  const s = new Set<string>();
  for (const b of bindings) {
    if (b.keys.length === 0) continue;
    s.add(b.keys[0]);
  }
  return s;
}
