import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "buffet-493105";

const children = [];
let shuttingDown = false;

function run(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const proc of children) {
      if (proc.pid && proc.pid !== child.pid && !proc.killed) {
        proc.kill("SIGTERM");
      }
    }

    if (signal) {
      console.error(`${name} exited from signal ${signal}`);
      process.exit(1);
    }

    process.exit(code ?? 1);
  });

  children.push(child);
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run(
  "firebase emulators",
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "-y",
    "firebase-tools@latest",
    "emulators:start",
    "--project",
    projectId,
    "--only",
    "auth,firestore,storage,functions",
  ],
);

run("next dev", process.execPath, [nextBin, "dev", "--hostname", "0.0.0.0"]);
