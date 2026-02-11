<template>
  <el-dialog v-model="audioVisible" destroy-on-close>
    <tapir-widget :time="0.2" :backendEndpoint="backendEndpoint"
                  title="音频交互"
                  instructionMessageStart="点击开始录音"
                  instructionMessageStop="点击停止录音"
                  listenInstructions="播放您的录音"
                  successMessageRecorded="录音成功"
                  successMessageSubmitted="上传成功"
                  :successfulUpload="successfulUpload"
                  submitLabel="点击识别"
                  buttonColor="border border-primary"/>
  </el-dialog>
</template>
<script setup lang="ts" name="AiPromptsDialog">
// @ts-ignore
import TapirWidget from 'vue-audio-record';
import 'vue-audio-record/dist/vue-audio-tapir.css';
import {Session} from "/@/utils/storage";

const emit = defineEmits(['refresh']);
const audioVisible = ref(false)

/**
 * 从会话存储中获取访问令牌
 * @returns {string} 访问令牌
 */
const token = computed(() => {
  return Session.getToken();
});
/**
 * 从会话存储中获取访问租户
 * @returns {string} 租户
 */
const tenant = computed(() => {
  return Session.getTenant();
});

const backendEndpoint = computed(() => {
  return `${import.meta.env.VITE_API_URL}${import.meta.env.VITE_IS_MICRO == 'false' ? '/admin' : '/knowledge'}/chat/audio?access_token=${token.value}&TENANT-ID=${tenant.value}`
})


const successfulUpload = async (response: any) => {
  audioVisible.value = false
  const {data} = await response.json()
  emit('refresh', JSON.parse(data).text);
}


/**
 * 打开提示词选择界面.
 */
const openDialog = () => {
  audioVisible.value = true
}

// Expose the openDialog function
defineExpose({
  openDialog
});
</script>
