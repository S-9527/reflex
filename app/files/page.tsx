import DrillShell from "@/app/drill-shell";
import FileDrill from "./drill";

/**
 * 文件浏览器练习页。
 *
 * 这一族练的是一条规律:小写 = 项目根目录,大写 = 当前目录。
 * 外壳统一在 DrillShell 里,这一层只管标题和说明。
 */
export default function FilesPage() {
  return (
    <DrillShell
      title="文件浏览器练习"
      intro={
        <>
          这一族记一条规律就够:<b>小写 = 项目根目录,大写 = 当前目录</b>。
          题目问的是「这个操作要开哪个目录的那个」,所以练的是规律本身,
          不是一个个背键。
        </>
      }
    >
      <FileDrill />
    </DrillShell>
  );
}