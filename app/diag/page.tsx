import DrillShell from "@/app/drill-shell";
import DiagDrill from "./drill";

/**
 * 诊断 / LSP 跳转练习页。
 *
 * ⚠️ 页面顶部那块红字不是装饰 —— `gd` 在 LazyVim 16 里是
 * **Git Diff (hunks)**,不是「跳定义」。我第一版按记忆写成跳定义,
 * 页面照跑、单测和浏览器都没报错,是实测才发现的。
 */
export default function DiagPage() {
  return (
    <DrillShell
      title="诊断与 LSP 跳转"
      intro={
        <>
          练 <code>[d</code> <code>]d</code> <code>[D</code> <code>]D</code> 那一族,以及{" "}
          <code>gr*</code> 的六个 LSP 查询。核心是<b>光标在诊断之间移动</b>,
          所以画成了带游标的诊断列表。数据来自{" "}
          <code>vim.diagnostic</code> 实测和 <code>nvim_get_keymap(&quot;n&quot;)</code>。
        </>
      }
    >
      <DiagDrill />
    </DrillShell>
  );
}