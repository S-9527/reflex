import DrillShell from "@/app/drill-shell";
import TabDrill from "./drill";

/**
 * 标签页练习页。
 *
 * 外壳统一在 DrillShell 里,这一层只管标题和说明。
 */
export default function TabsPage() {
  return (
    <DrillShell
      title="标签页练习"
      intro={
        <>
          按 <kbd>&lt;Tab&gt;</kbd> 再按面板上的键,两下。练的是
          「标签条上怎么跳、怎么关」。注意 <kbd>&lt;Tab&gt;]</kbd> /{" "}
          <kbd>&lt;Tab&gt;[</kbd> <b>到头就停、不环绕</b>,
          和 buffer 的 <kbd>&lt;Space&gt;bb</kbd> 正好相反。
        </>
      }
    >
      <TabDrill />
    </DrillShell>
  );
}