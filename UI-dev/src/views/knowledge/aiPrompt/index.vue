<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button icon="folder-add" type="primary" class="ml10" @click="formDialogRef.openDialog()" v-auth="'knowledge_aiPrompt_add'">
						新 增
					</el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiPrompt_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiPrompt_export'"
						@exportExcel="exportExcel"
						class="ml10 mr20"
						style="float: right"
						@queryTable="getDataList"
					></right-toolbar>
				</div>
			</el-row>
			<el-table
				:data="state.dataList"
				v-loading="state.loading"
				border
				:cell-style="tableStyle.cellStyle"
				:header-cell-style="tableStyle.headerCellStyle"
				@selection-change="selectionChangHandle"
				@sort-change="sortChangeHandle"
			>
				<el-table-column type="selection" width="40" align="center" />
				<el-table-column type="index" label="#" width="60" />
				<el-table-column prop="act" label="标题" width="200" show-overflow-tooltip />
				<el-table-column prop="prompt" label="提示词" show-overflow-tooltip />
				<el-table-column prop="promptSort" label="排序" width="80" show-overflow-tooltip />
				<el-table-column prop="promptStatus" label="有效" width="80" show-overflow-tooltip>
					<template #default="scope">
						<dict-tag :options="yes_no_type" :value="scope.row.promptStatus"></dict-tag>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="400">
					<template #default="scope">
						<el-button icon="edit-pen" text type="primary" v-auth="'knowledge_aiPrompt_edit'" @click="formDialogRef.openDialog(scope.row.id)">
							编辑
						</el-button>
						<el-button icon="delete" text type="primary" v-auth="'knowledge_aiPrompt_del'" @click="handleDelete([scope.row.id])"> 删除 </el-button>
						<el-button icon="magic-stick" text type="primary" @click="openOptimizeDialog(scope.row)"> 优化 </el-button>
					</template>
				</el-table-column>
			</el-table>
			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />

		<!-- 优化对话框 -->
		<OptimizeDialog ref="optimizeDialogRef" />
	</div>
</template>

<script setup lang="ts" name="systemAiPrompt">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs } from '/@/api/knowledge/aiPrompt';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { useDict } from '/@/hooks/dict';

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
// 引入优化对话框组件
const OptimizeDialog = defineAsyncComponent(() => import('./optimize.vue'));
// 定义查询字典
const { yes_no_type } = useDict('yes_no_type', 'source_type');

// 定义变量内容
const formDialogRef = ref();
// 搜索变量
const queryRef = ref();
const showSearch = ref(true);
// 多选变量
const selectObjs = ref([]) as any;
const multiple = ref(true);

const state: BasicTableProps = reactive<BasicTableProps>({
	queryForm: {},
	pageList: fetchList,
	descs: ['create_time'],
});

//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, sortChangeHandle, downBlobFile, tableStyle } = useTable(state);

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
	downBlobFile('/knowledge/aiPrompt/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiPrompt.xlsx');
};

// 多选事件
const selectionChangHandle = (objs: { id: string }[]) => {
	selectObjs.value = objs.map(({ id }) => id);
	multiple.value = !objs.length;
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

// 优化对话框引用
const optimizeDialogRef = ref();

// 打开优化对话框
function openOptimizeDialog(row: any) {
	if (optimizeDialogRef.value) {
		optimizeDialogRef.value.openDialog(row);
	} else {
		console.error('OptimizeDialog component is not available');
	}
}
</script>
