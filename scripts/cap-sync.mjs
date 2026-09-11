import { spawnSync } from "node:child_process";

const major = Number(process.versions.node.split(".")[0]);
const syncArgs = ["cap", "sync", "android"];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  process.exit(result.status ?? 1);
}

if (major >= 22) {
  run("npx", syncArgs);
}

run("fnm", ["exec", "--using=22", "--", "npx", ...syncArgs]);
