export const useChannelFilter = () => {
  const route = useRoute();
  const router = useRouter();

  // Get current channel from URL query parameter
  const selectedChannel = computed(() => {
    return (route.query.channel as string) || 'all';
  });

  // Set channel filter and update URL
  const setChannelFilter = async (channel: string) => {
    const query = { ...route.query };
    
    if (channel === 'all') {
      delete query.channel;
    } else {
      query.channel = channel;
    }

    await router.push({
      path: route.path,
      query
    });
  };

  // Filter meetings by selected channel
  const filterMeetingsByChannel = (meetings: any[], channel: string = selectedChannel.value) => {
    if (!meetings) return [];
    
    if (channel === 'all') {
      return meetings;
    }
    
    return meetings.filter(meeting => meeting.room === channel);
  };

  return {
    selectedChannel,
    setChannelFilter,
    filterMeetingsByChannel
  };
};