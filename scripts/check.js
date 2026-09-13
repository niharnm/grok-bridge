import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

let count = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${path}`);
      count++;
    } else if (entry.name.endsWith(".json")) {
      JSON.parse(await readFile(path, "utf8"));
      count++;
    }
  }
}
await check(".");
process.stdout.write(`Validated ${count} JavaScript and JSON files.\n`);
