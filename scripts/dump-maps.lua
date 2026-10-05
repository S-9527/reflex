-- 抽取完整的键位数据 + which-key 分组结构。
--
-- ## 为什么不能只用 nvim_get_keymap
--
-- `nvim_get_keymap` 只给 lhs/desc/rhs,**拿不到 which-key 的分组**。
-- 分组是 LazyVim 在 which-key 的 plugin opts 里用
-- `spec = { { "<leader>b", group = "buffer" }, ... }` 注册的。
--
-- 只读 nvim_get_keymap = 丢掉整棵分组树,板块划分只能靠手写前缀规则猜 ——
-- 这正是现在「板块划分不合理」的根因。
--
-- ## ⚠️ 为什么必须手动触发 VimEnter
--
-- which-key 的 `config.setup()` 里,真正消费 spec 的 `load()` 被延迟:
--
--     local _load = vim.schedule_wrap(load)
--     if vim.v.vim_did_enter == 1 then
--       _load()
--     else
--       vim.api.nvim_create_autocmd("VimEnter", { once = true, callback = _load })
--     end
--
-- `nvim --headless -c 'luafile ...'` 跑脚本时 `vim_did_enter` 还是 0,
-- 所以走的是**注册 autocmd** 那条分支,而 VimEnter 在脚本之后才触发 ——
-- 脚本里 `Config.mappings` 是 0、`M.loaded` 是 false,分组一条都拿不到。
--
-- (我在这上面绕了四轮:先以为分组在 `_queue` 里(只有 6 条)、
--  再以为 leader 没归一化(改了还是 14 个键)、
--  再试 `:WhichKey`(headless 下阻塞等输入,卡死)。
--  真正的根因就是 load() 没跑。)
--
-- 所以这里手动触发 VimEnter,并用 `vim.wait` 边等边跑事件循环。
--
-- ## 为什么要 rhs
--
-- rhs 相同的两条映射,底层执行的是**同一条命令**,就是真同义键。
-- 判定「次解 / 等价解」只有这个判据是严谨的 —— desc 是插件的描述文字,
-- 不同插件可能撞词,同一功能可能措辞不同。
-- 旧脚本抽了 rhs 却在写 JSON 时丢掉(见 extract.lua 第 34 行抽、52 行没写),
-- 导致等价解只能靠手写表猜,于是出现「<Space>bb 被当成 L 的等价解」这种错。
--
-- ## 这次不做任何过滤
--
-- 不过滤 Insert、不筛 desc、不剔 auto-pairs。全量拉出来,
-- 要不要练交给训练器决定,而不是在抽取阶段就替你扔掉。

local out = { keys = {}, groups = {}, meta = {} }

-- 触发 VeryLazy:LazyVim 的 keymaps 和 which-key spec 都在这之后注册
vim.api.nvim_exec_autocmds("User", { pattern = "VeryLazy", modeline = false })
vim.wait(10000, function() return false end)

-- ------------------------------------------- 强制 which-key 消费它的 spec
local Config = nil
local ok_cfg, c = pcall(require, "which-key.config")
if ok_cfg then Config = c end

-- 手动触发 VimEnter,让 which-key 注册的 once-autocmd 跑起来
pcall(vim.api.nvim_exec_autocmds, "VimEnter", {})
-- vim.wait 会跑事件循环,所以 schedule_wrap 的 load() 也会被执行。
-- 条件:Config.loaded 变 true(load() 的最后一行就是它)。
vim.wait(8000, function() return Config and Config.loaded == true end, 20)

-- 队列里剩下的(若有)也喂进去
local ok_wk, wk = pcall(require, "which-key")
if ok_wk and Config then
  for _, todo in ipairs(wk._queue or {}) do
    pcall(Config.add, todo.spec, todo.opts)
  end
  wk._queue = {}
end

-- ---------------------------------------------------------------- 1. 全量键位
local MODES = { "n", "i", "v", "x", "o", "c", "s", "t" }
for _, mode in ipairs(MODES) do
  for _, m in ipairs(vim.api.nvim_get_keymap(mode)) do
    out.keys[#out.keys + 1] = {
      mode = mode,
      lhs = m.lhs,
      desc = m.desc or "",
      rhs = m.rhs or "",
      -- rhs 为空 = Lua 回调。这类键按下去有动作,但看不出是什么 ——
      -- 标出来,别在训练器里假装知道它等价于谁。
      lua = (m.rhs == nil or m.rhs == ""),
      buffer = (m.buffer ~= nil and m.buffer ~= 0) or false,
      expr = m.expr == 1,
      silent = m.silent == 1,
      noremap = m.noremap == 1,
    }
  end
end

-- ------------------------------------------------- 2. which-key 的分组定义
local function addGroup(key, group, desc, mode, proxy)
  if not key or key == "" then return end
  out.groups[#out.groups + 1] = {
    lhs = key, group = group, desc = desc, mode = mode, proxy = proxy,
  }
end

if Config and Config.mappings then
  for _, m in ipairs(Config.mappings) do
    local key = m.lhs or (type(m[1]) == "string" and m[1]) or nil
    if key and (m.group or m.proxy) then
      addGroup(key, m.group, type(m.desc) == "string" and m.desc or nil, m.mode, m.proxy)
    end
  end
end

-- 兜底:直接从 LazyVim 源码读顶层分组(最权威,不依赖运行时状态)
local editor = vim.fn.expand("~/.local/share/nvim/lazy/LazyVim/lua/lazyvim/plugins/editor.lua")
if vim.fn.filereadable(editor) == 1 then
  local src = table.concat(vim.fn.readfile(editor), "\n")
  for lhs, grp in src:gmatch('{%s*"([^"]+)"%s*,%s*group%s*=%s*"([^"]+)"') do
    addGroup(lhs, grp, nil, nil, nil)
  end
end

-- 归一化 + 去重
-- ⚠️ 分组写 `<leader>b`,而 nvim_get_keymap 的 lhs 里 leader 是**真实空格**。
local function norm(s) return (s:gsub("<leader>", " ")) end

local seen, uniq = {}, {}
for _, g in ipairs(out.groups) do
  g.lhs = norm(g.lhs)
  local k = g.lhs .. "|" .. tostring(g.group)
  if not seen[k] then
    seen[k] = true
    uniq[#uniq + 1] = g
  end
end
out.groups = uniq

-- --------------------------------------------- 3. 每个键归到最长的匹配分组
table.sort(out.groups, function(a, b) return #a.lhs > #b.lhs end)
local grouped = 0
for _, k in ipairs(out.keys) do
  for _, g in ipairs(out.groups) do
    -- 必须比分组键更长,否则分组节点自己(如 ` b`)也算成员
    if k.lhs ~= g.lhs and vim.startswith(k.lhs, g.lhs) then
      k.group = g.group
      k.groupLhs = g.lhs
      grouped = grouped + 1
      break
    end
  end
end

-- ---------------------------------------------------------- 4. 元信息
local byMode = {}
for _, k in ipairs(out.keys) do byMode[k.mode] = (byMode[k.mode] or 0) + 1 end

local withRhs, named = 0, 0
for _, k in ipairs(out.keys) do if not k.lua then withRhs = withRhs + 1 end end
for _, g in ipairs(out.groups) do if g.group then named = named + 1 end end

out.meta = {
  total = #out.keys,
  withRhs = withRhs,
  luaOnly = #out.keys - withRhs,
  groupDefs = #out.groups,
  namedGroups = named,
  grouped = grouped,
  loaded = Config and Config.loaded or false,
  byMode = byMode,
  extractedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
}

local path = vim.fn.expand("~/workspace/reflex/data/keymaps.json")
vim.fn.writefile({ vim.json.encode(out) }, path)

print(("✅ %d 键(rhs %d / lua %d)· 分组定义 %d 条(命名 %d)· 归组 %d 键(%.0f%%)· loaded=%s")
  :format(out.meta.total, out.meta.withRhs, out.meta.luaOnly,
          out.meta.groupDefs, out.meta.namedGroups,
          out.meta.grouped, out.meta.grouped / out.meta.total * 100,
          tostring(out.meta.loaded)))
print("   → " .. path)
