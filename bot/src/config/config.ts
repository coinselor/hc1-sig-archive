import { BotConfiguration, BotConfigurationSchema } from "../types/index.ts";

export class ConfigManager {
  private config: BotConfiguration | null = null;

  async loadConfiguration(): Promise<BotConfiguration> {
    let fileConfig: Record<string, unknown>;
    try {
      const configText = await Deno.readTextFile("config/bot.json");
      fileConfig = JSON.parse(configText);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(
          "Configuration file 'config/bot.json' not found. " +
          "Copy 'config/bot.json.example' to 'config/bot.json' and configure it."
        );
      }
      throw new Error(`Failed to load config file: ${error}`);
    }

    this.injectSensitiveEnvVars(fileConfig);
    
    try {
      this.config = BotConfigurationSchema.parse(fileConfig);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Configuration validation failed: ${error.message}`);
      }
      throw error;
    }
    
    return this.config;
  }

  getConfiguration(): BotConfiguration {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call loadConfiguration() first.");
    }
    return this.config;
  }

  private injectSensitiveEnvVars(config: Record<string, unknown>): void {
    const matrixToken = Deno.env.get("MATRIX_ACCESS_TOKEN");
    if (matrixToken) {
      if (!config.matrix || typeof config.matrix !== 'object') {
        config.matrix = {};
      }
      (config.matrix as Record<string, unknown>).accessToken = matrixToken;
    }

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    if (githubToken) {
      if (!config.storage || typeof config.storage !== 'object') {
        config.storage = {};
      }
      const storage = config.storage as Record<string, unknown>;
      if (!storage.github || typeof storage.github !== 'object') {
        storage.github = {};
      }
      (storage.github as Record<string, unknown>).token = githubToken;
    }
  }
}