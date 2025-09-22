<template>
  <div>
    <!-- Meeting Header -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="font-mono text-lg">❯</span>
        <h1 class="text-lg font-sans font-semibold">DETAILS</h1>
      </div>

      <!-- Meeting Metadata -->
      <div class="font-mono text-sm space-y-1 text-zinc-600">
        <div
          class="grid md:grid-cols-2 w-fit gap-4 space-x-8 items-center justify-around"
        >
          <div>
            <span>// Title:</span>
            <span class="font-bold text-zinc-900 ml-2">{{
              meeting.title
            }}</span>
          </div>
          <div>
            <span>// Room:</span>
            <span class="font-bold text-zinc-900 ml-2">#{{ channelName }}</span>
          </div>
          <div>
            <span>// Chair:</span>
            <span class="font-bold text-zinc-900 ml-2">{{
              meeting.chair
            }}</span>
          </div>
          <div>
            <span>// Participants:</span>
            <span class="font-bold text-zinc-900 ml-2">{{
              participantCount
            }}</span>
          </div>
          <div>
            <span>// Start:</span>
            <span class="font-bold text-zinc-900 ml-2">{{
              formattedStartTime
            }}</span>
          </div>
          <div>
            <span>// Duration:</span>
            <span class="font-bold text-zinc-900 ml-2">{{
              meeting.duration
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Participants Section -->
    <div
      v-if="meeting.participants && meeting.participants.length > 0"
      class="mb-6"
    >
      <div class="flex items-center gap-2 mb-3">
        <span class="font-mono text-lg">❯</span>
        <h2 class="text-lg font-sans font-semibold">PARTICIPANTS</h2>
        <span class="text-sm tracking-wide font-mono text-zinc-600">
          // {{ participantCount }} Total
        </span>
      </div>

      <div class="font-mono text-sm">
        <span
          v-for="(participant, index) in meeting.participants"
          :key="participant"
          class="text-zinc-700"
        >
          {{ participant
          }}<span v-if="index < meeting.participants.length - 1">, </span>
        </span>
      </div>
    </div>

    <!-- Meeting Content -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="font-mono text-lg">❯</span>
        <h2 class="text-lg font-sans font-semibold">MEETING MINUTES</h2>
        <span class="text-sm tracking-wide font-mono text-zinc-600">
          // Raw Log
        </span>
      </div>

      <div class="font-mono text-sm whitespace-pre-line text-zinc-700">
        <ContentRenderer :value="meeting"/>
      </div>
    </div>

    <!-- Participant Stats Section -->
    <div
      v-if="meeting.participantStats && meeting.participantStats.length > 0"
      class="mb-6"
    >
      <div class="flex items-center gap-2 mb-4">
        <span class="font-mono text-lg">❯</span>
        <h2 class="text-lg font-sans font-semibold">STATS</h2>
        <span class="text-sm tracking-wide font-mono text-zinc-600">
          // Lines Said
        </span>
      </div>

      <div class="font-mono text-sm">
        <div
          class="grid grid-cols-[auto_1fr] gap-4 items-center mb-2 font-semibold text-zinc-700"
        >
          <div class="text-right">Lines</div>
          <div>Name</div>
        </div>
        <div
          v-for="participant in meeting.participantStats"
          :key="participant.userId"
          class="grid grid-cols-[auto_1fr] gap-4 items-center py-1 text-zinc-600"
        >
          <div class="text-right font-bold">{{ participant.messageCount }}</div>
          <div>{{ participant.displayName }}</div>
        </div>
      </div>
    </div>

    <div class="pt-4">
      <div class="flex justify-between items-center">
        <NuxtLink
          to="/meetings"
          class="font-mono text-md hover:underline font-semibold"
        >
          ← Back to All Meetings
        </NuxtLink>

        <div class="font-mono text-xs text-zinc-500">
          Published: {{ formattedPublishedTime }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  meeting: {
    title: string;
    room: string;
    chair: string;
    startTime: string;
    endTime: string;
    duration: string;
    participants: string[];
    published: string;
    body?: unknown;
    participantStats?: {
      userId: string;
      displayName: string;
      messageCount: number;
    }[];
  };
}

const props = defineProps<Props>();

// Computed properties
const channelName = computed(() => {
  return props.meeting.room.replace(/\s+/g, "-").toLowerCase();
});

const participantCount = computed(() => {
  return props.meeting.participants?.length || 0;
});

const formattedStartTime = computed(() => {
  try {
    const date = new Date(props.meeting.startTime);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return props.meeting.startTime;
  }
});

const formattedPublishedTime = computed(() => {
  try {
    const date = new Date(props.meeting.published);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return props.meeting.published;
  }
});
</script>
