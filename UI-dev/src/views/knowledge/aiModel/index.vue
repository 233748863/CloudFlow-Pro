<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row v-show="showSearch">
				<el-form :model="state.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
					<el-form-item label="类型" prop="title">
						<el-select placeholder="请选择类型" v-model="state.queryForm.modelType">
							<el-option :key="index" :label="item.label" :value="item.value" v-for="(item, index) in modelTypes">
								{{ item.label }}
							</el-option>
						</el-select>
					</el-form-item>
					<el-form-item>
						<el-button icon="search" type="primary" @click="getDataList"> 查询</el-button>
						<el-button icon="Refresh" @click="resetQuery">重置</el-button>
					</el-form-item>
				</el-form>
			</el-row>
			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button icon="folder-add" type="primary" class="ml10" @click="formDialogRef.openDialog()" v-auth="'knowledge_aiModel_add'">
						新 增
					</el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiModel_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiModel_export'"
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
				<el-table-column prop="provider" label="供应商" show-overflow-tooltip width="200">
					<template #default="scope">
						{{ getProviderLabel(scope.row.provider) }}
					</template>
				</el-table-column>
				<el-table-column prop="modelType" label="类型" show-overflow-tooltip width="100">
					<template #default="scope">
						<el-tag>
							{{ getModelTypeLabel(scope.row.modelType) }}
						</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="name" label="名称" show-overflow-tooltip width="300" />
				<el-table-column prop="modelName" label="模型" show-overflow-tooltip />

				<el-table-column prop="defaultModel" >
          <template #header>
            默认模型
            <tip content="若调用不传递模型，则使用【默认模型】"></tip>
          </template>
					<template #default="scope">
						<el-switch v-model="scope.row.defaultModel" @change="changeSwitch(scope.row)" active-value="1" inactive-value="0"></el-switch>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="150">
					<template #default="scope">
						<el-button icon="edit-pen" text type="primary" v-auth="'knowledge_aiModel_edit'" @click="formDialogRef.openDialog(scope.row.id)"
							>编辑</el-button
						>
						<el-button icon="delete" text type="primary" v-auth="'knowledge_aiModel_del'" @click="handleDelete([scope.row.id])">删除</el-button>
					</template>
				</el-table-column>
			</el-table>
			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />
	</div>
</template>

<script setup lang="ts" name="systemAiModel">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs, putObj } from '/@/api/knowledge/aiModel';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { modelTypes, providers } from './model';

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
// 定义查询字典

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
});

//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, sortChangeHandle, downBlobFile, tableStyle } = useTable(state);

// Update the changeSwitch function
const changeSwitch = async (row: AiModel) => {
	try {
		await putObj({
			id: row.id,
			modelType: row.modelType,
			defaultModel: row.defaultModel,
		});
		useMessage().success('更新成功');
		await getDataList();
	} catch (error) {
		useMessage().error('更新失败');
	}
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

// 清空搜索条件
const resetQuery = () => {
	// 清空搜索条件
	queryRef.value?.resetFields();
	state.queryForm = {};
	// 清空多选
	selectObjs.value = [];
	getDataList();
};

// 导出excel
const exportExcel = () => {
  downBlobFile('/knowledge/aiModel/export', Object.assign(state.queryForm, {ids: selectObjs}), 'aiModel.xlsx')
}

// 获取模型类型的标签
const getModelTypeLabel = (value: string) => {
	const modelType = modelTypes.find((type) => type.value === value);
	return modelType ? modelType.label : value;
};

// 获取供应商的标签
const getProviderLabel = (value: string) => {
	const provider = providers.find((p) => p.value === value);
	return provider ? provider.label : value;
};
</script>
