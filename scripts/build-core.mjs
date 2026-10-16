/**
 * 生成 `lib/core-vim.ts` —— 「Vim 内建操作」板块的数据。
 *
 * 跑：`node scripts/build-core.mjs`（先跑 `scripts/probe-core.lua` 产出实测数据）
 *
 * ## 为什么要生成，而不是手写
 *
 * 每道题的 `measured` 字段要带**探针实测的原始结果**（buffer 变成什么、
 * 光标去哪了）。手写会抄错，而且实测一改就得全量重抄。
 * 所以描述（中文、分类、解法）由人写，**实测证据从 JSON 里取**。
 *
 * ## 为什么描述必须人写
 *
 * `nvim_get_keymap` 里内建命令**没有 desc**（这正是它们缺失的原因）。
 * 所以「`dw` 删到下一个词首」这句话没有任何数据源能自动生成 ——
 * 只能人工写，但每条都能对应到一个可复现的探针下标。
 * `tests/core-vim.test.ts` 守住「每条描述都有对应实测」。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const probe = JSON.parse(readFileSync(join(root, "data/probe-core.json"), "utf8"));
const probes = probe.probes;

/**
 * 人工写的题目表。
 *
 * - `pi`   —— 探针下标（对应 `data/probe-core.json` 的 `probes[pi]`）
 * - `key`  —— 面板上显示的键序列（也是判分认的解法）
 * - `pk`   —— 探针实际按的完整键（**带示例参数**时用）
 * - `desc` —— 中文说明。**没有数据源能生成它**，只能人写
 * - `alts` —— 等价键（实测确认过的同义写法）
 * - `skip` —— 这一条为什么不出题（测了但教不了）
 *
 * ## ⚠️ 为什么有 `pk`
 *
 * 有些操作**必须带一个参数才有行为**：`r` 要跟一个字符、`i` 要跟插入内容。
 * 探针按的是 `rZ`（把字符换成 Z）、`iX`（插入 X），但**要练的是 `r` 本身**
 * —— 题目问「怎么替换一个字符」，答案是「r + 新字符」。
 *
 * 所以 `key` 是 `r`，`pk` 是 `rZ`。生成时会校验 `pk` 和探针记的键一致，
 * 防止下标错位（那会让描述和实测证据对不上，是最危险的错误）。
 */
const SPEC = [
  // ---------------------------------------------------------- 撤销 / 重复
  { key: "u", pre: "x", cat: "撤销 / 重复", desc: "撤销上一次修改" },
  { key: "<C-r>", pre: "xu", cat: "撤销 / 重复", desc: "重做（撤销的反操作）" },
  { key: ".", pre: "xw", cat: "撤销 / 重复", desc: "重复上一次修改（会跟着光标位置走）" },
  { key: "U", pre: "xx", cat: "撤销 / 重复", desc: "把整行恢复到本次编辑前（行级撤销，不是全局撤销）" },

  // ---------------------------------------------------------- 删除 / 修改
  { key: "dd", cat: "删除 / 修改", desc: "删掉整行" },
  { key: "cc", cat: "删除 / 修改", desc: "改整行：清空内容并进插入模式" },
  { key: "D", cat: "删除 / 修改", desc: "从光标删到行尾", alts: ["d$"] },
  { key: "C", cat: "删除 / 修改", desc: "从光标改到行尾（删完进插入模式）" },
  { key: "x", cat: "删除 / 修改", desc: "删掉光标处的字符" },
  { key: "X", cat: "删除 / 修改", desc: "删掉光标**前**一个字符" },
  { key: "r", pk: "rZ", cat: "删除 / 修改", desc: "把光标处字符替换成一个新字符（不进插入模式）" },
  { key: "s", pk: "sZ", cat: "删除 / 修改", desc: "删掉光标字符并进插入模式（= xi）" },
  { key: "S", pk: "Snew", cat: "删除 / 修改", desc: "清空整行并进插入模式（= cc）" },
  { key: "dw", cat: "删除 / 修改", desc: "删到下一个词首（词 + 后面的空格一起没）" },
  { key: "de", cat: "删除 / 修改", desc: "删到词尾（只删词，**留**空格）" },
  { key: "d0", cat: "删除 / 修改", desc: "从光标删到行首" },
  { key: "daw", cat: "删除 / 修改", desc: "删一个词 + 后面的空白（around）" },
  { key: "diw", cat: "删除 / 修改", desc: "删一个词，保留空白（inner）" },

  // ---------------------------------------------------------- 复制 / 粘贴
  { key: "yy", cat: "复制 / 粘贴", desc: "复制整行" },
  { key: "Y", cat: "复制 / 粘贴", desc: "复制整行 —— Vim 里 Y **等价 yy**，不是 y$（书上常说错）" },
  { key: "yiw", cat: "复制 / 粘贴", desc: "复制一个词" },
  { key: "p", pre: "yy", cat: "复制 / 粘贴", desc: "粘贴到光标**后**面（行级粘贴时是下一行）" },
  { key: "P", pre: "yy", cat: "复制 / 粘贴", desc: "粘贴到光标**前**面（行级粘贴时是上一行）" },
  { key: "ddp", cat: "复制 / 粘贴", desc: "交换相邻两行 —— dd 删行 + p 粘到下一行" },

  // ---------------------------------------------------------- 寄存器 / 标记 / 宏
  { key: '"ayy', cat: "寄存器 / 标记 / 宏", desc: "把整行复制到**命名寄存器 a**（前缀是双引号 + 寄存器名）" },
  { key: '"ap', pre: '"ayy3j', cat: "寄存器 / 标记 / 宏", desc: "从命名寄存器 a 粘贴" },
  { key: '"_dd', cat: "寄存器 / 标记 / 宏", desc: "用**黑洞寄存器** _ 删行 —— 删掉且不污染无名寄存器" },
  { key: "ma", cat: "寄存器 / 标记 / 宏", desc: "在当前位置打标记 a（buffer 不变，但跳转时用得上）" },
  { key: "`a", pre: "maG", cat: "寄存器 / 标记 / 宏", desc: "跳回标记 a 的**精确位置**（行 + 列）" },
  { key: "'a", pre: "maG", cat: "寄存器 / 标记 / 宏", desc: "跳回标记 a **所在行的行首**（列不还原）—— 和 `a 的区别就在这" },
  { key: "@a", pre: "qaxqj", cat: "寄存器 / 标记 / 宏", desc: "重放寄存器 a 里录的宏" },
  { key: "@@", pre: "qaxqj@a", cat: "寄存器 / 标记 / 宏", desc: "重复上一次执行的宏" },

  // ---------------------------------------------------------- 插入入口
  { key: "i", pk: "iX", cat: "插入入口", desc: "在光标**前**插入" },
  { key: "a", pk: "aX", cat: "插入入口", desc: "在光标**后**追加" },
  { key: "I", pk: "IX", cat: "插入入口", desc: "跳到行首插入（跳过缩进后的第一个非空字符）" },
  { key: "A", pk: "AX", cat: "插入入口", desc: "跳到行尾插入" },
  { key: "o", pk: "oX", cat: "插入入口", desc: "在**下面**开一个新行并插入" },
  { key: "O", pk: "OX", cat: "插入入口", desc: "在**上面**开一个新行并插入" },
  { key: "R", pk: "RXY", cat: "插入入口", desc: "进替换模式：连续覆盖后面的字符，直到按 <Esc>" },

  // ---------------------------------------------------------- 可视模式
  { key: "v", pk: "vll", cat: "可视模式", desc: "字符级可视：选中一个字符范围" },
  { key: "V", cat: "可视模式", desc: "行级可视：整行整行地选" },
  { key: "<C-v>", cat: "可视模式", desc: "块级可视：竖着选一列（列编辑）" },
  { key: "viw", cat: "可视模式", desc: "选中一个词（可视 + textobject）" },
  { key: "v$", cat: "可视模式", desc: "从光标选中到行尾" },
  { key: "ggVG", cat: "可视模式", desc: "全选整个文件（gg 到开头 + V 行可视 + G 到末尾）" },

  // ---------------------------------------------------------- 光标移动
  { key: "w", cat: "光标移动", desc: "跳到下一个词首" },
  { key: "b", cat: "光标移动", desc: "跳到上一个词首" },
  { key: "e", cat: "光标移动", desc: "跳到当前/下一个词的词尾" },
  { key: "W", cat: "光标移动", desc: "跳到下一个字串（按空白分，标点不算分隔）" },
  { key: "B", cat: "光标移动", desc: "跳到上一个字串" },
  { key: "E", cat: "光标移动", desc: "跳到字串尾" },
  { key: "ge", cat: "光标移动", desc: "跳到上一个词的词尾" },
  { key: "0", cat: "光标移动", desc: "跳到行首（第 0 列，缩进也算）" },
  { key: "^", cat: "光标移动", desc: "跳到行内第一个非空字符 —— 和 0 的区别就是缩进" },
  { key: "$", cat: "光标移动", desc: "跳到行尾" },
  { key: "gg", cat: "光标移动", desc: "跳到文件开头" },
  { key: "G", cat: "光标移动", desc: "跳到文件末尾" },
  { key: "5G", cat: "光标移动", desc: "跳到第 N 行（G 吃计数）" },
  { key: "}", cat: "光标移动", desc: "跳到下一段（空行分隔）" },
  { key: "{", cat: "光标移动", desc: "跳到上一段" },
  { key: "M", cat: "光标移动", desc: "跳到屏幕中部" },

  // ---------------------------------------------------------- 行内查找
  { key: "f", pk: "f(", cat: "行内查找", desc: "向右找到某个字符并停在它上面" },
  { key: "t", pk: "t(", cat: "行内查找", desc: "向右到某个字符**之前**一格（t = till）" },
  { key: "F", pk: "F(", cat: "行内查找", desc: "向左找到某个字符" },
  { key: "T", pk: "T(", cat: "行内查找", desc: "向左到某个字符**之后**一格" },
  { key: ";", pre: "f,", cat: "行内查找", desc: "重复上一次 f/t/F/T（保持方向）" },
  { key: ",", pre: "F,", cat: "行内查找", desc: "反向重复上一次 f/t/F/T" },

  // ---------------------------------------------------------- 缩进 / 大小写
  { key: ">>", cat: "缩进 / 大小写", desc: "整行右缩进一个 shiftwidth" },
  { key: "<<", cat: "缩进 / 大小写", desc: "整行左缩进一个 shiftwidth" },
  { key: "==", pre: "<<", cat: "缩进 / 大小写", desc: "按 filetype 的缩进规则自动缩进整行" },
  { key: ">j", cat: "缩进 / 大小写", desc: "缩进当前行和下一行（操作符 + motion）" },
  { key: "~", cat: "缩进 / 大小写", desc: "切换光标处字符的大小写，并右移一格" },
  { key: "g~~", cat: "缩进 / 大小写", desc: "整行大小写取反" },
  { key: "gUU", cat: "缩进 / 大小写", desc: "整行转大写" },
  { key: "guu", cat: "缩进 / 大小写", desc: "整行转小写" },
  { key: "gUw", cat: "缩进 / 大小写", desc: "把下一个词转大写（gU + motion）" },

  // ---------------------------------------------------------- 合并
  { key: "J", cat: "合并 / 拆分", desc: "把下一行合上来，中间**补一个空格**" },
  { key: "gJ", cat: "合并 / 拆分", desc: "合并下一行，**不补**空格" },

  // ---------------------------------------------------------- 滚动
  { key: "<C-d>", cat: "滚动", desc: "向下滚半屏" },
  { key: "<C-u>", cat: "滚动", desc: "向上滚半屏" },
  { key: "<C-f>", cat: "滚动", desc: "向下滚一整页" },
  { key: "<C-b>", cat: "滚动", desc: "向上滚一整页" },
  { key: "<C-e>", cat: "滚动", desc: "向下滚一行（光标不动）" },
  { key: "<C-y>", cat: "滚动", desc: "向上滚一行（光标不动）" },
  { key: "zt", cat: "滚动", desc: "把当前行滚到屏幕顶部（t = top）" },
  { key: "zz", cat: "滚动", desc: "把当前行滚到屏幕中间" },
  { key: "zb", cat: "滚动", desc: "把当前行滚到屏幕底部（b = bottom）" },

  // ---------------------------------------------------------- 文本对象（补 /text 没覆盖的）
  { key: "di(", cat: "文本对象", desc: "删圆括号内（i( 和 i) 等价，随便按哪个）" },
  { key: "da(", cat: "文本对象", desc: "删圆括号 + 括号本身" },
  { key: "di{", cat: "文本对象", desc: "删花括号内", alts: ["diB"] },
  { key: "da{", cat: "文本对象", desc: "删花括号 + 括号本身" },
  { key: 'di"', cat: "文本对象", desc: "删双引号内（不含引号）" },
  { key: 'da"', cat: "文本对象", desc: "删双引号 + 引号本身" },
  { key: "di'", cat: "文本对象", desc: "删单引号内" },
  { key: "da'", cat: "文本对象", desc: "删单引号 + 引号本身" },
  { key: "dis", cat: "文本对象", desc: "删一整句" },
  { key: "dii", cat: "文本对象", desc: "删同样缩进的整块（ii = 同缩进级别）" },
  { key: "dil", cat: "文本对象", desc: "删当前行（i + l）" },
  { key: "dal", cat: "文本对象", desc: "删当前行 + 下面的空行" },

  // ---------------------------------------------------------- 跳转
  { key: "<C-o>", pre: "G", cat: "跳转", desc: "跳回上一个位置（跳转历史里往回）" },
  { key: "<C-i>", pre: "G<C-o>", cat: "跳转", desc: "跳到下一个位置（<C-o> 的反向）" },
  { key: "g;", pre: "xx", cat: "跳转", desc: "跳到上一个修改点（changelist 往回）" },
  { key: "g,", pre: "xx", cat: "跳转", desc: "跳到下一个修改点" },

  // ---------------------------------------------------------- 救回「缺 desc 被误排」的内建键
  //
  // ⚠️ 这一组补的是另一类缺口。
  //
  // `/seq` 的 `whyNotDrillable()` 把「插件没上报 desc」等同于「不能出题」，
  // 于是一批**真正的 Vim 内建键**被静默排掉了 —— 它们在本机被插件注册了
  // 映射（为了别的目的），但没写 desc。
  //
  // 实测确认它们都有确定的、可测的行为，所以补进来。
  // ⚠️ `%` 有两条题（在 `(` 上 / 在 `{` 上）—— 必须用 line/col 消歧，
  //    否则生成器会报「探针有歧义」而停下（这是有意的，见 findProbe）
  { key: "%", line: 1, col: 12, cat: "括号跳转", desc: "在 ( 上跳到配对的 )" },
  { key: "%", line: 1, col: 13, cat: "括号跳转", desc: "在 { 上跳到配对的 }（同一条命令，换个括号也一样）" },
  { key: "g%", cat: "括号跳转", desc: "**反向**跳到配对的括号 —— matchit 提供" },
  { key: "[%", cat: "括号跳转", desc: "跳到**外层**未配对的括号开头 —— matchit 的 Multi 系列" },
  { key: "]%", cat: "括号跳转", desc: "跳到**外层**未配对的括号结尾" },
  { key: "a%", cat: "括号跳转", desc: "选中当前括号块 —— 可当 textobject 用（a%）" },
  { key: "*", cat: "搜索词", desc: "向下搜索光标所在的**整个词**（自动加 \\< \\> 边界）" },
  { key: "#", cat: "搜索词", desc: "向上搜索光标所在的整个词" },
  { key: "&", pre: ":s/aaa/ZZZ/\r", cat: "替换", desc: "在下一行重复上一次 :s 替换" },
  { key: "<C-W>", pk: "A<C-W>", cat: "插入模式编辑", desc: "插入模式：删掉光标前的一个词" },
  { key: "<C-U>", pk: "A<C-U>", cat: "插入模式编辑", desc: "插入模式：删到行首（整行清空）" },
  { key: ">", pre: "Vj", cat: "缩进 / 大小写", desc: "可视模式：缩进选中的行，且**保持选中**（rhs 是 >gv）" },
];

/**
 * 测了但**不出题**的 —— 必须在页面上列出来并说明原因。
 *
 * 「测不出来就说测不出来」是这个项目的底线（README 的「数据可信度」一节）。
 * 这几条探针确实跑了，但结果不能用来教人。
 */
const SKIPPED = [
  { key: "u", pre: "dd", reason: "同一操作的第二次实测（dd 后撤销），和 u 是同一个键 —— 不重复出题" },
  { key: ".", pre: "dd", reason: "同一操作的第二次实测（dd 后重复），和 . 是同一个键" },
  { key: "d$", reason: "和 D 是同一个操作（实测结果逐字相同），作为 D 的等价键展示" },
  { key: "dgg", reason: "d + gg 的组合，不是独立要背的键位（gg 已在光标移动里出题）" },
  { key: "dG", reason: "d + G 的组合，不是独立要背的键位（G 已在光标移动里出题）" },
  { key: "dap", reason: "和 dip 只差「带不带后面空行」，已由 inner/around 规律覆盖（见 /text）" },
  { key: "dip", reason: "同上，inner/around 规律已覆盖" },
  { key: "yy", pre: "_none_", reason: "只复制不粘贴的对照探针，和 yy 同一个键" },
  { key: "vaw", reason: "和 viw 只差 around，规律已由 inner/around 覆盖" },
  { key: ";", pre: "t,", reason: "t, 之后重复的第二次实测，和 ; 同一个键" },
  { key: "==", pre: "", reason: "对照探针（那一行本来就缩进正确，所以无变化）—— 用 << 之后的那次" },
  { key: "q", reason: "「停止录制」是宏的一部分，单独出题没意义（@a / @@ 已覆盖宏的用法）" },
  { key: "za", reason: "headless 下没有折叠可开 —— 实测无变化，**测不出效果就不出题**" },
  { key: "zR", reason: "同上，headless 下测不出折叠行为" },
  { key: "zM", reason: "同上，headless 下测不出折叠行为" },
  { key: "di[", reason: "标准文档里没有方括号 —— 样本不成立，测不出结果" },
  { key: "di<", reason: "标准文档里没有尖括号 —— 样本不成立" },
  { key: "diB", reason: "和 di{ 实测结果逐字相同，作为等价键展示" },
  { key: "dit", reason: "标准文档里没有 HTML 标签 —— 样本不成立" },
  { key: "gcc", reason: "注释是插件/Neovim 内建 comment，本机行为已由 /seq 的 gcc 覆盖" },
  { key: "gcgc", reason: "同上，和 gcc 等价" },
  { key: "gx", reason: "headless 下打不开系统程序 —— 测不出效果" },
];

// ------------------------------------------------------------- 生成
/**
 * 按 **(探针键, 前置操作)** 找实测证据 —— **不用下标**。
 *
 * ⚠️⚠️ 我第一版用硬编码下标（`pi: 12`），于是往探针脚本里插一条新探针之后
 * **后面全部错位**：`r` 的描述配上了 `sZ` 的实测结果。
 * 而且它**不报错** —— 描述看着正常，证据是别人的。
 * 这种「描述和证据对不上」比缺数据危险得多，因为看不出来。
 *
 * ## ⚠️⚠️ 为什么要 `line` / `col` 消歧，而不是「取第一个」
 *
 * 同一个 `(键, 前置)` 可能有**多条探针**，而且它们是**不同的题目**：
 *
 * ```
 * %  第 1 行第 12 列 → 从 ( 跳到 )      ← 一条题
 * %  第 1 行第 13 列 → 从 { 跳到 }      ← 另一条题
 * ```
 *
 * 我一开始写的是 `findIndex(...)` —— 静默取第一条。于是 `{` 那条题
 * 拿到了 `(` 那条的证据，**描述和证据对不上而且不报错**。
 * 这正是我在文件头警告过的那个失败模式，结果自己又踩了一次。
 *
 * 现在：给了 `line`/`col` 就按位置精确匹配；匹配到多条或一条都没有
 * 都**直接抛错**，绝不静默取第一条。
 */
function findProbe(probeKey, pre, line, col) {
  const matches = probes.filter(
    (p) =>
      p.key === probeKey &&
      (p.pre || "") === (pre || "") &&
      (line === undefined || p.line === line) &&
      (col === undefined || p.col === col),
  );
  if (matches.length === 0) {
    throw new Error(
      `找不到探针：键=${JSON.stringify(probeKey)} 前置=${JSON.stringify(pre || "")}` +
        (line !== undefined ? ` 位置=${line}:${col}` : ""),
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `探针有歧义：键=${JSON.stringify(probeKey)} 前置=${JSON.stringify(pre || "")} ` +
        `匹配到 ${matches.length} 条（位置 ${matches.map((m) => `${m.line}:${m.col}`).join(" / ")}）` +
        ` —— 题目里请写明 line/col 消歧，别让它静默取第一条`,
    );
  }
  return matches[0];
}

const items = SPEC.map((s) => {
  const expect = s.pk ?? s.key;
  const p = findProbe(expect, s.pre, s.line, s.col);
  return {
    key: s.key,
    category: s.cat,
    desc: s.desc,
    alts: s.alts ?? [],
    /**
     * 实测证据 —— 原样来自探针，**不手抄**。
     *
     * `result` 是按键之后整个 buffer；`cursor` 是 1-based 的 {行,列}。
     * 界面用它画 diff，测试用它验「这条描述和实测对得上」。
     */
    measured: {
      line: p.line,
      col: p.col,
      pre: p.pre || "",
      ft: p.ft ?? null,
      result: p.result,
      cursor: p.cursor,
      changed: p.changed,
      /**
       * 按键**之前**的 buffer。
       *
       * ⚠️ 有前置操作时，这是**前置跑完**的状态，不是原始文档 ——
       * 否则 `u`（前置 `x`）的 diff 会显示「完全没变化」（因为
       * 它撤销回了原始文档，而界面以为「之前」就是原始文档）。
       */
      before: p.before,
      selection: p.selection ?? null,
      // ⚠️ 自定义文档（`%` / `*` / `&` / 插入模式那几条）—— 没有就是 null
      doc: p.doc ?? null,
    },
  };
});

const skipped = SKIPPED.map((s) => ({ key: s.key, reason: s.reason }));

const cats = [...new Set(items.map((i) => i.category))];

const ts = `// 自动生成，请勿手改。
//
// 生成：node scripts/build-core.mjs
// 数据源：data/probe-core.json（由 scripts/probe-core.lua 在本机 nvim 实测）
//
// ## ⚠️⚠️ 为什么需要这个文件
//
// 数据集（lib/bindings.ts）全部来自 \`nvim_get_keymap\`，而它**只返回
// 用户/插件映射** —— Vim 内建命令一条都不在里面。本机实测：
//
//     u      n: （没有映射）
//     dd     n: （没有映射）
//     p      n: （没有映射）
//
// 所以 \`u\` \`p\` \`dd\` \`f\` \`m\` \`q\` 这些**从抽取阶段就不存在** ——
// 后面怎么聚合、去重都补不回来。这就是「vim 操作没有完全覆盖」的根因。
//
// 补的办法和 /text（文本对象）一样：**破坏性实测**。
// 造已知内容 → 落到指定位置 → \`:normal! {键}\` → 记录 buffer 和光标的 diff。
// 每条 \`measured\` 都是可复现的实测结果，探针在 scripts/probe-core.lua。
//
// ## 为什么 \`desc\` 是人写的
//
// 内建命令**没有 desc**（这正是它们缺失的原因）。所以「\`dw\` 删到下一个
// 词首」这句话没有任何数据源能生成 —— 只能人工写。
// 但每条都能对应到一个**可复现的探针下标**，\`tests/core-vim.test.ts\` 守住这点。
//
// ## ⚠️ headless 测不出的，如实标出来
//
// 折叠（\`za\` \`zR\` \`zM\`）和 \`gx\`（开系统程序）在 headless 下测不出效果，
// 所以**不出题**，只在 \`CORE_SKIPPED\` 里列出并说明。
// 「测不出来就说测不出来」是这个项目的底线。

/** 一条内建操作的实测证据 */
export type CoreMeasured = {
  /** 探针在文档的哪一行、哪一列（1-based）按下 */
  line: number;
  col: number;
  /** 前置操作（空 = 没有）。\`u\` 这种必须先有东西可撤销 */
  pre: string;
  /** 探针设的 filetype（\`==\` 这类依赖缩进规则） */
  ft: string | null;
  /** 按下之后整个 buffer 的内容 */
  result: string[];
  /** 按下之后的光标 {行, 列}，1-based */
  cursor: [number, number];
  /**
   * 按键**之前**的 buffer。
   *
   * ⚠️ 有前置操作时，这是**前置跑完**的状态，不是原始文档 ——
   * 否则 \`u\`（前置 \`x\`）的 diff 会显示「完全没变化」。
   */
  before: string[];
  /** buffer 内容变了吗 */
  changed: boolean;
  /** 可视选区（只有可视模式那几条有） */
  selection: { l1: number; c1: number; l2: number; c2: number } | null;
  /**
   * 这一条用的**自定义文档**（\`null\` = 用标准 CORE_SRC）。
   *
   * ⚠️ 为什么需要：标准文档是为 motion/textobject 设计的，里面没有
   * 「嵌套括号」「重复的单词」这类结构。拿它测 \`%\` / \`*\` / \`&\` 会得到
   * **假的「无变化」** —— 不是键失效，是样本不成立。
   * 所以那几条用自己的文档，画 diff 时要用它当「之前」。
   */
  doc: string[] | null;
};

/** 一条要练的内建操作 */
export type CoreItem = {
  /** 键序列，也是面板上显示的 */
  key: string;
  /** 分组 */
  category: string;
  /** 中文说明（人写，见文件头） */
  desc: string;
  /** 实测确认的等价键（仅展示，也算答对） */
  alts: string[];
  measured: CoreMeasured;
};

/** 测了但不出题的，以及原因 */
export type CoreSkipped = { key: string; reason: string };

/** 探针用的标准文档 —— 和实测时完全一致 */
export const CORE_SRC: string[] = ${JSON.stringify(probe.src, null, 2)};

/** 全部要练的内建操作 */
export const CORE_ITEMS: CoreItem[] = ${JSON.stringify(items, null, 2)};

/**
 * 分组（按操作性质，不是 which-key —— 内建命令本来就不在 which-key 里）。
 *
 * 顺序即面板上的顺序，刻意按「学习的依赖关系」排：
 * 先撤销/删除，再插入，然后移动，最后才是冷门的寄存器/宏。
 */
export const CORE_CATEGORIES: string[] = ${JSON.stringify(cats, null, 2)};

/** 测了但不出题的 —— 页面上单独列出，用户能核对这个判断 */
export const CORE_SKIPPED: CoreSkipped[] = ${JSON.stringify(skipped, null, 2)};

/**
 * 题库 —— **首页分母和页面题库读的是同一份**。
 *
 * ⚠️⚠️ 这个常量存在的唯一理由，是让 \`lib/boards.ts\` 能拿到**真实题数**。
 *
 * 原来首页的分母是手写的估计值，于是四个板块对不上页面实际题数
 * （\`/seq\` 写 235 实际 135、\`/text\` 写 16 实际 11），而且**都不报错** ——
 * 后果是进度条永远到不了 100%。详见 \`lib/boards.ts\` 顶部。
 *
 * 这里直接给出题目形状（id + 键 + 解法），页面和 boards 都用它，不可能对不上。
 */
export type CoreTask = {
  /** 题目 id：\`core:<键>#<下标>\`（同一个键有多次实测，用下标区分） */
  id: string;
  /** 键序列 */
  key: string;
  /** 中文说明 */
  desc: string;
  /** 分组 */
  category: string;
  /** 主解法 + 实测等价键 */
  accept: string[][];
};

export const CORE_TASKS: CoreTask[] = CORE_ITEMS.map((it, i) => ({
  id: \`core:\${it.key}#\${i}\`,
  key: it.key,
  desc: it.desc,
  category: it.category,
  accept: [splitLhs(it.key), ...it.alts.map((a) => splitLhs(a))],
}));

/** Vim 记法 → 逐键数组。和 lib/keys.ts 的 splitLhs 同源 */
function splitLhs(lhs: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lhs.length) {
    if (lhs[i] === "<") {
      const end = lhs.indexOf(">", i);
      if (end > i) {
        out.push(lhs.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    out.push(lhs[i]);
    i++;
  }
  return out;
}
`;

writeFileSync(join(root, "lib/core-vim.ts"), ts);

console.log(`✅ ${items.length} 条内建操作 → lib/core-vim.ts`);
console.log(`   分组：${cats.length} 个`);
const byCat = {};
for (const i of items) byCat[i.category] = (byCat[i.category] || 0) + 1;
for (const [c, n] of Object.entries(byCat)) console.log(`     ${c.padEnd(20)} ${n}`);
console.log(`   测了但不出题：${skipped.length} 条（页面上会说明原因）`);
