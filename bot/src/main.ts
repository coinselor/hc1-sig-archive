import { ConfigManager } from "./config/config.ts";
import { AuthorizationServiceImpl } from "./auth/index.ts";
import { MatrixBotServiceImpl } from "./bot/index.ts";

let botService: MatrixBotServiceImpl | null = null;

async function main() {
  console.log("Starting Matrix Meeting Bot...");

  try {
    // Load configuration
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

    // Initialize authorization service
    const authService = new AuthorizationServiceImpl();
    await authService.loadAuthorizedUsers();
    console.log(
      `Authorization service initialized with ${authService.getAuthorizedUserCount()} authorized users`
    );

    // Initialize Matrix bot service with authorization service
    botService = new MatrixBotServiceImpl(config, authService);
    await botService.start();

    console.log("Matrix Meeting Bot started successfully!");
    console.log("Press Ctrl+C to stop the bot.");

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    console.error("Failed to start Matrix Meeting Bot:", error);
    await gracefulShutdown();
    Deno.exit(1);
  }
}

async function gracefulShutdown() {
  console.log("\nShutting down Matrix Meeting Bot...");
  
  if (botService) {
    try {
      await botService.stop();
    } catch (error) {
      console.error("Error stopping bot service:", error);
    }
  }
  
  console.log("Shutdown complete.");
}

// Handle graceful shutdown
Deno.addSignalListener("SIGINT", async () => {
  await gracefulShutdown();
  Deno.exit(0);
});

// Only add SIGTERM listener on non-Windows platforms
if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGTERM", async () => {
    await gracefulShutdown();
    Deno.exit(0);
  });
}

if (import.meta.main) {
  await main();
}
