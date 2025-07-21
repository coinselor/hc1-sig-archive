<template>
  <div>
    <!-- Loading State -->
    <div v-if="pending" class="">
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <span class="font-mono text-sm">01:</span>
          <div class="font-mono text-sm">Loading meeting minutes...</div>
        </div>
        <div class="flex items-center gap-3">
          <span class="font-mono text-sm">02:</span>
          <div class="font-mono text-sm">Fetching participants...</div>
        </div>
        <div class="flex items-center gap-3">
          <span class="font-mono text-sm">03:</span>
          <div class="font-mono text-sm">Rendering content...</div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="">
      <div class="flex items-center gap-3 mb-3">
        <span class="font-mono">[ERROR]</span>
        <span class="font-mono">Meeting log not found</span>
      </div>
      <div class="font-mono text-sm text-zinc-600 mb-4">
        {{
          error.message ||
          "The requested meeting log could not be located in the archive."
        }}
      </div>
      <NuxtLink to="/meetings" class="font-mono text-sm hover:underline">
        ← Back to All Meetings
      </NuxtLink>
    </div>

    <!-- Meeting Content -->
    <div v-else-if="meeting">
      <MeetingMinutes :meeting="meeting" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Get the route parameters
const route = useRoute();

// Define meeting type
interface Meeting {
  path: string;
  title: string;
  room: string;
  chair: string;
  chairId: string;
  startTime: string;
  endTime: string;
  duration: string;
  participants: string[];
  participantStats: Array<{
    userId: string;
    displayName: string;
    messageCount: number;
  }>;
  roomId: string;
  published: string;
  body?: unknown; // For the content body
}

// Fetch the specific meeting based on the route path
const {
  data: meeting,
  pending,
  error,
} = (await useAsyncData(`meeting-${route.path}`, () => {
  return queryCollection("meetings").path(route.path).first();
})) as {
  data: Ref<Meeting | null>;
  pending: Ref<boolean>;
  error: Ref<Error | null>;
};

// Dynamic SEO based on meeting data
watchEffect(() => {
  if (meeting.value) {
    useHead({
      title: `${meeting.value.title} - HC1 SIG Archive`,
      meta: [
        {
          name: "description",
          content: `Meeting minutes for ${meeting.value.title} in #${meeting.value.room}, chaired by ${meeting.value.chair}`,
        },
      ],
    });
  } else {
    useHead({
      title: "Meeting Not Found - HC1 SIG Archive",
      meta: [
        {
          name: "description",
          content:
            "The requested meeting log could not be found in the archive.",
        },
      ],
    });
  }
});

// Set default page meta
definePageMeta({
  title: "Meeting Minutes - HC1 SIG Archive",
});
</script>
