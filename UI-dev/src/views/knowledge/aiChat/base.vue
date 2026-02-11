<template>
	<chat-index :datasetId="datasetId" />
</template>

<script setup lang="ts">
import ChatIndex from './index.vue';
import { ref, onBeforeMount } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const datasetId = ref<string>('');

onBeforeMount(() => {
	const parts = route.path.split('/');
	const lastParam = parts[parts.length - 1];
	datasetId.value = lastParam;
});
</script>
