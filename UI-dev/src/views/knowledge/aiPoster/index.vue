<template>
	<div class="p-2">
		<el-row :gutter="10">
			<!-- Left Column: Template Selection - 30% -->
			<el-col :span="7">
				<TemplateSelector :currentTemplate="currentTemplate" @select-template="selectTemplate" />
			</el-col>

			<!-- Middle Column: Poster Form - 40% -->
			<el-col :span="10">
				<PosterForm :formData="formData" :generating="generating" @generate-poster="generatePoster" @reset-form="resetForm" />
			</el-col>

			<!-- Right Column: Poster Preview - 30% -->
			<el-col :span="7">
				<PosterPreview :posterGenerated="posterGenerated" :templateCode="templateCode" @export-poster="exportPoster" ref="posterPreviewRef" />
			</el-col>
		</el-row>
	</div>
</template>

<script setup lang="ts" name="AiPost">
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';

// Import components
import TemplateSelector from './components/TemplateSelector.vue';
import PosterForm from './components/PosterForm.vue';
import PosterPreview from './components/PosterPreview.vue';
import { generate } from '/@/api/knowledge/aiPoster';
import { Session } from '/@/utils/storage';

// Use i18n
const { t } = useI18n();

// Form data
const formData = reactive({
	content: '',
	qrCode: '',
});

// Template selection
const currentTemplate = ref<string>('1');
const templateCode = ref<string>('');
const posterGenerated = ref<boolean>(false);
const generating = ref<boolean>(false);
const posterPreviewRef = ref<InstanceType<typeof PosterPreview> | null>(null);

// Select template
const selectTemplate = (template: any) => {
	currentTemplate.value = template.id;
	templateCode.value = template.templateCss + template.templateCode;
	console.log(templateCode.value);
};

const baseURL = import.meta.env.VITE_API_URL;

// SSE生成
const generatePoster = () => {
	if (!formData.content) {
		ElMessage.warning(t('poster.emptyDescription'));
		return;
	}
	generating.value = true;
	templateCode.value = '';
	let data = { templateId: currentTemplate.value, prompt: formData.content, qrCode: baseURL + formData.qrCode };
	fetchEventSource(`${baseURL}/admin/aiPoster/generate`, {
		method: 'POST',
		headers: {
			Authorization: 'Bearer ' + Session.getToken(),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(data),
		openWhenHidden: true,
		onmessage(msg: EventSourceMessage) {
			posterGenerated.value = true;
			let json = JSON.parse(msg.data);
			templateCode.value += json.message;
		},
		onclose() {
			ElMessage.success(t('poster.generateSuccess'));
			generating.value = false;
		},
		onerror(err: any) {
			generating.value = false;
			ElMessage.error(t('poster.generate') + err);
			throw err;
		},
	});
};

// Reset form
const resetForm = () => {
	formData.content = '';
	posterGenerated.value = false;
};

// Export poster as image
const exportPoster = () => {
	if (posterPreviewRef.value) {
		posterPreviewRef.value.exportPoster();
	}
};
</script>
