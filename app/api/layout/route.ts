import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * 读 nvim 导出的窗口布局。
 *
 * nvim 侧:在配置里挂 `lua require("reflex").dump_layout()`(见 README),
 * 它在切窗口/换 tab/开关 buffer 时把布局写到
 * `stdpath("state")/reflex-layout.json`。
 *
 * ⚠️ 这是抽样,不是权威数据源:只有 nvim 那边触发 dump 时才更新。
 * 而且它是"那一刻的快照",你在这里看到的可能已经过时几秒了。
 */
export async function GET() {
  const file = process.env.REFLEX_LAYOUT_FILE ?? join(homedir(), ".local/state/nvim/reflex-layout.json");
  try {
    const raw = await readFile(file, "utf8");
    const layout = JSON.parse(raw);
    if (!layout || !Array.isArray(layout.tabs) || !Array.isArray(layout.buffers)) {
      return Response.json({ layout: null, error: "JSON 形状不对(缺 tabs/buffers)" }, { status: 200 });
    }
    return Response.json({ layout, file, mtime: (await import("node:fs")).statSync(file).mtimeMs });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return Response.json(
        { layout: null, error: `没有 ${file} —— nvim 那边还没导出过`, path: file },
        { status: 200 },
      );
    }
    return Response.json({ layout: null, error: String(e) }, { status: 200 });
  }
}
