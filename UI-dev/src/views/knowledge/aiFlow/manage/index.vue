<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-row v-if="showSearch && tableState.queryForm">
				<el-form :model="tableState.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
					<el-form-item label="业务名称" prop="name">
						<el-input v-model="tableState.queryForm.name" placeholder="请输入名称搜索" />
					</el-form-item>
					<el-form-item>
						<el-button icon="search" type="primary" @click="getDataList"> 查询</el-button>
						<el-button icon="Refresh" @click="resetQuery">重置</el-button>
					</el-form-item>
				</el-form>
			</el-row>

			<el-row>
				<div class="mb8" style="width: 100%">
					<el-button icon="folder-add" type="primary" class="ml10" @click="formRef.openDialog()"> 新 增 </el-button>
					<el-button icon="upload" type="default" class="ml10" @click="uploadDialogVisible = true"> 导 入 </el-button>
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="false"
						class="ml10 mr20"
						style="float: right"
						@exportExcel="exportExcel"
						@queryTable="getDataList"
					></right-toolbar>
				</div>
			</el-row>

			<el-scrollbar class="h-[calc(100vh-280px)] mb-4">
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					<div
						v-for="dataset in tableState.dataList"
						:key="dataset.id"
						class="group overflow-hidden bg-white rounded-lg shadow-sm border border-gray-100 transition-all duration-300 cursor-pointer dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg hover:border-primary-100 hover:translate-y-[-2px]"
						@click="openSettingDialog(dataset)"
					>
						<div class="p-5">
							<div class="flex items-start">
								<div
									class="flex justify-center items-center text-lg font-medium text-white rounded-lg transition-transform size-12 group-hover:scale-110"
									:class="dataset.type === EOrchestrationType.WORK_FLOW ? 'bg-amber-500' : 'bg-indigo-600'"
								>
									{{ dataset.name ? dataset.name.substring(0, 1).toUpperCase() : '' }}
								</div>
								<div class="overflow-hidden flex-1 ml-3">
									<div class="text-base font-medium text-gray-900 truncate dark:text-white">
										{{ dataset.name }}
									</div>
									<div class="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
										<el-icon class="mr-1"><User /></el-icon>
										{{ dataset.createBy }}
									</div>
								</div>
								<div>
									<el-tag type="primary" size="small" class="ml-2" effect="light"> 高级编排 </el-tag>
								</div>
							</div>

							<div class="overflow-y-auto mt-4 h-16 text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
								{{ dataset.description || '暂无描述' }}
							</div>

							<div class="flex justify-start items-center pt-3 mt-4 border-t border-gray-100 dark:border-gray-700">
								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									@click.stop="router.push(`/aiFlow/process/${dataset.id}`)"
								>
									<el-icon><DataLine /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-button
									class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
									text
									type="primary"
									@click.stop="formRef.openDialog(`${dataset.id}`, 'edit')"
								>
									<el-icon><Setting /></el-icon>
								</el-button>

								<div class="mx-2 w-px h-4 bg-gray-200 dark:bg-gray-700"></div>

								<el-dropdown trigger="click" @command="(command: string) => itemDropdownHandle(dataset, command)">
									<el-button
										class="!p-2 text-gray-600 rounded-full transition-colors dark:text-gray-300 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
										text
										type="primary"
										@click.stop
									>
										<el-icon><More /></el-icon>
									</el-button>
									<template #dropdown>
										<el-dropdown-menu>
											<el-dropdown-item command="copy">复制</el-dropdown-item>
											<el-dropdown-item command="export">导出</el-dropdown-item>
											<el-dropdown-item command="remove">删除</el-dropdown-item>
										</el-dropdown-menu>
									</template>
								</el-dropdown>

								<div class="flex-grow"></div>
								<div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
									<el-icon class="mr-1"><Clock /></el-icon>
									{{ parseDate(dataset.createTime) }}
								</div>
							</div>
						</div>
					</div>
				</div>
			</el-scrollbar>

			<!-- 无数据显示 -->
			<el-empty v-if="!tableState.dataList || tableState.dataList.length === 0" description="暂无数据"></el-empty>

			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="tableState.pagination" />
		</div>
		<Form ref="formRef" @refresh="getDataList" />

		<!-- 上传对话框 -->
		<el-dialog v-model="uploadDialogVisible" title="导入文件" width="500px" destroy-on-close>
			<upload-file
				ref="elUploadRef"
				:file-list="[]"
				:auto-upload="false"
				:limit="1"
				:file-type="['dsl']"
				uploadFileUrl="/admin/aiFlow/import"
				@change="importHandle"
			/>
			<template #footer>
				<span class="dialog-footer">
					<el-button @click="uploadDialogVisible = false">取 消</el-button>
					<el-button type="primary" @click="submitUpload">确 定</el-button>
				</span>
			</template>
		</el-dialog>
	</div>
</template>
<script setup lang="ts">
import { DataLine, More, Setting, User } from '@element-plus/icons-vue';
import {
	IOrchestrationScope,
	delObjs,
	fetchList,
	IOrchestrationItem,
	EOrchestrationType,
	exportFlow,
	copyFlow,
	importFlow,
} from '/@/api/knowledge/aiFlow';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { BasicTableProps, useTable } from '/@/hooks/table';
import Form from './form.vue';
import { ElNotification } from 'element-plus';

interface State {
	showSearch: boolean;
	scopeList: IOrchestrationScope[];
	queryForm: {
		selectUserId?: string;
		name?: string;
	};
	formRef?: any;
	elUploadRef?: any;
}

const router = useRouter();

const queryRef = ref();
const uploadDialogVisible = ref(false);
const elUploadRef = ref();

const state = reactive<State>({
	showSearch: true,
	scopeList: [],
	queryForm: {
		selectUserId: undefined,
		name: undefined,
	},
	formRef: undefined,
});

const tableState = reactive<BasicTableProps>({
	queryForm: {},
	pageList: fetchList,
	dataList: [],
	pagination: {},
});

const { showSearch, formRef } = toRefs(state);
//  table hook
const { getDataList, currentChangeHandle, sizeChangeHandle /* , sortChangeHandle, downBlobFile, tableStyle */ } = useTable(tableState);

/**
 * @description  : 导出
 * @return        {any}
 */
function exportExcel() {}

// 清空搜索条件
const resetQuery = () => {
	// 清空搜索条件
	queryRef.value?.resetFields();
	tableState.queryForm = {};
	getDataList();
};

function openSettingDialog(dataset: IOrchestrationItem) {
	router.push({
		path: `/aiFlow/process/${dataset.id}`,
	});
}

async function itemDropdownHandle(dataset: IOrchestrationItem, command: string) {
	switch (command) {
		case 'copy':
			copyHandle(dataset.id as string);
			break;
		case 'remove':
			deleteHandle(dataset.id as string);
			break;
		case 'export':
			exportHandle(dataset);
			break;
	}
}

/**
 * @description  : 导出 方法
 * @param         {any} dataset
 * @return        {any}
 */
async function exportHandle(dataset: IOrchestrationItem) {
	try {
		if (!dataset.id || !dataset.name) {
			throw new Error('编排ID或名称不能为空');
		}
		await exportFlow(dataset.id, dataset.name);
	} catch (e: any) {
		useMessage().error(e.msg || e.message);
	}
}

async function copyHandle(id: string) {
	try {
		await copyFlow(id);
		getDataList();
		useMessage().success('复制成功');
	} catch (e: any) {
		useMessage().error(e.msg || e.message);
	}
}

/**
 * @description  : 删除方法。
 * @param         {string | string[]} idOrIds id 或 id[]
 * @return        {any}
 */
async function deleteHandle(idOrIds: string | string[]) {
	try {
		await useMessageBox().confirm('此操作将永久删除');
	} catch {
		return;
	}

	try {
		await delObjs([idOrIds]);
		getDataList();
		useMessage().success('删除成功');
	} catch (err: any) {
		useMessage().error(err.msg);
	}
}

/**
 * @description  : 导入
 * @param         {any} file
 * @return        {any}
 */
async function importHandle() {
	try {
		useMessage().success('导入成功');
		getDataList();
		uploadDialogVisible.value = false;
	} catch (e: any) {
		debugger;
		useMessage().error(e.msg || e.message);
	}
}

/**
 * 提交上传
 */
function submitUpload() {
	if (elUploadRef.value) {
		elUploadRef.value.submit();
	}
	uploadDialogVisible.value = false;
}
</script>
<style lang="scss" scoped>
:deep(.el-scrollbar__wrap) {
	overflow-x: hidden !important;
}

.bg-primary-100 {
	background-color: var(--el-color-primary-light-9);
}

.text-primary {
	color: var(--el-color-primary);
}

:deep(.el-button.is-text) {
	padding: 0;
	&:hover {
		background-color: transparent;
	}
}
</style>
