/**
 * 板块注册表 —— 首页和 `/stats` 共用的**唯一一份**板块定义。
 *
 * ## ⚠️ 为什么必须抽出来
 *
 * 原来板块清单硬编码在 `app/page.tsx` 的 `BOARDS` 数组里，
 * 而 `/stats` 按 which-key 分组统计 —— **两套分类法**，数字对不上：
 *
 * ```
 * 首页      「缓冲区 1/13」     （按板块，分母是题库长度）
 * /stats    「缓冲区 1/10」     （按 which-key 分组）
 * ```
 *
 * 同一个「缓冲区」两处两个数，而且**都不报错**。
 *
 * 现在板块定义只有这一份，首页和 `/stats` 都从这里读 ——
 * 加板块也只改一处。
 *
 * ## 分母为什么用「题库长度」
 *
 * 各板块的题库长度是**用户实际要练的题数**（`BUF_TASKS.length` 等），
 * 比 which-key 分组数更贴近「我还差多少」。而 which-key 分组
 * 在 `/stats` 里作为**数据集视角**单独展示 —— 两个维度都保留，
 * 但各自说清楚是什么。
 */

import { TASKS as WIN_TASKS } from "./winkeys";
import { BUF_TASKS } from "./bufs";
import { TAB_TASKS } from "./tabs";
import { FILE_TASKS } from "./files";
import { SPEC } from "./textobj";
import { UI_TOGGLES } from "./ui-toggles";
import { DIAG_KEYS } from "./diagnostics";
import { COMMANDS } from "./bindings";

export type Board = {
  /** 板块 id —— 也是 `lib/srs.ts` 里 `Item.board` 的值 */
  id: string;
  href: string;
  name: string;
  /** 一句话说明在练什么（首页显示） */
  what: string;
  /** 题库条数（用户实际要练的题数） */
  total: number;
  /**
   * 对应的 which-key 分组（能对上的那些）。
   *
   * `null` = 这个板块的键没有 which-key 分组（文本对象是 Vim 内建、
   * hydra 面板键只在面板里存在），所以 `/stats` 的分组视图覆盖不到它。
   */
  group: string | null;
};

export const BOARDS: Board[] = [
  {
    id: "windows-hydra",
    href: "/windows",
    name: "窗口",
    what: "分屏、切分、缩放、跳焦点。这一族练的是 <Space>w 面板里的反射",
    total: WIN_TASKS.length,
    // ⚠️ hydra 面板键大多不是全局 keymap，所以分组里只有 2 条
    group: "windows",
  },
  {
    id: "buffers",
    href: "/buffers",
    name: "缓冲区",
    what: "buffer 带子上的删/移/标，<Space>b 那一族",
    total: BUF_TASKS.length,
    group: "buffer",
  },
  {
    id: "tabs",
    href: "/tabs",
    name: "标签页",
    what: "<Tab> 那一族。注意它关的是整个标签页，不是单个 buffer",
    total: TAB_TASKS.length,
    // ⚠️ tab 键的 group 落在 leader-misc 兜底桶里，没有独立分组
    group: null,
  },
  {
    id: "files",
    href: "/files",
    name: "文件浏览器",
    what: "只记一条规律：小写 = 项目根目录，大写 = 当前目录",
    total: FILE_TASKS.length,
    group: "file/find",
  },
  {
    id: "text",
    href: "/text",
    name: "文本对象",
    what: "diw daw ip i( …。核心是 inner 带不带边缘空白",
    total: SPEC.filter((s) => s.measured).length,
    // ⚠️ 文本对象是 Vim 内建，不在 nvim_get_keymap 的映射表里
    group: null,
  },
  {
    id: "ui",
    href: "/ui",
    name: "界面开关",
    what: "<Space>u 那一族。记号大小写很密，边按边看画面怎么变",
    total: UI_TOGGLES.length,
    group: "ui",
  },
  {
    id: "diagnostics",
    href: "/diag",
    name: "诊断与 LSP",
    what: "[d ]d 在诊断间移动，加上 gr* 六个 LSP 查询。⚠️ gd 是 Git diff，不是跳定义",
    total: DIAG_KEYS.length,
    group: "diagnostics/quickfix",
  },
  {
    id: "search",
    href: "/search",
    name: "搜索跳转",
    what: "n / N 在匹配之间跳，以及 <Esc> 清高亮。核心是「方向感知」—— ? 倒着搜完之后 n 反而往前",
    // 练的是 n / N / <Esc> 三条（见 app/search/drill.tsx 的题库）
    total: 8,
    group: "search",
  },
  {
    id: "seq",
    href: "/seq",
    name: "全键位扫描",
    what: "其余全部键位按序列盲背。按下去只弹面板、没有画面可看的那种",
    // seq 按形态分组，这里给全量命令数（减去窗口键）
    total: COMMANDS.filter(
      (c) =>
        !/^(Go to (Left|Right|Upper|Lower) Window|Split Window|Delete Window|Move (Up|Down)|(Increase|Decrease) Window)/.test(
          c.desc,
        ),
    ).length,
    group: null,
  },
];

/** 按 id 查板块 */
export const BOARD_BY_ID = new Map(BOARDS.map((b) => [b.id, b]));

/* ------------------------------------------------------------------ 去重 */

/**
 * 各**专门页面**已经出的题，映射到全局命令 id。
 *
 * ## ⚠️ 为什么需要这个
 *
 * `/seq` 是「全键位扫描」，它的描述写的就是「**其余**全部键位」——
 * 意思是已经有专门页面的族不该在这里重复出题。
 *
 * 但实测（见 tests/dedup.test.ts）它和专门页面**重复了 62 条**：
 *
 * ```
 * <Space>u*   界面开关    24 条重复
 * <Tab>*      标签页       7 条重复
 * <Space>f*   文件查找    10 条重复
 * buffers     缓冲区       3 条重复
 * diag        诊断        18 条重复
 * ```
 *
 * 后果：同一条命令在两个页面各练一遍（进度 id 已统一，但**题量虚高**），
 * 而且 `/seq` 的「其余」名不副实。
 *
 * ## 判据
 *
 * 一个命令被专门页面覆盖 = 它的键（含次解）出现在那个板块的题库里。
 *
 * ⚠️ 只有**可视化板块**才算 —— `/seq` 自己不算（它就是要练「其余」的）。
 */
export function coveredByBoard(): Map<string, string> {
  const m = new Map<string, string>(); // display → boardId
  const add = (display: string, boardId: string) => {
    if (!m.has(display)) m.set(display, boardId);
  };

  /**
   * ⚠️ hydra 的题是**三段式** `<Space>wX`，不是裸面板键。
   *
   * 我第一版直接 `add(t.key)`，于是面板里的 `H` / `>` 把
   * **全局**的 `H`（上一个 buffer）和 `>`（缩进）也标记成「被覆盖」——
   * 这是两回事：面板键只在 `<Space><Space>` 进入面板后才存在，
   * 不是全局映射（`lib/winkeys.ts` 里记过这条实测结论）。
   *
   * 所以只贡献完整三段式 `display`。
   */
  for (const t of WIN_TASKS) add(`<Space>w${t.key}`, "windows-hydra");
  for (const t of BUF_TASKS) {
    add(t.key, "buffers");
    if (t.key.length > 1 && !t.key.startsWith("<")) add(`<Space>${t.key}`, "buffers");
  }
  for (const t of TAB_TASKS) add(`<Space>${t.key}`, "tabs");
  for (const t of FILE_TASKS) add(t.key, "files");
  for (const t of UI_TOGGLES) add(t.hasLeader ? `<Space>${t.key}` : t.key, "ui");
  for (const k of DIAG_KEYS) add(k.hasLeader ? `<Space>${k.key}` : k.key, "diagnostics");

  return m;
}

/**
 * 这些命令已经有专门页面了（`display` 或次解命中就算）。
 *
 * `/seq` 用它过滤出题库 —— 返回的是**要排除的 id 集合**。
 *
 * ⚠️ 次解也要算：`H` 的次解 `[b` 如果出现在某个专门页面，
 *    那 `H` 本身也该算被覆盖（它们同一条命令）。
 */
export function boardCoveredIds(commands: { id: string; display: string; alternates: string[] }[]): Set<string> {
  const byDisplay = coveredByBoard();
  const out = new Set<string>();
  for (const c of commands) {
    if (byDisplay.has(c.display) || c.alternates.some((a) => byDisplay.has(a))) {
      out.add(c.id);
    }
  }
  return out;
}
