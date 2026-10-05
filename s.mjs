import { allSolutions } from "./lib/seq-solutions.ts";
const cmds = new Set();
for (const s of allSolutions()) {
  if (s.native) cmds.add(s.native);
}
console.log([...cmds].sort().join("\n"));
console.log("=== 共", cmds.size, "条待验证 ===");
