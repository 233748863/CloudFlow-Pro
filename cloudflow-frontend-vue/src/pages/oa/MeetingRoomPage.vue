<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { meetingRoomConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="meetingRoomConfig" />
</template>
