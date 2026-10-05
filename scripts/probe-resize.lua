-- 实测窗口缩放的**实际位移**。
--
-- ## 为什么要实测
--
-- `lib/keys.ts` 里我写过一条结论:
--
--   「书 9.3.5 说裸按 <C-Up> 只挪一行/一列,真实场景要 20<C-Up>」
--
-- 但那是**从书里抄的**,不是在本机实测的 ——
-- 而这个项目已经因为「凭印象写」错过五次了:
--   <Space>bb 被当成 L 的等价解 / <Tab>d 漏了 leader 前缀 /
--   ]d 的绕回我把方向写反 / ]q 和 ]d 以为同构 / % 的三道重复题
--
-- 所以做可视化之前先测:裸按一次到底挪多少?

local out = {}
local function hdr(s) out[#out + 1] = "\n===== " .. s .. " =====" end

vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
vim.wait(6000, function() return false end)

-- 造两个窗口（竖切），把宽度记下来
local buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_set_current_buf(buf)
vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "test" })

local function win_widths()
  local ws = {}
  for _, w in ipairs(vim.api.nvim_list_wins()) do
    ws[#ws + 1] = vim.api.nvim_win_get_width(w)
  end
  table.sort(ws)
  return ws
end

local function feed(keys)
  local ok, err = pcall(function()
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(keys, true, false, true), "x", false)
    vim.wait(120, function() return false end)
  end)
  return ok, err
end

hdr("窗口缩放的位移(实测)")

vim.cmd("vsplit")
local before = win_widths()
out[#out + 1] = "  竖切后宽度: " .. vim.inspect(before)
out[#out + 1] = "  columns = " .. vim.o.columns .. "  (屏宽决定每次挪多少)"

-- 裸按一次 <C-Right>
local ok = feed("<C-Right>")
out[#out + 1] = "\n  按 1 次 <C-Right> → " .. (ok and vim.inspect(win_widths()) or "报错")
out[#out + 1] = "  变化: " .. vim.inspect({ before[1], win_widths()[1] })

-- 带计数
local before2 = win_widths()
feed("10<C-Right>")
out[#out + 1] = "\n  按 10<C-Right> → " .. vim.inspect(win_widths())
out[#out + 1] = "  变化: " .. vim.inspect({ before2[1], win_widths()[1] })

-- 再带大计数
local before3 = win_widths()
feed("30<C-Right>")
out[#out + 1] = "\n  按 30<C-Right> → " .. vim.inspect(win_widths())
out[#out + 1] = "  变化: " .. vim.inspect({ before3[1], win_widths()[1] })

hdr("横向缩放的位移(实测)")

vim.cmd("split")
local hbefore = {}
for _, w in ipairs(vim.api.nvim_list_wins()) do
  hbefore[#hbefore + 1] = vim.api.nvim_win_get_height(w)
end
table.sort(hbefore)
out[#out + 1] = "  横切后高度: " .. vim.inspect(hbefore)

local okj = feed("<C-Down>")
out[#out + 1] = "  按 1 次 <C-Down> → 变化: " ..
  (okj and vim.inspect({ hbefore[#hbefore], (function()
    local hs = {}
    for _, w in ipairs(vim.api.nvim_list_wins()) do hs[#hs + 1] = vim.api.nvim_win_get_height(w) end
    table.sort(hs)
    return hs[#hs]
  end)() }) or "报错")

feed("10<C-Down>")
local hs2 = {}
for _, w in ipairs(vim.api.nvim_list_wins()) do hs2[#hs2 + 1] = vim.api.nvim_win_get_height(w) end
table.sort(hs2)
out[#out + 1] = "  再按 10<C-Down> → " .. vim.inspect(hs2)

hdr("这四个键的真实映射")
for _, key in ipairs({ "<C-Up>", "<C-Down>", "<C-Left>", "<C-Right>" }) do
  local found
  for _, m in ipairs(vim.api.nvim_get_keymap("n")) do
    if m.lhs == key then found = m break end
  end
  if found then
    out[#out + 1] = string.format("  %-10s rhs=%-32s desc=%s", key, tostring(found.rhs or "(lua)"), tostring(found.desc))
  else
    out[#out + 1] = string.format("  %-10s (没有这个映射)", key)
  end
end

hdr(">:resize 的原生写法对照")
vim.cmd("vsplit")
local b4 = vim.api.nvim_win_get_width(0)
vim.cmd("vertical resize +5")
local af = vim.api.nvim_win_get_width(0)
out[#out + 1] = string.format("  :vertical resize +5  → %d → %d (差 %d)", b4, af, af - b4)
vim.cmd("vertical resize -3")
out[#out + 1] = string.format("  :vertical resize -3  → %d → %d (差 %d)", af, vim.api.nvim_win_get_width(0), vim.api.nvim_win_get_width(0) - af)

local outPath = vim.fn.expand("~/workspace/reflex/data/probe-resize.txt")
vim.fn.writefile(out, outPath)
print("写好了")
