import { MeetingSession, GitHubStorageProvider as IGitHubStorageProvider } from "../types/index.ts";

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
            await this.createFile(filePath, content, commitMessage);

            return await this.getMinutesUrl(session);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to save meeting minutes to GitHub: ${errorMessage}`);
        }
    }

    // deno-lint-ignore require-await
    async getMinutesUrl(session: MeetingSession): Promise<string> {
        if (this.websiteUrl) {
            const filePath = this.generateFilePath(session);
            const cleanPath = filePath.replace(/\.md$/, '').replace(/^data\/meetings\//, '');
            // Website routes minutes at "/<channel>/<slug>" (no "/meetings" segment)
            return `${this.websiteUrl.replace(/\/$/, '')}/${cleanPath}`;
        } else {
            const filePath = this.generateFilePath(session);
            return `https://github.com/${this.repository}/blob/${this.branch}/${filePath}`;
        }
    }

    generateFilePath(session: MeetingSession): string {
        const channelName = this.sanitizeChannelName(session.roomName);

        const startTime = session.startTime;
        const year = startTime.getFullYear();
        const month = String(startTime.getMonth() + 1).padStart(2, '0');
        const day = String(startTime.getDate()).padStart(2, '0');
        const hour = String(startTime.getHours()).padStart(2, '0');
        const minute = String(startTime.getMinutes()).padStart(2, '0');

        const filename = `${year}-${month}-${day}-${hour}-${minute}-${channelName}.md`;

        // Store under the repository path watched by CI/CD and used by the website
        return `data/meetings/${channelName}/${filename}`;
    }

    commitMessage(session: MeetingSession): string {
        const startTime = session.startTime.toISOString().split('T')[0]; // YYYY-MM-DD format
        return `bot: add meeting minutes for ${session.roomName} on ${startTime}

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

    private encodeUtf8ToBase64(str: string): string {
        try {
            const utf8Bytes = new TextEncoder().encode(str);
            return btoa(String.fromCharCode(...utf8Bytes));
        } catch (_error) {
            const utf8Bytes = new TextEncoder().encode(str);
            let binaryString = '';
            for (let i = 0; i < utf8Bytes.length; i++) {
                binaryString += String.fromCharCode(utf8Bytes[i]);
            }
            return btoa(binaryString);
        }
    }

    private async createFile(
        filePath: string,
        content: string,
        commitMessage: string,
    ): Promise<void> {
        const url = `https://api.github.com/repos/${this.repository}/contents/${filePath}`;

        const body: Record<string, unknown> = {
            message: commitMessage,
            content: this.encodeUtf8ToBase64(content),
            branch: this.branch,
        };

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'HC1-Meeting-Bot/1.0',
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