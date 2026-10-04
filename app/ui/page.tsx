import DrillShell from "@/app/drill-shell";
import UiToggleDrill from "./drill";

/**
 * 界面开关练习页。
 *
 * ⚠️ 这一页和别的不一样:**键位是实测的,效果是约定的。**
 * headless 下测不出这批开关到底改了哪些 option(理由见 lib/ui-toggles.ts
 * 顶部的注释和页面顶部那段黄字)。
 *
 * 外壳统一在 DrillShell 里,别在这里自己写容器 ——
 * 这个坑已经踩过三次了(/buffers /tabs /text)。
 */
export default function UiPage() {
  return (
    <DrillShell
      title="界面开关练习"
      intro={
        <>
          练 <code>&lt;Space&gt;u</code> 那一族,共 24 条。这一族的大小写记号很密 ——
          <code>uL</code> <code>ul</code> <code>ug</code> <code>ua</code> <code>ub</code>{" "}
          <code>uz</code> <code>uZ</code> <code>uA</code> <code>uC</code>,只背 desc 配不住。
          题库在 <code>lib/ui-toggles.ts</code>,键位与{" "}
          <code>desc</code> 实测自 <code>nvim_get_keymap(&quot;n&quot;)</code>。
        </>
      }
    >
      <UiToggleDrill />
    </DrillShell>
  );
}