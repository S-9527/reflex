import DrillShell from "@/app/drill-shell";
import BufferDrill from "./drill";

/**
 * 缓冲区练习页。
 *
 * 外壳(居中宽度 + 标题 + 返回链接)统一在 DrillShell 里,
 * 这一层只负责标题和说明文字。
 */
export default function BuffersPage() {
  return (
    <DrillShell
      title="缓冲区练习"
      intro={
        <>
          按 <kbd>&lt;Space&gt;</kbd>
          <kbd>b</kbd>
          <kbd>键</kbd> 三键连着按 —— 练的是「看这条 buffer 带子,
          按对应的那一个键」。每题会标出本机实测存在的<b>更省事的等价键</b>。
        </>
      }
    >
      <BufferDrill />
    </DrillShell>
  );
}