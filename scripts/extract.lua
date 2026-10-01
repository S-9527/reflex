-- 从当前 LazyVim 会话抽取所有用户可按的键位,输出 JSON。
--
-- ## 为什么要用 nvim 跑,而不是读 lazy 配置
--
-- 因为「键位」的真相在**运行时的映射表**里,不在配置文件里。
-- lazy 的 spec 可以写错、被覆盖、被插件运行时改写(map 出来的)。
-- `nvim_get_keymap` 是唯一可信的来源 —— 这也是用户自己
-- 在 memo/docs/tools/lazyvim.md §3 里用的方法。
--
-- ## 必须在真 pty 下跑
--
-- 用户 pitfalls.md 记的坑:headless 下 `User VeryLazy` 不触发,
-- `lazyvim/config/keymaps.lua` 整份不执行,键位数从 234 掉到 140。
-- 所以外面套 `script -qec`。
--
-- 用法:script -qec "nvim --headless -c 'luafile scripts/extract.lua' -c 'qa!'" /dev/null

local out = {}
local MODE_DESC = { n = "Normal", i = "Insert", v = "Visual+Select", x = "Visual", o = "Operator-pending", c = "Cmdline", s = "Select" }

-- 触发 VeryLazy,否则 keymaps.lua 不执行
vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
vim.wait(8000, function() return false end)

-- 用户主动禁用了 flash —— 它如果被启用会接管 s/S,那些键不该进题库
local disabled = { ["folke/flash.nvim"] = true }

local function lhss(mode)
  local seen, acc = {}, {}
  for _, m in ipairs(vim.api.nvim_get_keymap(mode)) do
    local lhs = m.lhs
    if lhs and lhs ~= "" and not seen[lhs] then
      seen[lhs] = true
      acc[#acc + 1] = { lhs = lhs, desc = m.desc or "", rhs = m.rhs or "" }
    end
  end
  return acc
end

for _, mode in ipairs({ "n", "i", "v", "x", "o", "c", "s" }) do
  local maps = lhss(mode)
  -- global 的先出,buffer-local 的跳过(需要特定 buffer 才成立,
  -- 比如 gd/K —— 它们在 10 章会单独讲,不在这里当通用键练)
  for _, m in ipairs(maps) do
    local lhs = m.lhs
    -- 滤掉不可能是"用户接口"的
    local bad =
      lhs:match("^<Plug>")            -- 插件内部桥接
      or lhs:match("^<80>")           -- termcode 垃圾
      or lhs:match("^%s*$")
      or lhs:match("^<F%d+>$")        -- 纯 F 键
    if not bad then
      out[#out + 1] = {
        mode = mode,
        mode_desc = MODE_DESC[mode] or mode,
        lhs = lhs,
        desc = m.desc,
      }
    end
  end
end

local path = vim.fn.expand("~/workspace/reflex/data/raw-lazyvim.json")
vim.fn.mkdir(vim.fn.fnamemodify(path, ":h"), "p")
vim.fn.writefile({ vim.json.encode(out) }, path)
vim.fn.writefile({ ("共 %d 条"):format(#out) }, "/tmp/extract-count.txt")
