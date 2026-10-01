import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Layout } from "@/lib/layout";

export const dynamic = "force-dynamic";

/**
 * 读 nvim 导出的窗口布局。
 *
 * ## 路径怎么定
 *
 * nvim 侧默认写到 `stdpath("state")/reflex-layout.json`,即
 * `~/.local/state/nvim/reflex-layout.json`。两边都在同一台 WSL 机器上,
 * 所以直接读文件,不需要起服务。
 *
 * ⚠️ 别把它当权威数据源:这是抽样,只有 nvim 那边触发 dump 时才更新。
 */
async function findLayoutFile(): Promise<string | null> {
  const candidates = [
    process.env.REFLEX_LAYOUT_FILE,
    join(homedir(), ".local/state/nvim/reflex-layout.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      await readFile(p);
      return p;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

export async function GET() {
  const file = await findLayoutFile();
  if (!file) {
    return NextResponse.json({
      layout: null,
      error: `没找到 ${join(homedir(), ".local/state/nvim/reflex-layout.json")} —— nvim 侧还没导出过`,
    });
  }
  try {
    const raw = await readFile(file, "utf8");
    const layout = JSON.parse(raw) as Layout;
    // 形状不对就直接报,不把坏数据塞给前端画图 ——
    // 画出一张错的图比"没有图"更糟。
    if (!layout || !Array.isArray(layout.tabs) || !Array.isArray(layout.buffers)) {
      return NextResponse.json({ layout: null, error: "JSON 形状不对(缺 tabs/buffers)" });
    }
    return NextResponse.json({ layout });
  } catch (e) {
    return NextResponse.json({ layout: null, error: `读 ${file} 失败:${String(e)}` });
  }
}
