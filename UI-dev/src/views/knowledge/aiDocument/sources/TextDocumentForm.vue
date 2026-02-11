<template>
  <el-col class="mb20">
    <el-form-item label="文件名" prop="name">
      <el-input placeholder="请输入文件名" v-model="modelValue.name"/>
    </el-form-item>
  </el-col>
  <el-col class="mb20">
    <el-form-item label="内容" prop="content">
      <el-input type="textarea" rows="10" maxlength="1800" show-word-limit placeholder="请输入文件内容" v-model="modelValue.content"/>
    </el-form-item>
  </el-col>
</template>

<script setup lang="ts">
import { PropType } from 'vue';

const props = defineProps({
  modelValue: {
    type: Object as PropType<any>,
    required: true
  }
});

defineEmits(['update:modelValue']);
</script>