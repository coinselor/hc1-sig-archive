<template>
  <div class="mb-6">
    <!-- Channel Filter Header -->
    <div class="flex items-center gap-2 mb-4">
      <span class="font-mono text-lg">❯</span>
      <h3 class="text-lg font-sans font-semibold">CHANNELS</h3>
      <span class="text-sm tracking-wide font-mono text-zinc-600">
        // Filter by room
      </span>
    </div>

    <!-- Channel Filter Tabs -->
    <div class="flex flex-wrap gap-2">
      <!-- All Channels Tab -->
      <button
        @click="selectChannel('all')"
        :class="[
          'px-3 py-1.5 text-sm font-mono border rounded-md transition-colors',
          selectedChannel === 'all'
            ? 'bg-zinc-900 text-white border-zinc-900'
            : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
        ]"
      >
        All
        <span class="ml-1 text-xs opacity-70">({{ totalMeetings }})</span>
      </button>

      <!-- Individual Channel Tabs -->
      <button
        v-for="channel in channels"
        :key="channel.room"
        @click="selectChannel(channel.room)"
        :class="[
          'px-3 py-1.5 text-sm font-mono border rounded-md transition-colors',
          selectedChannel === channel.room
            ? 'bg-zinc-900 text-white border-zinc-900'
            : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
        ]"
      >
        #{{ formatChannelName(channel.room) }}
        <span class="ml-1 text-xs opacity-70">({{ channel.count }})</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Channel {
  room: string;
  count: number;
}

interface Props {
  meetings: any[];
  selectedChannel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  selectedChannel: 'all'
});

const emit = defineEmits<{
  channelSelected: [channel: string];
}>();

// Compute unique channels with meeting counts
const channels = computed<Channel[]>(() => {
  if (!props.meetings) return [];
  
  const channelMap = new Map<string, number>();
  
  props.meetings.forEach(meeting => {
    const room = meeting.room;
    channelMap.set(room, (channelMap.get(room) || 0) + 1);
  });
  
  return Array.from(channelMap.entries())
    .map(([room, count]) => ({ room, count }))
    .sort((a, b) => b.count - a.count); // Sort by meeting count descending
});

const totalMeetings = computed(() => props.meetings?.length || 0);

// Format channel name for display
const formatChannelName = (room: string): string => {
  return room.toLowerCase().replace(/\s+/g, '-');
};

// Handle channel selection
const selectChannel = (channel: string) => {
  emit('channelSelected', channel);
};
</script>