import { BotConfiguration, StorageProvider } from "../types/index.ts";
import { GitHubStorageProvider } from "./github-storage-provider.ts";
import { LocalStorageProvider } from "./local-storage-provider.ts";

export class StorageFactory {
  static createStorageProvider(config: BotConfiguration): StorageProvider {
    switch (config.storage.provider) {
      case "github":
        if (!config.storage.github) {
          throw new Error("GitHub storage configuration is required when provider is 'github'");
        }
        return new GitHubStorageProvider({
          repository: config.storage.github.repository,
          branch: config.storage.github.branch,
          token: config.storage.github.token,
          websiteUrl: config.storage.github.websiteUrl,
        });

      case "local": {
        const localConfig = config.storage.local || { directory: "../data/" };
        return new LocalStorageProvider({
          directory: localConfig.directory,
        });
      }

      default:
        throw new Error(`Unsupported storage provider: ${config.storage.provider}`);
    }
  }

  static createFallbackStorageProvider(): StorageProvider {
    return new LocalStorageProvider({
      directory: "../data/meetings-backup",
    });
  }
}