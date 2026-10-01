// Optional single-command development launcher. Keeps frontend/backend in separate folders.
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const originIndex = args.indexOf("--origin");
const appOrigin =
  originIndex >= 0 ? args.splice(originIndex, 2)[1] : process.env.APP_ORIGIN;
const backend = spawn(process.execPath, ["--watch", "src/server.ts"], {
  cwd: resolve(root, "backend"),
  stdio: "inherit",
  env: { ...process.env, APP_ORIGIN: appOrigin },
});
const frontend = spawn(
  process.execPath,
  [resolve(root, "frontend/node_modules/vite/bin/vite.js"), ...args],
  { cwd: resolve(root, "frontend"), stdio: "inherit", env: process.env },
);
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  backend.kill("SIGTERM");
  frontend.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
backend.on("exit", (code) => {
  stop();
  process.exitCode = code || 0;
});
frontend.on("exit", (code) => {
  stop();
  process.exitCode = code || 0;
});
