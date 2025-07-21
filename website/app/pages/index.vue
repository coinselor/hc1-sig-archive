<template>
  <div>
    <!-- Channel Filter -->
    <ChannelFilter
      v-if="allMeetings && allMeetings.length > 0"
      :meetings="allMeetings"
      :selected-channel="selectedChannel"
      @channel-selected="setChannelFilter"
    />

    <!-- Recent Meetings Section -->
    <div class="flex flex-col gap-2 mb-6">
      <div class="flex justify-between items-center max-w-4xl">
        <div class="flex items-center gap-2">
          <span class="font-mono text-lg">❯</span>
          <h2 class="text-lg font-sans font-semibold">RECENT MEETINGS</h2>
          <span class="text-sm tracking-wide font-mono text-zinc-600"
            >// Last 5{{
              selectedChannel !== "all"
                ? ` from #${formatChannelName(selectedChannel)}`
                : ""
            }}</span
          >
        </div>
        <NuxtLink to="/meetings" class="font-mono text-sm hover:underline">
          View All →
        </NuxtLink>
      </div>

      <!-- Loading State -->
      <div v-if="pending" class="">
        <div class="space-y-2">
          <div v-for="i in 3" :key="i" class="flex items-center gap-3">
            <span class="font-mono text-sm"
              >{{ String(i).padStart(2, "0") }}:</span
            >
            <div class="font-mono text-sm">Loading meetings...</div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="">
        <div class="flex items-center gap-3 mb-3">
          <span class="font-mono">[ERROR]</span>
          <span class="font-mono">Failed to load meetings</span>
        </div>
        <div class="font-mono text-sm">
          {{ error.message || "Connection to meeting archive failed" }}
        </div>
      </div>

      <!-- Recent Meetings List -->
      <div
        v-else-if="recentMeetings && recentMeetings.length > 0"
        class="space-y-0"
      >
        <MeetingCard
          v-for="meeting in recentMeetings"
          :key="meeting.path"
          :title="meeting.title"
          :chair="meeting.chair"
          :room="meeting.room"
          :start-time="meeting.startTime"
          :duration="meeting.duration"
          :participants="meeting.participants || []"
          :path="meeting.path"
        />
      </div>

      <!-- Empty State -->
      <div v-else class="terminal-card">
        <div class="flex items-center gap-3 mb-3">
          <span class="terminal-text-dim font-mono">[INFO]</span>
          <span class="terminal-text font-mono">No meeting logs found</span>
        </div>
        <div class="terminal-text-dim font-mono text-sm">
          // Archive is empty. Meetings will appear here once captured.
        </div>
      </div>
    </div>

    <!-- Stats Section -->
    <div v-if="recentMeetings && recentMeetings.length > 0" class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="font-mono text-lg">❯</span>
        <h2 class="text-lg font-sans font-semibold">STATS</h2>
        <span class="text-sm tracking-wide font-mono text-zinc-600">
          // For Nerds
        </span>
      </div>

      <div class="font-mono text-sm space-y-1 my-8">
        <div class="flex flex-col md:flex-row items-center gap-4">
          <span class="text-zinc-600">Total meetings:</span>
          <span class="font-bold">{{ totalMeetings }}</span>
          <span class="text-zinc-600 hidden md:block">|</span>
          <span class="text-zinc-600">Different rooms:</span>
          <span class="font-bold">{{ uniqueRooms }}</span>
          <span class="text-zinc-600 hidden md:block">|</span>
          <span class="text-zinc-600">Unique participants:</span>
          <span class="font-bold">{{ totalParticipants }}</span>
        </div>
      </div>
    </div>

    <!-- Global Leaderboard Section -->
    <div v-if="globalLeaderboard && globalLeaderboard.length > 0" class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="font-mono text-lg">❯</span>
        <h2 class="text-lg font-sans font-semibold">LEADERBOARD</h2>
        <span class="text-sm tracking-wide font-mono text-zinc-600">
          // All-Time
        </span>
      </div>

      <div class="font-mono text-sm my-8 max-w-lg">
        <div
          class="grid grid-cols-[2rem_1fr_5rem_5rem] gap-4 items-center mb-3 font-semibold text-zinc-700 border-b border-zinc-200 pb-2"
        >
          <div class="text-center">Rank</div>
          <div class="text-left">Name</div>
          <div class="text-center">Messages</div>
          <div class="text-center">Meetings</div>
        </div>
        <div
          v-for="(participant, index) in globalLeaderboard"
          :key="participant.userId"
          class="grid grid-cols-[2rem_1fr_5rem_5rem] items-center py-2 text-zinc-600 hover:bg-zinc-50 rounded transition-colors"
        >
          <div class="text-center font-bold text-zinc-800">
            {{ index + 1 }}.
          </div>
          <div class="text-left ml-4 font-medium">
            {{ participant.displayName }}
          </div>
          <div class="text-center font-bold text-zinc-800">
            {{ participant.totalMessages }}
          </div>
          <div class="text-center text-zinc-800">
            {{ participant.meetingsParticipated }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  Meeting,
  ParticipantStat,
  LeaderboardEntry,
} from "../../types/meeting";

// Page metadata
definePageMeta({
  title: "HC1 SIG Archive - Meeting Logs",
  description: "Automatically captured meeting minutes from HyperCore One SIGs",
});

// Channel filtering composable
const { selectedChannel, setChannelFilter, filterMeetingsByChannel } =
  useChannelFilter();

// Fetch all meetings for filtering and stats
const {
  data: allMeetings,
  pending,
  error,
} = await useAsyncData("all-meetings-stats", () => {
  return queryCollection("meetings").order("startTime", "DESC").all();
});

// Filter recent meetings based on selected channel
const recentMeetings = computed(() => {
  if (!allMeetings.value) return [];
  const filtered = filterMeetingsByChannel(allMeetings.value);
  return filtered.slice(0, 5); // Take only the first 5 for recent meetings
});

// Computed stats
const totalMeetings = computed(() => allMeetings.value?.length || 0);
const uniqueRooms = computed(() => {
  if (!allMeetings.value) return 0;
  const rooms = new Set(allMeetings.value.map((m) => m.room));
  return rooms.size;
});
const totalParticipants = computed(() => {
  if (!allMeetings.value) return 0;
  const participants = new Set();
  allMeetings.value.forEach((meeting) => {
    meeting.participants?.forEach((p) => participants.add(p));
  });
  return participants.size;
});

const globalLeaderboard = computed(() => {
  if (!allMeetings.value) return [];
  const participants: Record<string, LeaderboardEntry> = {};
  allMeetings.value.forEach((meeting: Meeting) => {
    meeting.participantStats?.forEach((participant: ParticipantStat) => {
      if (!participants[participant.userId]) {
        participants[participant.userId] = {
          userId: participant.userId,
          displayName: participant.displayName,
          totalMessages: 0,
          meetingsParticipated: 0,
        };
      }
      const participantEntry = participants[participant.userId]!;
      participantEntry.totalMessages += participant.messageCount || 0;
      participantEntry.meetingsParticipated++;
    });
  });
  return Object.values(participants).sort(
    (a: LeaderboardEntry, b: LeaderboardEntry) =>
      b.totalMessages - a.totalMessages
  );
});

// Format channel name for display
const formatChannelName = (room: string): string => {
  return room.toLowerCase().replace(/\s+/g, "-");
};

// SEO
useHead({
  title: "HC1 SIG Archive - Meeting Logs",
  meta: [
    {
      name: "description",
      content:
        "HC1 SIG Archive - Auto-generated logs from HyperCore One SIG conversations.",
    },
  ],
});
</script>
