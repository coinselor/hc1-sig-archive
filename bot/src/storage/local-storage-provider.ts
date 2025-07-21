import { MeetingSession, StorageProvider } from "../types/index.ts";

export class LocalStorageProvider implements StorageProvider {
  private readonly directory: string;

  constructor(config: { directory: string }) {
    this.directory = config.directory;
  }

  async saveMinutes(session: MeetingSession, content: string): Promise<string> {
    const filePath = this.generateFilePath(session);
    const fullPath = `${this.directory}/${filePath}`;

    try {
      // Ensure the directory exists
      await this.ensureDirectoryExists(fullPath);
      
      // Write the file
      await Deno.writeTextFile(fullPath, content);
      
      return fullPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save meeting minutes locally: ${errorMessage}`);
    }
  }

  async getMinutesUrl(session: MeetingSession): Promise<string> {
    const filePath = this.generateFilePath(session);
    return `${this.directory}/${filePath}`;
  }

  private generateFilePath(session: MeetingSession): string {
    // Convert room name to a safe directory name
    const channelName = this.sanitizeChannelName(session.roomName);
    
    // Format the date and time for the filename
    const startTime = session.startTime;
    const year = startTime.getFullYear();
    const month = String(startTime.getMonth() + 1).padStart(2, '0');
    const day = String(startTime.getDate()).padStart(2, '0');
    const hour = String(startTime.getHours()).padStart(2, '0');
    const minute = String(startTime.getMinutes()).padStart(2, '0');
    
    const filename = `${year}-${month}-${day}-${hour}-${minute}.md`;
    
    return `${channelName}/${filename}`;
  }

  private sanitizeChannelName(roomName: string): string {
    return roomName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const directory = filePath.substring(0, filePath.lastIndexOf('/'));
    try {
      await Deno.mkdir(directory, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
  }
}