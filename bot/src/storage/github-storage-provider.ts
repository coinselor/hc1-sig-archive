import { MeetingSession, StorageProvider, GitHubStorageProvider as IGitHubStorageProvider } from "../types/index.ts";

export class GitHubStorageProvider implements IGitHubStorageProvider {
    public readonly repository: string;
    public readonly branch: string;
    public readonly token: string;
    private readonly websiteUrl?: string;

    constructor(config: {
        repository: string;
        branch: string;
        token: string;
        websiteUrl?: string;
    }) {
        this.repository = config.repository;
        this.branch = config.branch;
        this.token = config.token;
        this.websiteUrl = config.websiteUrl;
    }

    async saveMinutes(session: MeetingSession, content: string): Promise<string> {
        const filePath = this.generateFilePath(session);
        const commitMessage = this.commitMessage(session);

        try {
            // Get the current file SHA if it exists (for updates)
            const existingFile = await this.getFileInfo(filePath);

            // Create or update the file
            await this.createOrUpdateFile(filePath, content, commitMessage, existingFile?.sha);

            // Return the URL where the minutes can be accessed
            return await this.getMinutesUrl(session);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to save meeting minutes to GitHub: ${errorMessage}`);
        }
    }

    async getMinutesUrl(session: MeetingSession): Promise<string> {
        if (this.websiteUrl) {
            // Return the website URL if configured
            const filePath = this.generateFilePath(session);
            const htmlPath = filePath.replace(/\.md$/, '.html');
            return `${this.websiteUrl.replace(/\/$/, '')}/${htmlPath}`;
        } else {
            // Return the GitHub repository URL
            const filePath = this.generateFilePath(session);
            return `https://github.com/${this.repository}/blob/${this.branch}/${filePath}`;
        }
    }

    generateFilePath(session: MeetingSession): string {
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

        return `meetings/${channelName}/${filename}`;
    }

    commitMessage(session: MeetingSession): string {
        const startTime = session.startTime.toISOString().split('T')[0]; // YYYY-MM-DD format
        return `Add meeting minutes: ${session.roomName} - ${startTime}

Meeting Details:
- Chair: ${session.chairDisplayName}
- Duration: ${this.calculateDuration(session)}
- Participants: ${session.participants.size}`;
    }

    private sanitizeChannelName(roomName: string): string {
        return roomName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
            .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    }

    private calculateDuration(session: MeetingSession): string {
        if (!session.endTime) {
            return "Ongoing";
        }

        const durationMs = session.endTime.getTime() - session.startTime.getTime();
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
    }

    private async getFileInfo(filePath: string): Promise<{ sha: string } | null> {
        const url = `https://api.github.com/repos/${this.repository}/contents/${filePath}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Matrix-Meeting-Bot/1.0',
                },
            });

            if (response.status === 404) {
                return null; // File doesn't exist
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return { sha: data.sha };
        } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                return null;
            }
            throw error;
        }
    }

    private async createOrUpdateFile(
        filePath: string,
        content: string,
        commitMessage: string,
        sha?: string
    ): Promise<void> {
        const url = `https://api.github.com/repos/${this.repository}/contents/${filePath}`;

        const body: Record<string, unknown> = {
            message: commitMessage,
            content: btoa(unescape(encodeURIComponent(content))), // Base64 encode UTF-8 content
            branch: this.branch,
        };

        if (sha) {
            body.sha = sha; // Required for updates
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'Matrix-Meeting-Bot/1.0',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `GitHub API error: ${response.status} ${response.statusText}. ${errorData.message || ''
                }`
            );
        }
    }
}