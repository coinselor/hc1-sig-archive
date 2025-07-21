import { z } from "zod";

export interface MeetingSession {
  id: string;
  roomId: string;
  roomName: string;
  chairUserId: string;
  chairDisplayName: string;
  startTime: Date;
  endTime?: Date;
  messages: CapturedMessage[];
  participants: Set<string>;
}

export interface CapturedMessage {
  timestamp: Date;
  senderId: string;
  senderDisplayName: string;
  content: string;
  messageType: "m.text" | "m.emote" | "m.notice";
  eventId: string;
  isEdited?: boolean;
  originalEventId?: string;
}

export const BotConfigurationSchema = z.object({
  matrix: z.object({
    homeserverUrl: z.string().url("Must be a valid URL"),
    accessToken: z.string().min(1, "Access token is required"),
    userId: z.string().min(1, "User ID is required"),
    displayName: z.string().optional(),
  }),

  authorization: z.object({
    authorizedUsers: z.array(z.string()).min(
      1,
      "At least one authorized user is required",
    ),
  }),

  storage: z.object({
    provider: z.enum(["local", "github"]),
    local: z.object({
      directory: z.string().default("./data/meetings"),
    }).optional(),
    github: z.object({
      repository: z.string().min(
        1,
        "Repository is required for GitHub storage",
      ),
      branch: z.string().default("main"),
      token: z.string().min(1, "GitHub token is required"),
      websiteUrl: z.string().url().optional(),
    }).optional(),
  }).refine((data) => {
    if (data.provider === "github" && !data.github) {
      return false;
    }
    if (data.provider === "local" && !data.local) {
      return false;
    }
    return true;
  }, {
    message: "Storage configuration must match the selected provider",
  }),
});

export type BotConfiguration = z.infer<typeof BotConfigurationSchema>;

export interface StorageProvider {
  saveMinutes(session: MeetingSession, content: string): Promise<string>;
  getMinutesUrl(session: MeetingSession): Promise<string>;
}

export interface GitHubStorageProvider extends StorageProvider {
  repository: string;
  branch: string;
  token: string;
  commitMessage(session: MeetingSession): string;
  generateFilePath(session: MeetingSession): string;
}

export interface AuthorizationService {
  isAuthorized(userId: string, action: "start" | "end" | "cancel"): boolean;
  loadAuthorizedUsers(): Promise<void>;
  reloadConfiguration(): Promise<void>;
}

export interface MatrixEvent {
  event_id: string;
  sender: string;
  origin_server_ts: number;
  type: string;
  content: Record<string, unknown>;
  room_id?: string;
  state_key?: string;
  redacts?: string; // For redaction events
}

export interface TextMessageContent {
  msgtype: "m.text";
  body: string;
  format?: "org.matrix.custom.html";
  formatted_body?: string;
  [key: string]: unknown;
}

export interface EmoteMessageContent {
  msgtype: "m.emote";
  body: string;
  format?: "org.matrix.custom.html";
  formatted_body?: string;
  [key: string]: unknown;
}

export interface NoticeMessageContent {
  msgtype: "m.notice";
  body: string;
  format?: "org.matrix.custom.html";
  formatted_body?: string;
  [key: string]: unknown;
}

export type MessageContent =
  | TextMessageContent
  | EmoteMessageContent
  | NoticeMessageContent;

export interface MatrixBotService {
  start(): Promise<void>;
  stop(): Promise<void>;
  handleCommand(roomId: string, event: MatrixEvent): Promise<void>;
  handleMessage(roomId: string, event: MatrixEvent): Promise<void>;
}

export interface CommandResult {
  command: "start" | "end" | "cancel" | "status";
  valid: boolean;
  error?: string;
}
