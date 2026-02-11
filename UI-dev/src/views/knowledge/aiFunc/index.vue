<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row v-show="showSearch">
				<el-form :model="state.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
					<el-form-item label="函数名称" prop="funcName">
						<el-input placeholder="请输入函数名称" v-model="state.queryForm.funcName" />
					</el-form-item>
					<el-form-item label="函数标题" prop="funcTitle">
						<el-input placeholder="请输入函数标题" v-model="state.queryForm.funcTitle" />
					</el-form-item>
					<el-form-item>
						<el-button icon="search" type="primary" @click="getDataList"> 查询 </el-button>
						<el-button icon="Refresh" @click="resetQuery">重置</el-button>
					</el-form-item>
				</el-form>
			</el-row>
			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button icon="folder-add" type="primary" class="ml10" @click="handleAdd" v-auth="'knowledge_aiFunc_add'"> 新 增 </el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiFunc_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiFunc_export'"
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
						:key="item.id"
						class="group overflow-hidden bg-white rounded-lg shadow-sm border border-gray-100 transition-all duration-300 cursor-pointer dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg hover:border-primary-100 hover:translate-y-[-2px]"
					>
						<div class="p-5">
							<div class="flex items-start" @click="handleEdit(item.id)">
								<div
									class="flex justify-center items-center text-lg font-medium text-white bg-indigo-600 rounded-lg transition-transform size-12 group-hover:scale-110"
								>
									{{ item.funcName ? item.funcName.substring(0, 1).toUpperCase() : '' }}
								</div>
								<div class="overflow-hidden flex-1 ml-3">
									<div class="text-base font-medium text-gray-900 truncate dark:text-white">
										{{ item.funcName }}
									</div>
									<div class="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
										<el-icon class="mr-1"><Monitor /></el-icon>
										{{ item.funcTitle }}
									</div>
								</div>
								<div>
									<dict-tag :options="yes_no_type" :value="item.funcStatus"></dict-tag>
								</div>
							</div>

							<div @click="handleEdit(item.id)" class="overflow-y-auto mt-4 h-16 text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
								{{ item.funcDesc || '暂无描述' }}
							</div>

							<div class="flex justify-start items-center pt-3 mt-4 border-t border-gray-100 dark:border-gray-700">
								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiFunc_del'"
									@click="handleEdit(item.id)"
								>
									<el-icon><EditPen /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									v-auth="'knowledge_aiFunc_del'"
									@click="handleDelete([item.id])"
								>
									<el-icon><Delete /></el-icon>
								</el-button>

								<div class="flex-grow"></div>
								<div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
									<el-icon class="mr-1"><Clock /></el-icon>
									{{ parseDate(item.createTime, '{y}-{m}-{d}') }}
								</div>

								<el-checkbox
									class="ml-4"
									:value="selectObjs.includes(item.id)"
									@change="(val: boolean) => handleCardSelect(val, item.id)"
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
	</div>
</template>

<script setup lang="ts" name="systemAiFunc">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs } from '/@/api/knowledge/aiFunc';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { useDict } from '/@/hooks/dict';
import { useRouter } from 'vue-router';
import { EditPen, Delete, Monitor } from '@element-plus/icons-vue';
import { parseDate } from '/@/utils/formatTime';

const { yes_no_type } = useDict('yes_no_type');
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
	downBlobFile('/knowledge/aiFunc/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiFunc.xlsx');
};

// 多选事件 - 为卡片视图添加的选择函数
const handleCardSelect = (selected: boolean, id: string) => {
	if (selected) {
		selectObjs.value.push(id);
	} else {
		selectObjs.value = selectObjs.value.filter((item: string) => item !== id);
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

const router = useRouter();
const handleAdd = () => {
	let to = '/knowledge/aiFunc/workflow/index';
	router.push(to);
};

const handleEdit = (id: string) => {
	router.push({
		path: '/knowledge/aiFunc/workflow/index',
		query: { id },
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
