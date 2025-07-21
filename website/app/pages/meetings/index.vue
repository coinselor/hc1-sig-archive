<template>
  <div>
    <!-- Channel Filter -->
    <ChannelFilter
      v-if="allMeetingsData && allMeetingsData.length > 0"
      :meetings="allMeetingsData"
      :selected-channel="selectedChannel"
      @channel-selected="setChannelFilter"
    />

    <!-- All Meetings Section -->
    <div class="flex flex-col gap-2 mb-6">
      <div class="flex items-center gap-2 max-w-4xl">
        <span class="font-mono text-lg">❯</span>
        <h2 class="text-lg font-sans font-semibold">ALL MEETINGS</h2>
        <span class="text-sm tracking-wide font-mono text-zinc-600">
          // {{ filteredMeetings.length }}
          {{
            selectedChannel !== "all"
              ? `from #${formatChannelName(selectedChannel)}`
              : "Total"
          }}
          Meetings
        </span>
      </div>

      <!-- Loading State -->
      <div v-if="pending" class="">
        <div class="space-y-2">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3">
            <span class="font-mono text-sm">
              {{ String(i).padStart(2, "0") }}:
            </span>
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

      <!-- All Meetings List -->
      <div v-else-if="allMeetings && allMeetings.length > 0" class="space-y-0">
        <MeetingCard
          v-for="meeting in allMeetings"
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
  </div>
</template>

<script setup lang="ts">
import type { Meeting } from "../../../types/meeting";

// Page metadata
definePageMeta({
  title: "All Meetings - HC1 Matrix Bot",
  description: "Browse through all captured meeting minutes organized by date.",
});

// Channel filtering composable
const { selectedChannel, setChannelFilter, filterMeetingsByChannel } =
  useChannelFilter();

// Fetch all meetings
const {
  data: allMeetingsData,
  pending,
  error,
} = (await useAsyncData("all-meetings", () => {
  return queryCollection("meetings").order("startTime", "DESC").all();
})) as {
  data: Ref<Meeting[] | null>;
  pending: Ref<boolean>;
  error: Ref<Error | null>;
};

// Filter meetings based on selected channel
const filteredMeetings = computed(() => {
  if (!allMeetingsData.value) return [];
  return filterMeetingsByChannel(allMeetingsData.value);
});

// Use filtered meetings for display
const allMeetings = computed(() => filteredMeetings.value);

// Format channel name for display
const formatChannelName = (room: string): string => {
  return room.toLowerCase().replace(/\s+/g, "-");
};

// SEO
useHead({
  title: "All Meetings - HC1 Matrix Bot",
  meta: [
    {
      name: "description",
      content: "Browse through all captured meeting minutes organized by date.",
    },
  ],
});
</script>
