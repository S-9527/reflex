-- 验证数据集里那 55 个「声称实测过」的原生 Ex 命令。
--
-- ## 为什么要补这一刀
--
-- `lib/bindings.ts` 里 77 条原生等价标着 `nativeVerified: true`，
-- 意思是「我逐条跑过 exists(':命令')，确认存在」。
--
-- 但**探针脚本已经不存在了** —— 只有注释在声称。
-- 而这个项目已经被实测推翻过六次（`<Space>bb` 被当成 `L` 的等价解、
-- `<Tab>d` 漏了 leader、`]d` 绕回方向写反、`]q` 以为和 `]d` 同构、
-- `%` 出了三道重复题、窗口缩放步长 `±1` 写成 `±2`）。
--
-- `lib/provenance.ts` 那条又一次适用：**探针没验证过 → 结论不成立**。
--
-- 所以重新验一遍，把结果写成可复现的记录。
--
-- 跑法：
--   script -qec "nvim --headless -c 'luafile scripts/probe-ex.lua' -c 'qa!'" /dev/null
-- 输出：data/probe-ex.txt
--
-- ## 它抓到的三个错（第七次「凭印象写 → 实测推翻」）
--
-- 原来数据集里有三条**跑不通**的原生等价：
--
-- | 写的 | 实测 |
-- |------|------|
-- | `:bdelete 1,$` | ❌ E94 —— 范围要写在命令名**前面**（`:1,$bdelete`）|
-- | `:bdelete %,$` | ❌ E94 同上 |
-- | `:bdelete +bufhidden` | ❌ E94 —— `+bufhidden` 是 buffer 选项，不是参数 |
--
-- 还有一条更隐蔽：改成 `:1,{当前-1}bdelete` 后仍是**占位符跑不通**
-- （`E492`）。正确写法是相对范围 **`:1,.-1bdelete`**（`.` = 当前）。
--
-- 所以这个探针现在同时测**修正后的写法**（该跑得动）和
-- **原来那三条错的**（该继续报错，作为反向对照）。

local out = {}
local function hdr(s) out[#out + 1] = "\n===== " .. s .. " =====" end

vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
vim.wait(6000, function() return false end)

-- 数据集里声称「已实测存在」的 55 个命令名（去重后）
local CLAIMED = {
  "Man", "autocmd", "bdelete", "bnext", "bprevious", "buffer", "buffers",
  "clast", "close", "cnext", "cnfile", "command", "copen", "cpfile",
  "cprevious", "crewind", "edit", "enew", "find", "help", "history",
  "jumps", "last", "llast", "lnext", "lnfile", "lopen", "lpfile",
  "lprevious", "lrewind", "ls", "marks", "next", "nohlsearch", "previous",
  "ptnext", "redraw", "registers", "resize", "rewind", "split",
  "substitute", "tabclose", "tabfirst", "tablast", "tabnew", "tabnext",
  "tabonly", "tabprevious", "tlast", "trewind", "vertical", "vsplit",
  "wincmd", "write",
}

hdr("逐个 exists() 验证")

local ok, missing = {}, {}
for _, name in ipairs(CLAIMED) do
  -- ⚠️ exists() 只认命令名，带参数的要只查名字
  --    （这个坑踩过：`:wincmd h` 查的是 `:wincmd`）
  local n = vim.fn.exists(":" .. name)
  if n ~= 0 then
    ok[#ok + 1] = name
  else
    missing[#missing + 1] = name
  end
end

out[#out + 1] = string.format("  存在: %d / %d", #ok, #CLAIMED)
if #missing > 0 then
  out[#out + 1] = "\n  ❌ 不存在的（数据集的声称是错的）:"
  for _, name in ipairs(missing) do
    out[#out + 1] = "    :" .. name
  end
else
  out[#out + 1] = "  ✅ 全部存在，数据集的声称成立"
end

-- 顺带验证几个「带参数」的写法能不能真跑（exists 只验名字，不验参数）
hdr("带参数的命令：实跑一遍看报不报错")

local function tryCmd(cmd)
  local o, err = pcall(vim.cmd, cmd)
  return o, err
end

-- ⚠️ 这里测的是**修正后**的写法，不是原来那三条错的。
--
-- 原来测的是 `:bdelete 1,$` / `:bdelete %,$` / `:bdelete +bufhidden`，
-- 实测全报 E94。修正后：
--   删左边 → `:1,.-1bdelete`（相对范围，`. ` = 当前）
--   删右边 → `:+1,$bdelete`
--   删其它 → `:%bdelete`
-- 那三条错的也留着一起测，作为**反向对照**（它们应该继续报错）。
local SAMPLES = {
  ":buffer #",
  ":resize +2",
  ":vertical resize -2",
  ":history /",
  ":wincmd h",
  ":bdelete!",
  ":ls",
  -- ✅ 修正后的写法（应该跑得动）
  ":1,.-1bdelete",
  ":+1,$bdelete",
  ":%bdelete",
  -- ❌ 原来的错误写法（应该继续报错，作为对照）
  ":bdelete 1,$",
  ":bdelete %,$",
  ":bdelete +bufhidden",
}

-- ⚠️ 先造几个 buffer，否则 `:bdelete 1,$` 会报 E94（没有匹配的 buffer），
--    那是**环境问题不是命令问题**。这个区分很重要 ——
--    我第一版直接在空 buffer 上跑，三条全报错，差点误判成「命令写错了」。
vim.cmd("only")
vim.cmd("enew!")
for i = 2, 5 do vim.cmd("badd /tmp/reflex-probe-" .. i .. ".txt") end
out[#out + 1] = string.format("  （先造了 %d 个 buffer 再测）", #vim.fn.getbufinfo({ buflisted = 1 }))

for _, c in ipairs(SAMPLES) do
  local o, err = tryCmd(c)
  local msg
  if o then
    msg = "✅ 跑得动"
  else
    local e = tostring(err)
    -- ⚠️ 区分「语法错」和「边界情况」：
    --    E492/E94 = 命令名或参数写错 → 真的错
    --    E516      = 语法对，只是没东西可删（边界）→ 不算错
    if e:match("E516") then
      msg = "⚠️ E516 没东西可删（语法对，是边界）"
    else
      msg = "❌ " .. e:gsub(".*E(%d+): ", "E%1: "):gsub("\n.*", "")
    end
  end
  out[#out + 1] = string.format("  %-24s %s", c, msg)
  -- 每条测完补回 buffer，免得后面的命令受前面影响。
  --
  -- ⚠️ 文件名必须**唯一** —— `badd` 按名字去重，用同一个名字
  --    加第二次不会生效，`while` 就永远转不完
  --    （我第一次写死循环了，探针卡住 60 秒被挪到后台）。
  local n = 0
  while #vim.fn.getbufinfo({ buflisted = 1 }) < 5 and n < 10 do
    n = n + 1
    vim.cmd("badd /tmp/reflex-probe-refill-" .. n .. ".txt")
  end
end

-- 反向验证：故意写错的探针应该报 0（确认 exists 本身没坏）
hdr("探针自检（防止探针自己坏了）")
out[#out + 1] = "  exists(':bnext')   = " .. vim.fn.exists(":bnext") .. "   (应非 0)"
out[#out + 1] = "  exists(':bPrev')   = " .. vim.fn.exists(":bPrev") .. "   (应为 0 —— 我写错过这个)"
out[#out + 1] = "  exists(':b#')      = " .. vim.fn.exists(":b#") .. "   (应为 0 —— # 是参数不是命令名)"
out[#out + 1] = "  exists(':notacmd') = " .. vim.fn.exists(":notacmd") .. "   (应为 0)"

local outPath = vim.fn.expand("~/workspace/reflex/data/probe-ex.txt")
vim.fn.writefile(out, outPath)
print("写好了")
