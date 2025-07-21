#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Simple backlog processor to convert Element export logs to HC1 Matrix Bot format
 * Usage: deno run --allow-read --allow-write backlog-processor.ts <export-file.txt>
 */

// Basic interfaces
interface ParsedMessage {
    timestamp: Date;
    sender: string;
    content: string;
    rawLine: string;
}

interface MeetingMetadata {
    title: string;
    room: string;
    roomId: string;
    chair: string;
    chairId: string;
    startTime: string;
    endTime: string;
    duration: string;
    participants: string[];
    participantStats: ParticipantStat[];
    published: string;
}

interface ParticipantStat {
    userId: string;
    displayName: string;
    messageCount: number;
}

// Main processing function
async function main() {
    const args = Deno.args;

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log("🚀 HC1 Matrix Bot Backlog Processor");
        console.log("Usage: deno run --allow-read --allow-write backlog-processor.ts <export-file.txt> [file2.txt] [file3.txt]...");
        console.log("Example: deno run --allow-read --allow-write backlog-processor.ts meeting-export.txt");
        console.log("Batch: deno run --allow-read --allow-write backlog-processor.ts *.txt");
        console.log("\nExpected Element export format:");
        console.log("Mon, Sep 9, 2024, 23:41:05 - username: message content");
        Deno.exit(0);
    }

    console.log(`🚀 HC1 Matrix Bot Backlog Processor`);
    console.log(`📁 Processing ${args.length} file(s)...\n`);

    let successCount = 0;
    let failureCount = 0;
    const results: { file: string; status: 'success' | 'failed'; error?: string }[] = [];

    for (const filePath of args) {
        console.log(`\n📄 Processing: ${filePath}`);

        try {
            await processFile(filePath);
            console.log(`✅ Successfully processed: ${filePath}`);
            successCount++;
            results.push({ file: filePath, status: 'success' });
        } catch (error) {
            console.error(`❌ Failed to process ${filePath}:`, error.message);
            failureCount++;
            results.push({ file: filePath, status: 'failed', error: error.message });
            continue; // Continue with next file
        }
    }

    // Print summary
    console.log(`\n📊 Processing Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📁 Total: ${args.length}`);

    if (failureCount > 0) {
        console.log(`\n❌ Failed files:`);
        for (const result of results) {
            if (result.status === 'failed') {
                console.log(`   - ${result.file}: ${result.error}`);
            }
        }
    }

    if (successCount > 0) {
        console.log(`\n🎉 Successfully processed ${successCount} meeting(s)!`);
        console.log(`📂 Files saved to: data/meetings/`);
    }
}

async function processFile(filePath: string) {
    // Parse the Element export log
    const messages = await parseElementLog(filePath);

    if (messages.length === 0) {
        throw new Error("No valid messages found in the export file");
    }

    console.log(`📝 Found ${messages.length} messages`);

    // Collect metadata interactively
    const metadata = await collectMetadata(messages);

    // Generate markdown content
    const markdownContent = generateMarkdown(metadata, messages);

    // Save the markdown file
    const savedPath = await saveMarkdownFile(metadata, markdownContent);
    console.log(`💾 Saved: ${savedPath}`);
}

/**
 * Parse Element export log file
 * Expected format: "Day, Month DD, YYYY, HH:MM:SS - username: message content"
 * Example: "Mon, Sep 9, 2024, 23:41:05 - georgezgeorgez: My idea is that SIGs define the frontier"
 */
async function parseElementLog(filePath: string): Promise<ParsedMessage[]> {
    const text = await Deno.readTextFile(filePath);
    const lines = text.split('\n');
    const messages: ParsedMessage[] = [];

    // Regex to match Element export format
    // Captures: Day, Month DD, YYYY, HH:MM:SS - username: message
    const lineRegex = /^(\w+),\s+(\w+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{2}):(\d{2}):(\d{2})\s+-\s+([^:]+):\s+(.+)$/;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const match = trimmedLine.match(lineRegex);
        if (!match) {
            console.warn(`⚠️  Skipping malformed line: ${trimmedLine.substring(0, 50)}...`);
            continue;
        }

        const [, dayName, monthName, day, year, hour, minute, second, sender, content] = match;

        try {
            // Parse the timestamp
            const timestamp = parseElementTimestamp(monthName, day, year, hour, minute, second);

            messages.push({
                timestamp,
                sender: sender.trim(),
                content: content.trim(),
                rawLine: trimmedLine
            });
        } catch (error) {
            console.warn(`⚠️  Skipping line with invalid timestamp: ${trimmedLine.substring(0, 50)}...`);
            continue;
        }
    }

    // Sort messages by timestamp
    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return messages;
}

/**
 * Parse Element timestamp format to Date object
 */
function parseElementTimestamp(monthName: string, day: string, year: string, hour: string, minute: string, second: string): Date {
    const monthMap: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };

    const monthIndex = monthMap[monthName];
    if (monthIndex === undefined) {
        throw new Error(`Invalid month name: ${monthName}`);
    }

    const date = new Date(
        parseInt(year),
        monthIndex,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
    );

    if (isNaN(date.getTime())) {
        throw new Error(`Invalid date components: ${monthName} ${day}, ${year} ${hour}:${minute}:${second}`);
    }

    return date;
}

/**
 * Collect meeting metadata interactively from user input
 */
async function collectMetadata(messages: ParsedMessage[]): Promise<MeetingMetadata> {
    console.log("\n📋 Please provide meeting metadata:");

    // Extract basic info from messages
    const participants = extractParticipants(messages);
    const chair = messages[0].sender; // First sender is chair
    const startTime = messages[0].timestamp;
    const endTime = messages[messages.length - 1].timestamp;
    const duration = calculateDuration(startTime, endTime);

    console.log(`\n🔍 Auto-detected info:`);
    console.log(`   Chair: ${chair} (first message sender)`);
    console.log(`   Participants: ${participants.join(', ')}`);
    console.log(`   Duration: ${duration}`);
    console.log(`   Start: ${startTime.toISOString()}`);
    console.log(`   End: ${endTime.toISOString()}`);

    // Prompt for required metadata
    const roomName = await prompt("Room name (e.g., 'General', 'Development'): ");
    if (!roomName) throw new Error("Room name is required");

    const defaultTitle = `${roomName} Meeting`;
    const title = await prompt(`Meeting title [${defaultTitle}]: `) || defaultTitle;

    const defaultRoomId = `!${roomName.toLowerCase().replace(/\s+/g, '')}:example.org`;
    const roomId = await prompt(`Room ID [${defaultRoomId}]: `) || defaultRoomId;

    const defaultChairId = `@${chair.toLowerCase()}:example.org`;
    const chairId = await prompt(`Chair ID [${defaultChairId}]: `) || defaultChairId;

    // Generate participant list with Matrix IDs
    const participantIds = participants.map(p => `@${p.toLowerCase()}:example.org`);

    // Calculate participant stats
    const participantStats = calculateParticipantStats(messages, participantIds);

    return {
        title,
        room: roomName,
        roomId,
        chair,
        chairId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        participants: participantIds,
        participantStats,
        published: new Date().toISOString()
    };
}

/**
 * Extract unique participants from messages
 */
function extractParticipants(messages: ParsedMessage[]): string[] {
    const participants = new Set<string>();
    for (const message of messages) {
        participants.add(message.sender);
    }
    return Array.from(participants).sort();
}

/**
 * Calculate meeting duration in human-readable format
 */
function calculateDuration(startTime: Date, endTime: Date): string {
    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
    } else {
        return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
}

/**
 * Calculate participant statistics with message counts
 */
function calculateParticipantStats(messages: ParsedMessage[], participantIds: string[]): ParticipantStat[] {
    const messageCounts = new Map<string, number>();

    // Count messages per participant
    for (const message of messages) {
        const count = messageCounts.get(message.sender) || 0;
        messageCounts.set(message.sender, count + 1);
    }

    // Create stats array
    const stats: ParticipantStat[] = [];
    for (let i = 0; i < participantIds.length; i++) {
        const participantId = participantIds[i];
        const displayName = participantId.substring(1, participantId.indexOf(':'));
        const messageCount = messageCounts.get(displayName) || 0;

        stats.push({
            userId: participantId,
            displayName,
            messageCount
        });
    }

    // Sort by message count descending
    stats.sort((a, b) => b.messageCount - a.messageCount);

    return stats;
}

/**
 * Generate markdown content in HC1 Matrix Bot format
 */
function generateMarkdown(metadata: MeetingMetadata, messages: ParsedMessage[]): string {
    // Generate YAML frontmatter
    const frontmatter = generateFrontmatter(metadata);

    // Generate message content
    const content = generateMessageContent(messages);

    return `${frontmatter}\n\n${content}\n`;
}

/**
 * Generate YAML frontmatter matching the bot format exactly
 */
function generateFrontmatter(metadata: MeetingMetadata): string {
    const participantList = metadata.participants
        .map(userId => `  - "${userId}"`)
        .join('\n');

    const participantStatsList = metadata.participantStats
        .map(stat => `  - userId: "${stat.userId}"
    displayName: "${stat.displayName}"
    messageCount: ${stat.messageCount}`)
        .join('\n');

    return `---
title: "${metadata.title}"
room: "${metadata.room}"
chair: "${metadata.chair}"
chairId: "${metadata.chairId}"
startTime: "${metadata.startTime}"
endTime: "${metadata.endTime}"
duration: "${metadata.duration}"
participants:
${participantList}
participantStats:
${participantStatsList}
roomId: "${metadata.roomId}"
published: "${metadata.published}"
---`;
}

/**
 * Generate message content in HH:MM:SS - displayName: message format
 */
function generateMessageContent(messages: ParsedMessage[]): string {
    const messageLines: string[] = [];

    for (const message of messages) {
        const timeStr = formatTimeHHMMSS(message.timestamp);
        messageLines.push(`${timeStr} - ${message.sender}: ${message.content}`);
    }

    return messageLines.join('\n');
}

/**
 * Format time in HH:MM:SS format
 */
function formatTimeHHMMSS(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Save markdown file with proper naming convention
 */
async function saveMarkdownFile(metadata: MeetingMetadata, content: string): Promise<string> {
    // Generate file path: data/meetings/{room-slug}/{YYYY-MM-DD-HH-MM-room-slug}.md
    const startTime = new Date(metadata.startTime);
    const roomSlug = slugify(metadata.room);

    const date = startTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = startTime.toISOString().split('T')[1].substring(0, 5).replace(':', '-'); // HH-MM

    const filename = `${date}-${time}-${roomSlug}.md`;
    const dirPath = `data/meetings/${roomSlug}`;
    const filePath = `${dirPath}/${filename}`;

    // Create directory if it doesn't exist
    try {
        await Deno.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) {
            throw error;
        }
    }

    // Check if file already exists
    try {
        await Deno.stat(filePath);
        const overwrite = await prompt(`File ${filePath} already exists. Overwrite? (y/N): `);
        if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
            throw new Error("File already exists and user chose not to overwrite");
        }
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
        // File doesn't exist, which is fine
    }

    // Write the file
    await Deno.writeTextFile(filePath, content);

    return filePath;
}

/**
 * Convert text to URL-friendly slug
 */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Simple prompt function for user input
 */
async function prompt(message: string): Promise<string> {
    console.log(message);
    const buf = new Uint8Array(1024);
    const n = await Deno.stdin.read(buf) ?? 0;
    return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

// Run the script
if (import.meta.main) {
    await main();
}