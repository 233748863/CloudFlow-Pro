<template>
  <el-col class="mb20">
    <el-form-item label="资料" prop="files">
      <upload-file
          :limit="1"
          @change="handleFileChange"
          :fileType="['xlsx']"
      />
      <a class="link link-primary" @click="downloadTemplate">Q&A Excel 模板下载</a>
    </el-form-item>
  </el-col>
</template>

<script setup lang="ts">
import { PropType } from 'vue';
import { downBlobFile } from "/@/utils/other";

const props = defineProps({
  modelValue: {
    type: Object as PropType<any>,
    required: true
  }
});

const emit = defineEmits(['update:modelValue']);

const handleFileChange = (fileNames: string, fileList: any[]) => {
  emit('update:modelValue', fileList);
}

const downloadTemplate = () => {
  downBlobFile('/admin/sys-file/local/file/qa.xlsx', {}, 'Q&A.xlsx');
};
</script>
