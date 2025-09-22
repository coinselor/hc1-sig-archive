import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  RichReply,
} from "matrix-bot-sdk";
import {
  BotConfiguration,
  MatrixBotService,
  MatrixEvent,
  MessageContent,
  AuthorizationService,
  StorageProvider,
  MemberEventContent,
  RelationContent,
} from "../types/index.ts";
import { MeetingManager } from "./meeting-manager.ts";
import { CommandHandler } from "./command-handler.ts";
import { StorageFactory } from "../storage/storage-factory.ts";

export class MatrixBotServiceImpl implements MatrixBotService {
  private client: MatrixClient | null = null;
  private config: BotConfiguration;
  private meetingManager: MeetingManager;
  private commandHandler: CommandHandler;
  private storageProvider: StorageProvider;
  private fallbackStorageProvider: StorageProvider;
  private authorizationService: AuthorizationService;
  private isRunning = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(
    config: BotConfiguration, 
    authorizationService: AuthorizationService,
    meetingManager?: MeetingManager
  ) {
    this.config = config;
    this.authorizationService = authorizationService;
    this.meetingManager = meetingManager || new MeetingManager({ 
      minutesGeneration: config.minutesGeneration,
      kvPath: config.denoKv?.path
    });
    this.commandHandler = new CommandHandler({
      authorizationService: this.authorizationService,
    });
    this.storageProvider = StorageFactory.createStorageProvider(config);
    this.fallbackStorageProvider = StorageFactory.createFallbackStorageProvider();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("HC1 Meeting Bot service is already running");
      return;
    }

    try {
      await this.meetingManager.initialize();
      const storage = new SimpleFsStorageProvider("./data/matrix-storage.json");
      this.client = new MatrixClient(
        this.config.matrix.homeserverUrl,
        this.config.matrix.accessToken,
        storage
      );

      if (this.config.matrix.displayName) {
        try {
          await this.client.setDisplayName(this.config.matrix.displayName);
        } catch (error) {
          console.warn("Failed to set display name:", error);
        }
      }

      AutojoinRoomsMixin.setupOnClient(this.client);

      this.setupEventListeners();

      console.log("Starting Matrix client...");
      await this.client.start();
      
      this.isRunning = true;
      this.reconnectAttempts = 0;
      
      console.log(`HC1 Meeting Bot connected as ${this.config.matrix.userId}`);
      console.log("Bot is ready.");
      
    } catch (error) {
      console.error("Failed to start HC1 Meeting Bot service:", error);
      await this.handleConnectionError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.client) {
      console.log("HC1 Meeting Bot service is not running");
      return;
    }

    try {
      console.log("Stopping HC1 Meeting Bot service...");
      
      this.client.stop();
      
      await this.meetingManager.close();
      
      this.isRunning = false;
      this.client = null;
      
      console.log("HC1 Meeting Bot service gracefully stopped.");
      
    } catch (error) {
      console.error("Error stopping HC1 Meeting Bot service:", error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    this.client.on("room.message", async (roomId: string, event: MatrixEvent) => {
      try {
        if (event.sender === this.config.matrix.userId) {
          return;
        }

        if (this.isCommand(event)) {
          await this.processEvent(roomId, event);
        } else {
          await this.handleMessage(roomId, event);
        }
      } catch (error) {
        console.error(`Error handling room message in ${roomId}:`, error);
      }
    });

    this.client.on("room.event", async (roomId: string, event: MatrixEvent) => {
      try {
        if (event.type === "m.room.member") {
          await this.handleMemberEvent(roomId, event);
        } else if (event.type === "m.room.message") {
          await this.handleMessageEdit(roomId, event);
        } else if (event.type === "m.room.redaction") {
          await this.handleMessageRedaction(roomId, event);
        }
      } catch (error) {
        console.error(`Error handling room event in ${roomId}:`, error);
      }
    });

    this.client.on("sync.failed", async (error: Error) => {
      console.error("Matrix sync failed:", error);
      await this.handleConnectionError(error);
    });

    this.client.on("sync", () => {
      if (this.reconnectAttempts > 0) {
        console.log("Matrix sync restored successfully");
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay
      }
    });
  }

  private isCommand(event: MatrixEvent): boolean {
    const content = event.content as unknown as MessageContent;
    if (content.msgtype !== "m.text" || !content.body) {
      return false;
    }
    return this.commandHandler.isCommand(content.body);
  }

  async processEvent(roomId: string, event: MatrixEvent): Promise<void> {
    const content = event.content as unknown as MessageContent;
    const command = content.body?.trim() || "";
    
    console.log(`Received command in ${roomId}: ${command} from ${event.sender}`);
    
    try {
      const commandResult = this.commandHandler.handleCommand(event);
      
      if (!commandResult.valid) {
        const errorMessage = commandResult.error || "❌ FAIL: Invalid command.";
        
        if (errorMessage.includes("Access Denied")) {
          await this.sendFormattedMessage(roomId, errorMessage);
        } else {
          const formattedError = errorMessage.includes("Unknown command") 
            ? `❌ FAIL: Invalid command.\n\n${errorMessage}\n\nUse \`#help\` to view available commands.`
            : `❌ FAIL: Command failed.\n\n${errorMessage}`;
          
          await this.sendFormattedMessage(roomId, formattedError);
        }
        return;
      }

      const roomName = await this.getRoomName(roomId);
      const senderDisplayName = await this.getSenderDisplayName(event.sender);

      switch (commandResult.command) {
        case "start":
          await this.handleStartMeetingCommand(roomId, roomName, event.sender, senderDisplayName);
          break;
        case "end":
          await this.handleEndMeetingCommand(roomId);
          break;
        case "cancel":
          await this.handleCancelMeetingCommand(roomId);
          break;
        case "status":
          await this.handleStatusCommand(roomId);
          break;
        case "help":
          await this.sendFormattedMessage(roomId, this.commandHandler.getHelpText());
          break;
        case "topic":
          await this.handleTopicCommand(roomId, command);
          break;
        default:
          await this.sendMessage(roomId, "Unknown command. Use #help to see available commands.");
      }
    } catch (error) {
      console.error(`Error handling command in ${roomId}:`, error);
      await this.sendMessage(roomId, `There was an unexpected error. ¯_(ツ)_/¯`);
    }
  }

  async handleMessage(roomId: string, event: MatrixEvent): Promise<void> {
    const content = event.content as unknown as MessageContent;
    
    console.log(`Message in ${roomId} from ${event.sender}: ${content.body || "[no body]"}`);
    
    try {
      if (event.sender === this.config.matrix.userId) {
        return;
      }
      const senderDisplayName = await this.getSenderDisplayName(event.sender);
      
      // Only works if meeting is active
      const captured = await this.meetingManager.captureMessage(roomId, event, senderDisplayName);
      
      if (captured) {
        console.log(`Captured message from ${event.sender} in meeting for room ${roomId}`);
      }
    } catch (error) {
      console.error(`Error capturing message in ${roomId}:`, error);
    }
  }

  private async handleMemberEvent(roomId: string, event: MatrixEvent): Promise<void> {
    console.log(`Member event in ${roomId}: ${event.type} for ${event.state_key}`);
    
    try {
      if (!event.state_key) {
        return; // No user ID to track
      }

      if (event.state_key === this.config.matrix.userId) {
        return;
      }

      const content = event.content as unknown as MemberEventContent;
      const membership = content?.membership;
      
      if (membership === "join") {
        const displayName = await this.getSenderDisplayName(event.state_key);
        const recorded = await this.meetingManager.recordParticipantEvent(
          roomId,
          event.state_key,
          displayName,
          "join"
        );
        
        if (recorded) {
          console.log(`Recorded join event for ${event.state_key} in meeting for room ${roomId}`);
        }
      } else if (membership === "leave" || membership === "ban") {
        const displayName = await this.getSenderDisplayName(event.state_key);
        const recorded = await this.meetingManager.recordParticipantEvent(
          roomId,
          event.state_key,
          displayName,
          "leave"
        );
        
        if (recorded) {
          console.log(`Recorded leave event for ${event.state_key} in meeting for room ${roomId}`);
        }
      }
    } catch (error) {
      console.error(`Error handling member event in ${roomId}:`, error);
    }
  }

  private async handleMessageEdit(roomId: string, event: MatrixEvent): Promise<void> {
    try {
      if (event.sender === this.config.matrix.userId) {
        return;
      }

      const content = event.content as unknown as MessageContent;
      
      // Check if this is an edit (has m.relates_to with rel_type "m.replace")
      const relatesTo = content["m.relates_to"] as RelationContent;
      if (relatesTo?.rel_type === "m.replace") {
        const originalEventId = relatesTo.event_id;
        const newContent = content["m.new_content"] as MessageContent;
        
        if (originalEventId && newContent && ["m.text", "m.emote", "m.notice"].includes(newContent.msgtype)) {
          const senderDisplayName = await this.getSenderDisplayName(event.sender);
          
          const editEvent: MatrixEvent = {
            ...event,
            content: newContent as Record<string, unknown>,
          };
          
          const captured = await this.meetingManager.captureMessageEdit(
            roomId,
            editEvent,
            originalEventId,
            senderDisplayName
          );
          
          if (captured) {
            console.log(`Captured message edit from ${event.sender} in meeting for room ${roomId}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error handling message edit in ${roomId}:`, error);
    }
  }

  private async handleMessageRedaction(roomId: string, event: MatrixEvent): Promise<void> {
    try {
      if (event.sender === this.config.matrix.userId) {
        return;
      }

      const redactedEventId = event.content?.redacts || event.redacts;
      
      if (redactedEventId) {
        const senderDisplayName = await this.getSenderDisplayName(event.sender);
        
        const redactionEvent: MatrixEvent = {
          event_id: event.event_id,
          sender: event.sender,
          room_id: event.room_id,
          origin_server_ts: event.origin_server_ts,
          type: "m.room.message",
          content: {
            msgtype: "m.notice",
            body: `[Message redacted by ${senderDisplayName}]`,
          },
        };
        
        const captured = await this.meetingManager.captureMessage(roomId, redactionEvent, "System");
        
        if (captured) {
          console.log(`Captured message redaction by ${event.sender} in meeting for room ${roomId}`);
        }
      }
    } catch (error) {
      console.error(`Error handling message redaction in ${roomId}:`, error);
    }
  }

  private async handleConnectionError(error: Error): Promise<void> {
    console.error("Matrix connection error:", error);
    
    if (!this.isRunning) {
      return; // Don't reconnect if we're shutting down
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.isRunning = false;
      return;
    }

    console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`);
    
    // Wait before reconnecting with exponential backoff
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Cap at 30 seconds
    
    try {
      if (this.client) {
        this.client.stop();
      }
      await this.start();
    } catch (reconnectError) {
      console.error("Reconnection failed:", reconnectError);
    }
  }

  private async sendMessage(roomId: string, message: string): Promise<void> {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    try {
      await this.client.sendMessage(roomId, {
        msgtype: "m.notice",
        body: message,
      });
    } catch (error) {
      console.error(`Failed to send message to ${roomId}:`, error);
      throw error;
    }
  }

  async sendFormattedMessage(roomId: string, text: string, html?: string): Promise<void> {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    try {
      const content: MessageContent = {
        msgtype: "m.notice",
        body: text,
      };

      if (html) {
        content.format = "org.matrix.custom.html";
        content.formatted_body = html;
      }

      await this.client.sendMessage(roomId, content);
    } catch (error) {
      console.error(`Failed to send formatted message to ${roomId}:`, error);
      throw error;
    }
  }

  async replyToMessage(roomId: string, originalEvent: MatrixEvent, replyText: string): Promise<void> {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    try {
      const reply = RichReply.createFor(roomId, originalEvent, replyText, replyText);
      reply.msgtype = "m.notice";
      await this.client.sendMessage(roomId, reply);
    } catch (error) {
      console.error(`Failed to reply to message in ${roomId}:`, error);
      throw error;
    }
  }

  get running(): boolean {
    return this.isRunning;
  }

  get matrixClient(): MatrixClient | null {
    return this.client;
  }

  private async handleStartMeetingCommand(
    roomId: string,
    roomName: string,
    chairUserId: string,
    chairDisplayName: string
  ): Promise<void> {
    try {
      const result = await this.meetingManager.startMeeting(
        roomId,
        roomName,
        chairUserId,
        chairDisplayName
      );

      if (result.success) {
        await this.sendFormattedMessage(roomId, result.message);
      } else {
        const errorMessage = result.message.includes("already active") 
          ? `❌ FAIL: A meeting is already active in this room. Please end the current meeting before starting a new one.`
          : `❌ FAIL: Meeting did not start.\n\n${result.message}`;
        
        await this.sendFormattedMessage(roomId, errorMessage);
      }
    } catch (error) {
      console.error(`Error starting meeting in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendMessage(roomId, `❌ FAIL: Meeting did not start.\n\n${errorMessage}`);
    }
  }

  private async handleEndMeetingCommand(roomId: string): Promise<void> {
    try {
      const result = await this.meetingManager.endMeeting(roomId);

      if (result.success && result.minutes && result.session) {
        try {
          await this.storageProvider.saveMinutes(result.session, result.minutes.content);
          const websiteUrl = await this.storageProvider.getMinutesUrl(result.session);
          
          if (websiteUrl) {
            const formattedMessage = 
              `${result.session.roomName} meeting has ended after ${this.calculateDuration(result.session.startTime, result.session.endTime!)} with ${result.session.messages.length} messages captured and ${result.session.participants.size} participants.\n\n` +
              `Minutes are available at ${websiteUrl}`;
            
            await this.sendFormattedMessage(roomId, formattedMessage);
          } else {
            const formattedMessage = `${result.session.roomName} meeting has ended after ${this.calculateDuration(result.session.startTime, result.session.endTime!)} with ${result.session.messages.length} messages captured and ${result.session.participants.size} participants.\n\n` +
              `Minutes have been locally stored.`;
            
            await this.sendFormattedMessage(roomId, formattedMessage);
          }
        } catch (storageError) {
          console.error("Primary storage failed, trying fallback:", storageError);
          
          try {
            await this.fallbackStorageProvider.saveMinutes(result.session, result.minutes.content);
            const formattedMessage = `${result.session.roomName} meeting has ended.\n\n` +
              `Minutes saved to local backup storage due to primary storage failure.`;
            
            await this.sendFormattedMessage(roomId, formattedMessage);
          } catch (fallbackError) {
            console.error("Fallback storage also failed:", fallbackError);
            const errorMessage = `${result.session.roomName} meeting has ended, but failed to save minutes.\n`;
            
            await this.sendFormattedMessage(roomId, errorMessage);
          }
        }
      } else {
        const errorMessage = result.message.includes("No active meeting") 
          ? `❌ FAIL: No active meeting found in this room.`
          : `❌ FAIL: Meeting could not end.\n\n${result.message}`;
        
        await this.sendFormattedMessage(roomId, errorMessage);
      }
    } catch (error) {
      console.error(`Error ending meeting in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ FAIL: Meeting could not end.\n\n${errorMessage}`);
    }
  }

  private async handleCancelMeetingCommand(roomId: string): Promise<void> {
    try {
      const result = await this.meetingManager.cancelMeeting(roomId);
      
      if (result.success) {
        await this.sendFormattedMessage(roomId, result.message);
      } else {
        const errorMessage = result.message.includes("No active meeting") 
          ? `❌ FAIL: No active meeting found in this room.`
          : result.message.includes("Insufficient permissions")
          ? `❌ FAIL: Insufficient permissions. You are not authorized to cancel meetings.`
          : `❌ FAIL: Meeting could not be cancelled. ${result.message}`;
        
        await this.sendFormattedMessage(roomId, errorMessage);
      }
    } catch (error) {
      console.error(`Error cancelling meeting in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ FAIL: Meeting could not be cancelled.\n\n${errorMessage}`);
    }
  }

  private async handleStatusCommand(roomId: string): Promise<void> {
    try {
      const status = this.meetingManager.getMeetingStatus(roomId);
      
      if (status.hasActiveMeeting && status.session) {
        const formattedMessage = `STATUS: Active for ${status.duration}.\n\n` +
          `All messages in this room are being recorded.\n` +
          `Lines said: ${status.messageCount}\n` +
          `Use #endmeeting to end the meeting.`;
        
        await this.sendFormattedMessage(roomId, formattedMessage);
      } else {
        const formattedMessage = `STATUS: No active meeting.\n\n` +
          `Use #startmeeting to begin a new meeting session.`;
        
        await this.sendFormattedMessage(roomId, formattedMessage);
      }
    } catch (error) {
      console.error(`Error getting meeting status in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ FAIL: Failed to get meeting status.\n\n${errorMessage}`);
    }
  }

  private async handleTopicCommand(roomId: string, command: string): Promise<void> {
    try {
      // Extract topic from command (everything after "#topic ")
      const topicMatch = command.match(/^#topic\s+(.+)$/i);
      
      if (!topicMatch || !topicMatch[1].trim()) {
        await this.sendFormattedMessage(roomId, "❌ FAIL: Please provide a topic.\n\nUsage: #topic Your meeting topic here");
        return;
      }
      
      const topic = topicMatch[1].trim();
      const result = await this.meetingManager.setMeetingTopic(roomId, topic);
      
      if (result.success) {
        await this.sendFormattedMessage(roomId, `✅ SUCCESS: Meeting topic set to: "${topic}"`);
      } else {
        await this.sendFormattedMessage(roomId, `❌ FAIL: ${result.message}`);
      }
    } catch (error) {
      console.error(`Error setting topic in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ FAIL: Failed to set topic.\n\n${errorMessage}`);
    }
  }

  private async getRoomName(roomId: string): Promise<string> {
    if (!this.client) {
      return roomId; // Fallback to room ID if client not available
    }

    try {
      const roomState = await this.client.getRoomState(roomId);
      const nameEvent = roomState.find((event: MatrixEvent) => event.type === "m.room.name");
      
      if (nameEvent && nameEvent.content && nameEvent.content.name) {
        return nameEvent.content.name;
      }
      
      const aliasEvent = roomState.find((event: MatrixEvent) => event.type === "m.room.canonical_alias");
      if (aliasEvent && aliasEvent.content && aliasEvent.content.alias) {
        return aliasEvent.content.alias;
      }
      
      return roomId;
    } catch (error) {
      console.warn(`Failed to get room name for ${roomId}:`, error);
      return roomId;
    }
  }

  private async getSenderDisplayName(userId: string): Promise<string> {
    if (!this.client) {
      return userId; // Fallback to user ID if client not available
    }

    try {
      const profile = await this.client.getUserProfile(userId);
      return profile.displayname || userId;
    } catch (error) {
      console.warn(`Failed to get display name for ${userId}:`, error);
      return userId; 
    }
  }

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