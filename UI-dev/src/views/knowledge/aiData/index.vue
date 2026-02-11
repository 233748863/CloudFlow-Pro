<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row v-show="showSearch">
				<el-form :model="state.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
					<el-form-item label="数据集名称" prop="datasetName">
						<el-input placeholder="请输入数据集名称" v-model="state.queryForm.datasetName" />
					</el-form-item>
					<el-form-item>
						<el-button icon="search" type="primary" @click="getDataList"> 查询 </el-button>
						<el-button icon="Refresh" @click="resetQuery">重置</el-button>
					</el-form-item>
				</el-form>
			</el-row>
			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button icon="folder-add" type="primary" class="ml10" @click="formDialogRef.openDialog()" v-auth="'knowledge_aiData_add'">
						新 增
					</el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiData_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiData_export'"
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
						v-for="item in state.dataList"
						:key="item.dataId"
						class="group overflow-hidden bg-white rounded-lg shadow-sm border border-gray-100 transition-all duration-300 cursor-pointer dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg hover:border-primary-100 hover:translate-y-[-2px]"
						@dbclick="handleNavigateToChat(item)"
					>
						<div class="p-5">
							<div class="flex items-start">
								<div
									class="flex justify-center items-center text-lg font-medium text-white bg-indigo-600 rounded-lg transition-transform size-12 group-hover:scale-110"
								>
									{{ item.datasetName ? item.datasetName.substring(0, 1).toUpperCase() : '' }}
								</div>
								<div class="overflow-hidden flex-1 ml-3">
									<div class="text-base font-medium text-gray-900 truncate dark:text-white">
										{{ item.datasetName }}
									</div>
									<div class="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
										<el-icon class="mr-1"><User /></el-icon>
										{{ item.dsName || '暂无' }}
									</div>
								</div>
								<div>
									<dict-tag :options="yes_no_type" :value="item.learningStatus"></dict-tag>
								</div>
							</div>

							<div class="overflow-y-auto mt-4 h-16 text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
								{{ item.description || '暂无描述' }}
							</div>

							<div class="flex justify-start items-center pt-3 mt-4 border-t border-gray-100 dark:border-gray-700">
								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiData_edit'"
									@click="formDialogRef.openDialog(item.dataId)"
								>
									<el-icon><EditPen /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiData_del'"
									@click="handleDelete([item.dataId])"
								>
									<el-icon><Delete /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									@click="handleFieldEvaluation(item)"
								>
									<el-icon><Menu /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									@click="handleNavigateToChat(item)"
								>
									<el-icon><ChatDotRound /></el-icon>
								</el-button>

								<div class="flex-grow ml-4"></div>
								<div class="text-xs text-gray-400 dark:text-gray-500">
									<el-icon class="mr-1"><Clock /></el-icon>
									{{ parseDate(item.createTime) }}
								</div>

								<el-checkbox
									class="ml-4"
									:value="selectObjs.includes(item.dataId)"
									@change="(val: boolean) => handleCardSelect(val, item.dataId)"
								></el-checkbox>
							</div>
						</div>
					</div>
				</div>
			</el-scrollbar>

			<!-- 无数据显示 -->
			<el-empty v-if="!state.dataList || state.dataList.length === 0" description="暂无数据"></el-empty>

			<!-- 分页组件 -->
			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />

		<!-- 字段列表 -->
		<field-dialog ref="fieldDialogRef" @refresh="getDataList(false)" />
	</div>
</template>

<script setup lang="ts" name="systemAiData">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs } from '/@/api/knowledge/aiData';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { useDict } from '/@/hooks/dict';
import { EditPen, Delete, User, ChatDotRound } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
const FieldDialog = defineAsyncComponent(() => import('/@/views/knowledge/aiDataTable/field.vue'));

// 定义查询字典
const { yes_no_type } = useDict('yes_no_type');

// 定义变量内容
const formDialogRef = ref();
const fieldDialogRef = ref();
// 搜索变量
const queryRef = ref();
const showSearch = ref(true);
// 多选变量
const selectObjs = ref([]) as any;
const multiple = ref(true);
// 路由实例
const router = useRouter();

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
	downBlobFile('/knowledge/aiData/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiData.xlsx');
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

// 字段评估事件
const handleFieldEvaluation = (item: any) => {
	if (item && item.dataId) {
		// 获取数据源名称，如果不存在则设为空字符串
		const dataSource = item.dsName || '';

		// 确保表名数组是有效的数组
		let tableNames = [];
		if (item.tableName && Array.isArray(item.tableName)) {
			tableNames = item.tableName;
		}

		// 打开字段评估对话框，传递数据源名称和表名数组
		fieldDialogRef.value?.openDialog(dataSource, tableNames, false);
	}
};

// 导航到聊天页面
const handleNavigateToChat = (item: any) => {
	// 将所需参数传递给路由，并导航到 AI 聊天页面
	router.push({
		path: '/knowledge/aiChat/index',
		query: {
			datasetId: '-2', // 固定使用 Chat2BI 知识库ID
			dataId: item.dataId,
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

.text-primary-500 {
	color: var(--el-color-primary);
}
</style>
