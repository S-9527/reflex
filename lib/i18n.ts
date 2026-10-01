// 描述的中文翻译表。key = 原始英文 desc。
//
// ## 为什么要单独一张表,而不是直接写进 bindings.ts
//
// 三个理由:
// 1. bindings.ts 是从 nvim 抽取自动生成的,重跑脚本会覆盖手写内容。
//    翻译必须独立存放,才能在重新抽取后自动套用。
// 2. 同一句英文在不同键下含义不同。见下面 `Comment textobject` 的处理 ——
//    它在不同 mode 下的实际动作不一样,一句话翻不准。
// 3. 保留原文可对照。键位来自插件 desc,不是我的原创,留英文原文便于
//    以后核对上游改了什么(而且符合"不抄官方文档、留链接"的原则)。
//
// ## 覆盖方式
//
// 顺序:translations[display + "|" + mode] → translations[display] → translations[desc]
// 前两个用于按 (键, 模式) 精确覆盖,第三个是按英文原文的通用兜底。
//
// ## 状态
//
// 全部 status="mapped":键确实存在(本机 nvim_get_keymap 实测),
// 中文描述是我翻译的,未经你逐条校校。用之前请当"草稿"看。

export const translations: Record<string, string> = {
  // ── 窗口(第 1 关,你的弱项)────────────────────────────
  "Go to Left Window": "跳到左边的窗口",
  "Go to Right Window": "跳到右边的窗口",
  "Go to Upper Window": "跳到上方的窗口",
  "Go to Lower Window": "跳到下方的窗口",
  "Increase Window Width": "增加窗口宽度",
  "Decrease Window Width": "减少窗口宽度",
  "Increase Window Height": "增加窗口高度",
  "Decrease Window Height": "减少窗口高度",
  "Delete Window": "关闭当前窗口",
  "Toggle Zoom Mode": "切换缩放模式(只留当前窗口,全屏)",
  "Window Hydra Mode (which-key)": "窗口命令菜单(钉住,可连按)",
  "Split Window Right": "垂直分屏(左右)",
  "Split Window Below": "水平分屏(上下)",
  "Delete Buffer and Window": "关掉这个 buffer 及其所在窗口",

  // ── 缓冲区 ─────────────────────────────────────────
  "Next Buffer": "下一个缓冲区",
  "Prev Buffer": "上一个缓冲区",
  "Switch to Other Buffer": "切到另一个缓冲区",
  "Move buffer next": "把当前标签往右挪一格",
  "Move buffer prev": "把当前标签往左挪一格",
  "Pick Buffer": "缓冲区选择器(可搜索)",
  "Delete Buffer": "关闭当前缓冲区",
  "Delete Buffers to the Left": "关闭左边的所有缓冲区",
  "Delete Buffers to the Right": "关闭右边的所有缓冲区",
  "Delete Other Buffers": "只留当前这个缓冲区",
  "Delete Non-Pinned Buffers": "关闭所有未固定的缓冲区",
  "Delete Invisible Buffers": "清理看不见的缓冲区",
  "Toggle Pin": "固定/取消固定这个标签",
  "Buffer Keymaps (which-key)": "当前缓冲区的键位表",
  "Buffer Lines": "诊断 + 位置列表 + 标记",
  "Buffer Diagnostics": "当前缓冲区的诊断",
  "Line Diagnostics": "当前行的诊断",
  "Diagnostics (Trouble)": "诊断面板(Trouble)",
  "Buffer Diagnostics (Trouble)": "本文件诊断(Trouble)",
  "Location List (Trouble)": "位置列表(Trouble)",
  "Quickfix List (Trouble)": "快速修复列表(Trouble)",
  "Todo (Trouble)": "待办(Trouble)",
  "Todo/Fix/Fixme (Trouble)": "TODO/FIX/FIXME(Trouble)",

  // ── 文件查找 ──────────────────────────────────────
  "Find Files (Root Dir)": "查找文件(项目根目录)",
  "Find Files (cwd)": "查找文件(当前目录)",
  "Find Files (git-files)": "查找文件(仅 git 跟踪的)",
  "Find Config File": "查找配置文件",
  "New File": "新建文件",
  "Grep (Root Dir)": "项目内全文搜索",
  "Grep (cwd)": "当前目录全文搜索",
  "Grep Open Buffers": "在已打开的缓冲区里搜索",
  "Explorer Snacks (root dir)": "文件树(项目根)",
  "Explorer Snacks (cwd)": "文件树(当前目录)",

  // ── Git ───────────────────────────────────────────
  "Git Status": "Git 状态",
  "Git Diff (hunks)": "查看改动块",
  "Git Diff (origin)": "与远端的差异",
  "Git Blame Line": "这一行是谁改的",
  "Git Browse (open)": "在浏览器打开当前文件",
  "Git Browse (copy)": "复制仓库链接",
  "Git Log": "提交历史",
  "Git Log (cwd)": "提交历史(当前目录)",
  "Git Current File History": "当前文件的历史",
  "Git Stash": "Git 贮藏",

  // ── GitHub ────────────────────────────────────────
  "GitHub Issues (open)": "未关闭的 Issue",
  "GitHub Issues (all)": "所有 Issue",
  "GitHub Pull Requests (open)": "未合并的 PR",
  "GitHub Pull Requests (all)": "所有 PR",

  // ── 代码 / LSP ────────────────────────────────────
  "vim.lsp.buf.code_action()": "代码操作(快速修复建议)",
  "vim.lsp.buf.references()": "查找引用",
  "vim.lsp.buf.rename()": "重命名符号",
  "vim.lsp.buf.implementation()": "跳到实现",
  "vim.lsp.buf.type_definition()": "跳到类型定义",
  "vim.lsp.buf.document_symbol()": "文档符号表",
  "LSP references/definitions/... (Trouble)": "LSP 面板:引用/定义/诊断等",
  "Symbols (Trouble)": "符号面板",
  "Mason": "Mason:管理 LSP / 格式化 / 检查器",
  "Format": "格式化",
  "Format Injected Langs": "格式化注入语言(比如内嵌的代码块)",
  "Toggle Auto Format (Buffer)": "自动格式化(仅当前文件)",
  "Toggle Auto Format (Global)": "自动格式化(全局)",
  "Inspect Pos": "查看光标位置信息",
  "Inspect Tree": "查看语法树",

  // ── 搜索替换 ──────────────────────────────────────
  "Search and Replace": "搜索并替换",
  "Search History": "搜索历史",
  "Next Search Result": "下一个搜索结果",
  "Prev Search Result": "上一个搜索结果",
  "Escape and Clear hlsearch": "取消高亮搜索",
  "Redraw / Clear hlsearch / Diff Update": "重绘 / 清除高亮 / 更新差异",

  // ── 诊断 ──────────────────────────────────────────
  "Next Diagnostic": "下一个诊断",
  "Prev Diagnostic": "上一个诊断",
  "Next Error": "下一个错误",
  "Prev Error": "上一个错误",
  "Next Warning": "下一个警告",
  "Prev Warning": "上一个警告",
  "Jump to the first diagnostic in the current buffer": "跳到本文件第一个诊断",
  "Jump to the last diagnostic in the current buffer": "跳到本文件最后一个诊断",
  "Show diagnostics under the cursor": "显示光标处的诊断",
  "Diagnostics": "诊断",
  "Toggle Diagnostics": "开关诊断显示",

  // ── 界面 ──────────────────────────────────────────
  "Toggle Wrap": "自动换行开关",
  "Toggle Line Numbers": "行号开关",
  "Toggle Relative Number": "相对行号开关",
  "Toggle Indent Guides": "缩进参考线开关",
  "Toggle Conceal Level": "折叠隐藏级别",
  "Toggle Treesitter Highlight": "语法高亮开关",
  "Toggle Smooth Scroll": "平滑滚动开关",
  "Toggle Animations": "动画开关",
  "Toggle Dark Background": "深色/浅色背景",
  "Toggle Dimming": "背景变暗(专注模式)",
  "Toggle Inlay Hints": "内联类型提示开关",
  "Toggle Spelling": "拼写检查开关",
  "Toggle Tabline": "标签栏开关",
  "Toggle Zen Mode": "禅模式(聚焦当前文件)",
  "Toggle Mini Pairs": "自动配对括号开关",
  "Colorschemes": "配色主题",
  "Icons": "图标",
  "Highlights": "高亮组",
  "Help Pages": "帮助文档",
  "Man Pages": "手册页",
  "Man Pages ": "手册页",

  // ── 标签页 ────────────────────────────────────────
  "New Tab": "新建标签页",
  "Next Tab": "下一个标签页",
  "Previous Tab": "上一个标签页",
  "First Tab": "第一个标签页",
  "Last Tab": "最后一个标签页",
  "Close Tab": "关闭当前标签页",
  "Close Other Tabs": "关闭其他标签页",

  // ── 会话 ──────────────────────────────────────────
  "Save File": "保存文件",
  "Quit All": "全部退出",
  "Restore Session": "恢复会话",
  "Restore Last Session": "恢复上一个会话",
  "Don't Save Current Session": "退出但不保存会话",
  "Select Session": "选择要恢复的会话",

  // ── 插件管理 ──────────────────────────────────────
  "Lazy": "Lazy 插件管理器",
  "Search for Plugin Spec": "搜索插件配置文件",
  "Profiles": "配置档案",

  // ── 终端 ──────────────────────────────────────────
  "Terminal (Root Dir)": "开终端(项目根目录)",
  "Terminal (cwd)": "开终端(当前目录)",

  // ── 其他常用 ──────────────────────────────────────
  "Down": "向下",
  "Up": "向上",
  "Scroll Backward": "向上翻页",
  "Scroll Forward": "向下翻页",
  "Jumps": "跳转记录",
  "Marks": "标记",
  "Registers": "寄存器",
  "Autocmds": "自动命令",
  "Command History": "命令历史",
  "Commands": "命令",
  "Redirect Cmdline": "重定向命令行输出",
  "Locations": "位置列表",
  "Location List": "位置列表",
  "Quickfix List": "快速修复列表",
  "Todo": "待办",
  "Todo/Fix/Fixme": "TODO/FIX/FIXME 注释",
  "Next Todo Comment": "下一个 TODO 注释",
  "Previous Todo Comment": "上一个 TODO 注释",
  "Next Trouble/Quickfix Item": "下一个 Trouble/Quickfix 条目",
  "Previous Trouble/Quickfix Item": "上一个 Trouble/Quickfix 条目",
  "Toggle comment": "注释开关(所选内容)",
  "Toggle comment line": "注释开关(整行)",
  "Add Comment Above": "在上方插入注释",
  "Add Comment Below": "在下方插入注释",
  "Add empty line above cursor": "在光标上方插入空行",
  "Add empty line below cursor": "在光标下方插入空行",
  "Add empty line below": "在下方插入空行",
  "Add empty line above": "在上方插入空行",
  "Keywordprg": "查当前词的文档",
  "Profiler Scratch Buffer": "性能分析(临时缓冲区)",
  "Toggle Profiler": "性能分析开关",
  "Toggle Profiler Highlights": "性能分析高亮开关",
  "Keymaps": "键位表",
  "Projects": "最近的项目",
  "Recent": "最近打开的",
  "Recent (cwd)": "最近打开的(当前目录)",
  "Buffers": "打开的缓冲区",
  "Buffers (all)": "所有缓冲区(含未打开的)",
  "Visual selection or word (Root Dir)": "选中项目内匹配的内容/词",
  "Visual selection or word (cwd)": "选中当前目录内匹配的内容/词",
  "Move Down": "下移一格",
  "Move Up": "上移一格",
  'Move to left "around"': "往左选一段(含外层)",
  'Move to right "around"': "往右选一段(含外层)",
  "Toggle Scratch Buffer": "暂存缓冲区开关",
  "Select Scratch Buffer": "选择一个暂存缓冲区",
  "LazyVim Changelog": "LazyVim 更新日志",
  "Notification History": "通知历史",
  "Dismiss All": "全部清除",
  "Dismiss All Notifications": "清除所有通知",
  "Resume": "继续(终端)",
  "Undotree": "撤销树",
  " :ptprevious": "上一个标签页",
  "Opens filepath or URI under cursor with the system handler (file explorer, web browser, …)":
    "用系统程序打开光标处的文件/链接(文件管理器、浏览器等)",

  // ⚠️ 以下 desc 是插件内部标记,不是用户可感知的动作。
  //    译成中文反而会误导("哪个 Noice?"),所以原样保留英文。
  "MiniPairs <BS>": "MiniPairs <BS>",
  "which_key_ignore": "which_key_ignore",
  "vim.snippet.jump if active, otherwise <Tab>": "跳到下一个代码片段(无片段则缩进)",
  "vim.snippet.jump if active, otherwise <S-Tab>": "跳到上一个代码片段(无片段则反缩进)",
  "Noice All": "Noice:全部通知",
  "Noice History": "Noice:通知历史",
  "Noice Last Message": "Noice:上一条消息",
  "Noice Picker (Telescope/FzfLua)": "Noice:消息选择器",
  // ⚠️ 实测踩到:`<Space>sn` 的 desc 是 `+noice`,那是插件内部标记
  // (子菜单是 <Space>sna/snh/snl/snt),当题干会让人一头雾水。
  "+noice": "Noice 通知(子菜单)",

  // ── 文本对象(第 7 章的重点)────────────────────────
  // ⚠️ 这些 desc 是插件给的通名,真正的作用取决于后面接的键(见 6/7 章)。
  //    这里译成"操作符 + 文本对象"的说法,和书里的术语对齐。
  "Around textobject": "外层文本对象(连分隔符一起选)",
  "Inside textobject": "内层文本对象(只选内容)",
  "Around last textobject": "上一次的文本对象(连分隔符)",
  "Inside last textobject": "上一次的文本对象(只内容)",
  "Around next textobject": "下一个文本对象(连分隔符)",
  "Inside next textobject": "下一个文本对象(只内容)",
  "Comment textobject": "注释文本对象",
  "Comment textobject ": "注释文本对象",

  // ── 剩余的 Ex 命令(不翻,原样保留)───────────────
  // 这些 desc 本身就是命令名,翻译成中文反而看不懂。
};

/** 按 (键, 模式) 精确覆盖的例子。键 = `${display}|${mode}` */
export const byKeyMode: Record<string, string> = {
  // 示例格式。实际使用时同一键在不同 mode 下动作不同,写在这里。
};

/**
 * 解析一条绑定的中文描述。
 *
 * @param display 显示用的键串
 * @param mode    Vim 模式
 * @param desc    英文原文
 */
export function translate(display: string, mode: string, desc: string): string {
  return (
    byKeyMode[`${display}|${mode}`] ??
    translations[display] ??
    translations[desc] ??
    desc
  );
}
