<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button icon="folder-add" type="primary" class="ml10" @click="formDialogRef.openDialog()" v-auth="'knowledge_aiDataset_add'">
						新 增
					</el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiDataset_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiDataset_export'"
						@exportExcel="exportExcel"
						class="ml10 mr20"
						style="float: right"
						@queryTable="getDataList"
					></right-toolbar>
				</div>
			</el-row>

			<el-scrollbar class="h-[calc(100vh-280px)] mb-4">
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					<div
						v-for="dataset in state.dataList"
						:key="dataset.id"
						class="group overflow-hidden bg-white rounded-lg shadow-sm border border-gray-100 transition-all duration-300 cursor-pointer dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg hover:border-primary-100 hover:translate-y-[-2px]"
						@dblclick="go2document(dataset)"
					>
						<div class="p-5">
							<div class="flex items-start">
								<div class="flex overflow-hidden justify-center items-center rounded-lg border border-gray-200 size-12 dark:border-gray-700">
									<img :src="baseURL + dataset.avatarUrl" alt="Avatar" class="object-cover w-full h-full" />
								</div>
								<div class="overflow-hidden flex-1 ml-3">
									<div class="text-base font-medium text-gray-900 truncate dark:text-white">
										{{ dataset.name }}
									</div>
									<div class="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
										<el-icon class="mr-1"><Document /></el-icon>
										文档数：{{ dataset.units || 0 }}
									</div>
								</div>
								<div v-if="dataset.publicFlag === '1'" class="ml-2">
									<el-tag size="small" type="success">已发布</el-tag>
								</div>
							</div>

							<div class="overflow-y-auto mt-4 h-16 text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
								{{ dataset.description || '暂无描述' }}
							</div>

							<div class="flex justify-start items-center pt-3 mt-4 border-t border-gray-100 dark:border-gray-700">
								<el-button
									v-if="dataset.publicFlag === '1'"
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiDataset_edit'"
									@click="mountDialogRef.openDialog(dataset.id)"
								>
									<el-icon><Link /></el-icon>
								</el-button>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiDataset_edit'"
									@click="formDialogRef.openDialog(dataset.id)"
								>
									<el-icon><EditPen /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiDataset_del'"
									@click="handleDelete([dataset.id])"
								>
									<el-icon><Delete /></el-icon>
								</el-button>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									@dbclick="handleNavigateToChat(dataset)"
								>
									<el-icon><ChatDotRound /></el-icon>
								</el-button>

								<div class="flex-grow"></div>

								<el-checkbox
									class="ml-4"
									:value="selectObjs.includes(dataset.id)"
									@change="(val: boolean) => handleCardSelect(val, dataset.id)"
								></el-checkbox>
							</div>
						</div>
					</div>
				</div>
			</el-scrollbar>

			<!-- 无数据显示 -->
			<el-empty v-if="!state.dataList || state.dataList.length === 0" description="暂无数据"></el-empty>

			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />
		<mount-dialog ref="mountDialogRef" />
	</div>
</template>

<script setup lang="ts" name="systemAiDataset">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs } from '/@/api/knowledge/aiDataset';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { EditPen, Delete, Document, Link, ChatDotRound } from '@element-plus/icons-vue';
import { computed } from 'vue';

const router = useRouter();
const baseURL = computed(() => import.meta.env.VITE_API_URL);

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
const MountDialog = defineAsyncComponent(() => import('./mount.vue'));

// 定义变量内容
const formDialogRef = ref();
const mountDialogRef = ref();
// 搜索变量
const queryRef = ref();
const showSearch = ref(true);
// 多选变量
const selectObjs = ref([]) as any;
const multiple = ref(true);

const state: BasicTableProps = reactive<BasicTableProps>({
	queryForm: {},
	pageList: fetchList,
	dataList: [],
});

//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, downBlobFile } = useTable(state);

// 清空搜索条件
const resetQuery = () => {
	// 清空搜索条件
	queryRef.value?.resetFields();
	// 清空多选
	selectObjs.value = [];
	getDataList();
};

// 导出excel
const exportExcel = () => {
	downBlobFile('/knowledge/aiDataset/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiDataset.xlsx');
};

// 多选事件 - 为卡片视图添加的选择函数
const handleCardSelect = (selected: boolean, dataId: string) => {
	if (selected) {
		selectObjs.value.push(dataId);
	} else {
		selectObjs.value = selectObjs.value.filter((id: string) => id !== dataId);
	}
	multiple.value = selectObjs.value.length === 0;
};

// 删除操作
const handleDelete = async (ids: string[]) => {
	try {
		await useMessageBox().confirm('此操作将永久删除');
	} catch {
		return;
	}

	try {
		await delObjs(ids);
		getDataList();
		useMessage().success('删除成功');
	} catch (err: any) {
		useMessage().error(err.msg);
	}
};

const go2document = (dataset: any) => {
	router.push({
		path: '/knowledge/aiDocument/index',
		query: {
			datasetId: dataset.id,
		},
	});
};

const handleNavigateToChat = (dataset: any) => {
	router.push({
		path: '/knowledge/aiChat/index',
		query: {
			datasetId: dataset.id,
		},
	});
};
</script>

<style lang="scss" scoped>
:deep(.el-scrollbar__wrap) {
	overflow-x: hidden !important;
}

:deep(.el-checkbox) {
	margin-right: 0;
}

.bg-primary-100 {
	background-color: var(--el-color-primary-light-9);
}

.text-primary {
	color: var(--el-color-primary);
}
</style>
