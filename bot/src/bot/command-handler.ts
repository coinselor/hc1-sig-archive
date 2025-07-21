import { AuthorizationService, CommandResult, MatrixEvent } from "../types/index.ts";

export interface CommandHandlerOptions {
  authorizationService: AuthorizationService;
}

export interface ParsedCommand {
  command: "start" | "end" | "cancel" | "status";
  valid: boolean;
  error?: string;
}

export interface CommandResponse {
  success: boolean;
  message: string;
  requiresAuthorization: boolean;
}

/**
 * Handles parsing and validation of Matrix room commands for meeting management
 */
export class CommandHandler {
  private authorizationService: AuthorizationService;

  constructor(options: CommandHandlerOptions) {
    this.authorizationService = options.authorizationService;
  }

  /**
   * Parse a command string and return the parsed command information
   * @param commandText - The raw command text (e.g., "/startmeeting")
   * @returns ParsedCommand object with command type and validation status
   */
  parseCommand(commandText: string): ParsedCommand {
    if (!commandText || typeof commandText !== "string") {
      return {
        command: "start",
        valid: false,
        error: "Command text is required and must be a string",
      };
    }

    const trimmed = commandText.trim();

    // Check if it starts with a slash
    if (!trimmed.startsWith("/")) {
      return {
        command: "start",
        valid: false,
        error: "Commands must start with '/'",
      };
    }

    // Extract the command part (remove the slash and any arguments)
    const commandPart = trimmed.substring(1).split(" ")[0].toLowerCase();

    switch (commandPart) {
      case "startmeeting":
        return {
          command: "start",
          valid: true,
        };
      case "endmeeting":
        return {
          command: "end",
          valid: true,
        };
      case "cancelmeeting":
        return {
          command: "cancel",
          valid: true,
        };
      case "meetingstatus":
        return {
          command: "status",
          valid: true,
        };
      default:
        return {
          command: "start",
          valid: false,
          error: `Unknown command: ${commandPart}. Supported commands: /startmeeting, /endmeeting, /cancelmeeting, /meetingstatus`,
        };
    }
  }

  /**
   * Validate if a user is authorized to execute a specific command
   * @param userId - The Matrix user ID
   * @param command - The command to validate
   * @returns CommandResponse with authorization result
   */
  validateAuthorization(userId: string, command: "start" | "end" | "cancel" | "status"): CommandResponse {
    // Status command doesn't require authorization - anyone can check meeting status
    if (command === "status") {
      return {
        success: true,
        message: "Status command is available to all users",
        requiresAuthorization: false,
      };
    }

    // All other commands require authorization
    const isAuthorized = this.authorizationService.isAuthorized(userId, command);
    
    if (!isAuthorized) {
      // Requirement 6.6: Clear permission denied message for unauthorized users
      const commandNames = {
        start: "start meetings",
        end: "end meetings", 
        cancel: "cancel meetings"
      };
      
      return {
        success: false,
        message: `❌ **Access Denied**\n\nInsufficient permissions. You are not authorized to ${commandNames[command]}.\n\nOnly designated meeting chairs can perform this action. Please contact your administrator if you believe this is an error.`,
        requiresAuthorization: true,
      };
    }

    return {
      success: true,
      message: "User is authorized to perform this command",
      requiresAuthorization: true,
    };
  }

  /**
   * Handle a command from a Matrix event
   * @param roomId - The Matrix room ID where the command was sent
   * @param event - The Matrix event containing the command
   * @returns CommandResult with the processed command information
   */
  async handleCommand(roomId: string, event: MatrixEvent): Promise<CommandResult> {
    try {
      // Extract the message content
      const content = event.content as { body?: string };
      const messageBody = content.body;

      if (!messageBody) {
        return {
          command: "start",
          valid: false,
          error: "Message body is required",
        };
      }

      // Parse the command
      const parsedCommand = this.parseCommand(messageBody);
      
      if (!parsedCommand.valid) {
        return {
          command: parsedCommand.command,
          valid: false,
          error: parsedCommand.error,
        };
      }

      // Validate authorization
      const authResult = this.validateAuthorization(event.sender, parsedCommand.command);
      
      if (!authResult.success) {
        return {
          command: parsedCommand.command,
          valid: false,
          error: authResult.message,
        };
      }

      // Command is valid and user is authorized
      return {
        command: parsedCommand.command,
        valid: true,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        command: "start",
        valid: false,
        error: `Failed to handle command: ${errorMessage}`,
      };
    }
  }

  /**
   * Check if a message contains a bot command
   * @param messageBody - The message body to check
   * @returns true if the message is a bot command, false otherwise
   */
  isCommand(messageBody: string): boolean {
    if (!messageBody || typeof messageBody !== "string") {
      return false;
    }

    const trimmed = messageBody.trim();
    
    // Check if it starts with a slash and matches our supported commands
    if (!trimmed.startsWith("/")) {
      return false;
    }

    const commandPart = trimmed.substring(1).split(" ")[0].toLowerCase();
    const supportedCommands = ["startmeeting", "endmeeting", "cancelmeeting", "meetingstatus"];
    
    return supportedCommands.includes(commandPart);
  }

  /**
   * Get help text for supported commands
   * @returns String containing help information for all supported commands
   */
  getHelpText(): string {
    return `**Meeting Bot Commands:**

• \`/startmeeting\` - Start a new meeting session (requires authorization)
• \`/endmeeting\` - End the current meeting and generate minutes (requires authorization)  
• \`/cancelmeeting\` - Cancel the current meeting without generating minutes (requires authorization)
• \`/meetingstatus\` - Check if a meeting is currently active (available to all users)

**Note:** Only authorized users can start, end, or cancel meetings. Anyone can check meeting status.`;
  }
}