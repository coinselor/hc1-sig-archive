import { MeetingSession, CapturedMessage, MatrixEvent, MessageContent } from "../types/index.ts";
import { MinutesGenerator, GeneratedMinutes } from "./minutes-generator.ts";

export interface MeetingManagerOptions {
  kvPath?: string;
  minutesGeneration?: {
    includeSystemMessages?: boolean;
    timeZone?: string;
  };
}

export interface MeetingStartResult {
  success: boolean;
  message: string;
  session?: MeetingSession;
}

export interface MeetingEndResult {
  success: boolean;
  message: string;
  session?: MeetingSession;
  minutes?: GeneratedMinutes;
}

export interface MeetingStatusResult {
  hasActiveMeeting: boolean;
  session?: MeetingSession;
  messageCount?: number;
  duration?: string;
}

/**
 * Manages meeting sessions, including persistence and state recovery
 */
export class MeetingManager {
  private kv!: Deno.Kv;
  private activeSessions: Map<string, MeetingSession> = new Map();
  private kvPath?: string;
  private minutesGenerator: MinutesGenerator;

  constructor(options: MeetingManagerOptions = {}) {
    this.kvPath = options.kvPath;
    this.minutesGenerator = new MinutesGenerator();
  }

  /**
   * Initialize the meeting manager and recover any active sessions
   */
  async initialize(): Promise<void> {
    try {
      if (this.kvPath) {
        const kvDir = this.kvPath.substring(0, this.kvPath.lastIndexOf('/'));
        if (kvDir) {
          try {
            await Deno.mkdir(kvDir, { recursive: true });
          } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
              throw error;
            }
          }
        }
      }
      
      this.kv = await Deno.openKv(this.kvPath);
      
      await this.recoverActiveSessions();
      
      console.log(`MeetingManager initialized with ${this.activeSessions.size} recovered sessions`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize MeetingManager: ${errorMessage}`);
    }
  }

  /**
   * Close the meeting manager and clean up resources
   */
  close(): void {
    try {
      if (this.kv) {
        this.kv.close();
      }
      this.activeSessions.clear();
    } catch (error) {
      console.error("Error closing MeetingManager:", error);
    }
  }

  /**
   * Start a new meeting session
   */
  async startMeeting(
    roomId: string,
    roomName: string,
    chairUserId: string,
    chairDisplayName: string
  ): Promise<MeetingStartResult> {
    try {
      if (this.activeSessions.has(roomId)) {
        return {
          success: false,
          message: "A meeting is already active in this room. Please end the current meeting before starting a new one.",
        };
      }

      const sessionId = this.generateSessionId(roomId);
      const session: MeetingSession = {
        id: sessionId,
        roomId,
        roomName,
        chairUserId,
        chairDisplayName,
        startTime: new Date(),
        messages: [],
        participants: new Set([chairUserId]),
      };

      this.activeSessions.set(roomId, session);

      await this.persistSession(session);

      const confirmationMessage = `${roomName} meeting initiated by ${chairDisplayName} acting as chair.\nA record of all messages will be automatically archived.`;

      return {
        success: true,
        message: confirmationMessage,
        session,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to start meeting: ${errorMessage}`,
      };
    }
  }

  /**
   * End an active meeting session
   */
  async endMeeting(roomId: string): Promise<MeetingEndResult> {
    try {
      const session = this.activeSessions.get(roomId);
      
      if (!session) {
        return {
          success: false,
          message: "No active meeting found in this room.",
        };
      }

      session.endTime = new Date();

      let minutes: GeneratedMinutes;
      try {
        minutes = this.minutesGenerator.generateMinutes(session);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to generate meeting minutes: ${errorMessage}`,
        };
      }

      await this.persistSession(session);

      this.activeSessions.delete(roomId);

      await this.kv.delete(["active_sessions", roomId]);

      const duration = this.calculateDuration(session.startTime, session.endTime);
      const confirmationMessage = `${session.roomName} meeting has ended. Duration: ${duration}. Minutes have been generated and are ready for upload.`;

      return {
        success: true,
        message: confirmationMessage,
        session,
        minutes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to end meeting: ${errorMessage}`,
      };
    }
  }

  /**
   * Cancel an active meeting session without generating minutes
   */
  async cancelMeeting(roomId: string): Promise<MeetingEndResult> {
    try {
      const session = this.activeSessions.get(roomId);
      
      if (!session) {
        return {
          success: false,
          message: "No active meeting found in this room.",
        };
      }

      this.activeSessions.delete(roomId);

      await this.kv.delete(["active_sessions", roomId]);
      await this.kv.delete(["sessions", session.id]);

      const confirmationMessage = `${session.roomName} meeting has been cancelled. No minutes will be generated.`;

      return {
        success: true,
        message: confirmationMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to cancel meeting: ${errorMessage}`,
      };
    }
  }

  /**
   * Get the status of a meeting in a room
   */
  getMeetingStatus(roomId: string): MeetingStatusResult {
    const session = this.activeSessions.get(roomId);
    
    if (!session) {
      return {
        hasActiveMeeting: false,
      };
    }

    const duration = this.calculateDuration(session.startTime, new Date());
    
    return {
      hasActiveMeeting: true,
      session,
      messageCount: session.messages.length,
      duration,
    };
  }

  /**
   * Set the topic for an active meeting
   */
  async setMeetingTopic(roomId: string, topic: string): Promise<{ success: boolean; message: string }> {
    try {
      const session = this.activeSessions.get(roomId);
      
      if (!session) {
        return {
          success: false,
          message: "No active meeting found in this room. Start a meeting first with #startmeeting.",
        };
      }

      session.topic = topic;
      
      await this.persistSession(session);
      
      return {
        success: true,
        message: `Topic updated successfully.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to set topic: ${errorMessage}`,
      };
    }
  }

  /**
   * Capture a message during an active meeting
   */
  async captureMessage(roomId: string, event: MatrixEvent, senderDisplayName: string): Promise<boolean> {
    try {
      const session = this.activeSessions.get(roomId);
      
      if (!session) {
        return false;
      }

      const content = event.content as unknown as MessageContent;
      if (!content.msgtype || !["m.text", "m.emote", "m.notice"].includes(content.msgtype)) {
        return false;
      }

      const capturedMessage: CapturedMessage = {
        timestamp: new Date(event.origin_server_ts),
        senderId: event.sender,
        senderDisplayName,
        content: content.body,
        messageType: content.msgtype as "m.text" | "m.emote" | "m.notice",
        eventId: event.event_id,
      };

      session.messages.push(capturedMessage);
      
      session.participants.add(event.sender);

      await this.persistSession(session);

      return true;
    } catch (error) {
      console.error("Error capturing message:", error);
      return false;
    }
  }

  /**
   * Handle message edits during an active meeting
   */
  async captureMessageEdit(
    roomId: string,
    event: MatrixEvent,
    originalEventId: string,
    senderDisplayName: string
  ): Promise<boolean> {
    try {
      const session = this.activeSessions.get(roomId);
      
      if (!session) {
        return false;
      }

      const content = event.content as unknown as MessageContent;
      
      const editedMessage: CapturedMessage = {
        timestamp: new Date(event.origin_server_ts),
        senderId: event.sender,
        senderDisplayName,
        content: content.body,
        messageType: content.msgtype as "m.text" | "m.emote" | "m.notice",
        eventId: event.event_id,
        isEdited: true,
        originalEventId,
      };

      session.messages.push(editedMessage);
      session.participants.add(event.sender);

      await this.persistSession(session);

      return true;
    } catch (error) {
      console.error("Error capturing message edit:", error);
      return false;
    }
  }

  /**
   * Record participant join/leave events
   */
  async recordParticipantEvent(
    roomId: string,
    userId: string,
    displayName: string,
    eventType: "join" | "leave"
  ): Promise<boolean> {
    try {
      const session = this.activeSessions.get(roomId);
      
      if (!session) {
        return false;
      }

      const eventMessage: CapturedMessage = {
        timestamp: new Date(),
        senderId: "system",
        senderDisplayName: "System",
        content: `${displayName} ${eventType === "join" ? "joined" : "left"} the meeting.`,
        messageType: "m.notice",
        eventId: `system-${Date.now()}`,
      };

      session.messages.push(eventMessage);
      
      if (eventType === "join") {
        session.participants.add(userId);
      }

      await this.persistSession(session);

      return true;
    } catch (error) {
      console.error("Error recording participant event:", error);
      return false;
    }
  }

  /**
   * Recover active sessions from persistent storage after restart
   */
  private async recoverActiveSessions(): Promise<void> {
    try {
      const entries = this.kv.list({ prefix: ["active_sessions"] });
      
      for await (const entry of entries) {
        const roomId = entry.key[1] as string;
        const sessionData = entry.value as MeetingSession;
        
        // Reconstruct the serialized session data
        const session: MeetingSession = {
          ...sessionData,
          startTime: new Date(sessionData.startTime),
          endTime: sessionData.endTime ? new Date(sessionData.endTime) : undefined,
          participants: new Set(sessionData.participants as unknown as string[]),
        };
        
        this.activeSessions.set(roomId, session);
        console.log(`Recovered active meeting session for room ${roomId}`);
      }
    } catch (error) {
      console.error("Error recovering active sessions:", error);
    }
  }

  /**
   * Persist a session to Deno KV
   */
  private async persistSession(session: MeetingSession): Promise<void> {
    try {
      // Convert Set to Array for JSON serialization
      const sessionData = {
        ...session,
        participants: Array.from(session.participants),
      };

      await this.kv.set(["sessions", session.id], sessionData);
      
      // Store active session reference if meeting is ongoing
      if (!session.endTime) {
        await this.kv.set(["active_sessions", session.roomId], sessionData);
      }
    } catch (error) {
      console.error("Error persisting session:", error);
      throw error;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(roomId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${roomId.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}_${random}`;
  }

  /**
   * Calculate duration between two dates
   */
  private calculateDuration(startTime: Date, endTime: Date): string {
    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
    } else {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
  }
}