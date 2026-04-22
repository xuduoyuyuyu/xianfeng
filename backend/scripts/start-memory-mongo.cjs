const { MongoMemoryServer } = require("mongodb-memory-server");

async function main() {
  const mongod = await MongoMemoryServer.create({
    instance: {
      ip: "127.0.0.1",
      port: 60014,
      dbName: "knowledge-base",
    },
  });

  const uri = mongod.getUri();
  console.log(`[memory-mongo] started at ${uri}`);

  const shutdown = async () => {
    console.log("[memory-mongo] shutting down");
    await mongod.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[memory-mongo] failed to start", error);
  process.exit(1);
});
