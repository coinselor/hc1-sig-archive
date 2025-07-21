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
    this.meetingManager = meetingManager || new MeetingManager();
    
    // Initialize command handler
    this.commandHandler = new CommandHandler({
      authorizationService: this.authorizationService,
    });
    
    // Initialize storage providers
    this.storageProvider = StorageFactory.createStorageProvider(config);
    this.fallbackStorageProvider = StorageFactory.createFallbackStorageProvider();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Matrix bot service is already running");
      return;
    }

    try {
      console.log("Initializing Matrix client...");
      
      // Initialize meeting manager
      await this.meetingManager.initialize();
      
      // Create storage provider for Matrix client state
      const storage = new SimpleFsStorageProvider("./data/matrix-storage.json");
      
      // Initialize Matrix client
      this.client = new MatrixClient(
        this.config.matrix.homeserverUrl,
        this.config.matrix.accessToken,
        storage
      );

      // Set display name if configured
      if (this.config.matrix.displayName) {
        try {
          await this.client.setDisplayName(this.config.matrix.displayName);
        } catch (error) {
          console.warn("Failed to set display name:", error);
        }
      }

      // Enable auto-join for rooms the bot is invited to
      AutojoinRoomsMixin.setupOnClient(this.client);

      // Set up event listeners
      this.setupEventListeners();

      // Start the client
      console.log("Starting Matrix client...");
      await this.client.start();
      
      this.isRunning = true;
      this.reconnectAttempts = 0;
      
      console.log(`Matrix bot connected as ${this.config.matrix.userId}`);
      console.log("Bot is ready to receive commands and messages");
      
    } catch (error) {
      console.error("Failed to start Matrix bot service:", error);
      await this.handleConnectionError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.client) {
      console.log("Matrix bot service is not running");
      return;
    }

    try {
      console.log("Stopping Matrix bot service...");
      
      // Stop the client
      await this.client.stop();
      
      // Close the meeting manager
      await this.meetingManager.close();
      
      this.isRunning = false;
      this.client = null;
      
      console.log("Matrix bot service stopped successfully");
      
    } catch (error) {
      console.error("Error stopping Matrix bot service:", error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.client) {
      throw new Error("Matrix client not initialized");
    }

    // Listen for room messages
    this.client.on("room.message", async (roomId: string, event: MatrixEvent) => {
      try {
        // Skip messages from the bot itself
        if (event.sender === this.config.matrix.userId) {
          return;
        }

        // Handle commands (messages starting with /)
        if (this.isCommand(event)) {
          await this.handleCommand(roomId, event);
        } else {
          // Handle regular messages for meeting capture
          await this.handleMessage(roomId, event);
        }
      } catch (error) {
        console.error(`Error handling room message in ${roomId}:`, error);
      }
    });

    // Listen for room member events (joins/leaves) and other room events
    this.client.on("room.event", async (roomId: string, event: MatrixEvent) => {
      try {
        if (event.type === "m.room.member") {
          await this.handleMemberEvent(roomId, event);
        } else if (event.type === "m.room.message") {
          // Handle message edits (requirement 3.3)
          await this.handleMessageEdit(roomId, event);
        } else if (event.type === "m.room.redaction") {
          // Handle message redactions (requirement 3.4)
          await this.handleMessageRedaction(roomId, event);
        }
      } catch (error) {
        console.error(`Error handling room event in ${roomId}:`, error);
      }
    });

    // Listen for connection errors
    this.client.on("sync.failed", async (error: Error) => {
      console.error("Matrix sync failed:", error);
      await this.handleConnectionError(error);
    });

    // Listen for successful sync
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
    return content.msgtype === "m.text" && !!content.body && content.body.startsWith("/");
  }

  async handleCommand(roomId: string, event: MatrixEvent): Promise<void> {
    const content = event.content as unknown as MessageContent;
    const command = content.body?.trim() || "";
    
    console.log(`Received command in ${roomId}: ${command} from ${event.sender}`);
    
    try {
      // Parse and validate the command using CommandHandler
      const commandResult = await this.commandHandler.handleCommand(roomId, event);
      
      if (!commandResult.valid) {
        // Send formatted error message for invalid commands
        const errorMessage = commandResult.error || "Invalid command";
        
        // Check if it's an authorization error (contains "Access Denied")
        if (errorMessage.includes("Access Denied")) {
          await this.sendFormattedMessage(roomId, errorMessage);
        } else {
          // Format other error messages
          const formattedError = errorMessage.includes("Unknown command") 
            ? `❌ **Invalid Command**\n\n${errorMessage}\n\nUse \`/meetingstatus\` to check current meeting status.`
            : `❌ **Command Error**\n\n${errorMessage}`;
          
          await this.sendFormattedMessage(roomId, formattedError);
        }
        return;
      }

      // Get room name for meeting operations
      const roomName = await this.getRoomName(roomId);
      const senderDisplayName = await this.getSenderDisplayName(roomId, event.sender);

      // Execute the validated command
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
        default:
          await this.sendMessage(roomId, "Unknown command. Use /startmeeting, /endmeeting, /cancelmeeting, or /meetingstatus");
      }
    } catch (error) {
      console.error(`Error handling command in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendMessage(roomId, `Error processing command: ${errorMessage}`);
    }
  }

  async handleMessage(roomId: string, event: MatrixEvent): Promise<void> {
    const content = event.content as unknown as MessageContent;
    
    console.log(`Message in ${roomId} from ${event.sender}: ${content.body || "[no body]"}`);
    
    // Requirement 3.1: Capture messages during active meetings
    // Requirement 3.2: Don't capture bot's own messages (already filtered in setupEventListeners)
    try {
      // Get sender display name
      const senderDisplayName = await this.getSenderDisplayName(roomId, event.sender);
      
      // Attempt to capture the message (will only succeed if meeting is active)
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
    
    // Requirement 3.5: Track participant join/leave events during meetings
    try {
      if (!event.state_key) {
        return; // No user ID to track
      }

      // Skip events for the bot itself
      if (event.state_key === this.config.matrix.userId) {
        return;
      }

      const content = event.content as any;
      const membership = content?.membership;
      
      if (membership === "join") {
        // User joined the room
        const displayName = await this.getSenderDisplayName(roomId, event.state_key);
        const recorded = await this.meetingManager.recordParticipantEvent(
          roomId,
          event.state_key,
          displayName,
          "join"
        );
        
        if (recorded) {
          console.log(`Recorded join event for ${event.state_key} in meeting for room ${roomId}`);
        }
      } else if (membership === "leave" || membership === "ban" || membership === "kick") {
        // User left the room (or was removed)
        const displayName = await this.getSenderDisplayName(roomId, event.state_key);
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

  // Requirement 3.3: Handle message edits during meetings
  private async handleMessageEdit(roomId: string, event: MatrixEvent): Promise<void> {
    try {
      // Skip edits from the bot itself
      if (event.sender === this.config.matrix.userId) {
        return;
      }

      const content = event.content as any;
      
      // Check if this is an edit (has m.relates_to with rel_type "m.replace")
      if (content["m.relates_to"]?.rel_type === "m.replace") {
        const originalEventId = content["m.relates_to"].event_id;
        const newContent = content["m.new_content"] as MessageContent;
        
        if (newContent && ["m.text", "m.emote", "m.notice"].includes(newContent.msgtype)) {
          const senderDisplayName = await this.getSenderDisplayName(roomId, event.sender);
          
          // Create a modified event for the edit
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

  // Requirement 3.4: Handle message redactions during meetings
  private async handleMessageRedaction(roomId: string, event: MatrixEvent): Promise<void> {
    try {
      // Skip redactions from the bot itself
      if (event.sender === this.config.matrix.userId) {
        return;
      }

      const redactedEventId = event.content?.redacts || event.redacts;
      
      if (redactedEventId) {
        const senderDisplayName = await this.getSenderDisplayName(roomId, event.sender);
        
        // Create a special message to record the redaction
        const redactionEvent: MatrixEvent = {
          event_id: event.event_id,
          sender: event.sender,
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
        await this.client.stop();
      }
      await this.start();
    } catch (reconnectError) {
      console.error("Reconnection failed:", reconnectError);
      // The error will trigger another reconnection attempt
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

  // Utility method to send formatted messages
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

  // Utility method to reply to a message
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

  // Getter for checking if the service is running
  get running(): boolean {
    return this.isRunning;
  }

  // Getter for the Matrix client (for testing purposes)
  get matrixClient(): MatrixClient | null {
    return this.client;
  }

  // Command handler methods
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
        // Requirement 1.6: Formatted confirmation message for meeting start
        const formattedMessage = `**Meeting Started** 🎯\n\n` +
          `${roomName} meeting initiated by ${chairDisplayName} acting as chair. ` +
          `A record of all messages will be automatically archived.\n\n` +
          `**Meeting Details:**\n` +
          `• **Room:** ${roomName}\n` +
          `• **Chair:** ${chairDisplayName}\n` +
          `• **Started:** ${new Date().toLocaleString()}\n\n` +
          `Use \`/endmeeting\` to end the meeting and generate minutes.`;
        
        await this.sendFormattedMessage(roomId, formattedMessage);
      } else {
        // Handle error cases with formatted messages
        const errorMessage = result.message.includes("already active") 
          ? `❌ **Cannot Start Meeting**\n\nA meeting is already active in this room. Please end the current meeting before starting a new one.\n\nUse \`/meetingstatus\` to check the current meeting details.`
          : `❌ **Failed to Start Meeting**\n\n${result.message}`;
        
        await this.sendFormattedMessage(roomId, errorMessage);
      }
    } catch (error) {
      console.error(`Error starting meeting in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendMessage(roomId, `❌ **Failed to start meeting:** ${errorMessage}`);
    }
  }

  private async handleEndMeetingCommand(roomId: string): Promise<void> {
    try {
      const result = await this.meetingManager.endMeeting(roomId);

      if (result.success && result.minutes && result.session) {
        // Try to save minutes using primary storage provider
        try {
          const url = await this.storageProvider.saveMinutes(result.session, result.minutes.content);
          const websiteUrl = await this.storageProvider.getMinutesUrl(result.session);
          
          // Requirement 2.6: Meeting end confirmation with website URL
          if (websiteUrl) {
            const formattedMessage = `**Meeting Ended** ✅\n\n` +
              `${result.session.roomName} meeting has ended.\n\n` +
              `**Meeting Summary:**\n` +
              `• **Duration:** ${this.calculateDuration(result.session.startTime, result.session.endTime!)}\n` +
              `• **Messages captured:** ${result.session.messages.length}\n` +
              `• **Participants:** ${result.session.participants.size}\n\n` +
              `📄 **Minutes are available at:** ${websiteUrl}`;
            
            await this.sendFormattedMessage(roomId, formattedMessage);
          } else {
            const formattedMessage = `**Meeting Ended** ✅\n\n` +
              `${result.session.roomName} meeting has ended.\n\n` +
              `**Meeting Summary:**\n` +
              `• **Duration:** ${this.calculateDuration(result.session.startTime, result.session.endTime!)}\n` +
              `• **Messages captured:** ${result.session.messages.length}\n` +
              `• **Participants:** ${result.session.participants.size}\n\n` +
              `📄 Minutes have been saved successfully.`;
            
            await this.sendFormattedMessage(roomId, formattedMessage);
          }
        } catch (storageError) {
          console.error("Primary storage failed, trying fallback:", storageError);
          
          // Try fallback storage
          try {
            await this.fallbackStorageProvider.saveMinutes(result.session, result.minutes.content);
            const formattedMessage = `**Meeting Ended** ⚠️\n\n` +
              `${result.session.roomName} meeting has ended.\n\n` +
              `**Meeting Summary:**\n` +
              `• **Duration:** ${this.calculateDuration(result.session.startTime, result.session.endTime!)}\n` +
              `• **Messages captured:** ${result.session.messages.length}\n` +
              `• **Participants:** ${result.session.participants.size}\n\n` +
              `📄 Minutes saved to local backup storage due to primary storage failure.`;
            
            await this.sendFormattedMessage(roomId, formattedMessage);
          } catch (fallbackError) {
            console.error("Fallback storage also failed:", fallbackError);
            const errorMessage = `❌ **Meeting Ended with Storage Error**\n\n` +
              `${result.session.roomName} meeting has ended, but failed to save minutes.\n` +
              `Please contact administrator.\n\n` +
              `**Meeting Summary:**\n` +
              `• **Duration:** ${this.calculateDuration(result.session.startTime, result.session.endTime!)}\n` +
              `• **Messages captured:** ${result.session.messages.length}\n` +
              `• **Participants:** ${result.session.participants.size}`;
            
            await this.sendFormattedMessage(roomId, errorMessage);
          }
        }
      } else {
        // Handle error cases with formatted messages
        const errorMessage = result.message.includes("No active meeting") 
          ? `❌ **Cannot End Meeting**\n\nNo active meeting found in this room.`
          : `❌ **Failed to End Meeting**\n\n${result.message}`;
        
        await this.sendFormattedMessage(roomId, errorMessage);
      }
    } catch (error) {
      console.error(`Error ending meeting in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ **Failed to end meeting:** ${errorMessage}`);
    }
  }

  private async handleCancelMeetingCommand(roomId: string): Promise<void> {
    try {
      const result = await this.meetingManager.cancelMeeting(roomId);
      
      if (result.success) {
        // Requirement 8.5: Confirmation message when meeting is cancelled
        const formattedMessage = `**Meeting Cancelled** ❌\n\n` +
          `The meeting has been cancelled and no minutes will be generated.\n` +
          `All captured messages for this session have been discarded.`;
        
        await this.sendFormattedMessage(roomId, formattedMessage);
      } else {
        // Requirements 8.3 & 8.4: Error messages for invalid states and unauthorized users
        const errorMessage = result.message.includes("No active meeting") 
          ? `❌ **Cannot Cancel Meeting**\n\nNo active meeting found in this room.`
          : result.message.includes("Insufficient permissions")
          ? `❌ **Access Denied**\n\nInsufficient permissions. You are not authorized to cancel meetings.`
          : `❌ **Failed to Cancel Meeting**\n\n${result.message}`;
        
        await this.sendFormattedMessage(roomId, errorMessage);
      }
    } catch (error) {
      console.error(`Error cancelling meeting in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ **Failed to cancel meeting:** ${errorMessage}`);
    }
  }

  private async handleStatusCommand(roomId: string): Promise<void> {
    try {
      const status = this.meetingManager.getMeetingStatus(roomId);
      
      if (status.hasActiveMeeting && status.session) {
        // Requirements 7.2: Status response with meeting details when active
        const formattedMessage = `**Meeting Status: ACTIVE** 🟢\n\n` +
          `**Meeting Details:**\n` +
          `• **Room:** ${status.session.roomName}\n` +
          `• **Chair:** ${status.session.chairDisplayName}\n` +
          `• **Started:** ${status.session.startTime.toLocaleString()}\n` +
          `• **Duration:** ${status.duration}\n` +
          `• **Messages captured:** ${status.messageCount}\n` +
          `• **Participants:** ${status.session.participants.size}\n\n` +
          `📝 All messages in this room are being recorded for meeting minutes.\n` +
          `Use \`/endmeeting\` to end the meeting and generate minutes.`;
        
        await this.sendFormattedMessage(roomId, formattedMessage);
      } else {
        // Requirement 7.3: Status response when no meeting is active
        const formattedMessage = `**Meeting Status: NO ACTIVE MEETING** ⚪\n\n` +
          `No meeting is currently in progress in this room.\n` +
          `Messages are not being recorded.\n\n` +
          `Use \`/startmeeting\` to begin a new meeting session.`;
        
        await this.sendFormattedMessage(roomId, formattedMessage);
      }
    } catch (error) {
      console.error(`Error getting meeting status in ${roomId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendFormattedMessage(roomId, `❌ **Failed to get meeting status:** ${errorMessage}`);
    }
  }

  // Helper method to get room name
  private async getRoomName(roomId: string): Promise<string> {
    if (!this.client) {
      return roomId; // Fallback to room ID if client not available
    }

    try {
      // Try to get the room's display name
      const roomState = await this.client.getRoomState(roomId);
      const nameEvent = roomState.find((event: any) => event.type === "m.room.name");
      
      if (nameEvent && nameEvent.content && nameEvent.content.name) {
        return nameEvent.content.name;
      }
      
      // Fallback to canonical alias if no name
      const aliasEvent = roomState.find((event: any) => event.type === "m.room.canonical_alias");
      if (aliasEvent && aliasEvent.content && aliasEvent.content.alias) {
        return aliasEvent.content.alias;
      }
      
      // Final fallback to room ID
      return roomId;
    } catch (error) {
      console.warn(`Failed to get room name for ${roomId}:`, error);
      return roomId; // Fallback to room ID
    }
  }

  // Helper method to get sender display name
  private async getSenderDisplayName(roomId: string, userId: string): Promise<string> {
    if (!this.client) {
      return userId; // Fallback to user ID if client not available
    }

    try {
      // Try to get the user's display name in the room
      const profile = await this.client.getUserProfile(userId);
      return profile.displayname || userId;
    } catch (error) {
      console.warn(`Failed to get display name for ${userId}:`, error);
      return userId; // Fallback to user ID
    }
  }

  // Helper method to calculate duration between two dates
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