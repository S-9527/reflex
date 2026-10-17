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
 * ## ⚠️⚠️ 分母必须是「页面实际出的题数」，不是估算
 *
 * 这个文件原来的 `total` 是**手写估的**，于是四个板块的分母和实际题数
 * 对不上，而且**全都不报错**：
 *
 * | 板块 | 原来写的 | 页面实际 | 错因 |
 * |------|---------|---------|------|
 * | `/seq` | 235 | 135 | 只减了窗口键，没减「已被专门页面覆盖」和「不能当题干」 |
 * | `/text` | 16 | 11 | 数的是 `SPEC.filter(measured)`，而题目是 (对象,位置) 组合 |
 *
 * 分母虚高的后果不是「数字难看」，是**进度条永远到不了 100%** ——
 * 用户以为还有题没练，而其实全练完了。
 *
 * 所以现在 `total` 一律**从题库真实长度算**，见下面每个板块的注释。
 * 并且 `tests/board-total.test.ts` 守住这条不变量。
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
import { QUESTIONS as TEXT_QUESTIONS } from "./textobj";
import { UI_TOGGLES } from "./ui-toggles";
import { DIAG_KEYS } from "./diagnostics";
import { drillablePool } from "./seq-groups";
import { CORE_TASKS } from "./core-vim";

/**
 * 各板块的**去重判据**（`boardCoveredIds` / `coveredByBoard`）搬到了
 * `lib/coverage.ts` —— 为了断开 `boards ↔ seq-groups` 的循环依赖。
 *
 * 这里 re-export 一次，保持老的 import 路径可用（`tests/dedup.test.ts`
 * 和 `app/seq/page.tsx` 都从 `@/lib/boards` 引）。
 */
export { boardCoveredIds, coveredByBoard } from "./coverage";

/**
 * 窗口的四个模式 —— **每个模式有自己的 `boardId`**。
 *
 * ## ⚠️⚠️ 为什么必须显式列出来
 *
 * 原来 `BOARDS` 里只有一个 `windows-hydra`（18 题），而 `/windows`
 * 页面实际上有**四个模式、四个 boardId**：
 *
 * ```
 * windows-jump     5 题（ARENAS）
 * windows-build    4 题
 * windows-resize   4 题
 * windows-hydra   18 题
 * ```
 *
 * 前三者的进度记录落在 `windows-jump` / `windows-build` / `windows-resize`
 * 下，而首页只读 `windows-hydra` —— 于是**练了 13 题，首页一点不动**。
 *
 * 这里把四个都注册成独立板块。它们在首页合成一张卡片显示
 * （见 `BOARD_GROUPS`），但进度各自统计、各自清空。
 */
export type Board = {
  /** 板块 id —— 也是 `lib/srs.ts` 里 `Item.board` 的值 */
  id: string;
  href: string;
  name: string;
  /** 一句话说明在练什么（首页显示） */
  what: string;
  /** 题库条数（用户实际要练的题数）—— **必须等于页面真实题数** */
  total: number;
  /**
   * 对应的 which-key 分组（能对上的那些）。
   *
   * `null` = 这个板块的键没有 which-key 分组（文本对象是 Vim 内建、
   * hydra 面板键只在面板里存在），所以 `/stats` 的分组视图覆盖不到它。
   */
  group: string | null;
  /**
   * 首页把哪些板块**合成一张卡片**显示。
   *
   * ⚠️ 只为 `/windows` 的四个模式准备 —— 它们是同一页的四个页签，
   *    在首页并排四张卡会让人以为要去四个地方练。
   *    其他板块 `undefined` = 自己一张卡。
   */
  card?: string;
};

/** 窗口四模式共用的卡片名 —— 首页合成一张 */
export const WINDOWS_CARD = "windows";

export const BOARDS: Board[] = [
  {
    id: "windows-jump",
    href: "/windows",
    name: "窗口跳转",
    what: "在已有布局里把焦点移到目标窗口。<C-H/J/K/L>",
    total: 5, // app/windows/jump.tsx 的 TASKS = ARENAS.length
    group: null,
    card: WINDOWS_CARD,
  },
  {
    id: "windows-build",
    href: "/windows",
    name: "窗口搭建",
    what: "用 <Space>| / <Space>- 拼出目标布局",
    total: 4, // app/windows/build.tsx 的 TASKS
    group: null,
    card: WINDOWS_CARD,
  },
  {
    id: "windows-resize",
    href: "/windows",
    name: "窗口缩放",
    what: "<C-方向键> 把窗口调到目标尺寸",
    total: 4, // app/windows/resize.tsx 的 TASKS
    group: null,
    card: WINDOWS_CARD,
  },
  {
    id: "windows-hydra",
    href: "/windows",
    name: "窗口键位",
    what: "照 <Space>w 面板练单个键",
    total: WIN_TASKS.length,
    // ⚠️ hydra 面板键大多不是全局 keymap，所以分组里只有 2 条
    group: "windows",
    card: WINDOWS_CARD,
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
    what: "<Tab> 那一族，加上 Vim 内建的 gt / gT / g<Tab>。注意它关的是整个标签页，不是单个 buffer",
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
    /**
     * ⚠️ 必须数 `QUESTIONS`（页面的真实题目），**不是** `SPEC`。
     *
     * `SPEC` 是「对象规格表」，里面有 18 条（含 `iw` 的两次不同位置实测），
     * 而页面出的题是 (对象, 光标位置) 的组合，共 11 道。
     * 原来写 `SPEC.filter(measured).length` = 16 —— 分母虚高 5，
     * 进度条永远差 5 格。
     */
    total: TEXT_QUESTIONS.length,
    // ⚠️ 文本对象是 Vim 内建，不在 nvim_get_keymap 的映射表里
    group: null,
  },
  {
    id: "core",
    href: "/core",
    name: "Vim 内建操作",
    what: "撤销/重做、operator、motion、寄存器、标记、宏 —— 这些在 nvim_get_keymap 里查不到，但每天都要用",
    total: CORE_TASKS.length,
    // ⚠️ 这些是 Vim 内建命令，本来就不在 which-key 的分组树里
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
    total: 8, // app/search/drill.tsx 的 QUESTIONS
    group: "search",
  },
  {
    id: "seq",
    href: "/seq",
    name: "全键位扫描",
    what: "其余全部键位按序列盲背。按下去只弹面板、没有画面可看的那种",
    /**
     * ⚠️⚠️ 必须用 `drillablePool()` 的真实长度。
     *
     * 原来写的是「COMMANDS 减去窗口键」= **235**，但 `/seq` 页面
     * 实际出的题是 `drillablePool()` —— 它还要再减掉：
     *
     * 1. 已被专门页面覆盖的（`boardCoveredIds`）
     * 2. 不能当题干的（空 desc / help 引用 / auto-pairs，`whyNotDrillable`）
     *
     * 真实值是 **135**。原来虚高 100 —— 进度条永远到不了头。
     *
     * ⚠️ `drillablePool()` 会调 `boardCoveredIds()`，而那个函数住在
     *    `lib/coverage.ts`（**不是**这个文件）—— 就是为了避免
     *    `boards ↔ seq-groups` 循环依赖。见 coverage.ts 顶部说明。
     */
    total: drillablePool().length,
    group: null,
  },
];

/** 按 id 查板块 */
export const BOARD_BY_ID = new Map(BOARDS.map((b) => [b.id, b]));

/**
 * 首页要显示的分组 —— 把 `/windows` 的四个模式合成一张卡。
 *
 * 返回的是**卡片**，每张卡带它下面的板块 id 列表和总题数。
 * 单板块的卡 `ids` 只有一个元素，首页按同样逻辑渲染即可。
 */
export type BoardCard = {
  /** 卡片 id（多板块时是 `card` 字段，否则就是板块 id） */
  id: string;
  /** 卡片上的链接 */
  href: string;
  name: string;
  what: string;
  /** 这张卡覆盖的板块 id */
  ids: string[];
  /** 总题数 = 各板块之和 */
  total: number;
  /** 单板块的卡带上它的 which-key 分组，供首页显示 */
  group: string | null;
};

export function boardCards(): BoardCard[] {
  const out: BoardCard[] = [];
  const byCard = new Map<string, BoardCard>();

  for (const b of BOARDS) {
    const key = b.card ?? b.id;
    const existing = byCard.get(key);
    if (existing) {
      existing.ids.push(b.id);
      existing.total += b.total;
      continue;
    }
    const card: BoardCard = {
      id: key,
      href: b.href,
      name: b.card ? "窗口" : b.name,
      what: b.card ? "分屏、切分、缩放、跳焦点 —— 四个模式：跳转 / 搭建 / 缩放 / 键位" : b.what,
      ids: [b.id],
      total: b.total,
      group: b.group,
    };
    byCard.set(key, card);
    out.push(card);
  }
  return out;
}

/** 一张卡覆盖的板块 id（首页清进度时用） */
export function cardBoardIds(card: BoardCard): string[] {
  return card.ids;
}
