<template>
	<el-drawer title="数据表" v-model="tableVisible" close-on-click-modal size="40%">
		<el-form :model="state.queryForm" @keyup.enter="getDataList" ref="queryRef">
			<el-row class="mb-2" :gutter="20">
				<el-col :span="12">
					<el-form-item label="数据集" prop="datasetName">
						<el-input placeholder="请输入数据集名称" style="max-width: 200px" v-model="state.queryForm.datasetName" />
					</el-form-item>
				</el-col>

				<el-col :span="12">
					<el-form-item>
						<el-button @click="getDataList" icon="search" type="primary">
							{{ $t('common.queryBtn') }}
						</el-button>
						<el-button icon="Refresh" @click="resetQuery">{{ $t('common.resetBtn') }}</el-button>
					</el-form-item>
				</el-col>
			</el-row>
		</el-form>

		<el-row class="mb-2">
			已选数据集:
			<el-tag v-if="selectedDatasetName" class="ml-2" closable @close="handleClose" :disable-transitions="false">
				{{ selectedDatasetName }}
			</el-tag>
		</el-row>
		<!-- Table Content -->
		<el-row>
			<el-table
				ref="tableRef"
				:data="state.dataList"
				style="width: 100%"
				v-loading="state.loading"
				border
				row-key="id"
				width="30%"
				@row-dblclick="handleRowDblClick"
				highlight-current-row
				:cell-style="tableStyle.cellStyle"
				:header-cell-style="tableStyle.headerCellStyle"
			>
				<el-table-column :label="t('table.index')" type="index" width="60" />
				<el-table-column label="数据集" prop="datasetName" show-overflow-tooltip />
				<el-table-column label="描述" prop="description" show-overflow-tooltip />
			</el-table>
			<pagination @current-change="currentChangeHandle" @size-change="sizeChangeHandle" v-bind="state.pagination" />
		</el-row>
	</el-drawer>
</template>
<script setup lang="ts" name="AiTablesDialog">
import { fetchList } from '/@/api/knowledge/aiData';
import { BasicTableProps, useTable } from '/@/hooks/table';
import { useI18n } from 'vue-i18n';
import { useMessage } from '/@/hooks/message';

const emit = defineEmits(['refresh']);
const tableVisible = ref(false);
const { t } = useI18n();
const queryRef = ref();
const tableRef = ref();
// 选中的数据ID
const selectedDataId = ref<string | null>(null);
// 选中的数据集名称
const selectedDatasetName = ref<string | null>(null);

const state: BasicTableProps = reactive<BasicTableProps>({
	queryForm: {
		datasetName: '',
	},
	pageList: fetchList,
	createdIsNeed: false,
});

//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, tableStyle } = useTable(state);

// 双击行事件
const handleRowDblClick = (row: any) => {
	selectedDataId.value = row.dataId;
	selectedDatasetName.value = row.datasetName;
	// Emit a 'refresh' event with the selected data
	emit('refresh', row.dataId );
	useMessage().success('已选择数据集: ' + row.datasetName);
};

// 清空搜索条件
const resetQuery = () => {
	selectedDataId.value = null;
	selectedDatasetName.value = null;
	queryRef.value?.resetFields();
	getDataList();
};

// 关闭处理
const handleClose = () => {
	selectedDataId.value = null;
	selectedDatasetName.value = null;
};

/**
 * 打开提示词选择界面.
 */
const openDialog = () => {
	getDataList();
	tableVisible.value = true;
};

// Expose the openDialog function
defineExpose({
	openDialog,
});
</script>
