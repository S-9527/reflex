-- 读你自己的 nvim 会话的窗口布局,给 reflex 页面画图。
--
-- ## 用法
--
-- 手动跑一次:   :lua require("reflex_layout").dump()
-- 永久挂上:     在 ~/.config/nvim/lua/plugins/ 里加一行(见 README)
--
-- ## 为什么只是个旁路
--
-- 它**只读**:不接管任何键位、不改任何行为,只往 JSON 写一份快照。
-- 不想用就把配置里那行 require 删掉,它彻底不存在。
--
-- 这一点是从 dojo 的教训来的:dojo 之所以难维护,是因为它要接管按键、
-- 转发原映射、处理 buffer-local 恢复 —— 全是为了"判分"这一个需求。
-- 而这里不需要判分,只需要看一眼,所以不该付那个代价。

local M = {}

local function buf_name(b)
  local n = vim.api.nvim_buf_get_name(b)
  if n == "" then return "[No Name]" end
  return n
end

--- 导出当前布局
---@return table
function M.layout()
  local tabs = {}
  for _, tabnr in ipairs(vim.api.nvim_list_tabpages()) do
    local wins = {}
    for _, w in ipairs(vim.api.nvim_tabpage_list_wins(tabnr)) do
      -- 只画普通窗口。浮窗(snacks 选择器、lsp hover)不是布局的一部分 ——
      -- 画进去图就没法看了。这一点踩过 dojo 的坑:
      -- 「#nvim_list_wins() 是恒真的」,因为它自己的 UI 浮窗也占窗口位。
      if vim.api.nvim_win_get_config(w).relative == "" then
        local pos = vim.fn.win_screenpos(w) -- {row, col},1-based
        local buf = vim.api.nvim_win_get_buf(w)
        wins[#wins + 1] = {
          winid = w,
          buf = buf,
          name = buf_name(buf),
          row = pos[1],
          col = pos[2],
          rowspan = vim.api.nvim_win_get_height(w),
          colspan = vim.api.nvim_win_get_width(w),
          active = w == vim.api.nvim_get_current_win(),
        }
      end
    end
    table.sort(wins, function(a, b)
      if a.row ~= b.row then return a.row < b.row end
      return a.col < b.col
    end)
    tabs[#tabs + 1] = {
      tabnr = tabnr,
      wins = wins,
      active = tabnr == vim.api.nvim_get_current_tabpage(),
    }
  end

  local buffers = {}
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    buffers[#buffers + 1] = {
      id = b,
      name = buf_name(b),
      listed = vim.bo[b].buflisted,
      loaded = vim.api.nvim_buf_is_loaded(b),
      winids = vim.fn.win_findbuf(b),
    }
  end

  return {
    tabs = tabs,
    buffers = buffers,
    curwin = vim.api.nvim_get_current_win(),
    columns = vim.o.columns,
    lines = vim.o.lines,
  }
end

--- 写到文件
---@param path? string  默认 stdpath("state")/reflex-layout.json
function M.dump(path)
  path = path or (vim.fn.stdpath("state") .. "/reflex-layout.json")
  vim.fn.mkdir(vim.fn.fnamemodify(path, ":h"), "p")
  local ok, err = pcall(vim.fn.writefile, { vim.json.encode(M.layout()) }, path)
  if not ok then
    vim.notify("reflex: 导出布局失败 " .. tostring(err), vim.log.levels.WARN)
  end
  return path
end

--- 在若干时机自动导出(去抖)。只读,不改变任何编辑行为。
function M.attach(opts)
  opts = opts or {}
  local path = opts.path
  vim.api.nvim_create_augroup("ReflexLayout", { clear = true })
  local t = nil
  vim.api.nvim_create_autocmd({ "WinEnter", "WinClosed", "TabEnter", "BufAdd", "BufDelete" }, {
    group = "ReflexLayout",
    callback = function()
      -- 去抖:连续切窗口时只写最后一次,避免狂刷磁盘
      if t then
        pcall(t.close)
        t = nil
      end
      t = vim.uv.new_timer()
      t:start(150, 0, function()
        M.dump(path)
        if t then
          t:stop()
          t:close()
          t = nil
        end
      end)
    end,
  })
  return M.dump(path)
end

return M
