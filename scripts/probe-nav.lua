-- 实测诊断跳转 / 搜索跳转的**边界行为**。
--
-- 跑法:
--   script -qec "nvim --headless -c 'luafile scripts/probe-nav.lua' -c 'qa!'" /dev/null
-- 输出:data/probe-nav.txt
--
-- ## 为什么需要这个探针
--
-- `]d` / `[d` 在本机的 rhs 是**空的**(Lua 回调),`nvim_get_keymap`
-- 看不出它们的行为 —— 只能真的按一遍。
--
-- ## 它抓到的错(重要)
--
-- 我在 lib/diag-nav.ts 里按「Vim 手册的直觉」建模:
--
--   ]d 到末尾**不动**(不绕回)
--
-- 而且为这个假设写了注释和测试,还声称「这和 :cnext 会绕回是两回事」。
-- **实测把它推翻了**:
--
--   诊断在第 3、7 行,从第 1 行连按 ]d:
--     第 3 次 → 第 3 行   ← 绕回了
--
-- 也就是说 `]d` 和 `:cnext` 的行为**一样**(都绕回)。
-- 那条「证明它不绕回」的测试,把**错的**行为锁住了。
--
-- `lib/provenance.ts` 里那条又一次应验:**探针没验证过 → 结论不成立**。

local out = {}

local function hdr(s) out[#out + 1] = "\n===== " .. s .. " =====" end

-- 触发 LazyVim 的键位注册
vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
vim.wait(6000, function() return false end)

-- ---------------------------------------------------------------- 1. 映射真相
hdr("]d / [d / ]q / [q 的真实映射")

for _, key in ipairs({ "]d", "[d", "]q", "[q", "]D", "[D", "n", "N" }) do
  local maps = vim.api.nvim_get_keymap("n")
  local found
  for _, m in ipairs(maps) do
    if m.lhs == key then found = m break end
  end
  if found then
    out[#out + 1] = string.format("  %-4s rhs=%-40s desc=%s",
      key, tostring(found.rhs or "(lua 回调)"), tostring(found.desc))
  else
    out[#out + 1] = string.format("  %-4s (没有这个映射)", key)
  end
end

-- ---------------------------------------------------------- 2. 诊断跳转行为
hdr("]d 的边界行为(实测)")

-- 造一个 buffer,给第 3、7 行挂诊断
local buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_set_current_buf(buf)
local lines = {}
for i = 1, 12 do lines[i] = "line " .. i end
vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)

local ns = vim.api.nvim_create_namespace("reflex_probe")
vim.diagnostic.set(ns, buf, {
  { lnum = 2, col = 0, message = "d1", severity = 1 },
  { lnum = 6, col = 0, message = "d2", severity = 2 },
})

local function cur_line() return vim.api.nvim_win_get_cursor(0)[1] end
local function set_line(l) vim.api.nvim_win_set_cursor(0, { l, 0 }) end
local function feed(keys)
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(keys, true, false, true), "x", false)
  vim.wait(120, function() return false end)
end

-- 从第 1 行开始,连按 5 次 ]d
set_line(1)
out[#out + 1] = string.format("  起点第 %d 行", cur_line())
for i = 1, 5 do
  feed("]d")
  out[#out + 1] = string.format("  第 %d 次 ]d → 第 %d 行", i, cur_line())
end

-- 从最后一行倒着按 [d
set_line(12)
out[#out + 1] = string.format("\n  起点第 %d 行", cur_line())
for i = 1, 5 do
  feed("[d")
  out[#out + 1] = string.format("  第 %d 次 [d → 第 %d 行", i, cur_line())
end

-- ---------------------------------------------------------- 3. 搜索跳转行为
hdr("n / N 的边界行为(实测)")

local sbuf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_set_current_buf(sbuf)
vim.api.nvim_buf_set_lines(sbuf, 0, -1, false, {
  "total one", "x", "total two", "x", "total three",
})

-- 正向搜索
vim.fn.setreg("/", "total")
vim.cmd("normal! gg")
vim.fn.search("total", "cW")
out[#out + 1] = string.format("  正向搜 total,起点第 %d 行", cur_line())
for i = 1, 4 do
  feed("n")
  out[#out + 1] = string.format("    第 %d 次 n → 第 %d 行", i, cur_line())
end
out[#out + 1] = "  --- 现在按 N ---"
for i = 1, 2 do
  feed("N")
  out[#out + 1] = string.format("    第 %d 次 N → 第 %d 行", i, cur_line())
end

-- 反向搜索：验证「n 和 N 角色互换」
hdr("反向搜索(? )后 n / N 的方向")
vim.cmd("normal! G$")
vim.fn.search("total", "bW")
out[#out + 1] = string.format("  反向搜 total,起点第 %d 行", cur_line())
feed("n")
out[#out + 1] = string.format("    按 n → 第 %d 行 (如果变小=往前,说明角色互换了)", cur_line())
feed("N")
out[#out + 1] = string.format("    按 N → 第 %d 行", cur_line())

-- ------------------------------------------------------- 4. wrapscan 设置
hdr("wrapscan 当前值")
out[#out + 1] = "  wrapscan = " .. tostring(vim.o.wrapscan)

local outPath = vim.fn.expand("~/workspace/reflex/data/probe-nav.txt")
vim.fn.writefile(out, outPath)
print("写好了")
