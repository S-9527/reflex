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
