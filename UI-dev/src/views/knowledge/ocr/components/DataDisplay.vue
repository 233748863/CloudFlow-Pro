<template>
	<div>
		<div class="flex justify-between items-center mb-4">
			<div class="flex gap-2 items-center">
				<el-button v-if="!isPreview" type="primary" size="small" @click="handleAddMarker">
					<el-icon><Plus /></el-icon>
					新增标记
				</el-button>
				<ModelList v-if="isPreview" modelType="Chat" />
			</div>
		</div>

		<el-table
			:data="markerList"
			style="width: 100%"
			:border="true"
			size="large"
			row-class-name="hover:bg-gray-50"
			header-row-class-name="bg-gray-50"
			@row-dblclick="handleRowDblClick"
		>
			<el-table-column prop="label" label="#" width="60" align="center">
				<template #default="{ row }">
					<el-tag size="small" effect="plain" round>{{ row.label }}</el-tag>
				</template>
			</el-table-column>

			<el-table-column prop="name" label="属性" width="120" align="center">
				<template #default="{ row }">
					<span class="font-medium">{{ row.name }}</span>
				</template>
			</el-table-column>

			<el-table-column :label="isPreview ? '标记值' : '描述'" min-width="200" show-overflow-tooltip align="left">
				<template #default="scope">
					<el-tooltip
						:content="isPreview ? scope.row.markedValue : scope.row.description"
						placement="top"
						:effect="isPreview ? 'dark' : 'light'"
						:show-after="500"
					>
						<div class="px-2 py-1">
							<span class="text-gray-600">
								{{ isPreview ? scope.row.markedValue : scope.row.description }}
							</span>
						</div>
					</el-tooltip>
				</template>
			</el-table-column>

			<el-table-column v-if="!isPreview" label="操作" width="60" fixed="right" align="center">
				<template #default="scope">
					<el-button type="danger" :icon="Delete" circle size="small" @click="handleDelete(scope.row)" />
				</template>
			</el-table-column>
		</el-table>

		<!-- 新增标记对话框 -->
		<el-dialog v-model="dialogVisible" title="新增标记" width="500px" :close-on-click-modal="false" destroy-on-close>
			<el-form :model="form" :rules="rules" ref="formRef" label-width="80px" class="py-4">
				<el-form-item label="属性" prop="name">
					<el-input v-model="form.name" placeholder="请输入属性名" clearable />
				</el-form-item>
				<el-form-item label="描述" prop="description">
					<el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入描述" show-word-limit maxlength="500" />
				</el-form-item>
			</el-form>
			<template #footer>
				<div class="dialog-footer">
					<el-button @click="dialogVisible = false">取消</el-button>
					<el-button type="primary" @click="submitForm">确认</el-button>
				</div>
			</template>
		</el-dialog>

		<!-- 编辑标记对话框 -->
		<el-dialog v-model="editDialogVisible" title="编辑标记" width="500px" :close-on-click-modal="false" destroy-on-close>
			<el-form :model="editForm" :rules="rules" ref="editFormRef" label-width="80px" class="py-4">
				<el-form-item label="属性" prop="name">
					<el-input v-model="editForm.name" placeholder="请输入属性名" clearable />
				</el-form-item>
				<el-form-item label="描述" prop="description">
					<el-input v-model="editForm.description" type="textarea" :rows="4" placeholder="请输入描述" show-word-limit maxlength="500" />
				</el-form-item>
			</el-form>
			<template #footer>
				<div class="dialog-footer">
					<el-button @click="editDialogVisible = false">取消</el-button>
					<el-button type="primary" @click="submitEditForm">确认</el-button>
				</div>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElTable, ElTableColumn, ElButton, ElTooltip, ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import { defineAsyncComponent } from 'vue';
import type { FormInstance } from 'element-plus';
import { rule } from '/@/utils/validate';

const ModelList = defineAsyncComponent(() => import('/@/views/knowledge/aiChat/components/widgets/modelList.vue'));

interface Props {
	markerList: Array<any>;
	isPreview: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'removeMarker', id: number): void;
	(e: 'editMarker', marker: any): void;
	(e: 'selectChatModel', model: any): void;
	(e: 'addMarker', marker: any): void;
}>();

const dialogVisible = ref(false);
const formRef = ref<FormInstance>();
const form = ref({
	name: '',
	description: '',
});

const rules = {
	name: [
		{ required: true, message: '请输入属性名', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
		{ validator: rule.validatorLowercase, trigger: 'blur' },
	],
	description: [
		{ required: true, message: '请输入描述', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
};

function handleAddMarker() {
	dialogVisible.value = true;
	form.value = {
		name: '',
		description: '',
	};
}

function submitForm() {
	if (!formRef.value) return;

	formRef.value.validate((valid) => {
		if (valid) {
			const newMarker = {
				id: Date.now(),
				label: (props.markerList.length + 1).toString(),
				name: form.value.name,
				description: form.value.description,
			};

			emit('addMarker', newMarker);
			dialogVisible.value = false;
			ElMessage.success('新增标记成功');
		}
	});
}

function handleDelete(row: any) {
	ElMessageBox.confirm('确认删除该标记吗？', '提示', {
		confirmButtonText: '确定',
		cancelButtonText: '取消',
		type: 'warning',
	}).then(() => {
		emit('removeMarker', row.id);
		ElMessage.success('删除成功');
	});
}

// 添加编辑相关的响应式变量
const editDialogVisible = ref(false);
const editFormRef = ref<FormInstance>();
const editForm = ref({
	id: '',
	label: '',
	name: '',
	description: '',
});

// 处理双击行事件
function handleRowDblClick(row: any) {
	if (props.isPreview) return; // 预览模式下不允许编辑

	editForm.value = {
		id: row.id,
		label: row.label,
		name: row.name,
		description: row.description,
	};
	editDialogVisible.value = true;
}

// 提交编辑表单
function submitEditForm() {
	if (!editFormRef.value) return;

	editFormRef.value.validate((valid) => {
		if (valid) {
			const updatedMarker = {
				...editForm.value,
			};

			emit('editMarker', updatedMarker);
			editDialogVisible.value = false;
			ElMessage.success('编辑标记成功');
		}
	});
}
</script>
