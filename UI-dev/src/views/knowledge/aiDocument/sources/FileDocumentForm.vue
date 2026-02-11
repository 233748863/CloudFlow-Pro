<template>
	<el-col class="mb20">
		<el-form-item label="资料" prop="files">
			<upload-file :limit="fileLimit" :fileSize="fileSize" :fileType="fileType" @change="handleFileChange" />
		</el-form-item>
	</el-col>
</template>

<script setup lang="ts">
const emit = defineEmits(['update:modelValue']);


const props = defineProps({
	modelValue: {
		type: Object,
	},
});

// 单此上传文件数量限制
const fileLimit = ref(5);
// 单个文件大小限制
const fileSize = ref(10);
// 文件类型限制
const fileType = ref(['jpeg', 'png', 'jpg', 'gif', 'md', 'doc', 'xls', 'ppt', 'txt', 'pdf', 'docx', 'xlsx', 'pptx']);

const handleFileChange = (fileNames: string, fileList: any[]) => {
	emit('update:modelValue', fileList);
};
</script>
