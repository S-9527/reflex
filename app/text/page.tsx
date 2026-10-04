import DrillShell from "@/app/drill-shell";
import TextObjDrill from "./drill";

/**
 * 文本对象练习页。
 *
 * 外壳(居中宽度 + 标题 + 返回链接)统一在 DrillShell 里。
 * ⚠️ 这一层不能省 —— root layout 只有 body,容器得每页自己写,
 * 漏了内容就会顶到左边缘铺满全宽(这个坑已经踩过两次)。
 */
export default function TextPage() {
  return (
    <DrillShell
      title="文本对象练习"
      intro={
        <>
          给你一段代码,高亮出 <kbd>d</kbd> + 某个键会选中哪一块。
          这一族只记一件事:<b>inner 带不含边缘空白</b> ——
          <code>diw</code> 留一个空格,<code>daw</code> 连空格一起删。
          这些键在 <code>nvim_get_keymap</code> 里查不到(Vim 内建),
          范围是<b>跑一遍实测</b>出来的。
        </>
      }
    >
      <TextObjDrill />
    </DrillShell>
  );
}