<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row v-show="showSearch">
				<el-form :model="state.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
					<el-form-item label="知识库名" prop="title">
						<el-select placeholder="请选择知识库" v-model="state.queryForm.datasetId">
							<el-option :key="index" :label="item.name" :value="item.id" v-for="(item, index) in datasetList">
								{{ item.name }}
							</el-option>
						</el-select>
					</el-form-item>
					<el-form-item label="切片状态" prop="sliceStatus">
						<el-select placeholder="请选择状态" v-model="state.queryForm.sliceStatus">
							<el-option :key="item.value" :label="item.label" :value="item.value" v-for="(item, index) in slice_status">
								{{ item.label }}
							</el-option>
						</el-select>
					</el-form-item>
					<el-form-item label="总结状态" prop="summaryStatus">
						<el-select placeholder="请选择状态" v-model="state.queryForm.summaryStatus">
							<el-option :key="item.value" :label="item.label" :value="item.value" v-for="(item, index) in summary_status">
								{{ item.label }}
							</el-option>
						</el-select>
					</el-form-item>
					<el-form-item label="文件名" prop="name">
						<el-input placeholder="请输入文件名" v-model="state.queryForm.name" />
					</el-form-item>
					<el-form-item label="文件来源" prop="sourceType">
						<el-select placeholder="请选择状态" v-model="state.queryForm.sourceType">
							<el-option :key="item.value" :label="item.label" :value="item.value" v-for="(item, index) in source_type">
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
					<el-button icon="folder-add" type="primary" class="ml10" @click="formDialogRef.openDialog()" v-auth="'knowledge_aiDocument_add'">
						新 增
					</el-button>
					<el-button plain :disabled="multiple" icon="Delete" type="primary" v-auth="'knowledge_aiDocument_del'" @click="handleDelete(selectObjs)">
						删除
					</el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiDocument_export'"
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
				@row-dblclick="go2slice"
				:cell-style="tableStyle.cellStyle"
				:header-cell-style="tableStyle.headerCellStyle"
				@selection-change="selectionChangHandle"
				@sort-change="sortChangeHandle"
			>
				<el-table-column type="selection" width="40" align="center" />
				<el-table-column type="index" label="#" width="40" />
				<el-table-column prop="name" label="名称" width="200" show-overflow-tooltip />
				<el-table-column prop="fileType" label="文件类型" show-overflow-tooltip />
				<el-table-column prop="sourceType" label="文件来源" show-overflow-tooltip>
					<template #default="scope">
						<dict-tag :options="source_type" :value="scope.row.sourceType"></dict-tag>
					</template>
				</el-table-column>
				<el-table-column prop="sliceCount" label="切片数量" show-overflow-tooltip />
				<el-table-column prop="hitCount" label="命中次数" show-overflow-tooltip />
				<el-table-column prop="fileStatus" width="100" show-overflow-tooltip>
					<template #header>
						切片结果
						<tip content="点击【失败】标签可查看失败原因" />
					</template>
					<template #default="scope">
						<template v-if="scope.row.sliceStatus === '9'">
							<el-tooltip placement="top">
								<template #content>{{ scope.row.sliceFailReason }}</template>
								<dict-tag :options="slice_status" :value="scope.row.sliceStatus" />
							</el-tooltip>
						</template>
						<template v-else>
							<dict-tag :options="slice_status" :value="scope.row.sliceStatus" />
						</template>
					</template>
				</el-table-column>
				<el-table-column prop="summaryStatus" width="100" show-overflow-tooltip>
					<template #header>
						总结结果
						<tip content="点击【失败】标签可查看失败原因" />
					</template>
					<template #default="scope">
						<template v-if="scope.row.summaryStatus === '9'">
							<el-tooltip placement="top">
								<template #content>{{ scope.row.summaryFailReason }}</template>
								<dict-tag :options="summary_status" :value="scope.row.summaryStatus" />
							</el-tooltip>
						</template>
						<template v-else>
							<dict-tag :options="summary_status" :value="scope.row.summaryStatus" />
						</template>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="300">
					<template #default="scope">
						<el-button
							icon="Download"
							text
							type="primary"
							v-auth="'knowledge_aiDocument_del'"
							v-if="scope.row.sourceType === '4'"
							@click="retry2Document(scope.row)"
							>更新
						</el-button>
						<el-button icon="Refresh" text type="primary" @click="retry2slice(scope.row)" v-if="scope.row.sourceType !== '4'">重试 </el-button>
						<el-button icon="edit-pen" text type="primary" v-auth="'knowledge_aiDocument_del'" @click="go2slice(scope.row)">切片 </el-button>
						<el-button icon="delete" text type="primary" v-auth="'knowledge_aiDocument_del'" @click="handleDelete([scope.row.id])">删除 </el-button>
					</template>
				</el-table-column>
			</el-table>
			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />
	</div>
</template>

<script setup lang="ts" name="systemAiDocument">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs, retrySlice, retryIssue } from '/@/api/knowledge/aiDocument';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { useDict } from '/@/hooks/dict';
import { fetchDataList } from '/@/api/knowledge/aiDataset';

const route = useRoute();

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
// 定义查询字典
const { yes_no_type, source_type, slice_status, summary_status } = useDict('yes_no_type', 'source_type', 'slice_status', 'summary_status');
const router = useRouter();

// 定义变量内容
const formDialogRef = ref();
// 搜索变量
const queryRef = ref();
const showSearch = ref(true);
// 多选变量
const selectObjs = ref([]) as any;
const multiple = ref(true);

const state: BasicTableProps = reactive<BasicTableProps>({
	createdIsNeed: false,
	queryForm: {},
	pageList: fetchList,
});

//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, sortChangeHandle, downBlobFile, tableStyle } = useTable(state);

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
	downBlobFile('/knowledge/aiDocument/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiDocument.xlsx');
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

const datasetList = ref([]);
const getDatasetList = async () => {
	const { data } = await fetchDataList();
	datasetList.value = data;
};

onMounted(async () => {
	await getDatasetList();
	if (route.query.datasetId) {
		state.queryForm.datasetId = route.query.datasetId;
	}

	// 查询表格数据
	await getDataList();
});

const retry2slice = async (document: any) => {
	await useMessageBox()
		.confirm('此操作将重新切片，删除原有切片数据')
		.catch(() => {
			return;
		});

	try {
		await retrySlice(document);
		useMessage().success('操作成功，稍后请刷新列表查看');
	} catch (err: any) {
		useMessage().error(err.msg);
	}
};

const retry2Document = async (document: any) => {
	await useMessageBox()
		.confirm('此操作将获取最新工单')
		.catch(() => {
			return;
		});

	try {
		await retryIssue(document);
		useMessage().success('操作成功，稍后请刷新列表查看');
	} catch (err: any) {
		useMessage().error(err.msg);
	}
};

const go2slice = (document: any) => {
	router.push({
		path: '/knowledge/aiSlice/index',
		query: {
			documentId: document.id,
		},
	});
};
</script>
