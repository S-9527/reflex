import DrillShell from "@/app/drill-shell";
import SearchDrill from "./drill";

/**
 * 搜索跳转练习页。
 *
 * ⚠️ 这一族看着最简单（`n` / `N`），但实测本机映射是**方向感知**的：
 *
 * ```vim
 * n → 'Nn'[v:searchforward].'zv'
 * N → 'nN'[v:searchforward].'zv'
 * ```
 *
 * 所以用 `?` 倒着搜之后，**`n` 反而往前**。光看「下一个搜索结果」
 * 这五个字完全看不出来 —— 走一遍才明白。
 */
export default function SearchPage() {
  return (
    <DrillShell
      title="搜索跳转"
      intro={
        <>
          练 <code>n</code> <code>N</code> 在匹配之间移动，以及{" "}
          <code>&lt;Esc&gt;</code> 清高亮。核心是<b>光标在匹配间跳</b>，
          所以画成了带高亮的代码。数据来自 <code>nvim_get_keymap(&quot;n&quot;)</code> 实测。
        </>
      }
    >
      <SearchDrill />
    </DrillShell>
  );
}
