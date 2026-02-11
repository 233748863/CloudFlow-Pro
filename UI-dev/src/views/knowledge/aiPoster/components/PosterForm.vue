<template>
	<el-card class="mb-5 h-full rounded-lg">
		<template #header>
			<div class="flex justify-between items-center">
				<span>{{ $t('poster.promptSettings') }}</span>
			</div>
		</template>

		<!-- Prompt input -->
		<el-form :model="formData" label-position="top" ref="formRef" :rules="rules">
			<el-form-item :label="$t('poster.content')" prop="content">
				<el-input v-model="formData.content" type="textarea" :rows="10" placeholder="请输入海报内容" />
			</el-form-item>

			<!-- QR Code upload -->
			<el-form-item :label="$t('poster.qrcode')" prop="qrCode">
				<Upload-Image v-model:imageUrl="formData.qrCode" :width="'120px'" :height="'120px'" :border-radius="'4px'" :file-size="2" dir="poster">
					<template #tip>
						<div class="el-upload__tip">
							{{ $t('poster.qrcodeTip') }}
						</div>
					</template>
				</Upload-Image>
			</el-form-item>

			<el-form-item>
				<el-button type="primary" @click="onGeneratePoster" :loading="generating" :disabled="generating">
					{{ $t('poster.generate') }}
				</el-button>
				<el-button @click="onResetForm" :disabled="generating">{{ $t('common.resetBtn') }}</el-button>
				<el-text v-if="generating" class="ml-2" type="info">{{ $t('poster.generatingTip') }}</el-text>
			</el-form-item>
		</el-form>
	</el-card>
</template>

<script setup lang="ts" name="PosterForm">
import { ref } from 'vue';
import UploadImage from '/@/components/Upload/Image.vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { min } from 'lodash';

interface FormData {
	content: string;
	qrCode: string;
}

defineProps<{
	formData: FormData;
	generating: boolean;
}>();

const emit = defineEmits<{
	(e: 'generate-poster'): void;
	(e: 'reset-form'): void;
	(e: 'update:formData', formData: FormData): void;
}>();

const formRef = ref<FormInstance>();

const { t } = useI18n();

const rules = ref<FormRules>({
	content: [
		{ required: true, message: '请输入海报内容', trigger: 'blur' },
		{ min: 50, max: 500, message: '请输入50-500个字符', trigger: 'blur' },
	],
	qrCode: [{ required: true, message: '请上传二维码', trigger: 'change' }],
});

const onGeneratePoster = () => {
	if (!formRef.value) return;

	formRef.value.validate((valid) => {
		if (valid) {
			ElMessage.info({ message: t('poster.waitingMessage'), duration: 5000 });
			emit('generate-poster');
		}
	});
};

const onResetForm = () => {
	if (formRef.value) {
		formRef.value.resetFields();
	}
	emit('reset-form');
};
</script>
