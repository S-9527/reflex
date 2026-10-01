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
    // 可打印字符。真实浏览器在按住 Shift 时已经把 key 变成大写,
    // 但仍要自己抬一手:万一收到 "w"+shiftKey,也得还原成 W。
    // 用户只看得见字符,不该让他看到 "shift-w"。
    const ch = e.shiftKey ? e.key.toUpperCase() : e.key;
    // 修饰键在尖括号**外面** <C-a> / <M-a>
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

/** 把 "<Space>ff" 这样的展示串拆成逐键数组,供匹配器建前缀树。 */
export function splitLhs(lhs: string): string[] {
  // 先摘出所有 <...> 记号
  const out: string[] = [];
  const rest = lhs.replace(/<[^<>]+>/g, (m) => {
    out.push(m);
    return "";
  });
  // 剩下的都是单个字符
  for (const c of rest) out.push(c);
  return out;
}

/** 便于展示:按键数组 → "<Space>ff" */
export function formatKeys(keys: string[]): string {
  return keys.join("");
}
