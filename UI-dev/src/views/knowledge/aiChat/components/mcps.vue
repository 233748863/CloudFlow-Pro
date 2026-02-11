<template>
	<el-drawer title="选择 MCP" v-model="mcpVisible" close-on-click-modal>
		<!-- MCP cards -->
		<ul role="list" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2">
			<li class="col-span-2 rounded-lg shadow bg-slate-50 dark:bg-slate-900" v-for="mcp in mcpList" :key="mcp.mcpId">
				<div class="flex justify-between items-center p-6 space-x-6 w-full">
					<button class="flex-1 truncate group" @click="selectMcp(mcp)">
						<div class="flex items-center space-x-3">
							<h3
								class="text-sm font-medium truncate transition-colors text-slate-900 group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-600"
							>
								{{ mcp.name }}
							</h3>
						</div>
						<p class="mt-1 text-sm truncate text-slate-500">
							{{ mcp.description || '无描述' }}
						</p>
					</button>
					<button
						class="flex flex-col flex-shrink-0 gap-y-1 items-center p-1 text-xs rounded-lg transition-colors text-slate-900 hover:text-blue-600 focus:text-blue-600 dark:text-slate-200"
					>
						<svg
							@click="selectMcp(mcp)"
							xmlns="http://www.w3.org/2000/svg"
							class="w-6 h-6"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
							<path d="M9 4h6a2 2 0 0 1 2 2v14l-5 -3l-5 3v-14a2 2 0 0 1 2 -2"></path>
						</svg>
					</button>
				</div>
			</li>
		</ul>
	</el-drawer>
</template>
<script setup lang="ts" name="AiMcpsDialog">
import { list } from '/@/api/knowledge/aiMcpConfig';

const emit = defineEmits(['refresh']);
const mcpVisible = ref(false);
const mcpList = ref([]);

/**
 * 选中MCP
 * @param mcp
 */
const selectMcp = (mcp: any) => {
	// Close the MCP dialog
	mcpVisible.value = false;
	// Emit a 'refresh' event with the selected MCP
	emit('refresh', { mcpId: mcp.mcpId, mcpName: mcp.name });
};

/**
 * 查询所有MCP.
 */
const queryMcpList = async () => {
	try {
		const { data } = await list();
		mcpList.value = data;
	} catch (error) {
		console.error('Failed to fetch MCP list:', error);
	}
};

/**
 * 打开MCP选择界面.
 */
const openDialog = () => {
	mcpVisible.value = true;
	// Refresh the list when opening
	queryMcpList();
};

onMounted(() => {
	queryMcpList();
});

// Expose the openDialog function
defineExpose({
	openDialog,
});
</script>
