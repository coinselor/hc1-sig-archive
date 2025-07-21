<template>
  <NuxtLink
    :to="meetingPath"
    class="group block max-w-4xl border-neutral-200 p-8 bg-neutral-50 my-8 ring-1 ring-zinc-200 rounded-lg last:border-b-0 cursor-pointer"
  >
    <!-- Channel and Chair Row -->
    <div class="flex items-center justify-between mb-2">
      <div class="">
        <span class="flex items-center text-sm font-mono">
          <Icon name="ph:matrix-logo" size="20" class="mr-2" />
          #{{ channelName }}
        </span>
      </div>
      <div class="flex items-center gap-1 text-sm text-zinc-600">
        <Icon
          name="material-symbols-light:chair-sharp"
          size="24"
          class="opacity-60"
        />
        <span class="font-mono">{{ chair }}</span>
      </div>
    </div>

    <!-- Meeting Title -->
    <div class="mb-3">
      <h3 class="text-lg font-semibold text-zinc-900 group-hover:underline">
        {{ title }}
      </h3>
    </div>

    <!-- Meeting Details -->
    <div
      class="flex items-center justify-between text-sm text-zinc-600 font-mono"
    >
      <span>{{ formattedDate }}</span>
      <span class="flex items-center justify-center">
        <Icon name="mynaui:users-group" size="24" class="opacity-60 mr-2" />
        {{ participantCount }}
      </span>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
interface Props {
  title: string;
  chair: string;
  room: string;
  startTime: string;
  duration: string;
  participants: string[];
  path: string;
}

const props = defineProps<Props>();

// Computed properties
const channelName = computed(() => {
  return props.room.replace(/\s+/g, "-").toLowerCase();
});

const participantCount = computed(() => {
  return props.participants?.length || 0;
});

const meetingPath = computed(() => {
  return props.path;
});

const formattedDate = computed(() => {
  try {
    const date = new Date(props.startTime);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return props.startTime;
  }
});
</script>
