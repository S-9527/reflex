-- 从当前 nvim 会话导出窗口布局,给 reflex 页面画图用。
--
-- ## 用法
--
-- 手动跑一次(在 nvim 里):  :lua require("reflex_layout").dump()
-- 或在启动时挂上:
--   lua require("reflex_layout").attach()
--
-- ## 为什么放在这里而不是插件里
--
-- 它是个**只读的旁路**:不接管任何键位、不改任何行为,只写一个 JSON 文件。
-- 你不想用它的时候,配置里那行 require 删掉就完全不存在。
-- 这一点和 dojo 的教训有关 —— dojo 之所以难维护,是因为它要接管按键。
--
-- ⚠️ 不要把它当权威数据源:这是**抽样**。只有在你触发 dump 时才反映那一刻
--    的状态。用来画图、用来对照,不要用来当断言依据。

local M = {}

local function buf_name(b)
  local n = vim.api.nvim_buf_get_name(b)
  if n == "" then return "[No Name]" end
  return n
end

local function dump_buf()
  local out = {}
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    local listed = vim.bo[b].buflisted
    -- 保留未列出的(unlisted)也有用:它们是「隐藏缓冲区」,第 9 章会提到
    out[#out + 1] = {
      id = b,
      name = buf_name(b),
      listed = listed,
      loaded = vim.api.nvim_buf_is_loaded(b),
      winids = vim.fn.win_findbuf(b),
    }
  end
  return out
end

local function dump_tab(tabnr)
  local wins = {}
  for _, w in ipairs(vim.api.nvim_tabpage_list_wins(tabnr)) do
    -- 只画普通窗口。浮窗(snacks 选择器、lsp hover)不是布局的一部分,
    -- 画进去会让图变得没法看 —— 这一点是从 dojo 的教训来的:
    -- 「#nvim_list_wins() 在 dojo 里是恒真的」,因为浮窗也占窗口位。
    if vim.api.nvim_win_get_config(w).relative == "" then
      local pos = vim.fn.win_screenpos(w) -- {row, col},1-based
      wins[#wins + 1] = {
        winid = w,
        buf = vim.api.nvim_win_get_buf(w),
        name = buf_name(vim.api.nvim_win_get_buf(w)),
        row = pos[1],
        col = pos[2],
        rowspan = vim.api.nvim_win_get_height(w),
        colspan = vim.api.nvim_win_get_width(w),
        active = w == vim.api.nvim_get_current_win(),
      }
    end
  end
  return {
    tabnr = tabnr,
    wins = wins,
    active = tabnr == vim.api.nvim_get_current_tabpage(),
  }
end

function M.layout()
  local tabs = {}
  for _, t in ipairs(vim.api.nvim_list_tabpages()) do
    tabs[#tabs + 1] = dump_tab(t)
  end
  return {
    tabs = tabs,
    buffers = dump_buf(),
    curwin = vim.api.nvim_get_current_win(),
    columns = vim.o.columns,
    lines = vim.o.lines,
  }
end

--- 写到文件。默认路径和 reflex 页面读的一致。
---@param path? string
function M.dump(path)
  path = path or (vim.fn.stdpath("state") .. "/reflex-layout.json")
  vim.fn.mkdir(vim.fn.fnamemodify(path, ":h"), "p")
  local ok, err = pcall(vim.fn.writefile, { vim.json.encode(M.layout()) }, path)
  if not ok then
    vim.notify("reflex: 导出布局失败 " .. tostring(err), vim.log.levels.WARN)
  end
  return path
end

--- 在若干时机自动导出。只读,不改行为。
function M.attach(opts)
  opts = opts or {}
  local path = opts.path
  local group = vim.api.nvim_create_augroup("ReflexLayout", { clear = true })
  local targets = { "WinEnter", "WinClosed", "TabEnter", "BufAdd", "BufDelete" }
  if opts.debounce == false then
    vim.api.nvim_create_autocmd(targets, {
      group = group,
      callback = function() M.dump(path) end,
    })
  else
    -- 去抖:连续切窗口时只写最后一次,避免狂刷磁盘
    local t = nil
    vim.api.nvim_create_autocmd(targets, {
      group = group,
      callback = function()
        if t then pcall(vim.api.nvim_del_augroup_by_id, t) end
        t = vim.api.nvim_create_augroup("ReflexLayoutDebounce", { clear = true })
        vim.api.nvim_create_autocmd({ "User" }, {
          group = t,
          pattern = "VeryLazy",
          once = true,
          callback = function() M.dump(path) end,
        })
        vim.defer_fn(function() M.dump(path) end, 200)
      end,
    })
  end
  return M.dump(path)
end

return M
