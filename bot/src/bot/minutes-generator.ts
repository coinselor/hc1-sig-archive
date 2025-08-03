import { MeetingSession, CapturedMessage } from "../types/index.ts";

export interface MinutesGeneratorOptions {
  includeSystemMessages?: boolean;
  timeZone?: string;
}

export interface GeneratedMinutes {
  content: string;
  filename: string;
  metadata: MinutesMetadata;
}

export interface ParticipantStat {
  userId: string;
  displayName: string;
  messageCount: number;
}

export interface MinutesMetadata {
  title: string;
  room: string;
  chair: string;
  chairId: string;
  startTime: string;
  endTime: string;
  duration: string;
  participants: string[];
  participantStats: ParticipantStat[];
  roomId: string;
  published: string;
}

/**
 * Generates meeting minutes in Markdown format with frontmatter metadata
 */
export class MinutesGenerator {
  private options: MinutesGeneratorOptions;

  constructor(options: MinutesGeneratorOptions = {}) {
    this.options = {
      includeSystemMessages: options.includeSystemMessages ?? true,
      timeZone: options.timeZone ?? "UTC",
    };
  }

  /**
   * Generate meeting minutes from a completed meeting session
   */
  generateMinutes(session: MeetingSession): GeneratedMinutes {
    if (!session.endTime) {
      throw new Error("Cannot generate minutes for an active meeting session");
    }

    const metadata = this.generateMetadata(session);
    const frontmatter = this.generateFrontmatter(metadata);
    const content = this.generateContent(session);
    const filename = this.generateFilename(session);

    const fullContent = `${frontmatter}\n${content}`;

    return {
      content: fullContent,
      filename,
      metadata,
    };
  }

  /**
   * Generate metadata for the meeting minutes
   */
  private generateMetadata(session: MeetingSession): MinutesMetadata {
    const duration = this.calculateDuration(
      session.startTime,
      session.endTime!
    );
    const participants = Array.from(session.participants).sort();
    const participantStats = this.calculateParticipantStats(session);

    return {
      title: `${session.roomName} Meeting`,
      room: session.roomName,
      chair: session.chairDisplayName,
      chairId: session.chairUserId,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime!.toISOString(),
      duration,
      participants,
      participantStats,
      roomId: session.roomId,
      published: new Date().toISOString(),
    };
  }

  /**
   * Generate YAML frontmatter for the meeting minutes
   */
  private generateFrontmatter(metadata: MinutesMetadata): string {
    const participantList = metadata.participants
      .map((userId) => `  - "${userId}"`)
      .join("\n");
    const participantStatsList = metadata.participantStats
      .map((stat) => `  - userId: "${stat.userId}"
    displayName: "${stat.displayName}"
    messageCount: ${stat.messageCount}`)
      .join("\n");

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
   * Generate the main content of the meeting minutes
   */
  private generateContent(
    session: MeetingSession,
  ): string {
    return this.generateMinutesContent(session);
  }

  /**
   * Generate participant list with display names
   */
  private generateParticipantList(session: MeetingSession): string {
    const userDisplayNames = new Map<string, string>();

    userDisplayNames.set(session.chairUserId, session.chairDisplayName);

    for (const message of session.messages) {
      if (message.senderId !== "system") {
        userDisplayNames.set(message.senderId, message.senderDisplayName);
      }
    }

    const participants = Array.from(session.participants)
      .sort()
      .map((userId) => {
        const displayName = userDisplayNames.get(userId) || userId;
        return `- ${displayName} (${userId})`;
      });

    return participants.join("\n");
  }

  /**
   * Generate the meeting minutes content from captured messages
   */
  private generateMinutesContent(session: MeetingSession): string {
    if (session.messages.length === 0) {
      return "No messages were captured during this meeting.";
    }

    // Sort messages by timestamp
    const sortedMessages = [...session.messages].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const filteredMessages = this.filterDuplicateEdits(sortedMessages);

    const minutesLines: string[] = [];

    for (const message of filteredMessages) {
      if (
        !this.options.includeSystemMessages &&
        message.senderId === "system"
      ) {
        continue;
      }

      const timestamp = this.formatTimeWithSeconds(message.timestamp);
      const formattedMessage = this.formatMessage(message);

      if (message.messageType === "m.emote") {
        minutesLines.push(`${timestamp} ${formattedMessage}`);
      } else {
        minutesLines.push(
          `${timestamp} <${message.senderDisplayName}> ${formattedMessage}`
        );
      }
    }
    return minutesLines.join("\n");
  }

  /**
   * Format a single message based on its type
   */
  private formatMessage(message: CapturedMessage): string {
    let content = message.content;

    switch (message.messageType) {
      case "m.emote":
        content = `*${message.senderDisplayName} ${content}*`;
        break;
      case "m.notice":
        if (message.senderId === "system") {
          content = `*${content}*`;
        } else {
          content = `**${content}**`;
        }
        break;
      case "m.text":
      default:
        // Regular text message, no special formatting needed
        break;
    }

    if (message.isEdited) {
      content += " (edited)";
    }

    return content;
  }

  /**
   * Generate filename for the meeting minutes
   */
  private generateFilename(session: MeetingSession): string {
    const date = session.startTime.toISOString().split("T")[0]; // YYYY-MM-DD
    const time = session.startTime
      .toISOString()
      .split("T")[1]
      .substring(0, 5)
      .replace(":", "-"); // HH-MM
    const roomSlug = this.slugify(session.roomName);

    return `${date}-${time}-${roomSlug}.md`;
  }

  /**
   * Convert room name to URL-friendly slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Calculate duration between two dates in human-readable format
   */
  private calculateDuration(startTime: Date, endTime: Date): string {
    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${
        minutes !== 1 ? "s" : ""
      }`;
    } else {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
  }

  /**
   * Format date in YYYY-MM-DD format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  /**
   * Format time in HH:MM:SS format
   */
  private formatTimeWithSeconds(date: Date): string {
    const time = date.toISOString().split("T")[1].substring(0, 8);
    return time;
  }

  /**
   * Format time in HH:MM UTC format
   */
  private formatTime(date: Date): string {
    const time = date.toISOString().split("T")[1].substring(0, 5);
    return `${time} UTC`;
  }

  /**
   * Format date and time in readable format
   */
  private formatDateTime(date: Date): string {
    return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
  }

  /**
   * Filter out original messages when edited versions exist
   */
  private filterDuplicateEdits(messages: CapturedMessage[]): CapturedMessage[] {
    const messageMap = new Map<string, CapturedMessage>();
    
    // Group messages by their event ID or content+sender+timestamp for similar messages
    for (const message of messages) {
      const key = `${message.senderId}-${message.timestamp.getTime()}`;
      
      // If we already have a message for this key, keep the edited version
      const existing = messageMap.get(key);
      if (!existing || message.isEdited) {
        messageMap.set(key, message);
      }
    }
    
    return Array.from(messageMap.values());
  }

  /**
   * Calculate participant statistics for the meeting
   */
  private calculateParticipantStats(session: MeetingSession): ParticipantStat[] {
    const sortedMessages = [...session.messages].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const filteredMessages = this.filterDuplicateEdits(sortedMessages);
    
    const messageCounts = new Map<string, { displayName: string; count: number }>();
    
    for (const message of filteredMessages) {
      if (message.senderId !== "system") {
        const existing = messageCounts.get(message.senderId);
        messageCounts.set(message.senderId, {
          displayName: message.senderDisplayName,
          count: (existing?.count || 0) + 1
        });
      }
    }
    
    return Array.from(messageCounts.entries())
      .map(([userId, data]) => ({
        userId,
        displayName: data.displayName,
        messageCount: data.count
      }))
      .sort((a, b) => b.messageCount - a.messageCount);
  }
}
