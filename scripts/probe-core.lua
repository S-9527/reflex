-- 破坏性实测 Vim **内建**操作 —— 产出 lib/core-vim.ts 的数据。
--
-- ## 为什么需要这个脚本
--
-- `nvim_get_keymap` 只返回**用户/插件映射**，Vim 内建命令一条都不在里面：
--
--     u      n: （没有映射）
--     dd     n: （没有映射）
--     p      n: （没有映射）
--
-- 实测确认过。所以 `data/keymaps.json` 里 `u` `p` `dd` `f` `m` `q` 这些
-- **从抽取阶段就不存在** —— 后面怎么聚合、去重都补不回来。
-- 这就是「vim 操作没有完全覆盖」的根因。
--
-- 补的办法和 `/text`（文本对象）一样：**跑一遍看发生了什么**。
-- 造已知内容 → 落到指定位置 → `:normal! {键}` → 记录 buffer 和光标的 diff。
--
-- ## 为什么用 `:normal!` 而不是 `feedkeys`
--
-- 实测踩过（见 lib/textobj.ts 顶部）：`feedkeys` 逐键喂、每次带 wait，
-- 会让操作符和后续键**脱节** —— `dis` 只删掉一个 `"`。
-- `:normal!` 一次性把整串喂给 Vim，行为才和真人按键一致。
--
-- ## ⚠️⚠️ 三条必须遵守的探针纪律（第一版全踩了）
--
-- 1. **每次探针前清寄存器 / 标记 / 录制**。
--    第一版 `"ap`（声称「没先复制」）实测粘出了上一轮的残留 ——
--    寄存器是**全局**的，跨探针泄漏。基于它写的「粘贴空寄存器」结论是假的。
--
-- 2. **测 `guu` 要用含大写的行**。第一版在第 1 行（`local total…`，全小写）
--    测 `guu`，得到「无变化」，差点写成「guu 不生效」——
--    它生效了，只是没有大写可转。
--
-- 3. **测 `==` / 缩进要设 filetype**。第一版没设，scratch buffer 没有
--    缩进规则，`==` 什么都不做。设成 lua 才有意义。
--
-- 4. **可视模式要读 `'<` / `'>`**，不能只看 buffer ——
--    `vll` 不改 buffer，但选中了范围，那才是要教的东西。
--    读法是 `v` + 键 + `<Esc>`（`<Esc>` 会把选区落到那两个 mark 上），
--    和 lib/textobj.ts 里的做法一致。
--
-- ## 跑法
--
--     nvim --headless -c 'luafile scripts/probe-core.lua' -c 'qa!'
--
-- 不需要真 pty —— 这里不依赖 LazyVim 的键位注册，纯 Vim 内建行为。

local out = {}

--- 探针用的标准文档。
---
--- ⚠️ 有意安排了「大小写混排 / 括号 / 空行 / 缩进行 / **两个逗号**」，
--- 这样一次文档能测 motion、textobject、缩进、大小写、段落、行内查找。
--- 第 5 行带 2 空格缩进 —— 用来区分 `0`（真行首）和 `^`（首个非空）。
---
--- ⚠️⚠️ 第 1 行**必须有两个逗号**（第 24 列和第 33 列）。
---    第一版只有一个，于是 `f,` + `;` 测出来「光标不动」——
---    不是 `;` 失效，是**没有第二个逗号可跳**。
---    这类「探针样本本身不成立」的假结论，这个项目踩过好几次
---    （见 lib/textobj.ts 的 col=17 那次）。
local SRC = {
  "local Total = compute(a, b) + 1, tail",
  'local name = "hello world"',
  "",
  "function f(x)",
  "  return { key = 'val' }",
  "end",
  "",
  "-- a paragraph",
  "second line here",
  "third line here",
}

--- 清掉所有会跨探针泄漏的状态。
---
--- ⚠️ 寄存器、录制寄存器、`last used register` 都是**全局**的。
---    小写标记 a-z 是 buffer-local，而每次探针都建新 buffer，所以不用清。
local function resetState()
  -- 清空所有寄存器（含无名寄存器 "）
  for _, r in ipairs({ '"', "a", "b", "0", "1", "-", "q" }) do
    pcall(vim.fn.setreg, r, {})
  end
  -- 如果上一个探针把录制留在「进行中」，先停掉。
  -- ⚠️ 不能无条件 `normal! q` —— 没有在录制时那是一个「等寄存器名」的半截
  --    命令，会把状态搞乱（实测踩过）。先问 reg_recording()。
  if vim.fn.reg_recording() ~= "" then
    pcall(vim.api.nvim_feedkeys, "q", "tx", false)
    vim.wait(30, function() return false end)
  end
  -- 清掉搜索寄存器和跳转历史（影响 n/N / C-o / C-i 的起始状态）
  pcall(vim.fn.setreg, "/", {})
  pcall(vim.api.nvim_exec2, "clearjumps", {})
end

--- 把 SRC 装进一个**真实文件**buffer，光标放到 line/col（1-based）。
--- 顺带设 filetype，让 `==` 这类依赖缩进规则的操作有意义。
---
--- ## ⚠️⚠️ 为什么用真实文件，而不是 `nvim_create_buf(false, true)`
---
--- scratch buffer（`buftype=nofile`）下 `U` **行为不一样** ——
--- 实测：在 scratch buffer 里 `xx` 之后按 `U`，整行被清成**空行**；
--- 而在真实文件里按 `U`，正确恢复成**修改前的原样**。
---
--- 我一开始用 scratch buffer，于是把 `U` 的实测结果记成了「整行清空」——
--- 那是**探针环境的产物**，不是 Vim 的行为。拿它教人会教错。
---
--- 所以现在写到临时文件再 `:edit` —— 和真人打开一个文件编辑完全一致。
--- 路径用 `tempname()`（`stdpath("temp")` 在 0.11 里不是合法值，实测 E6100）。
---
--- ## ⚠️ 为什么还要把 undolevels 临时设成 -1
---
--- `nvim_buf_set_lines` **本身是一条可撤销的修改**。不清掉这段历史的话，
--- `u` 撤销的是「我把 SRC 写进 buffer」这一步，而不是后面那次真实编辑 ——
--- 实测得到空 buffer，而描述写的是「删一个字符后撤销，字符回来」。
---
--- 这类 bug 特别隐蔽：**描述看着对，证据是错的**，而且不报错。
local function setup(line, col, ft)
  -- ⚠️ `stdpath("temp")` 在 nvim 0.11 里**不是合法值**（实测 E6100）。
  --    用 `tempname()` —— 它给一个唯一的临时路径，正好适合「每次探针一个新文件」。
  local path = vim.fn.tempname() .. ".txt"
  vim.fn.writefile(SRC, path)
  vim.cmd("edit! " .. vim.fn.fnameescape(path))
  local buf = vim.api.nvim_get_current_buf()
  -- ⚠️ 必须在 set_lines **之前**设成 -1，否则这一步本身会进历史
  vim.bo[buf].undolevels = -1
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, SRC)
  vim.bo[buf].undolevels = 1000
  if ft then vim.bo[buf].filetype = ft end
  vim.api.nvim_win_set_cursor(0, { line, col - 1 })
  resetState()
  return buf
end

--- 跑一条键序列。
---
--- ⚠️ `normal!` 里的特殊键要写成 `\<Esc>` 这种**真字节**，
---    不能是字面量 `<Esc>` 六个字符。`nvim_replace_termcodes`
---    负责这个转换 —— 少这一步，`iabc<Esc>` 会把 `<Esc>` 当普通文本插进去。
local function feed(keys)
  local termcodes = vim.api.nvim_replace_termcodes(keys, true, false, true)
  pcall(vim.api.nvim_exec2, "normal! " .. termcodes, {})
end

--- 像**真人打字**那样喂键 —— 走 typeahead，所以**宏录制能捕捉到**。
---
--- ## ⚠️⚠️ 宏必须用这个，不能用 `:normal!`
--
--- 实测（第一版就在这里错了）：
--
---     :normal! qaxq   →  寄存器 a = ""     ← 什么都没录到
---     feedkeys(...,"t") →  寄存器 a = "x"  ← 对的
--
--- 原因：`:normal!` 把整串直接交给 normal-mode 执行器，**绕过 typeahead**，
--- 而宏录制挂的是 typeahead 的钩子。所以 `qa`/`q` 在 `:normal!` 下
--- 「开始/停止录制」这个状态变了，但中间按的键一个都没进寄存器。
--
--- 更阴的是它**不报错**：`reg_recording()` 会正常返回 "a"，让人以为在录。
--- 第一版就是照着 `getreg("a") == ""` 写成「宏录不到」的假结论 ——
--- 而真相是探针手法错了。
---
--- `"t"` = 当作用户输入（会触发映射和录制）；
--- `"x"` = 立刻执行完再返回（否则 headless 下 typeahead 不会被消费）。
local function feedTyped(keys)
  local termcodes = vim.api.nvim_replace_termcodes(keys, true, false, true)
  vim.api.nvim_feedkeys(termcodes, "tx", false)
  -- 给 typeahead 一点时间排空（headless 下没有主循环在跑）
  vim.wait(30, function() return false end)
end

local function snapshot()
  local buf = vim.api.nvim_get_current_buf()
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  local cur = vim.api.nvim_win_get_cursor(0)
  return lines, cur[1], cur[2] + 1
end

--- 读可视选区（`'<` / `'>`）。没有选区返回 nil。
local function selection()
  local a = vim.fn.getpos("'<")
  local b = vim.fn.getpos("'>")
  if a[2] == 0 or b[2] == 0 then return nil end
  return { l1 = a[2], c1 = a[3], l2 = b[2], c2 = b[3] }
end

--- 记录一条探针结果。
---
--- ⚠️ 把 `pre`（前置操作）和 `ft` 一起记进去 —— 否则「u 的结果」脱离
---    「之前先按了 x」就没法复现，证据链断掉。
---
--- ## ⚠️⚠️ 为什么还要记 `before`
---
--- `result` 是按键**之后**的 buffer，但「之前」是什么？
--- 有前置操作时，答案是**前置跑完之后**的状态，不是原始 SRC。
---
--- 第一版没记 `before`，界面只能拿 SRC 当「之前」——
--- 于是 `u`（前置 `x`）画出来的 diff 是「完全没变化」，
--- 因为它撤销回了 SRC，而界面以为「之前」就是 SRC。
--- 看着像「这个键什么也不做」，其实是**对比基准错了**。
local function record(key, line, col, before, note, category, opts)
  opts = opts or {}
  local lines, ln, cl = snapshot()
  local entry = {
    key = key,
    line = line,
    col = col,
    result = lines,
    cursor = { ln, cl },
    -- ⚠️ 按键**之前**的 buffer（有前置时 = 前置跑完的状态）
    before = before,
    changed = not vim.deep_equal(before, lines),
    note = note,
    category = category,
    -- 前置操作（空字符串 = 没有）
    pre = opts.pre or "",
    -- filetype（影响 == / za 这类）
    ft = opts.ft,
  }
  if opts.selection then entry.selection = opts.selection end
  if opts.visual then entry.visual = true end
  if opts.typed then entry.typed = true end
  out[#out + 1] = entry
end

--- 测一条：在 (line,col) 处按 keys。
local function probe(key, line, col, note, category, opts)
  opts = opts or {}
  setup(line, col, opts.ft)
  local before = vim.deepcopy(SRC)
  feed(key)
  -- 可视模式：再按一次 <Esc> 把选区落到 '< / '>
  local sel = nil
  if opts.visual then
    feed("<Esc>")
    sel = selection()
  end
  record(key, line, col, before, note, category, {
    ft = opts.ft,
    visual = opts.visual,
    selection = sel,
  })
end

--- 先做一次前置操作，再测 keys。
--- 用来测「依赖前一步」的操作（撤销、重放、寄存器粘贴…）。
local function probeAfter(key, line, col, pre, note, category, opts)
  opts = opts or {}
  setup(line, col, opts.ft)
  feed(pre)
  local before = vim.deepcopy(vim.api.nvim_buf_get_lines(0, 0, -1, false))
  feed(key)
  record(key, line, col, before, note, category, { pre = pre, ft = opts.ft })
end

--- 和 {@link probeAfter} 一样，但**前置操作和按键都走 typeahead**。
---
--- ⚠️ 宏（`qa…q` / `@a` / `@@`）必须用这个 —— 见 `feedTyped` 的说明。
local function probeTyped(key, line, col, pre, note, category, opts)
  opts = opts or {}
  setup(line, col, opts.ft)
  if pre ~= "" then feedTyped(pre) end
  local before = vim.deepcopy(vim.api.nvim_buf_get_lines(0, 0, -1, false))
  feedTyped(key)
  record(key, line, col, before, note, category, { pre = pre, ft = opts.ft, typed = true })
end

-- ---------------------------------------------------------------- 1. 撤销 / 重做 / 重复
probeAfter("u", 1, 1, "x", "删一个字符后撤销，字符回来", "撤销 / 重复 / 宏")
probeAfter("u", 1, 1, "dd", "删整行后撤销，整行回来", "撤销 / 重复 / 宏")
probeAfter("<C-r>", 1, 1, "xu", "撤销之后重做，删除又回来", "撤销 / 重复 / 宏")
probeAfter(".", 1, 1, "xw", "x 删字符 → w 移动 → . 在新位置重复删除", "撤销 / 重复 / 宏")
probeAfter(".", 1, 1, "dd", "dd 删行 → . 再删一行", "撤销 / 重复 / 宏")
probeAfter("U", 1, 1, "xx", "把整行恢复到本次修改前（Vim 的行级撤销）", "撤销 / 重复 / 宏")

-- ---------------------------------------------------------------- 2. 删除 / 修改
probe("dd", 1, 1, "删掉整行（连行一起删）", "删除 / 修改")
probe("cc", 1, 1, "改整行：内容清空并进插入模式", "删除 / 修改")
probe("D", 1, 7, "从光标删到行尾（保留光标前的内容）", "删除 / 修改")
probe("C", 1, 7, "从光标改到行尾（删完进插入模式）", "删除 / 修改")
probe("x", 1, 1, "删掉光标处的字符", "删除 / 修改")
probe("X", 1, 7, "删掉光标**前**一个字符", "删除 / 修改")
probe("rZ", 1, 1, "把光标处字符替换成 Z（不进插入模式）", "删除 / 修改")
probe("sZ", 1, 1, "删掉光标字符并进插入模式，插入 Z", "删除 / 修改")
probe("Snew", 1, 1, "清空整行并插入 new", "删除 / 修改")
probe("dw", 1, 1, "删到下一个词首（删掉一个词 + 空格）", "删除 / 修改")
probe("de", 1, 1, "删到词尾（只删词，留空格）", "删除 / 修改")
probe("d$", 1, 7, "删到行尾（和 D 等价）", "删除 / 修改")
probe("d0", 1, 7, "从光标删到行首", "删除 / 修改")
probe("dgg", 5, 1, "从第 5 行删到文件开头", "删除 / 修改")
probe("dG", 5, 1, "从第 5 行删到文件末尾", "删除 / 修改")
probe("daw", 1, 1, "删掉一个词 + 后面的空白（a = around）", "删除 / 修改")
probe("diw", 1, 1, "删掉一个词，保留空白（i = inner）", "删除 / 修改")
probe("dap", 8, 1, "删掉整段 + 后面的空行", "删除 / 修改")
probe("dip", 8, 1, "删掉整段，不含后面的空行", "删除 / 修改")

-- ---------------------------------------------------------------- 3. 复制 / 粘贴
probe("yy", 1, 1, "复制整行（buffer 不变）", "复制 / 粘贴")
probe("Y", 1, 7, "复制整行（Vim 里 Y 等价 yy，不是 y$）", "复制 / 粘贴")
probe("yiw", 1, 1, "复制一个词", "复制 / 粘贴")
probeAfter("p", 1, 1, "yy", "复制整行后 p 粘到下一行", "复制 / 粘贴")
probeAfter("P", 1, 1, "yy", "复制整行后 P 粘到上一行", "复制 / 粘贴")
probeAfter("ddp", 1, 1, "", "dd 删行 + p 粘到下一行 = 交换相邻两行", "复制 / 粘贴")
probeAfter('"ayy', 1, 1, "", "把整行复制到**命名寄存器 a**", "寄存器 / 标记 / 宏")
probeAfter('"ap', 1, 1, '"ayy3j', "从命名寄存器 a 粘贴（先复制第 1 行，跳到第 4 行再粘）", "寄存器 / 标记 / 宏")
probeAfter("p", 1, 1, '"_dd', "用黑洞寄存器 _ 删行之后粘贴 —— 无名寄存器没被污染，粘的是上上次的内容", "寄存器 / 标记 / 宏")
probe('"_dd', 1, 1, "用**黑洞寄存器** _ 删行 —— 删掉且不污染无名寄存器", "寄存器 / 标记 / 宏")
probeAfter("yy", 1, 1, "", "只复制不粘贴，看无名寄存器里存了什么", "复制 / 粘贴")

-- ---------------------------------------------------------------- 4. 插入入口
probe("iX", 1, 3, "在光标**前**插入 X", "插入入口")
probe("aX", 1, 3, "在光标**后**插入 X", "插入入口")
probe("IX", 1, 3, "跳到行首插入 X", "插入入口")
probe("AX", 1, 3, "跳到行尾插入 X", "插入入口")
probe("oX", 1, 3, "在**下面**开新行插入 X", "插入入口")
probe("OX", 1, 3, "在**上面**开新行插入 X", "插入入口")
probe("RXY", 1, 1, "进替换模式，连续覆盖两个字符", "插入入口")

-- ---------------------------------------------------------------- 5. 可视模式
probe("vll", 1, 1, "字符级选中：往右两格（选中 lo）", "可视模式", { visual = true })
probe("V", 1, 1, "行级选中：整行", "可视模式", { visual = true })
probe("<C-v>", 1, 1, "块级选中（竖着选一列）", "可视模式", { visual = true })
probe("viw", 1, 1, "选中一个词（可视 + textobject）", "可视模式", { visual = true })
probe("vaw", 1, 1, "选中一个词 + 空白", "可视模式", { visual = true })
probe("v$", 1, 1, "选中到行尾", "可视模式", { visual = true })
probe("ggVG", 5, 1, "全选整个文件（gg + V + G）", "可视模式", { visual = true })

-- ---------------------------------------------------------------- 6. 光标移动
probe("w", 1, 1, "跳到下一个词首", "光标移动")
probe("b", 1, 10, "跳到上一个词首", "光标移动")
probe("e", 1, 1, "跳到词尾", "光标移动")
probe("W", 1, 1, "跳到下一个字串（按空白分，标点不算分隔）", "光标移动")
probe("B", 1, 10, "跳到上一个字串", "光标移动")
probe("E", 1, 1, "跳到字串尾", "光标移动")
probe("ge", 1, 10, "跳到上一个词的词尾", "光标移动")
probe("0", 5, 9, "跳到行首（第 0 列，缩进也跳过）", "光标移动")
probe("^", 5, 9, "跳到第一个非空字符（缩进之后）", "光标移动")
probe("$", 1, 1, "跳到行尾", "光标移动")
probe("gg", 5, 1, "跳到文件开头", "光标移动")
probe("G", 1, 1, "跳到文件末尾", "光标移动")
probe("5G", 1, 1, "跳到第 5 行（G 吃计数）", "光标移动")
probe("}", 1, 1, "跳到下一段（空行分隔）", "光标移动")
probe("{", 8, 1, "跳到上一段", "光标移动")
probe("%", 1, 22, "跳到配对括号（光标在 ( 上，跳到 )）", "光标移动")
probe("H", 5, 1, "跳到屏幕顶部", "光标移动")
probe("M", 9, 1, "跳到屏幕中部", "光标移动")
probe("L", 1, 1, "跳到屏幕底部", "光标移动")

-- ---------------------------------------------------------------- 7. 行内查找
probe("f(", 1, 1, "向右找到 ( 并停在它上面", "行内查找")
probe("t(", 1, 1, "向右到 ( **之前**一格", "行内查找")
probe("F(", 1, 25, "向左找到 (", "行内查找")
probe("T(", 1, 25, "向左到 ( **之后**一格", "行内查找")
probeAfter(";", 1, 1, "f,", "f, 找到逗号 → ; 重复同一查找（继续向后）", "行内查找")
probeAfter(",", 1, 25, "F,", "F, 找到逗号 → , 反向重复（继续向前）", "行内查找")
probeAfter(";", 1, 1, "t,", "t, 到逗号前 → ; 重复", "行内查找")

-- ---------------------------------------------------------------- 8. 缩进 / 大小写 / 合并
probe(">>", 4, 1, "整行右缩进（shiftwidth）", "缩进 / 大小写")
probe("<<", 5, 1, "整行左缩进", "缩进 / 大小写")
probe("==", 5, 1, "按语法自动缩进整行（这里第 5 行已按 lua 规则缩进好，所以无变化）", "缩进 / 大小写", { ft = "lua" })
probeAfter("==", 5, 1, "<<", "先 << 去掉缩进，再 == 让 lua 缩进规则把它缩回来", "缩进 / 大小写", { ft = "lua" })
probe(">j", 4, 1, "当前行 + 下一行一起缩进（操作符 + motion）", "缩进 / 大小写")
probe("~", 1, 1, "切换光标处字符的大小写，并右移一格", "缩进 / 大小写")
probe("g~~", 1, 1, "整行大小写取反", "缩进 / 大小写")
probe("gUU", 1, 1, "整行转大写", "缩进 / 大小写")
probe("guu", 1, 1, "整行转小写（第 1 行有 Total，所以看得见变化）", "缩进 / 大小写")
probe("gUw", 1, 1, "把下一个词转大写（操作符 + motion）", "缩进 / 大小写")
probe("J", 1, 1, "把下一行合上来，中间补一个空格", "合并 / 拆分")
probe("gJ", 1, 1, "合并下一行，**不补**空格", "合并 / 拆分")

-- ---------------------------------------------------------------- 9. 标记 / 宏
probe("ma", 3, 1, "在第 3 行打标记 a（buffer 不变）", "寄存器 / 标记 / 宏")
probeAfter("`a", 3, 5, "maG", "ma 打标记 → G 到末尾 → `a **精确**跳回标记（行+列）", "寄存器 / 标记 / 宏")
probeAfter("'a", 3, 5, "maG", "ma 打标记 → G 到末尾 → 'a 跳回标记**所在行行首**（列不还原）", "寄存器 / 标记 / 宏")
-- ⚠️ 宏一律走 probeTyped —— `:normal!` 录不进寄存器（见 feedTyped 说明）
probeTyped("@a", 1, 1, "qaxqj", "qa 开始录制（内容 x）→ q 停止 → @a 重放", "寄存器 / 标记 / 宏")
probeTyped("@@", 1, 1, "qaxqj@a", "@@ 重复上一次执行的寄存器宏", "寄存器 / 标记 / 宏")
probeTyped("q", 1, 1, "qa", "q 停止录制（正录着的时候按，寄存器里留下已录的键）", "寄存器 / 标记 / 宏")

-- ---------------------------------------------------------------- 10. 滚动 / 折叠
probe("<C-d>", 1, 1, "向下滚半屏", "滚动 / 折叠")
probe("<C-u>", 9, 1, "向上滚半屏", "滚动 / 折叠")
probe("<C-f>", 1, 1, "向下滚一整页", "滚动 / 折叠")
probe("<C-b>", 9, 1, "向上滚一整页", "滚动 / 折叠")
probe("<C-e>", 1, 1, "向下滚一行（光标不动）", "滚动 / 折叠")
probe("<C-y>", 9, 1, "向上滚一行（光标不动）", "滚动 / 折叠")
probe("zt", 5, 1, "把当前行滚到屏幕顶部", "滚动 / 折叠")
probe("zz", 5, 1, "把当前行滚到屏幕中间", "滚动 / 折叠")
probe("zb", 5, 1, "把当前行滚到屏幕底部", "滚动 / 折叠")
probe("za", 4, 1, "折叠开关（当前行有折叠时展开/收起）", "滚动 / 折叠", { ft = "lua" })
probe("zR", 4, 1, "展开所有折叠", "滚动 / 折叠", { ft = "lua" })
probe("zM", 4, 1, "收起所有折叠", "滚动 / 折叠", { ft = "lua" })

-- ---------------------------------------------------------------- 11. 文本对象（补 /text 之外的）
probe("di(", 1, 22, "删圆括号内（i( 和 i) 等价）", "文本对象")
probe("da(", 1, 22, "删圆括号 + 括号本身", "文本对象")
probe("di{", 5, 12, "删花括号内", "文本对象")
probe("da{", 5, 12, "删花括号 + 括号本身", "文本对象")
probe("di[", 1, 22, "删方括号内（这里没有方括号）", "文本对象")
probe("di<", 1, 22, "删尖括号内（这里没有尖括号）", "文本对象")
probe("diB", 5, 12, "删大括号内（B = 任意 {}，和 i{ 等价）", "文本对象")
probe("di\"", 2, 15, "删双引号内", "文本对象")
probe("da\"", 2, 15, "删双引号 + 引号本身", "文本对象")
probe("di'", 5, 19, "删单引号内", "文本对象")
probe("da'", 5, 19, "删单引号 + 引号本身", "文本对象")
probe("dis", 2, 15, "删一整句", "文本对象")
probe("dit", 5, 12, "删标签内（这里没有 HTML 标签）", "文本对象")
probe("dii", 5, 3, "删同样缩进的整块", "文本对象")
probe("dil", 5, 1, "删当前行（i + l）", "文本对象")
probe("dal", 5, 1, "删当前行 + 下面的空行", "文本对象")

-- ---------------------------------------------------------------- 12. 跳转 / 其他
probeAfter("<C-o>", 1, 1, "G", "G 跳到末尾后，<C-o> 跳回上一个位置", "跳转")
probeAfter("<C-i>", 1, 1, "G<C-o>", "跳回之后再 <C-i> 跳到下一个位置", "跳转")
probeAfter("g;", 1, 1, "xx", "跳到上一个修改点", "跳转")
probeAfter("g,", 1, 1, "xx", "跳到下一个修改点", "跳转")
probe("gcc", 1, 1, "注释当前行（需要注释插件/内建 comment）", "跳转")
probe("gcgc", 1, 1, "注释当前行（gcgc 和 gcc 等价）", "跳转")
probe("gx", 1, 1, "用系统程序打开光标下的路径/URL", "跳转")

-- ---------------------------------------------------------------- 13. 救回「缺 desc 被误排」的内建键
--
-- ## ⚠️ 这一节补的是另一类缺口
--
-- `/seq` 的 `whyNotDrillable()` 把「插件没上报 desc」等同于「不能出题」，
-- 于是一批**真正的 Vim 内建键**被静默排掉了。它们的共同点是：
-- 插件给它们注册了映射（为了别的目的），但没写 desc —— 于是被当成
-- 「没有描述，出不了题」。
--
-- 实测确认它们**都有确定的、可测的行为**，所以补上。
-- 用自定义文档（而不是标准 SRC）—— 这些键依赖具体的语法结构：
-- `%` 要有配对括号、`*` 要有重复的词、`&` 要先做过替换。

--- 用**自定义文档**测一条。
---
--- 为什么需要它：标准 SRC 是为 motion/textobject 设计的，
--- 里面没有「同一行两个配对括号」「重复的单词」这类结构，
--- 拿它测 `%` / `*` / `&` 会得到假的「无变化」。
---
--- ## ⚠️⚠️ 三条踩过的坑
---
--- 1. **插入模式的键必须和入口键一起喂**（`"A<C-W>"` 而不是先 `A` 再 `<C-W>`）。
---    `:normal! A` 执行完就退回普通模式了 —— 分成两次调用时，
---    第二次的 `<C-W>` 是在**普通模式**下按的，删的是别的东西。
---    实测：分开喂得到「buffer 没变」，合起来喂才对
---    （`hello world foo` → `hello world `）。所以入口键要拼进 `key`。
---
--- 2. **`%` 要求光标正好在括号上**。差一格就只是普通移动 ——
---    第一版在第 2 行第 7 列（`)` 之后的空格）测，得到「光标不动」的假结论。
---
--- 3. **matchit 的 `g%` / `[%` / `]%` / `a%` 是「映射」，不是内建命令**。
---    本机 `%` 的 rhs 是 `<Plug>(MatchitNormalForward)` —— 也就是说
---    **`%` 本身在本机就是一条映射**，而 `g%` / `[%` / `]%` 更是只在
---    matchit 加载后才存在。
---
---    ⚠️ `:normal!` **绕过映射**，所以拿它测这几个键会测到「裸 Vim 里
---    并不存在的行为」—— 实测得到「光标不动」的假结论。
---    正确做法是 `feedTyped`（走 typeahead，映射生效），见 `opts.typed`。
local function probeDoc(key, doc, line, col, note, category, opts)
  opts = opts or {}
  -- ⚠️ 同 setup()：必须用**真实文件** buffer（scratch buffer 下 U 行为不同）
  local path = vim.fn.tempname() .. ".txt"
  vim.fn.writefile(doc, path)
  vim.cmd("edit! " .. vim.fn.fnameescape(path))
  local buf = vim.api.nvim_get_current_buf()
  -- ⚠️ 同 setup()：写入内容本身会进撤销历史，必须先禁掉，
  --    否则 `u` 撤销的是「写内容」而不是后面那次编辑。
  vim.bo[buf].undolevels = -1
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, doc)
  vim.bo[buf].undolevels = 1000
  if opts.ft then vim.bo[buf].filetype = opts.ft end
  vim.api.nvim_win_set_cursor(0, { line, col - 1 })
  resetState()
  -- ⚠️ matchit 是 opt 包，LazyVim 在真机上会加载它
  --    （`%` 的 rhs 就是 `<Plug>(MatchitNormalForward)`）。
  --    headless 下要显式 packadd，否则测的是**裸 Vim 的行为**，不是本机行为。
  pcall(vim.cmd, "packadd matchit")
  local send = opts.typed and feedTyped or feed
  if opts.pre and opts.pre ~= "" then send(opts.pre) end
  local beforeKey = vim.deepcopy(vim.api.nvim_buf_get_lines(0, 0, -1, false))
  send(key)
  local lines, ln, cl = snapshot()
  out[#out + 1] = {
    key = key,
    line = line,
    col = col,
    result = lines,
    cursor = { ln, cl },
    -- ⚠️ 按键**之前**的 buffer（有前置时 = 前置跑完的状态）
    before = beforeKey,
    changed = not vim.deep_equal(beforeKey, lines),
    note = note,
    category = category,
    pre = opts.pre or "",
    ft = opts.ft,
    typed = opts.typed or false,
    -- ⚠️ 记下这一条用的是自定义文档 —— 界面画 diff 时要拿它当「之前」
    doc = doc,
  }
end

-- 括号配对文档：`%` 在 `(` 上跳到 `)`，`g%` 反向，`[%` / `]%` 跳到外层括号
--
-- ⚠️ `[%` / `]%` 测的是「跳到**外层**未配对的括号」，所以文档里
--    必须真的有**嵌套**：`f({ a = 1 })` 里 `{` 的「外层括号」是 `(`。
--    第一版用的是平铺的 `if (a and b)`（没有嵌套），于是 `[%` / `]%`
--    测出来「光标不动」—— 不是键失效，是**没有外层可跳**。
local BRACKETS = {
  "local x = f({ a = 1 })", -- ( 第 12 列 · { 第 13 列 · } 第 21 列 · ) 第 22 列
  "end",
}

-- ⚠️ 这几条走 `typed = true`（`:normal!` 绕过映射，测不到 matchit 的行为）
probeDoc("%", BRACKETS, 1, 12, "从 ( 跳到配对的 )", "括号跳转（matchit）", { typed = true })
probeDoc("%", BRACKETS, 1, 13, "从 { 跳到配对的 }", "括号跳转（matchit）", { typed = true })
probeDoc("g%", BRACKETS, 1, 22, "从 ) **反向**跳到配对的 ( —— matchit 提供", "括号跳转（matchit）", { typed = true })
probeDoc("[%", BRACKETS, 1, 13, "从 { 跳到**外层**未配对的 ( —— matchit 的 Multi 系列", "括号跳转（matchit）", { typed = true })
probeDoc("]%", BRACKETS, 1, 13, "从 { 跳到**外层**未配对的 ) —— matchit 的 Multi 系列", "括号跳转（matchit）", { typed = true })
probeDoc("a%", BRACKETS, 1, 13, "选中当前括号块 —— 可当 textobject 用（a%）", "括号跳转（matchit）", { typed = true })

-- 重复单词文档：`*` 向后搜同一个词，`#` 向前搜
local WORDS = { "local total = 1", "total = 2", "print(total)" }

probeDoc("*", WORDS, 1, 7, "向下搜索光标所在的整个词（\\<total\\>）", "搜索词")
probeDoc("#", WORDS, 3, 8, "向上搜索光标所在的整个词", "搜索词")

-- 替换文档：`&` 重复上一次 :s
local SUBST = { "aaa bbb aaa", "aaa ccc" }

probeDoc(
  "&",
  SUBST,
  1,
  1,
  "重复上一次 :s（在**下一行**上重复同样的替换）",
  "替换",
  -- ⚠️ `\r` 是 `:s` 命令的「回车」—— 不加它命令不会执行
  { pre = ":s/aaa/ZZZ/\r" }
)

-- 插入模式：入口键和编辑键**必须一起喂**（见 probeDoc 的坑 1）
--
-- ⚠️ 只收**真正的 Vim 内建**插入模式命令。
--    `,` `;` `.` `jk` 这些是 LazyVim / MiniPairs 的**映射**，不是内建命令：
--    实测（裸 nvim，没加载 LazyVim）按 `Ajk` 得到的是 `hellojk` ——
--    因为 `jk → <Esc>` 那条映射根本不存在，是 LazyVim 加的。
--    拿它测会得出**错的结论**，所以不收。
--    这类键留在 `/seq`（数据集里有它们的 rhs），不该混进「内建操作」。
probeDoc("A<C-W>", { "hello world foo" }, 1, 1, "插入模式：删掉光标前的一个词（内建）", "插入模式编辑")
probeDoc("A<C-U>", { "hello world foo" }, 1, 1, "插入模式：删到行首，整行清空（内建）", "插入模式编辑")

-- 可视模式下的 `>`：缩进选区，且**保持选中**（rhs 是 `>gv`）
probeDoc(">", { "function f(x)", "  body", "end" }, 1, 1, "可视模式：把选中的行缩进，并保持选中", "缩进 / 大小写", { pre = "Vj" })

-- ---------------------------------------------------------------- 输出
local path = vim.fn.expand("~/workspace/reflex/data/probe-core.json")
vim.fn.writefile({ vim.json.encode({ src = SRC, probes = out }) }, path)

local changed, moved, selected = 0, 0, 0
for _, p in ipairs(out) do
  if p.changed then changed = changed + 1 end
  if p.cursor[1] ~= p.line or p.cursor[2] ~= p.col then moved = moved + 1 end
  if p.selection then selected = selected + 1 end
end
print(("✅ 实测 %d 条内建操作 → %s"):format(#out, path))
print(("   改变 buffer %d 条 · 移动光标 %d 条 · 有可视选区 %d 条"):format(changed, moved, selected))
