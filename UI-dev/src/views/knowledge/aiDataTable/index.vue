<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row v-show="showSearch">
				<el-form :model="state.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
					<el-form-item label="数据源" prop="dsName">
						<el-select v-model="state.queryForm.dsName" placeholder="请选择数据源">
							<el-option label="默认数据源" value="master"></el-option>
							<el-option v-for="ds in datasourceList" :key="ds" :label="ds" :value="ds"></el-option>
						</el-select>
					</el-form-item>
					<el-form-item label="表名称" prop="tableName">
						<el-input placeholder="请输入表名称或注释" v-model="state.queryForm.tableName" />
					</el-form-item>
					<el-form-item>
						<el-button icon="search" type="primary" @click="getDataList"> 查询 </el-button>
						<el-button icon="Refresh" @click="resetQuery">重置</el-button>
					</el-form-item>
				</el-form>
			</el-row>
			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button plain icon="Refresh" :loading="state.loading" type="primary" v-auth="'knowledge_aiDataTable_add'" @click="handleSync">
						同步
					</el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiDataTable_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiDataTable_export'"
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
				<el-table-column type="index" label="#" width="40" />
				<el-table-column prop="dsName" label="数据源" show-overflow-tooltip />
				<el-table-column prop="tableName" label="表名称" show-overflow-tooltip />
				<el-table-column prop="tableComment" label="物理注释" show-overflow-tooltip />
				<el-table-column prop="virtualComment" label="逻辑注释" show-overflow-tooltip />
				<el-table-column prop="createTime" label="创建时间" show-overflow-tooltip />
				<el-table-column label="操作" width="200">
					<template #default="scope">
						<el-button
							icon="menu"
							text
							type="primary"
							v-auth="'knowledge_aiDataTable_edit'"
							@click="fieldDialogRef.openDialog(scope.row.dsName, [scope.row.tableName], true)"
							>字段</el-button
						>
						<el-button icon="edit-pen" text type="primary" v-auth="'knowledge_aiDataTable_edit'" @click="formDialogRef.openDialog(scope.row.tableId)"
							>编辑</el-button
						>
						<el-button icon="delete" text type="primary" v-auth="'knowledge_aiDataTable_del'" @click="handleDelete([scope.row.tableId])"
							>删除</el-button
						>
					</template>
				</el-table-column>
			</el-table>
			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />

		<!-- 字段列表 -->
		<field-dialog ref="fieldDialogRef" @refresh="getDataList(false)" />
	</div>
</template>

<script setup lang="ts" name="systemAiDataTable">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs, syncObj } from '/@/api/knowledge/aiDataTable';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { list } from '/@/api/gen/datasource';
import { onMounted } from 'vue';

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
const FieldDialog = defineAsyncComponent(() => import('./field.vue'));

// 定义变量内容
const formDialogRef = ref();
const fieldDialogRef = ref();
// 搜索变量
const queryRef = ref();
const showSearch = ref(true);
// 多选变量
const selectObjs = ref([]) as any;
const multiple = ref(true);
// 数据源列表
const datasourceList = ref([]);

const state: BasicTableProps = reactive<BasicTableProps>({
	queryForm: {
		tableName: '',
		dsName: '',
	},
	pageList: fetchList,
});

// 加载数据源列表
const loadDatasourceList = async () => {
	try {
		const { data } = await list();
		datasourceList.value = data?.map((item: any) => item.name) || [];
	} catch (err) {
		// Error handling
	}
};

// 页面加载时获取数据源列表
onMounted(() => {
	loadDatasourceList();
});

//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, sortChangeHandle, downBlobFile, tableStyle } = useTable(state);

// 导出excel
const exportExcel = () => {
	downBlobFile('/knowledge/aiDataTable/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiDataTable.xlsx');
};

// 多选事件
const selectionChangHandle = (objs: { tableId: string }[]) => {
	selectObjs.value = objs.map(({ tableId }) => tableId);
	multiple.value = !objs.length;
};

// 清空搜索条件
const resetQuery = () => {
	// 清空搜索条件
	queryRef.value?.resetFields();
	// 清空多选
	selectObjs.value = [];
	// 确保数据源也被重置
	state.queryForm.dsName = '';
	state.queryForm.tableName = '';
	getDataList();
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

// 同步操作
const handleSync = async () => {
	try {
		state.loading = true;
		await syncObj();
		getDataList();
		useMessage().success('同步成功');
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		state.loading = false;
	}
};

// 关闭字段抽屉并刷新表格
const closeFieldDrawerAndRefresh = () => {
	if (fieldDialogRef.value) {
		fieldDialogRef.value.closeDrawer();
	}
};

// 暴露方法给父组件
defineExpose({
	closeFieldDrawerAndRefresh,
});
</script>
