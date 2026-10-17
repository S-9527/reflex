// 把 data/vim-index.json 包成 TS 模块（和 bindings.ts 一样的做法）
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "data/vim-index.json"), "utf8"));
const ts = `// 自动生成，请勿手改。
//
// 生成：node scripts/build-vim-index.mjs && node scripts/build-vim-index-ts.mjs
// 数据源：${src.meta.source}（Vim 官方参考手册的完整命令表）
//
// ## ⚠️ 这个文件是**覆盖率的分母**
//
// 它和 \`lib/bindings.ts\` 是互补的：
//   bindings.ts  ← nvim_get_keymap，**只看得见用户/插件映射**
//   本文件        ← Vim 官方 index.txt，**看得见全部内建命令**
//
// 只用 bindings 判断覆盖率，会漏掉 \`h\` \`l\` \`m\` \`q\` \`:\` \`ZZ\` 这些
// 内建命令 —— 它们从来不在 keymap 里。

export type VimIndexEntry = {
  section: string;
  tag: string | null;
  /** 帮助标签（\`CTRL-W_c\`），用于回溯原文 */
  helpTag: string | null;
  char: string;
  vim: string;
  action: string;
  aliasOf: string | null;
  isNotUsed: boolean;
  isDup: boolean;
  isSeeAlso: boolean;
};

export const VIM_INDEX_META = ${JSON.stringify(src.meta, null, 2)};

export const VIM_INDEX: VimIndexEntry[] = ${JSON.stringify(src.entries, null, 1)};
`;
writeFileSync(join(root, "lib/vim-index.ts"), ts);
console.log(`✅ ${src.entries.length} 条 → lib/vim-index.ts`);
