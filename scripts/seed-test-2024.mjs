import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const apply = process.argv.includes("--apply");
const sql = readFileSync(new URL("./fixtures/test-2024.sql", import.meta.url), "utf8");
mkdirSync("tmp", { recursive: true });
const file = resolve("tmp/seed-test-2024.sql");
writeFileSync(file, `${sql}\n${apply ? "commit" : "rollback"};\n`);
const result = execFileSync(
  process.execPath,
  ["node_modules/supabase/dist/supabase.js", "db", "query", "--linked", "--file", file],
  { encoding: "utf8", windowsHide: true },
);
console.log(
  apply
    ? "2024 test dataset applied (existing fixture is never overwritten)."
    : "2024 test dataset preview: all writes rolled back.",
);
console.log(result);
