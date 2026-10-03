import { readConfig } from "./config.js";
import { SQLiteRepository } from "./db/sqlite.js";
import { createApp } from "./app.js";

async function main() {
  const config = readConfig();
  const repository = new SQLiteRepository(config.dbPath);
  const server = createApp(repository, { staticRoot: config.staticRoot });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });
  } catch (error) { await repository.close(); throw error; }
  console.log(JSON.stringify({ event: "listening", host: config.host, port: server.address().port, principalMode: config.principalMode }));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000).unref();
    await new Promise((resolve) => server.close(resolve));
    await repository.close();
    clearTimeout(deadline);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

main().catch((error) => {
  // Do not print request content, DB paths or environment values.
  console.error(error.message.startsWith("DEV_ONLY") ? error.message : "LOCAL_BACKEND_START_FAILED");
  process.exitCode = 1;
});
