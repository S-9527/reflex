-- 实测 quickfix 跳转(`]q` / `[q`)的边界行为。
--
-- 跑法:
--   script -qec "nvim --headless -c 'luafile scripts/probe-qf.lua' -c 'qa!'" /dev/null
-- 输出:data/probe-qf.txt
--
-- ## 为什么单独测
--
-- `]d` 我按直觉建模成「不绕回」,实测发现**会绕回**,写反了。
-- `]q` 是另一族(Trouble/quickfix),**不能假设它和 `]d` 一样** ——
-- 必须单独按一遍。
--
-- ## 它抓到的结论
--
-- 两族行为**不一样**:
--
--   quickfix 在第 2、5、8 行:
--     连按 ]q → 5, 8, 8, 8, 8    ← 停住,不绕回(报 E553)
--     连按 [q → 5, 2, 2, 2, 2    ← 停住
--
--   而 ]d 到头会绕回。
--
-- 我差点直接把 `]d` 的模型套到 `]q` 上 —— 那就画错了。
-- 这也解释了为什么用户会觉得两族「手感不一样」。

local out = {}
local function hdr(s) out[#out + 1] = "\n===== " .. s .. " =====" end

vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
vim.wait(6000, function() return false end)

-- 造一个 buffer，塞进 quickfix 列表的第 2、5、8 行
local buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_set_current_buf(buf)
local lines = {}
for i = 1, 12 do lines[i] = "qf line " .. i end
vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)

local items = {}
for _, lnum in ipairs({ 2, 5, 8 }) do
  items[#items + 1] = { bufnr = buf, lnum = lnum, col = 0, text = "qf " .. lnum }
end
vim.fn.setqflist(items, "r")

local function cur() return vim.api.nvim_win_get_cursor(0)[1] end
local function setl(l) vim.api.nvim_win_set_cursor(0, { l, 0 }) end
local lastErr = nil
local function feed(keys)
  lastErr = nil
  -- ⚠️ 必须 pcall：quickfix 到头会抛 E553，不包住整个脚本就中断了
  local ok, err = pcall(function()
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(keys, true, false, true), "x", false)
    vim.wait(120, function() return false end)
  end)
  if not ok then lastErr = tostring(err) end
end

hdr("quickfix 列表内容")
for i, it in ipairs(vim.fn.getqflist()) do
  out[#out + 1] = string.format("  [%d] 第 %d 行  %s", i, it.lnum, it.text)
end

hdr("]q 的边界行为（实测）")
setl(1)
out[#out + 1] = string.format("  起点第 %d 行", cur())
for i = 1, 5 do
  feed("]q")
  out[#out + 1] = string.format("  第 %d 次 ]q → 第 %d 行 %s", i, cur(),
    lastErr and ("【报错 " .. lastErr .. "】") or "")
  if lastErr then break end
end

hdr("[q 的边界行为（实测）")
setl(12)
out[#out + 1] = string.format("  起点第 %d 行", cur())
for i = 1, 5 do
  feed("[q")
  out[#out + 1] = string.format("  第 %d 次 [q → 第 %d 行 %s", i, cur(),
    lastErr and ("【报错 " .. lastErr .. "】") or "")
  if lastErr then break end
end

hdr("]q / [q 的真实映射")
for _, key in ipairs({ "]q", "[q" }) do
  for _, m in ipairs(vim.api.nvim_get_keymap("n")) do
    if m.lhs == key then
      out[#out + 1] = string.format("  %-4s rhs=%-30s desc=%s", key, tostring(m.rhs or "(lua)"), tostring(m.desc))
      break
    end
  end
end

-- 对照：:cnext / :cprevious 会不会绕回
hdr("对照 :cnext / :cprevious")
vim.cmd("cfirst")
out[#out + 1] = "  :cfirst → 第 " .. cur() .. " 行"
for i = 1, 4 do
  local ok, err = pcall(vim.cmd, "cnext")
  out[#out + 1] = string.format("  第 %d 次 :cnext → 第 %d 行 %s", i, cur(),
    ok and "" or ("【报错 " .. tostring(err) .. "】"))
  if not ok then break end
end

local outPath = vim.fn.expand("~/workspace/reflex/data/probe-qf.txt")
vim.fn.writefile(out, outPath)
print("写好了")
