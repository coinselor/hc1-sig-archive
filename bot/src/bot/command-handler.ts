import { AuthorizationService, CommandResult, MatrixEvent } from "../types/index.ts";

export interface CommandHandlerOptions {
  authorizationService: AuthorizationService;
}

export interface ParsedCommand {
  command: "start" | "end" | "cancel" | "status" | "help" | "topic";
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
   * @param commandText - The raw command text (e.g., "#startmeeting")
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

    if (!trimmed.startsWith("#")) {
      return {
        command: "start",
        valid: false,
        error: "Commands must start with '#'",
      };
    }

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
      case "help":
        return {
          command: "help",
          valid: true,
        };
      case "topic":
        return {
          command: "topic",
          valid: true,
        };
      default:
        return {
          command: "start",
          valid: false,
          error: `Unknown command: ${commandPart}.\nSupported commands: #startmeeting, #endmeeting, #cancelmeeting, #meetingstatus, #help, #topic`,
        };
    }
  }

  /**
   * Validate if a user is authorized to execute a specific command
   * @param userId - The Matrix user ID
   * @param command - The command to validate
   * @returns CommandResponse with authorization result
   */
  validateAuthorization(userId: string, command: "start" | "end" | "cancel" | "status" | "help" | "topic"): CommandResponse {
    if (command === "status" || command === "help") {
      return {
        success: true,
        message: command === "help" ? "Help command is available to all users" : "Status command is available to all users",
        requiresAuthorization: false,
      };
    }

    const isAuthorized = this.authorizationService.isAuthorized(userId, command);
    
    if (!isAuthorized) {
      return {
        success: false,
        message: `❌ FAIL: Access denied. Insufficient permissions`,
        requiresAuthorization: true,
      };
    }

    return {
      success: true,
      message: "User is authorized.",
      requiresAuthorization: true,
    };
  }

  /**
   * Handle a command from a Matrix event
   * @param roomId - The Matrix room ID where the command was sent
   * @param event - The Matrix event containing the command
   * @returns CommandResult with the processed command information
   */
  handleCommand(event: MatrixEvent): CommandResult {
    try {
      const content = event.content as { body?: string };
      const messageBody = content.body;

      if (!messageBody) {
        return {
          command: "start",
          valid: false,
          error: "Message body is required",
        };
      }

      const parsedCommand = this.parseCommand(messageBody);
      
      if (!parsedCommand.valid) {
        return {
          command: parsedCommand.command,
          valid: false,
          error: parsedCommand.error,
        };
      }

      const authResult = this.validateAuthorization(event.sender, parsedCommand.command);
      
      if (!authResult.success) {
        return {
          command: parsedCommand.command,
          valid: false,
          error: authResult.message,
        };
      }

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
    
    // Check for exact command matches to avoid Markdown conflicts
    const supportedCommands = ["#startmeeting", "#endmeeting", "#cancelmeeting", "#meetingstatus", "#help", "#topic"];
    
    // Check if the message starts with any of our exact commands (case-insensitive)
    const lowerTrimmed = trimmed.toLowerCase();
    return supportedCommands.some(cmd => 
      lowerTrimmed === cmd || lowerTrimmed.startsWith(cmd + " ")
    );
  }

  /**
   * Get help text for supported commands
   * @returns String containing help information for all supported commands
   */
  getHelpText(): string {
    return "Useful commands:\n#startmeeting | #topic | #endmeeting | #cancelmeeting | #meetingstatus | #help";
  }
}