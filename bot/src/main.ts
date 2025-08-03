import { ConfigManager } from "./config/config.ts";
import { AuthorizationServiceImpl } from "./auth/index.ts";
import { MatrixBotServiceImpl } from "./bot/index.ts";

let botService: MatrixBotServiceImpl | null = null;

async function main() {
  console.log("Starting HC1 Meeting Bot...");

  try {
    const configManager = new ConfigManager();
    const config = await configManager.loadConfiguration();

    console.log(
      `Connecting to Matrix homeserver: ${config.matrix.homeserverUrl}`,
    );
    console.log(`Bot user ID: ${config.matrix.userId}`);
    console.log(`Storage provider: ${config.storage.provider}`);
    console.log(
      `Authorized users: ${config.authorization.authorizedUsers.length}`,
    );

    const authService = new AuthorizationServiceImpl();
    await authService.loadAuthorizedUsers();
    console.log(
      `Authorization service initialized with ${authService.getAuthorizedUserCount()} authorized users.`
    );

    botService = new MatrixBotServiceImpl(config, authService);
    await botService.start();

    console.log("HC1 Meeting Bot started successfully.");
    console.log("Press Ctrl+C to stop the bot.");

    await new Promise(() => {});
  } catch (error) {
    console.error("Failed to start HC1 Meeting Bot:", error);
    await gracefulShutdown();
    Deno.exit(1);
  }
}

async function gracefulShutdown() {
  console.log("\nShutting down HC1 Meeting Bot...");
  
  if (botService) {
    try {
      await botService.stop();
    } catch (error) {
      console.error("Error stopping bot service:", error);
    }
  }
  
  console.log("HC1 Meeting Bot gracefully stopped.");
}

Deno.addSignalListener("SIGINT", async () => {
  await gracefulShutdown();
  Deno.exit(0);
});

if (import.meta.main) {
  await main();
}
