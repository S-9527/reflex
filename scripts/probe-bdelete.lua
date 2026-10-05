-- 实测 `:bdelete` 的范围语法 —— 数据集里三条写错了。
--
-- 跑法：
--   script -qec "nvim --headless -c 'luafile scripts/probe-bdelete.lua' -c 'qa!'" /dev/null
-- 输出：data/probe-bdelete.txt
--
-- ## 为什么要单独测
--
-- `scripts/probe-ex.lua` 用 `exists(':bdelete')` 验的是**命令名存在**，
-- 但验不了**参数写法**对不对。而数据集里三条带范围的写法是错的：
--
-- | 写的 | 实测 |
-- |------|------|
-- | `:bdelete 1,$` | ❌ E94 |
-- | `:bdelete %,$` | ❌ E94 |
-- | `:bdelete +bufhidden` | ❌ E94 |
--
-- 根因：`:bdelete` 的**范围写在命令名前面**（`:N,Mbdelete`），
-- 写在后面会被当成 buffer 名去找 —— 找不到就报 E94。
-- 见 `:help :bdelete` 的 `:N,Mbdelete[!]`。
--
-- ⚠️ 另一个坑：我改成 `:1,{当前-1}bdelete` 后仍是**占位符跑不通**
--    （`E492: Not an editor command`）。正确写法是相对范围
--    `:1,.-1bdelete`（`.` = 当前）。

local out = {}
local function hdr(s) out[#out + 1] = "\n===== " .. s .. " =====" end

local function bufs() return vim.fn.getbufinfo({ buflisted = 1 }) end
local function count() return #bufs() end

-- 用 :badd 造真的 buffer（enew 只会替换当前那个）
local function mk(n)
  vim.cmd("only")
  vim.cmd("enew!")
  for i = 2, n do vim.cmd("badd /tmp/reflex-bd-" .. i .. ".txt") end
  return vim.tbl_map(function(b) return b.bufnr end, bufs())
end

local function try(label, cmd)
  local o, err = pcall(vim.cmd, cmd)
  local msg
  if o then
    msg = "✅ 剩 " .. count() .. " 个"
  else
    local e = tostring(err)
    if e:match("E516") then
      msg = "⚠️ E516 没东西可删（语法对，是边界）"
    else
      msg = "❌ " .. e:gsub(".*E(%d+): ", "E%1: "):gsub("\n.*", "")
    end
  end
  out[#out + 1] = string.format("  %-26s %-22s %s", label, cmd, msg)
end

hdr("删左边的（保留当前）")
local ids = mk(4)
out[#out + 1] = "  buffer 编号: " .. vim.inspect(ids) .. "，当前切到第 3 个"
vim.cmd("buffer " .. ids[3])
try("✅ 相对范围（推荐）", ":1,.-1bdelete")
ids = mk(4); vim.cmd("buffer " .. ids[3])
try("✅ 具体数字", ":1,2bdelete")
ids = mk(4); vim.cmd("buffer " .. ids[3])
try("❌ 数据集原写法", ":bdelete 1,$")

hdr("删右边的")
ids = mk(4); vim.cmd("buffer " .. ids[2])
out[#out + 1] = "  buffer 编号: " .. vim.inspect(ids) .. "，当前第 2 个"
try("✅ 相对范围（推荐）", ":+1,$bdelete")
ids = mk(4); vim.cmd("buffer " .. ids[2])
try("✅ 具体数字", ":3,$bdelete")
ids = mk(4); vim.cmd("buffer " .. ids[2])
try("❌ 数据集原写法", ":bdelete %,$")

hdr("删其它 / bufhidden")
ids = mk(4); vim.cmd("buffer " .. ids[2])
try("✅ 删其它全部", ":%bdelete")
ids = mk(3)
try("❌ 数据集原写法", ":bdelete +bufhidden")
try("对照（另一个命令）", ":bwipeout")

hdr("边界：已经在第一个 buffer")
ids = mk(4); vim.cmd("buffer " .. ids[1])
try("删左边（没东西）", ":1,.-1bdelete")

hdr("边界：已经在最后一个")
ids = mk(4); vim.cmd("buffer " .. ids[#ids])
try("删右边（没东西）", ":+1,$bdelete")

hdr("占位符写法跑不通（我第一版这么写的）")
ids = mk(4); vim.cmd("buffer " .. ids[3])
try("❌ 占位符", ":1,{当前-1}bdelete")

vim.fn.writefile(out, vim.fn.expand("~/workspace/reflex/data/probe-bdelete.txt"))
print("写好了")
