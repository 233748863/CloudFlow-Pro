<template>
	<el-drawer title="字段评估" v-model="visible" size="100%" :close-on-click-modal="false" direction="rtl" @closed="onDrawerClosed">
		<template #header>
			<div class="drawer-header">
				<span>字段评估</span>
			</div>
		</template>

		<el-tabs v-model="activeTab" type="card" class="demo-tabs">
			<el-tab-pane v-for="tableName in tableNames" :key="tableName" :label="tableName" :name="tableName">
				<el-button plain type="primary" @click="handleSync(tableName)" :loading="syncLoading" class="mb-2">
					<el-icon><Refresh /></el-icon> 同步
				</el-button>
				<el-button plain type="success" @click="handleAssess(tableName)" :loading="assessLoading" class="mb-2 ml-2">
					<el-icon><Connection /></el-icon> 评估
				</el-button>
				<el-button plain type="info" @click="handleRefresh(tableName)" :loading="refreshLoading" class="mb-2 ml-2">
					<el-icon><CircleCheck /></el-icon> 刷新
				</el-button>
				<sc-form-table ref="fieldTable" v-model="fieldLists[tableName]" :hideAdd="true" :hideDelete="true" drag-sort placeholder="暂无数据">
					<el-table-column label="主键" prop="primaryPk" width="80" show-overflow-tooltip>
						<template #default="{ row }">
							<el-checkbox v-model="row.primaryPk" true-label="1" false-label="0" disabled></el-checkbox>
						</template>
					</el-table-column>
					<el-table-column label="字段名称" prop="fieldName" width="150" show-overflow-tooltip></el-table-column>
					<el-table-column label="字段备注" prop="fieldComment" show-overflow-tooltip></el-table-column>
					<el-table-column label="虚拟备注" prop="virtualComment" show-overflow-tooltip>
						<template #default="{ row }">
							<el-input v-model="row.virtualComment" placeholder="请输入虚拟备注"></el-input>
						</template>
					</el-table-column>
					<el-table-column label="字段类型" width="150" prop="fieldType" show-overflow-tooltip></el-table-column>
					<el-table-column label="修正状态" width="150" prop="modifyStatus" show-overflow-tooltip>
						<template #default="{ row }">
							<dict-tag :options="yes_no_type" :value="row.modifyStatus"></dict-tag>
						</template>
					</el-table-column>
				</sc-form-table>
			</el-tab-pane>
		</el-tabs>

		<template #footer>
			<span class="dialog-footer">
				<el-button @click="visible = false">取消</el-button>
				<el-button type="primary" @click="onSubmit" :disabled="loading">保存</el-button>
			</span>
		</template>
	</el-drawer>
</template>

<script setup lang="ts" name="AiDataTableFieldDialog">
import { fetchByTableId, syncByTableId, batchUpdateObj, assessByTableId } from '/@/api/knowledge/aiDataField';
import { getObj } from '/@/api/knowledge/aiData';
import { useMessage } from '/@/hooks/message';
import { useDict } from '/@/hooks/dict';
import Sortable from 'sortablejs';
import { Refresh, Connection, CircleCheck } from '@element-plus/icons-vue';

const emit = defineEmits(['refresh']);

// 引入组件
const scFormTable = defineAsyncComponent(() => import('/@/components/FormTable/index.vue'));

// 定义变量内容
const visible = ref(false);
const loading = ref(false);
const syncLoading = ref(false);
const assessLoading = ref(false);
const refreshLoading = ref(false);
const recordId = ref('');
const dsName = ref(''); // 添加数据源名称变量
const tableNames = ref<string[]>([]);
const activeTab = ref('');
const fieldLists = ref<{ [key: string]: any[] }>({});
const sortables = ref<{ [key: string]: any }>({});
const isDataTable = ref(false); // 标识是否是数据表视图

// 字典
const { yes_no_type } = useDict('yes_no_type');

// 启用行拖拽排序
const rowDrop = (tableName: string) => {
	nextTick(() => {
		const el: any = document.querySelector(`#tab-${tableName} .form-table`);
		if (!el) return;

		sortables.value[tableName] = Sortable.create(el.querySelector('.el-table__body-wrapper tbody'), {
			handle: '.drag-btn',
			onEnd: (e: any) => {
				const { newIndex, oldIndex } = e;
				const currRow = fieldLists.value[tableName].splice(oldIndex, 1)[0];
				fieldLists.value[tableName].splice(newIndex, 0, currRow);
			},
		});
	});
};

/**
 * 打开弹窗
 * @param dataSource 数据源名称
 * @param tables 表名数组
 * @param isTable 是否是数据表视图，默认false表示是数据集视图
 */
const openDialog = async (dataSource: string, tables?: string[], isTable: boolean = false) => {
	visible.value = true;
	dsName.value = dataSource; // 保存数据源名称
	recordId.value = dataSource; // 为了兼容原有逻辑，也保存在recordId中
	fieldLists.value = {};
	isDataTable.value = isTable;

	// 根据不同的模式处理表名
	if (isTable) {
		// 数据表模式
		tableNames.value = tables && tables.length > 0 ? tables : [''];
	} else {
		// 数据集模式，如果没有提供表名数组或为空数组，则从API获取
		if (!tables || tables.length === 0) {
			try {
				const res = await getObj(dataSource);
				if (res.data && res.data.tableName && Array.isArray(res.data.tableName)) {
					tableNames.value = res.data.tableName;
				} else {
					tableNames.value = [];
					useMessage().warning('没有关联的数据表');
					return;
				}
			} catch (err: any) {
				useMessage().error(err.msg || '获取数据集信息失败');
				tableNames.value = [];
				return;
			}
		} else {
			tableNames.value = tables;
		}
	}

	// 设置激活的标签为第一个表（如果存在表的话）
	if (tableNames.value.length > 0) {
		activeTab.value = tableNames.value[0];

		// 加载每个表的字段数据
		tableNames.value.forEach((tableName) => {
			getFieldList(dataSource, tableName);
		});
	}
};

// 同步字段
const handleSync = async (tableName: string) => {
	if (!dsName.value || !tableName) return;

	try {
		syncLoading.value = true;
		// 调用后台同步接口
		await syncByTableId(dsName.value, tableName);
		// 同步成功后重新获取字段列表
		await getFieldList(dsName.value, tableName);
		useMessage().success('同步成功');
	} catch (err: any) {
		useMessage().error(err.msg || '同步失败');
	} finally {
		syncLoading.value = false;
	}
};

// 评估字段
const handleAssess = async (tableName: string) => {
	if (!dsName.value || !tableName) return;

	try {
		assessLoading.value = true;
		// 调用后台评估接口
		await assessByTableId(dsName.value, tableName);
		// 评估成功后重新获取字段列表
		await getFieldList(dsName.value, tableName);
		useMessage().success('字段正在评估中，请稍后刷新');
	} catch (err: any) {
		useMessage().error(err.msg || '评估失败');
	} finally {
		assessLoading.value = false;
	}
};

// 刷新字段
const handleRefresh = async (tableName: string) => {
	if (!dsName.value || !tableName) return;

	try {
		refreshLoading.value = true;
		// 直接重新获取字段列表
		await getFieldList(dsName.value, tableName);
		useMessage().success('刷新成功');
	} catch (err: any) {
		useMessage().error(err.msg || '刷新失败');
	} finally {
		refreshLoading.value = false;
	}
};

// 获取字段列表
const getFieldList = (dataSource: string, tableName: string) => {
	loading.value = true;
	return fetchByTableId(dataSource, tableName)
		.then((res: any) => {
			fieldLists.value[tableName] = res.data || [];
			nextTick(() => {
				rowDrop(tableName);
			});
		})
		.catch((err: any) => {
			useMessage().error(err.msg || '获取字段列表失败');
			return Promise.reject(err);
		})
		.finally(() => {
			loading.value = false;
		});
};

// 关闭抽屉并触发刷新
const closeDrawer = () => {
	visible.value = false;
	emit('refresh');
};

// 提交表单
const onSubmit = async () => {
	try {
		loading.value = true;
		// 使用批量更新接口更新所有表的字段
		for (const tableName of tableNames.value) {
			if (fieldLists.value[tableName] && fieldLists.value[tableName].length > 0) {
				await batchUpdateObj(fieldLists.value[tableName]);
			}
		}
		useMessage().success('保存成功');
		closeDrawer();
	} catch (err: any) {
		useMessage().error(err.msg || '保存失败');
	} finally {
		loading.value = false;
	}
};

// 当抽屉关闭时触发刷新事件
const onDrawerClosed = () => {
	emit('refresh');
};

// 暴露变量
defineExpose({
	openDialog,
	closeDrawer,
});
</script>

<style lang="scss">
.drawer-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	width: 100%;
}

.sortable-row-gen .drag-btn {
	cursor: move;
	font-size: 12px;
}

.sortable-row-gen .vxe-body--row.sortable-ghost,
.sortable-row-gen .vxe-body--row.sortable-chosen {
	background-color: #dfecfb;
}

.demo-tabs > .el-tabs__content {
	padding: 0 32px 32px 32px;
	color: #6b778c;
	font-size: 32px;
	font-weight: 600;
}
</style>
