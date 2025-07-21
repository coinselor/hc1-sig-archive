export interface ParticipantStat {
  userId: string;
  displayName: string;
  messageCount: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalMessages: number;
  meetingsParticipated: number;
}

export interface Meeting {
  path: string;
  title: string;
  room: string;
  chair: string;
  chairId: string;
  startTime: string;
  endTime: string;
  duration: string;
  participants: string[];
  participantStats?: ParticipantStat[];
  roomId: string;
  published: string;
  body?: unknown;
}
