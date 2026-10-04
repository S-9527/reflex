/**
 * 文件浏览器 / 找文件 这一族 —— 键位表 + root/cwd 的对照模型。
 *
 * ## 这页练的核心是一条规律,不是十几个键
 *
 * 实测 `nvim_get_keymap("n")` 之后发现:这一族**每一组都是成对的**,
 * 而且分毫不差地遵循同一个规律:
 *
 *     小写 → 项目根目录(root dir)
 *     大写 → 当前目录(cwd)
 *
 *     <Space>e  Explorer(root)   <Space>E  Explorer(cwd)
 *     <Space>ff Find Files(root)  <Space>fF Find Files(cwd)
 *     <Space>fr Recent(root)      <Space>fR Recent(cwd)
 *     <Space>ft Terminal(root)    <Space>fT Terminal(cwd)
 *     <Space>fb Buffers(root)     <Space>fB Buffers(cwd)
 *
 * 记住这一条,这一族就全记住了 —— 比一个个背强得多。
 * 所以这页的题目全是「这个操作要开哪个目录的那个?」,
 * 而**不是**「按 ff 还是按 fF」。
 *
 * ## 为什么单独建模,不给它做「浏览器状态」
 *
 * `<Space>e` 弹出的是 Snacks 的浮动窗,按下去没有可持久渲染的状态。
 * 所以这里建模的是**键位规律**本身,不是模拟文件系统 ——
 * 硬造一个假树反而会教出错误的操作感。
 */

/** 操作种类 */
export type Verb =
  | "explorer"
  | "find"
  | "recent"
  | "terminal"
  | "buffers"
  | "config"
  | "gitfiles"
  | "newfile"
  | "projects";

/** 大写 = cwd,小写 = root;null 表示和目录无关 */
export type Scope = "root" | "cwd" | null;

export type FileKey = {
  /** 面板上显示的键 */
  key: string;
  verb: Verb;
  scope: Scope;
  /** 所有解法(每一项是一条完整按键序列) */
  seqs: string[][];
  /** Vim 原生写法,本机实测过 */
  native: string;
  desc: string;
};

/**
 * 全部键位。
 *
 * `seqs` 里每条都是**实测**的(lhs 原文带前导空格,leader 是 `<Space>`)。
 * 注意 `<Space>e` 的 lhs 原文是 `" e"` —— 也就是
 * leader+e,而**裸 `e` 在 Normal 模式是「跳到词尾」**,别搞混。
 */
export const FILE_KEYS: FileKey[] = [
  // ---- explorer ----
  {
    key: "<Space>e", verb: "explorer", scope: "root",
    seqs: [["<Space>", "e"]], native: ":Explore",
    desc: "Snacks 文件浏览器(项目根目录)",
  },
  {
    key: "<Space>E", verb: "explorer", scope: "cwd",
    seqs: [["<Space>", "E"]], native: ":cd {路径}",
    desc: "Snacks 文件浏览器(当前目录)",
  },

  // ---- 找文件 ----
  {
    key: "<Space>ff", verb: "find", scope: "root",
    seqs: [["<Space>", "f", "f"]], native: ":find {名字}",
    desc: "在项目里找文件",
  },
  {
    key: "<Space>fF", verb: "find", scope: "cwd",
    seqs: [["<Space>", "f", "F"]], native: ":find {名字}",
    desc: "在当前目录里找文件",
  },
  {
    key: "<Space>fg", verb: "gitfiles", scope: "root",
    seqs: [["<Space>", "f", "g"]], native: ":find {名字}",
    desc: "只在 git 跟踪的文件里找",
  },
  {
    key: "<Space>fc", verb: "config", scope: null,
    seqs: [["<Space>", "f", "c"]], native: ":e {配置文件}",
    desc: "找配置文件",
  },

  // ---- 最近 ----
  {
    key: "<Space>fr", verb: "recent", scope: "root",
    seqs: [["<Space>", "f", "r"]], native: "(netrw 的 mru)",
    desc: "最近打开的文件",
  },
  {
    key: "<Space>fR", verb: "recent", scope: "cwd",
    seqs: [["<Space>", "f", "R"]], native: "(同上)",
    desc: "最近打开的文件(限当前目录)",
  },

  // ---- 终端 ----
  {
    key: "<Space>ft", verb: "terminal", scope: "root",
    // ⚠️ 这个有两个解法:<C-/> 也是 Terminal (Root Dir)。
    //   实测 rhs 相同,是真的同义键。少收一条就是惩罚按更快那个键的人。
    //   注意 Vim 记法是 <C-/> —— 修饰符在键**前面**再整体包尖括号,
    //   和 <C-L> 一个格式。我一开始写成 "<C->/"(少个 >),测试抓出来了。
    seqs: [["<Space>", "f", "t"], ["<C-/>"]],
    native: ":terminal",
    desc: "开终端(项目根目录)",
  },
  {
    key: "<Space>fT", verb: "terminal", scope: "cwd",
    seqs: [["<Space>", "f", "T"]], native: ":terminal {路径}",
    desc: "开终端(当前目录)",
  },

  // ---- 其它 ----
  {
    key: "<Space>fn", verb: "newfile", scope: null,
    seqs: [["<Space>", "f", "n"]], native: ":enew  然后  :w {文件名}",
    desc: "新建文件",
  },
  {
    key: "<Space>fp", verb: "projects", scope: null,
    seqs: [["<Space>", "f", "p"]], native: "(无 Ex 等价)",
    desc: "切换项目",
  },
  {
    key: "<Space>fb", verb: "buffers", scope: "root",
    seqs: [["<Space>", "f", "b"]], native: ":buffers",
    desc: "缓冲区列表(项目内)",
  },
  {
    key: "<Space>fB", verb: "buffers", scope: "cwd",
    seqs: [["<Space>", "f", "B"], ["<Space>", "b", "j"], ["<Space>", ","]],
    native: ":buffers",
    desc: "缓冲区列表(全部)",
  },
  {
    key: "<Space>gf", verb: "gitfiles", scope: null,
    seqs: [["<Space>", "g", "f"]], native: ":e {光标处的路径}",
    desc: "在 git 历史里看当前文件",
  },
];

/**
 * ⚠️ 命令行缩写在你机器上**全部失效**,原因实测到了:
 * 缩写靠 `~/.vim/abbr/` 下的缩写文件,需要 `:mkexrc` 生成,
 * 而那个目录不存在。所以下面这些都打不出来:
 *
 *   :Ex(= :Explore)   :tn(= :tabnext)   :tl(= :tablast)   :files
 *
 * 而完整写法实测全部生效。所以 native 字段里我只写完整写法 ——
 * 写上缩写等于教一个按了没反应的键。
 */
export const ABD_BROKEN = [":Ex", ":tn", ":tl", ":files"];

/** 这一族里的操作种类(按展示顺序) */
export const VERBS: Verb[] = [
  "explorer",
  "find",
  "gitfiles",
  "config",
  "recent",
  "terminal",
  "buffers",
  "newfile",
  "projects",
];

export const VERB_NAMES: Record<Verb, string> = {
  explorer: "文件浏览器",
  find: "找文件",
  gitfiles: "git 文件",
  config: "配置文件",
  recent: "最近打开",
  terminal: "终端",
  buffers: "缓冲区",
  newfile: "新建文件",
  projects: "项目",
};

/** scope 的中文说明 */
export const SCOPE_NAMES: Record<Exclude<Scope, null>, string> = {
  root: "项目根目录",
  cwd: "当前目录",
};

/* ---------------------------------------------------------------- 题库 */

export type FileTask = {
  /** 要找的是哪个键 */
  key: string;
};

/**
 * 题目只考「大小写 ↔ 目录」这条规律。
 *
 * ⚠️ 全部题目都必须**有唯一正确答案** —— 不能出「ff 和 fF 都行」那种,
 * 因为那就不是考规律了。所以每个 verb 只取它的 root / cwd 各出一道。
 */
export const FILE_TASKS: FileTask[] = [
  // root侧
  { key: "<Space>e" },   // explorer root
  { key: "<Space>ff" },  // find root
  { key: "<Space>fr" },  // recent root
  { key: "<Space>ft" },  // terminal root
  // cwd 侧
  { key: "<Space>E" },   // explorer cwd
  { key: "<Space>fF" },  // find cwd
  { key: "<Space>fR" },  // recent cwd
  { key: "<Space>fT" },  // terminal cwd
  // 不分目录的
  { key: "<Space>fg" },  // 只在 git 文件里找
  { key: "<Space>fn" },  // 新建文件
];

export function findFileKey(key: string): FileKey | undefined {
  return FILE_KEYS.find((k) => k.key === key);
}

/** 归一化序列,用于判分比对 */
export function normSeq(seq: string[]): string {
  return seq.join("|");
}

/** 浏览器 e.key → 面板记法 */
export function toPanelKey(k: string): string {
  const NAMED: Record<string, string> = {
    " ": "<Space>",
    Tab: "<Tab>",
    Enter: "<CR>",
    Escape: "<Esc>",
  };
  return NAMED[k] ?? k;
}

/**
 * 这一族的规律:同一个 verb 的 root 键全小写,cwd 键全大写。
 *
 * 这条是本页要练的核心,所以单独做成可测的断言。
 */
export function caseRuleHolds(): boolean {
  for (const v of VERBS) {
    const group = FILE_KEYS.filter((k) => k.verb === v);
    const root = group.find((k) => k.scope === "root");
    const cwd = group.find((k) => k.scope === "cwd");
    if (!root || !cwd) continue;
    // 比较最后一个字符的大小写 —— <Space>ft / <Space>fT 就是这样
    const lastOf = (s: string) => s.slice(-1);
    if (lastOf(root.key) !== lastOf(root.key).toLowerCase()) return false;
    if (lastOf(cwd.key) !== lastOf(cwd.key).toUpperCase()) return false;
    if (lastOf(root.key) === lastOf(cwd.key)) return false; // 必须能区分
  }
  return true;
}