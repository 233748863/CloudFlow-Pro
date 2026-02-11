<template>
  <el-dialog
      v-model="dialogVisible"
      title="选择挂载方式"
      width="50%"
      :modal="false"
  >
    <div>
      <el-card size="mini">
        <el-row :gutter="10" justify="center">
          <el-col :span="8">
            <div :class="selectedMethod === 1 ? 'img-selected' : 'img-unselect'" @click="selectImg(1)">
              <div class="css-1awpln7">
                <div class="css-0">
                  <img alt="" src="/@/assets/ai/link.svg" class="chakra-image css-0">
                </div>
              </div>
            </div>
          </el-col>
          <el-col :span="8">
            <div :class="selectedMethod === 2 ? 'img-selected' : 'img-unselect'" @click="selectImg(2)">
              <div class="css-1awpln7">
                <div class="css-0">
                  <img alt="" src="/@/assets/ai/iframe.svg" class="chakra-image css-0">
                </div>
              </div>
            </div>
          </el-col>
          <el-col :span="8">
            <div :class="selectedMethod === 3 ? 'img-selected' : 'img-unselect'" @click="selectImg(3)">
              <div class="css-1awpln7">
                <div class="css-0">
                  <img alt="" src="/@/assets/ai/script.svg" class="chakra-image css-0">
                </div>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </div>
    <div>
      <el-card size="mini" body-class="card-class">
        <template #header>
          <div class="card-header">
            <div v-if="selectedMethod === 1">
              <span>将下面链接复制到浏览器打开</span>
              <span>
                <el-button style="float: right" class="ml-2" type="primary" @click="openText(url())">打开</el-button>
                <el-button style="float: right" type="primary" @click="copyText(url())">复制</el-button>
              </span>
            </div>
            <div v-if="selectedMethod === 2">
              <span>复制下面 Iframe 加入到你的网站中</span>
              <span>
                <el-button style="float: right" type="primary" @click="copyText(iframe())">复制</el-button>
              </span>
            </div>
            <div v-if="selectedMethod === 3">
              <span>将下面代码加入到你的网站中</span>
              <span>
                <el-button style="float: right" type="primary" @click="copyText(script())">复制</el-button>
              </span>
            </div>
          </div>
        </template>
        <span v-if="selectedMethod === 1">
          <div class="mockup-code">
            <pre data-prefix="$"><code> {{ url() }}</code></pre>
          </div>
        </span>
        <span v-if="selectedMethod === 2">
          <div class="mockup-code">
            <pre data-prefix="$"><code> {{ iframe() }}</code></pre>
          </div>
        </span>
        <span v-if="selectedMethod === 3">
          <div class="mockup-code">
            <pre data-prefix="$"><code> {{ script() }}</code></pre>
          </div>
        </span>
      </el-card>
    </div>
  </el-dialog>
</template>

<script setup lang="ts" name="AiDatasetDialog">
import commonFunction from "/@/utils/commonFunction";

const emit = defineEmits(['refresh']);
const {copyText} = commonFunction();

const left_right = [
  {
    label: '左侧',
    value: 'left',
  },
  {
    label: '右侧',
    value: 'right',
  }
]

const top_bottom = [
  {
    label: '顶部',
    value: 'top',
  },
  {
    label: '底部',
    value: 'bottom',
  }
]
const dialogVisible = ref(false)
const selectedDatasetId = ref()
const selectedMethod = ref(1)
const data_btn_x = ref(16)
const data_btn_y = ref(16)
const data_stream = ref(true)
const data_direction_x = ref('right')
const data_direction_y = ref('bottom')
const openDialog = (datasetid: any) => {
  dialogVisible.value = true
  selectedDatasetId.value = datasetid
}

const currentHostname = window.location.origin;
const openImageBase64 = ref("")
const closeImageBase64 = ref("")

function handleOpenIconBeforeUpload(file: Blob) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = e => {
    // 在这里处理 Base64 数据
    openImageBase64.value = e.target.result
  };
  return false;
}

function handleCloseIconBeforeUpload(file: Blob) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = e => {
    // 在这里处理 Base64 数据
    closeImageBase64.value = e.target.result
  };
  return false;
}


const isMicro = import.meta.env.VITE_IS_MICRO === 'true' ? 1 : 0

const script = () => {
  return `<script id="chatbot-iframe" src="${currentHostname}/bot/embed.min.js?t=${Date.now()}" data-bot-src="${currentHostname}/bot/index.html#/${isMicro}/${selectedDatasetId.value}/chat" async defer><\/script>`
}

const iframe = () => {
  return `<iframe src="${currentHostname}/bot/bot/index.html#/${isMicro}/${selectedDatasetId.value}/chat" style="width: 100%; height: 100%;" frameborder="0" allow="microphone"/>`
}

const url = () => {
  return `${currentHostname}/bot/index.html#/${isMicro}/${selectedDatasetId.value}/chat`
}
const selectImg = (index: number) => {
  selectedMethod.value = index
}

const openText = (url: string) => {
  window.open(url)
}

// 暴露变量
defineExpose({
  openDialog
});
</script>

<style scoped>
.img-unselect {
  display: flex;
  -webkit-box-align: center;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border: 1.5px solid rgb(232, 235, 240);
  border-radius: 5px;
  position: relative;
  background: #fbfbfc;
  padding: 0px !important;
}

.img-unselect:hover {
  border-color: #1dbcd8;
}

.img-selected {
  display: flex;
  -webkit-box-align: center;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-style: solid;
  border-image: initial;
  border-width: 1.5px;
  border-radius: 5px;
  position: relative;
  border-color: #1dbcd8;
  background: #f0f4ff;
  padding: 0px !important;
}

.card-class {
  background-color: #F4F4F7;
}
</style>
