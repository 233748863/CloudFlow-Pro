<template>
	<el-card class="mb-3 h-full rounded shadow-sm">
		<template #header>
			<div class="flex justify-between items-center">
				<span class="text-sm font-medium">{{ $t('poster.templateSelection') }}</span>
			</div>
		</template>

		<div class="flex overflow-hidden flex-col h-full">
			<el-input v-model="searchQuery" placeholder="模板名称" prefix-icon="Search" clearable class="mb-3 text-xs" @input="handleSearch" />
			<el-scrollbar class="flex-1">
				<div class="grid grid-cols-1 gap-3 px-1 py-1">
					<el-tooltip
						v-for="template in templates"
						:key="template.id"
						:content="template.templateName"
						placement="right"
						:disabled="template.templateName.length < 10"
					>
						<div
							:class="[
								'relative rounded-lg border p-3 cursor-pointer overflow-hidden transition-all hover:shadow-md flex items-center',
								currentTemplate === template.id
									? 'border-primary-500 bg-primary-50 ring-1 ring-primary-300'
									: 'border-gray-200 hover:border-primary-400 hover:bg-gray-50',
							]"
							@click="selectTemplate(template)"
						>
							<div class="flex-1">
								<p class="text-sm font-medium truncate">{{ template.templateName }}</p>
							</div>
							<el-icon v-if="currentTemplate === template.id" class="ml-2 text-primary-500"><Check /></el-icon>
						</div>
					</el-tooltip>
				</div>

				<!-- Loading State -->
				<div v-if="isLoading" class="flex justify-center items-center py-4">
					<el-skeleton :rows="3" :loading="isLoading" animated />
				</div>

				<!-- Empty State -->
				<el-empty v-if="templates.length === 0 && !isLoading" :description="$t('poster.noTemplatesFound')" :image-size="80"></el-empty>
			</el-scrollbar>
		</div>
	</el-card>
</template>

<script setup lang="ts" name="TemplateSelector">
import { useI18n } from 'vue-i18n';
import { fetchList } from '/@/api/knowledge/aiPoster';
import { Check } from '@element-plus/icons-vue';

// Use i18n for internationalization
useI18n();

// Define template interface
interface Template {
	id: string;
	templateName: string;
}

const currentTemplate = ref('');
const templates = ref<Template[]>([]);
const searchQuery = ref('');
const isLoading = ref(false);

const emit = defineEmits<{
	(e: 'select-template', template: Template): void;
}>();

// Fetch templates from API
const getTemplates = async (query?: string) => {
	try {
		isLoading.value = true;
		const params = query ? { templateName: query } : {};
		const { data } = await fetchList(params);
		templates.value = data;

		// If templates are available, select the first one
		if (templates.value.length > 0 && !currentTemplate.value) {
			selectTemplate(templates.value[0]);
		}
	} catch (error) {
		// Error handling without console.error
	} finally {
		isLoading.value = false;
	}
};

// Select template
const selectTemplate = (template: Template) => {
	currentTemplate.value = template.id;
	emit('select-template', template);
};

// Handle search input changes
const handleSearch = () => {
	getTemplates(searchQuery.value);
};

onMounted(() => {
	getTemplates();
});
</script>
