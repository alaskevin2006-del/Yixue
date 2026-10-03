import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function readConfig(env = process.env, args = process.argv.slice(2)) {
  if (env.NODE_ENV === "production" || !args.includes("--dev-principal")) {
    throw new Error("DEV_ONLY: explicit --dev-principal is required; production mode is forbidden.");
  }
  if (args.some((arg) => !["--dev-principal", "--serve-frontend"].includes(arg))) throw new Error("Unsupported server option.");
  const rawPort = env.YIXUE_PORT ?? "3000";
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) throw new Error("Invalid YIXUE_PORT.");
  const rawPath = env.YIXUE_DB_PATH ?? fileURLToPath(new URL("../.data/yixue.sqlite", import.meta.url));
  if (!rawPath.trim() || rawPath === ":memory:") throw new Error("A disk database path is required.");
  return { host: "127.0.0.1", port: Number(rawPort), dbPath: resolve(rawPath), principalMode: "DEV_ONLY",
    staticRoot: args.includes("--serve-frontend") ? fileURLToPath(new URL("../dist/", import.meta.url)) : null };
}
