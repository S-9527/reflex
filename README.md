# reflex

Neovim 肌肉记忆训练器。把本机 LazyVim 的真实键位抽出来，做成 qwerty 式打字流来练。

**不是**从文档或教程抄的键位表 —— 全部来自 `nvim_get_keymap` 的**运行时实测**。

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm vitest run   # 806 个测试
npx tsc --noEmit  # 类型检查
```

---

## 数据从哪来

三层，每层都可复现：

```
scripts/dump-maps.lua          ← 在真 nvim 里跑，抽全量键位 + which-key 分组
        ↓
data/keymaps.json              ← 387 键（rhs 158 / Lua 回调 229）· 50 个分组定义
        ↓
scripts/build-dataset.mjs      ← 按 rhs 聚合出「命令」
        ↓
lib/bindings.ts                ← 自动生成：368 键位 → 260 道题
```

### 重跑抽取

```bash
script -qec "nvim --headless -c 'luafile scripts/dump-maps.lua' -c 'qa!'" /dev/null
node scripts/build-dataset.mjs
```

⚠️ **必须在真 pty 下跑**（`script -qec`）。headless 下 `User VeryLazy` 不触发，
LazyVim 的 `keymaps.lua` 整份不执行，键位数会从 387 掉到 140 左右。

⚠️ which-key 的分组 spec 由 `vim.schedule_wrap` 延迟消费，而 headless 下
`vim_did_enter == 0` 走的是「注册 VimEnter autocmd」那条分支 ——
脚本跑完时它从没执行。`dump-maps.lua` 里手动触发 `VimEnter` 并用
`vim.wait` 等 `Config.loaded`，否则分组一条都拿不到。

---

## 核心设计

### 一个命令 = 一道题

键位和命令**不是一一对应**的：同一个操作在本机常常有多个键。
所以数据集按 `rhs` 聚合（rhs 相同 = 底层同一条命令）：

```ts
type Command = {
  display: string;      // 最优解 —— 出题只考它
  alternates: string[]; // 次解 —— 实测等价，仅展示
  native: string | null;// 原生 Ex —— 仅展示
  equivBy: "rhs" | "desc" | "lone";  // 等价判据的可信度
};
```

最优解的选法：**键数少 > 不用修饰键 > 不用 leader**。

实测 13 道多解命令，例如 `L` / `]b` 都是「下一个 buffer」，
`` ` `` / `<Space>bb` 都是 `:e #`。

⚠️ 没有 `rhs` 的键（Lua 回调，229 条）只能按 `desc` 弱判定，
界面上会标出来 —— 两种判据的可信度不同，不能混为一谈。

### qwerty 式打字流

```
旧：题面 → 你按 → 判分 → 等 1.5 秒 → 下一题     ← 断的
新：题面 → 你连续按 → 逐键反馈 → 同一帧下一题     ← 连续的
```

- **逐键上色**：每按一键立刻判定，绿 = 对，红 = 错
- **无缝推进**：命中即翻页，没有定时器
- **停住纠错**：按错时**保留已按对的前缀**，只标红错的那键
- **一轮有终点**：一个板块打完 → 结算屏（正确率 / 速度 / 错题）
- **间隔重复**：连对越多复习越远（1→3→7→16→35 天），答错立刻回插

### 两种模式

| | 跟打 | 默写（默认） |
|---|---|---|
| 题目区 | 直接显示键位 | 空格子，自己回忆 |
| 练什么 | 手指走位、序列节奏 | 命令 → 键位的映射 |
| 计入熟练度 | 否 | 是（且没用提示） |

默写模式下按 `?` 逐级给提示：**首键 → 首键+键数 → 全部解法**。

⚠️ 用过提示的题算「按键对了」但**不算「独立答对」** ——
否则按提示抄一遍会污染熟练度数据。结算屏把这两个数分开显示。

### 分层

```
lib/drill.ts       三态判据（hit / prefix / none）—— 纯函数，有单测
lib/hints.ts       提示分级 + 模式判定 —— 纯函数，有单测
lib/session.ts     会话与结算 —— 纯函数，有单测
lib/srs.ts         统一进度模型 + 间隔重复 —— 纯函数，有单测
lib/task-id.ts     全局题目 id（跨板块共享进度）—— 纯函数，有单测
lib/boards.ts      板块注册表（首页和 /stats 共用一份）
lib/use-drill.ts   React 外壳：挂 keydown、逐键反馈、会话状态
lib/drill-ui.tsx   公共 UI：SessionBar / ModeBar / KeySequence / DrillFlow
```

**所有练习页走同一套引擎**（含 `/seq`）—— 判据只有一份。

### 进度怎么记

全局一张表，key 是**全局题目 id**（`n|<Space>bd` 这种 `mode|lhs`）：

```ts
type Item = {
  board: string;        // 属于哪个板块
  seen, correct;
  independent: number;  // 其中「独立答对」—— 判断学会的依据
  streak, lapses;
  lastAt, dueAt;        // dueAt 驱动复习队列
};
```

同一条命令在 `/buffers` 和 `/seq` 得到**同一个 id**，练一次两边都算。
映射不到 `COMMANDS` 的（文本对象、hydra 面板键）用 `板块:本地key`。

各板块只管提供三样东西：`init`（起始状态）、`apply`（执行解法）、
`toPanelKey`（浏览器 key → 面板记法）。

**判据只有一份。** 这个项目早期所有 bug 都出在「同一个概念抄四遍」上 ——
详见 `lib/drill.ts` 顶部那张表。

---

## 板块

| 路由 | 练什么 | 可视化 |
|------|--------|--------|
| `/buffers` | buffer 带子上的删/移/标 | 带子 |
| `/tabs` | `<Tab>` 那一族 | 标签条 |
| `/files` | 文件查找（小写 = 根目录，大写 = 当前） | 规律对照 |
| `/text` | 文本对象 `diw` `daw` `ip` … | 代码高亮选中范围 |
| `/ui` | `<Space>u` 界面开关（24 条） | 模拟编辑器 |
| `/diag` | 诊断与 LSP 跳转 | 诊断列表 + 光标行（`]d` 绕回 / `]q` 停住） |
| `/search` | `n` / `N` 搜索跳转 | 匹配高亮 + 光标 |
| `/windows` | 分屏、切焦、缩放 | 分屏树 |
| `/seq` | 其余键位盲背 | 无（纯序列） |
| `/stats` | 数据集全貌 + 接本机 nvim 看实时布局 | 键盘图 |

板块划分**来自 which-key 的真实分组**（LazyVim 的 `group = "..."` 声明），
不是手编的「第 x 关」—— 所以分类和你按 `<Space>` 看到的面板一致。

---

## 接本机 nvim 看实时布局

`/stats` 的「我的 nvim」页签能读到你**真实的分屏结构**。装法是在
`~/.config/nvim/lua/plugins/` 下建一个文件：

```lua
return { "/home/anguish/workspace/reflex/scripts/reflex-layout-plugin.lua" }
```

它是**只读旁路**：不接管任何键位、不改编辑行为，只往
`stdpath("state")/reflex-layout.json` 写布局快照（去抖 150ms）。
删掉那行就彻底断开。

---

## 覆盖率

数据集里的键**没有练不到的**，审计见 `tests/coverage.test.ts`：

```
数据源 387 条 → 过滤 19（<Plug>/termcode/F键/空）→ 唯一键位 367
              → 全部进 RAW（零丢失）→ 聚合出 260 道命令
```

95 条没有独立命令，但原因都正当：8 条空 desc（翻不了），
87 条同一命令已在别的 mode 出过题（跨 mode 合并）。

⚠️ `x` 模式看起来「0 条出题」，但 nvim 里 `v`/`x`/`s` 是 Visual 的
三种子模式、同一批映射重复注册 —— **没有任何键是 x/s/t 独有的**，
练 `v` 就等于练 `x`。

---

## 已知边界

- **进度存在浏览器 localStorage**，换设备不同步
- **`/windows` 的 jump/build 还没并入公共引擎** ——
  那是另外两套独立实现（710 行），是最后一处技术债
- **Insert 模式的键收了但没专门练**（数据集全量保留，不替你过滤）
- 27 条键没有 `desc`（Vim 内建映射，插件没上报），题干为空

---

## 数据可信度

数据集里每条都标了来源。**不编造**是这个项目的底线：

- **键位 / rhs / 分组**：`nvim_get_keymap` 实测，可复现
- **原生 Ex 等价**：人工判断对应关系 + 逐条 `exists(':命令')` 实测存在性
  （实测抓出过 `:bPrev`、`:b#` 两个不存在的命令，以及一个双冒号的探针 bug）
- **界面开关的「画面变化」**：`nvim_list_uis()=0`，**测不出来**，
  页面上的视觉差异是**按约定画的**，界面上明确标注了
- **文本对象的范围**：破坏性实测（造已知内容 → `:normal! d(键)` → diff）

**测不出来的就说测不出来**，不假装知道。
