# reflex

Neovim 肌肉记忆训练器。把本机 LazyVim 的真实键位抽出来，做成 qwerty 式打字流来练。

**不是**从文档或教程抄的键位表 —— 全部来自**运行时实测**：
插件键位来自 `nvim_get_keymap`，Vim 内建操作来自**破坏性实测**
（`nvim_get_keymap` 看不见内建命令，详见「覆盖率」一节）。

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm vitest run   # 981 个测试
npx tsc --noEmit  # 类型检查
```

---

## 数据从哪来

**两条独立的抽取链路**，因为两个数据源性质完全不同：

### A. 插件 / 用户键位（`nvim_get_keymap` 能看到）

```
scripts/dump-maps.lua          ← 在真 nvim 里跑，抽全量键位 + which-key 分组
        ↓
data/keymaps.json              ← 387 键（rhs 158 / Lua 回调 229）· 50 个分组定义
        ↓
scripts/build-dataset.mjs      ← 按 rhs 聚合出「命令」
        ↓
lib/bindings.ts                ← 自动生成：368 键位 → 252 道题
```

### B. Vim 内建操作（`nvim_get_keymap` **看不到**）

`nvim_get_keymap` 只返回用户/插件映射 —— `u` `dd` `p` `f` `m` `q`
这些内建命令**一条都不在里面**，所以必须单独实测：

```
scripts/probe-core.lua         ← 破坏性实测：造内容 → 落光标 → :normal! (键) → diff
        ↓
data/probe-core.json           ← 139 条原始结果（buffer + 光标 + 前置 + 自定义文档）
        ↓
scripts/build-core.mjs         ← 人工写描述，实测证据原样引用
        ↓
lib/core-vim.ts                ← 自动生成：115 道题，17 个分组
```

⚠️ 这条链路是**后补的**。原来只有链路 A，于是内建操作整个缺失，
而「覆盖率」审计的口径是「数据集内的键有没有练不到」——
**自洽但前提不成立**。详见下面「覆盖率」一节。

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
| `/core` | **Vim 内建操作**：`u` `dd` `yy` `p` `f` `m` `q` `%` … | 实测 diff（buffer 变成什么 + 光标去哪） |
| `/ui` | `<Space>u` 界面开关（24 条） | 模拟编辑器 |
| `/diag` | 诊断与 LSP 跳转 | 诊断列表 + 光标行（`]d` 绕回 / `]q` 停住） |
| `/search` | `n` / `N` 搜索跳转 | 匹配高亮 + 光标 |
| `/windows` | 分屏、切焦、缩放 | 分屏树（四个模式都走统一引擎） |
| `/seq` | 其余键位盲背 | 无（纯序列） |
| `/stats` | 数据集全貌 + 接本机 nvim 看实时布局 | 键盘图 |

板块划分**来自 which-key 的真实分组**（LazyVim 的 `group = "..."` 声明），
不是手编的「第 x 关」—— 所以分类和你按 `<Space>` 看到的面板一致。

⚠️ `/core` 是**例外**：内建命令本来就不在 which-key 的分组树里，
所以它按**操作性质**分组（删除/修改、光标移动、寄存器/标记/宏…）。

`/seq` 也一样：真分组按 which-key，兜底键合成「其它」。
不能当题干的键（空 desc / help 引用 / auto-pairs）会被排掉，
但页面底部单独列出来，能看到排除了什么、为什么。

⚠️ **首页的分母一律从题库真实长度算**（`lib/boards.ts`），
不写估算值。原来有四个板块的分母是手写的，全都对不上实际题数
而且都不报错 —— 后果是进度条永远到不了 100%。
`tests/board-total.test.ts` 守住这条不变量。

---

## 接本机 nvim 看实时布局

`/stats` 的「我的 nvim」页签能读到你**真实的分屏结构**。装法是在
`~/.config/nvim/lua/plugins/` 下建一个文件：

```lua
-- 把路径改成你自己的克隆位置
return { vim.fn.expand("~/path/to/reflex/scripts/reflex-layout-plugin.lua") }
```

它是**只读旁路**：不接管任何键位、不改编辑行为，只往
`stdpath("state")/reflex-layout.json` 写布局快照（去抖 150ms）。
删掉那行就彻底断开。

---

## 覆盖率

### ⚠️ 先说一个**曾经的大洞**（已补）

数据集全部来自 `nvim_get_keymap`，而它**只返回用户/插件映射** ——
**Vim 内建命令一条都不在里面**。本机实测：

```
u      n: （没有映射）
dd     n: （没有映射）
p      n: （没有映射）
```

所以 `u` `p` `dd` `f` `m` `q` `w` `b` `gg` `*` `&` … 这些
**从抽取阶段就不存在**，后面怎么聚合、去重都补不回来。

原来的「覆盖率」一节只审计「数据集内的键有没有练不到」——
它是**自洽的**，但前提「数据集 = 全部要练的东西」不成立。
这就是「总觉得有漏掉的」的真正来源。

现在补上了：`/core` 板块，115 道题，全部来自**破坏性实测**
（造已知内容 → 落到指定位置 → `:normal! (键)` → diff buffer 和光标）。

```
scripts/probe-core.lua    ← 在本机 nvim 实测 139 条内建操作
        ↓
data/probe-core.json      ← 原始结果（buffer + 光标 + 前置操作 + 自定义文档）
        ↓
scripts/build-core.mjs    ← 人工写描述，实测证据原样引用
        ↓
lib/core-vim.ts           ← 115 道题，17 个分组
```

覆盖的操作族：撤销/重复、operator（`dd` `yy` `cc` `D` `C` `x` `r` `s` `S`）、
寄存器/标记/宏（`"a` `ma` `` `a `` `@a` `@@`）、插入入口（`i` `a` `I` `A` `o` `O` `R`）、
可视模式（`v` `V` `<C-v>`）、motion（`w` `b` `e` `0` `^` `$` `gg` `G` `{` `}` `%`）、
行内查找（`f` `t` `F` `T` `;` `,`）、缩进/大小写（`>>` `<<` `==` `~` `gUU` `guu`）、
滚动（`<C-d>` `<C-u>` `<C-f>` `<C-b>` `zt` `zz` `zb`）、跳转（`<C-o>` `<C-i>` `g;` `g,`）。

### 探针本身踩过的坑（都写在脚本注释里）

这一轮**探针比被测对象更容易错** —— 六个坑里有五个是探针的：

| 坑 | 表现 | 真相 |
|----|------|------|
| `nvim_buf_set_lines` 本身可撤销 | `u` 实测得到**空 buffer** | 撤销的是「写内容」那一步，不是编辑 |
| scratch buffer（`nofile`）下 `U` 行为不同 | `U` 实测「整行清空」 | 真实文件里是**恢复原样** |
| 宏必须走 typeahead | `:normal! qaxq` 录到**空寄存器** | `:normal!` 绕过宏录制，且**不报错** |
| `;` / `,` 样本只有一个逗号 | 实测「光标不动」 | 不是键失效，是**没有下一个可跳** |
| `g%` / `[%` / `]%` 是映射 | `:normal!` 测出「光标不动」 | `:normal!` 绕过映射，要用 `feedkeys` |
| 寄存器跨探针泄漏 | `"ap` 粘出上一轮的残留 | 每次探针前必须清寄存器 |

**教训：描述和证据对不上，比缺数据危险得多** —— 因为看不出来。
所以生成器按 `(键, 前置操作, 位置)` 精确匹配探针，找不到或有歧义就**直接抛错**；
`tests/core-vim.test.ts` 再验一遍证据自洽（含 `U` / `u` 这两条）。

⚠️ 这条规则是**踩了两次**才立起来的：第二版我写 `findIndex` 静默取第一条，
于是 `%` 在 `{` 上的那道题拿到了在 `(` 上的证据 —— 又是「描述对、证据错」。
现在有歧义会报错：

```
探针有歧义：键="%" 前置="" 匹配到 2 条（位置 1:12 / 1:13）
        —— 题目里请写明 line/col 消歧，别让它静默取第一条
```

### ⚠️ 三个只有「跑起来看」才发现的 bug

数据层全绿、类型检查通过、975 个测试全过（当时） —— 但页面是坏的。
我是装了 headless chromium 抓 DOM 才看见的：

| bug | 症状 | 为什么测试抓不到 |
|-----|------|-----------------|
| diff 把「改过的行」当成 `same` | **`→` 箭头一个都不渲染**，看着像「这个键什么也没做」 | 数据层是对的，错的是渲染分支 |
| `TaskBar` 在 115 题下列成一面墙 | 题目区和实测 diff 全被挤到屏幕外 | 组件本身没错，是**用法**错了（`/seq` 早就因为 131 个按钮踩过同一个坑） |
| Ctrl 记法大小写不一致 | 按 `<C-R>` **页面刷新了**（看着像「跳回第一关」） | 归一化函数住在 `@/` 别名模块里，vitest import 不了 → 只测了 `normalize`，没测那个壳 |

修法：diff 抽成纯函数 `lib/diff.ts`（LCS，有 `tests/diff.test.ts`）；
`/core` 改用和 `/seq` 一样的轻量控制行；`defaultToPanelKey` 改成复用
`lib/keys.ts` 的 `normalize()`（**别再自己写一张特殊键表**）。

**教训：测试全绿不等于页面能用。** 涉及「渲染分支」「布局密度」
「跨模块的一致性」的问题，必须真跑起来看 —— 这个项目现在有 981 个测试，
仍然漏掉了这三个。第三个尤其典型：**测试测的是隔壁函数，不是出错的那个**。

### Ctrl 记法必须大写

nvim 报的规范写法就是大写（实测 `nvim_get_keymap`）：

```
desc=redo       lhs="<C-R>"
desc=halfdown   lhs="<C-D>"
```

`normalize()` 也产大写 —— 两边一致才匹配得上。手写小写 `<C-r>` 的后果：
`shouldTake` 返回 false → 不接管 → `preventDefault` 没被调用 →
**浏览器执行 Ctrl+R 的默认行为（刷新）**。

实测（headless chromium 抓 keydown）：

```
[{"key":"r","ctrl":true,"prevented":false}]    ← 修前，没拦
[{"key":"r","ctrl":true,"prevented":true}]     ← 修后
```

`scripts/build-core.mjs` 有 `normCtrl()` 强制归一化，
`tests/core-vim.test.ts` 和 `tests/intercept.test.ts` 各钉一条防它漂回去。

### 数据集内部的覆盖率（原有审计，仍然有效）

```
数据源 387 条 → 过滤 19（<Plug>/termcode/F键/空）→ 唯一键位 367
              → 全部进 RAW（零丢失）→ 聚合出 252 道命令
              → /seq 可练 135 道（减去窗口键 + 专门页面已覆盖 + 不能当题干）
```

95 条没有独立命令，但原因都正当：8 条空 desc（翻不了），
87 条同一命令已在别的 mode 出过题（跨 mode 合并）。

⚠️ `x` 模式看起来「0 条出题」，但 nvim 里 `v`/`x`/`s` 是 Visual 的
三种子模式、同一批映射重复注册 —— **没有任何键是 x/s/t 独有的**，
练 `v` 就等于练 `x`。

### ⚠️ 救回来的 16 条

`/seq` 的 `whyNotDrillable()` 把「插件没上报 desc」等同于「不能出题」，
于是一批**真正的 Vim 内建键**被静默排掉了 —— 插件给它们注册了映射
（为了别的目的）却没写 desc。实测确认它们都有确定行为，已补进 `/core`：

| 键 | 数据集里的 desc | 实际是什么 |
|----|----------------|-----------|
| `%` | 空 | 跳配对括号（rhs 是 matchit 的 `<Plug>`） |
| `g%` `[%` `]%` | 空 | matchit 的反向 / 外层括号跳转 |
| `*` `#` | `:help v_star-default` | 搜索光标下的词 |
| `&` | `:help &-default` | 重复上一次替换 |
| `<C-W>` `<C-U>` | `:help i_CTRL-...-default` | 插入模式的删词 / 删到行首 |
| `Y` `;` `,` `.` `>` | 空 / help 引用 | 已在 `/core` 出题 |

**缺的只是一张人工 desc 表。**

---

## 已知边界

- **进度存在浏览器 localStorage**，换设备不同步
- **`/windows` 的 jump/build 已并入公共引擎** —— 全部练习页现在走同一套引擎
- **`/windows` 的四个模式各自记进度**（`windows-jump` / `-build` / `-resize` /
  `-hydra`），首页合成一张「窗口」卡显示
- **内建操作里 headless 测不出效果的不出题**：折叠（`za` `zR` `zM`）、
  `gx`（开系统程序）—— 在 `/core` 页底「已排除」里列出原因
- **`jk` / `,` `;` `.`（插入模式）不是 Vim 内建**，是 LazyVim / MiniPairs 的映射，
  所以留在 `/seq` 练，不混进 `/core`
- 少量键没有 `desc`（插件没上报），题干为空 —— 这些在 `/seq` 底部列出来

---

## 数据可信度

数据集里每条都标了来源。**不编造**是这个项目的底线：

- **键位 / rhs / 分组**：`nvim_get_keymap` 实测，可复现
- **Vim 内建操作**：破坏性实测（造已知内容 → 落到指定位置 →
  `:normal! (键)` → diff buffer 和光标），原始结果在 `data/probe-core.json`，
  探针在 `scripts/probe-core.lua`
- **原生 Ex 等价**：人工判断对应关系 + 逐条 `exists(':命令')` 实测存在性
  （实测抓出过 `:bPrev`、`:b#` 两个不存在的命令，以及一个双冒号的探针 bug）
- **界面开关的「画面变化」**：`nvim_list_uis()=0`，**测不出来**，
  页面上的视觉差异是**按约定画的**，界面上明确标注了
- **文本对象的范围**：破坏性实测（造已知内容 → `:normal! d(键)` → diff）

**测不出来的就说测不出来**，不假装知道。

⚠️ 探针本身也会错。这一轮六个坑里五个是探针的（撤销历史、scratch buffer、
宏录制、样本不成立、映射被绕过）—— 每一个都会产出**「描述对、证据错」**
的结果，而且**不报错**。所以：

1. 生成器按 `(键, 前置操作)` 精确匹配探针，找不到就**直接抛错**（不用下标）
2. `tests/core-vim.test.ts` 验证证据自洽（`U` / `u` 这两条专门钉了探针坑）
3. 每条题目的「实测 diff」用的是**探针记下来的 `before`**，不是原始文档 ——
   否则有前置操作的题会显示「完全没变化」
