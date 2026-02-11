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

					<el-form-item label="文件名" prop="name">
						<el-input placeholder="请输入文件名" v-model="state.queryForm.name" />
					</el-form-item>
					<el-form-item label="已训练" prop="fileStatus">
						<el-radio-group v-model="state.queryForm.sliceStatus">
							<el-radio :key="index" :label="item.value" border v-for="(item, index) in yes_no_type">{{ item.label }} </el-radio>
						</el-radio-group>
					</el-form-item>
					<el-form-item>
						<el-button icon="search" type="primary" @click="getDataList"> 查询</el-button>
						<el-button icon="Refresh" @click="resetQuery">重置</el-button>
					</el-form-item>
				</el-form>
			</el-row>

			<el-row>
				<div class="mb8" style="width: 100%">
					<right-toolbar
						v-model:showSearch="showSearch"
						:export="'knowledge_aiSlice_export'"
						@exportExcel="exportExcel"
						class="ml10 mr20"
						style="float: right"
						@queryTable="getDataList"
					></right-toolbar>
				</div>
			</el-row>

			<el-scrollbar>
				<div class="mx-auto mt-4">
					<div class="px-4">
						<div class="grid sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3">
							<div
								class="relative p-6 mb-6 bg-gray-100 rounded-lg border dark:border-gray-700 dark:bg-gray-800"
								v-for="slice in state.dataList"
								:key="slice.id"
							>
								<button v-if="slice.sliceStatus === '1'" class="absolute -top-2 right-0 px-3 rotate-[20deg] border bg-primary text-white font-bold">
									已训练
								</button>

								<div class="flex justify-between items-center">
									<div class="flex relative items-center w-2/4 group">
										<h3
											class="text-base font-semibold text-gray-900 truncate transition-colors duration-300 dark:text-gray-100 hover:text-primary"
											:title="slice.name"
										>
											<tip :content="slice.name" />
											{{ slice.name }}
										</h3>
									</div>
									<div class="flex items-end">
										<svg
											t="1710943696783"
											class="mr-2 w-5 h-5 text-base text-gray-500"
											viewBox="0 0 1024 1024"
											version="1.1"
											xmlns="http://www.w3.org/2000/svg"
											p-id="4358"
											width="128"
											height="128"
										>
											<path
												d="M678.68009472 305.67806859H345.31990528c-21.80301018 0-39.64183671 17.83882651-39.64183669 39.64183669v333.31409429c0 21.80301018 17.83882651 39.64183671 39.64183669 39.6418367h333.31409429c21.80301018 0 39.64183671-17.83882651 39.6418367-39.6418367V345.31990528c0.04609516-21.80301018-17.79273135-39.64183671-39.59574155-39.64183669z"
												fill="#ffffff"
												p-id="4359"
											></path>
											<path
												d="M873.6 64.4H150.4c-47.3 0-86 38.7-86 86v723.1c0 47.3 38.7 86 86 86h723.1c47.3 0 86-38.7 86-86V150.4c0.1-47.3-38.6-86-85.9-86z m56.9 778.2c0 48.3-39.6 87.9-87.9 87.9H181.4c-48.3 0-87.9-39.6-87.9-87.9V181.4c0-48.3 39.6-87.9 87.9-87.9h661.1c48.3 0 87.9 39.6 87.9 87.9v661.2z"
												fill="#000000"
												p-id="4360"
											></path>
											<path
												d="M639.2 282.6l80.2-80.6c5.9-5.6 15.3-5.6 20.7 0 2.3 2.3 3.3 4.3 4 6.6V209.2l15 55.7 55.7 15 0.3 0.2h0.2c2.3 0.7 4.7 1.6 6.4 3.8 5.7 5.6 5.7 14.8 0 20.7l-80 80.2c-3.8 3.7-9 5.2-14.4 3.8l-45.1-12-23 23.3c25.1 32 39.8 72.9 39.8 117.2 0 52.5-21.4 100.7-56.2 135.5l-0.7 0.5c-35 34.8-82.4 56-135 56-52.9 0-101.1-21.6-135.7-56.5-34.8-34.8-56.4-83-56.4-135.5 0-53.1 21.6-100.9 56.4-135.9C406 346.4 454.2 325 507.1 325c44.2 0 84.9 14.8 117.3 39.8l23.1-22.8-12.2-45.4c-1.5-4.9 0.2-10.5 3.9-14z m116.7 159c-4-13.6 3.5-27 16.4-30.8 12.9-4 26.4 3.5 30.4 16.4 4.3 14.4 7.8 29.1 9.9 44.4 2.1 14.6 3.3 30.1 3.3 45.6 0 85.1-34.4 162.5-90.3 218.1-56 55.7-133.3 90.8-218.5 90.8S344.6 791 288.6 735.3C233 679.6 198 602.2 198 517.1c0-85.4 35-162.8 90.6-218.8 56-55.7 133.2-90.1 218.5-90.1 15.1 0 30.6 0.9 45.2 3.5 15.3 1.9 30.3 5.4 44.5 9.6 12.9 3.7 20.2 17.6 16.4 30.6-3.8 12.9-17.7 20.2-30.6 16.4-12.2-3.8-24.7-6.4-37.2-8.4-12.2-1.9-25.1-3-38.3-3-71.8 0-136.7 29.2-183.7 76.5-47.2 46.8-76.2 111.7-76.2 183.7 0 71.5 29.1 136.4 76.2 183.7 47 46.8 111.9 76 183.7 76 71.7 0 136.7-29.2 183.7-76 47-47.3 76.2-112.2 76.2-183.7 0-13.2-1-26.5-2.8-38.3-1.7-12.8-4.5-25-8.3-37.2z m-248.8-12.8c15.3 0 29.9 3.8 42.8 10.8l53.6-53.7c-27.1-19.7-60.4-31.1-96.4-31.1-44.9 0-85.6 17.9-114.8 47.3v-0.2 0.2c-29.6 29.4-47.7 70.1-47.7 115.2 0 44.5 18.1 85.2 47.7 114.6 29.2 29.6 69.9 47.8 114.8 47.8 44.5 0 84.9-18.1 114.1-47l0.7-0.9c29.6-29.2 47.7-70.1 47.7-114.6 0-36.4-11.5-69.8-31.3-96.4L584.4 474c7 13.2 11.1 27.3 11.1 43.1 0 24-10.1 46.3-25.9 62.3h-0.2c-16 15.7-38.1 25.9-62.3 25.9-24.4 0-46.4-10.3-62.3-25.9-16-16-26.1-37.9-26.1-62.3 0-24.5 10.1-46.6 26.1-62.3v-0.4c15.9-15.9 38-25.6 62.3-25.6z m20.4 32.7c-6.1-2.3-13.2-3.5-20.4-3.5-16.4 0-31 6.6-41.7 17.4-10.4 10.4-17.2 25.4-17.2 41.8s6.8 30.8 17.2 41.4c10.8 10.6 25.4 17.4 41.7 17.4 16.4 0 31-6.8 41.6-17v-0.4c10.6-10.6 17.2-25 17.2-41.4 0-7.5-1.2-14.4-3.5-20.5l-37.9 37.8c-9.7 9.4-25 9.4-34.8 0-9.4-9.6-9.4-25.2 0-34.6l37.8-38.4z m194.7-220.3l-56.4 56.2 8.7 31.5 56.4-56.4-8.7-31.3z m29.2 52l-56 56.5 31.3 8.4 56.4-56.2-31.7-8.7z"
												fill="#000000"
												p-id="4361"
											></path>
										</svg>
										<span class="mr-1">命中次数：{{ slice.hitCount }}</span>
									</div>
								</div>
								<!--  双击此区域进入编辑模式，失去光标则边际结束-->

								<div class="overflow-y-auto h-48 rounded hover:bg-white dark:hover:bg-gray-700">
									<p
										class="overflow-y-auto my-3 h-40 text-sm font-normal text-gray-500 dark:text-gray-400"
										@dblclick="contentEditModel = true"
										@blur="onContentEditBlur(slice)"
										:contenteditable="contentEditModel"
										:id="`slice-${slice.id}`"
									>
										{{ slice.content }}
									</p>
								</div>
								<div class="flex justify-between items-center text-sm font-semibold text-gray-900 dark:text-gray-100">
									<div class="flex">
										<svg
											t="1710943778579"
											class="mr-1 w-6 h-5"
											viewBox="0 0 1024 1024"
											version="1.1"
											xmlns="http://www.w3.org/2000/svg"
											p-id="8180"
											width="128"
											height="128"
										>
											<path
												d="M109.568 99.328s-17.408 15.36 0 38.912 295.936 392.192 295.936 392.192 17.408 15.36 0 35.84-288.768 323.584-288.768 323.584-20.48 32.768 3.072 32.768h733.184s27.648 0 33.792-29.696c7.168-29.696 33.792-154.624 33.792-154.624s0-12.288-10.24-17.408c-10.24-6.144-30.72 0-33.792 9.216-3.072 9.216-92.16 98.304-125.952 104.448h-471.04l237.568-273.408s17.408-12.288 17.408-29.696-23.552-45.056-23.552-45.056L276.48 169.984h458.752s88.064 47.104 146.432 136.192c7.168 9.216 40.96 9.216 40.96 0s-51.2-201.728-51.2-201.728l-761.856-5.12z"
												fill="#111111"
												p-id="8181"
											></path>
										</svg>
										字符数：{{ slice.charCount }}
									</div>
									<div class="flex items-center">
										<el-button class="!p-0" icon="refresh" @click="handleRetrain(slice)" text type="primary" v-auth="'knowledge_aiSlice_del'"
											>重新训练
										</el-button>
										<el-button class="!p-0" icon="delete" @click="handleDelete([slice.id])" text type="primary" v-auth="'knowledge_aiSlice_del'"
											>{{ $t('common.delBtn') }}
										</el-button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</el-scrollbar>

			<pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination" />
		</div>

		<!-- 编辑、新增  -->
		<form-dialog ref="formDialogRef" @refresh="getDataList(false)" />
	</div>
</template>

<script setup lang="ts" name="systemAiSlice">
import { BasicTableProps, useTable } from '/@/hooks/table';
import { fetchList, delObjs, putObj } from '/@/api/knowledge/aiSlice';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { useDict } from '/@/hooks/dict';
import { useI18n } from 'vue-i18n';
import { fetchDataList } from '/@/api/knowledge/aiDataset';

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
// 定义查询字典
const { yes_no_type } = useDict('yes_no_type');
const route = useRoute();

// 定义变量内容
const formDialogRef = ref();
const contentEditModel = ref(false);
// 搜索变量
const queryRef = ref();
const showSearch = ref(true);
// 多选变量
const selectObjs = ref([]) as any;
const multiple = ref(true);
const { t } = useI18n();

const datasetList = ref([]);
const getDatasetList = async () => {
	const { data } = await fetchDataList();
	datasetList.value = data;
};

const state: BasicTableProps = reactive<BasicTableProps>({
	queryForm: {},
	createdIsNeed: false,
	pageList: fetchList,
	pagination: {
		size: 6,
		pageSizes: [3, 6, 9, 12],
	},
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
	downBlobFile('/knowledge/aiSlice/export', Object.assign(state.queryForm, { ids: selectObjs }), 'aiSlice.xlsx');
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

/**
 * 编辑内容
 * @param slice
 */
const onContentEditBlur = (slice: any) => {
	contentEditModel.value = false;

	let sliceDocument = document.getElementById(`slice-${slice.id}`);
	if (!sliceDocument) {
		return;
	}

	// 还原内容
	if (!sliceDocument.innerText) {
		useMessage().error('内容不能为空');
		sliceDocument.innerText = slice.content;
		return;
	}

	// 内容没有变动
	if (sliceDocument.innerText === slice.content) {
		return;
	}

	slice.content = sliceDocument.innerText;
	putObj(slice)
		.then(() => {
			useMessage().success('修改成功');
			getDataList();
		})
		.catch((err: any) => {
			useMessage().error(err.msg);
		});
};

// 重新训练操作
const handleRetrain = async (slice: any) => {
	try {
		await useMessageBox().confirm('确认要重新训练该切片吗？');
	} catch {
		return;
	}

	try {
		await putObj({ ...slice, sliceStatus: '0' });
		useMessage().success('已提交重新训练');
		getDataList();
	} catch (err: any) {
		useMessage().error(err.msg);
	}
};

onMounted(async () => {
	if (route.query.documentId) {
		state.queryForm.documentId = route.query.documentId;
	}

	// 查询表格数据
	await getDataList();
	//  查询知识库列表
	getDatasetList();
});
</script>
