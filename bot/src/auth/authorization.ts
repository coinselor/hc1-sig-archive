import { AuthorizationService } from "../types/index.ts";

export class AuthorizationServiceImpl implements AuthorizationService {
  private authorizedUsers: Set<string> = new Set();
  private configFilePath: string;

  constructor(configFilePath: string = "config/bot.json") {
    this.configFilePath = configFilePath;
  }

  /**
   * Check if a user is authorized to perform a specific action
   * @param userId - The Matrix user ID (e.g., "@alice:example.org")
   * @param action - The action to check authorization for
   * @returns true if the user is authorized, false otherwise
   */
  isAuthorized(userId: string, action: "start" | "end" | "cancel"): boolean {
    // All authorized users can perform all meeting actions
    return this.authorizedUsers.has(userId);
  }

  /**
   * Load authorized users from the configuration file
   */
  async loadAuthorizedUsers(): Promise<void> {
    try {
      const configText = await Deno.readTextFile(this.configFilePath);
      const config = JSON.parse(configText);

      if (!config.authorization?.authorizedUsers) {
        throw new Error(
          "Configuration file missing 'authorization.authorizedUsers' field"
        );
      }

      if (!Array.isArray(config.authorization.authorizedUsers)) {
        throw new Error(
          "'authorization.authorizedUsers' must be an array of user IDs"
        );
      }

      if (config.authorization.authorizedUsers.length === 0) {
        console.warn(
          "Warning: No authorized users configured. All meeting commands will be denied."
        );
      }

      // Clear existing users and load new ones
      this.authorizedUsers.clear();
      for (const userId of config.authorization.authorizedUsers) {
        if (typeof userId !== "string") {
          throw new Error(
            `Invalid user ID in authorized users list: ${userId}. Must be a string.`
          );
        }
        this.authorizedUsers.add(userId);
      }

      console.log(
        `Loaded ${this.authorizedUsers.size} authorized users from configuration`
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(
          `Configuration file not found: ${this.configFilePath}. ` +
            "Ensure the configuration file exists and is readable."
        );
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load authorized users: ${errorMessage}`);
    }
  }

  /**
   * Reload the configuration without restarting the service
   */
  async reloadConfiguration(): Promise<void> {
    const previousCount = this.authorizedUsers.size;
    await this.loadAuthorizedUsers();
    const newCount = this.authorizedUsers.size;

    console.log(
      `Configuration reloaded. Authorized users: ${previousCount} → ${newCount}`
    );
  }

  /**
   * Get the list of currently authorized users (for debugging/monitoring)
   */
  getAuthorizedUsers(): string[] {
    return Array.from(this.authorizedUsers);
  }

  /**
   * Get the count of authorized users
   */
  getAuthorizedUserCount(): number {
    return this.authorizedUsers.size;
  }
}