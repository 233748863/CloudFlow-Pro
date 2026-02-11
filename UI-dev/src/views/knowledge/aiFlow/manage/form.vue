<template>
	<el-dialog :title="dialogTitle" v-model="dialogVisible" :width="650" :close-on-click-modal="false" draggable>
		<el-form :ref="(ref: any) => formRef = ref" :model="formData" :rules="formRules" label-width="90px" label-position="top" v-loading="loading">
			<el-form-item label="编排名称" prop="name">
				<el-input v-model="formData.name" placeholder="请输入编排名称"></el-input>
			</el-form-item>
			<el-form-item label="编排描述" prop="description">
				<el-input
					v-model="formData.description"
					type="textarea"
					placeholder="描述该编排的应用场景及用途，如：XXX 小助手回答用户提出的 XXX 产品使用问题"
				></el-input>
			</el-form-item>
			<el-form-item v-if="dialogType === 'add'" label="选择应用类型" prop="type">
				<el-radio-group v-model="formData.type" class="flex gap-3 w-full">
					<el-radio :label="EOrchestrationType.WORK_FLOW" size="large" border class="!h-auto flex-1 m-0">
						<div class="py-2">
							<div class="leading-6 text-gray-500 text-md">高级编排</div>
							<div class="text-sm leading-5 text-gray-400">适合高级用户自定义AI业务流</div>
						</div>
					</el-radio>
				</el-radio-group>
			</el-form-item>
		</el-form>
		<template #footer>
			<span class="dialog-footer">
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" @click="submitHandle" :disabled="loading">
					<template v-if="dialogType === 'copy'">复制</template>
					<template v-else>确认</template>
				</el-button>
			</span>
		</template>
	</el-dialog>
</template>
<script setup lang="ts">
import {
	IOrchestrationScope,
	fetchOrchestrationScope,
	fetchList,
	orchestrationRemove,
	IOrchestrationItem,
	EOrchestrationType,
	addObj,
	getObj,
	putObj,
	orchestrationExportContent,
	orchestrationImportContent,
} from '/@/api/knowledge/aiFlow';
import { cloneDeep, merge, pick } from 'lodash';
import { useMessage, useMessageBox } from '/@/hooks/message';
import { FormRules } from 'element-plus';
import { rule } from '/@/utils/validate';
type IItem = IOrchestrationItem & { originId?: string } /* 用于复制时，存储原始id */;
interface State {
	dialogVisible: boolean;
	loading: boolean;
	dialogType: 'add' | 'edit' | 'copy';
	formData: IItem;
	formRules: FormRules<IOrchestrationItem>;
	formRef: any;
}

const getDefaultFormData = (obj?: Partial<IItem>): IItem => {
	return merge(
		{
			id: undefined,
			name: '',
			description: '',
			type: EOrchestrationType.WORK_FLOW,
		},
		obj || {}
	);
};

const emit = defineEmits(['refresh']);

const state = reactive<State>({
	dialogVisible: false,
	loading: false,
	formData: getDefaultFormData(),
	dialogType: 'add',
	formRules: {
		name: [
			{ required: true, message: '请输入编排名称', trigger: 'blur' },
			{ validator: rule.overLength, trigger: 'blur' },
		],
		description: [{ validator: rule.overLength, trigger: 'blur' }],
	},
	formRef: undefined,
});

const { dialogVisible, loading, formData, formRules, formRef, dialogType } = toRefs(state);

const dialogTitle = computed(() => {
	switch (state.dialogType) {
		case 'copy':
			return '复制';
		case 'edit':
			return '编辑';
		default:
			return '新增';
	}
});

/**
 * @description  : 初始化表单
 * @param         {any} id
 * @return        {any}
 */
async function init(id?: string) {
	state.loading = true;
	state.formData = getDefaultFormData({ id });
	state.formRef.resetFields();
	try {
		if (state.dialogType !== 'add' && id) {
			const res = await getObj(id);
			if (state.dialogType === 'copy') {
				state.formData = {
					...pick(res.data, ['name', 'description']),
					originId: id,
				};
			} else {
				state.formData = getDefaultFormData(res.data);
			}
		}
	} catch (e: any) {
		useMessage().error(e.message || '系统异常请联系管理员');
	}
	state.loading = false;
}

/**
 * @description  : 提交表单
 * @return        {any}
 */
async function submitHandle() {
	const valid = await state.formRef.validate().catch(() => {});
	if (!valid) return false;
	state.loading = true;
	const form = cloneDeep(state.formData);
	try {
		if (state.dialogType === 'add') {
			await addObj(form);
		} else if (state.dialogType === 'copy') {
			await copy(form.originId as string, pick(form, ['name', 'description']));
		} else {
			await putObj(form);
		}
		useMessage().success(dialogTitle.value + '成功');
		state.dialogVisible = false;
		emit('refresh');
	} catch (e: any) {
		useMessage().error(e.message || '系统异常请联系管理员');
	}
	state.loading = false;
}

defineExpose({
	/**
	 * @description  : 打开 dialog 窗口，并初始化窗口
	 * @param         {string} id
	 * @param         {'add' | 'edit' | 'copy'} type  默认 add
	 * @return        {any}
	 */
	openDialog: async (id?: string, type: 'add' | 'edit' | 'copy' = 'add') => {
		if (!['add', 'edit', 'copy'].includes(type)) {
			useMessageBox().error('type参数错误');
			return false;
		}
		dialogVisible.value = true;
		state.dialogType = type;
		await nextTick();
		init(id);
	},
});
</script>
<style lang="scss"></style>
