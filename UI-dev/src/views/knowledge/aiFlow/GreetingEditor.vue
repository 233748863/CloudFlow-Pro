<template>

  <!-- 开场白和开场问题编辑器 -->
  <el-dialog
    v-model="dialogVisible"
    title="提示词"
    width="600px"
    :show-footer="false"
  >
    <div class="greeting-editor">
      <!-- 开场白编辑区 -->
      <div class="greeting-section">
        <div class="section-title">
          <div class="title-with-help">
            <span>聊天开场白</span>
            <el-tooltip content="开场白会在用户进入对话时首先展示，用于介绍AI助手的功能和特点。"
                        placement="top">
              <el-icon class="help-icon">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </div>
        <el-input
          v-model="form.greeting"
          type="textarea"
          :rows="5"
          class="greeting-input"
          placeholder="在这里编写AI助手的开场白"
        />
      </div>

      <!-- 开场问题编辑区 -->
      <div class="questions-section">
        <div class="section-title">
          <div class="title-with-help">
            <span>开场问题</span>
            <div class="question-count">{{ form.questions.length }}/10</div>
            <el-tooltip content="设置常见问题示例，帮助用户快速开始对话。最多可设置10个问题。"
                        placement="top">
              <el-icon class="help-icon">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
          <el-button 
            type="primary"
            class="add-question"
            @click="addQuestion"
            :disabled="form.questions.length >= 10"
            size="small"
          >
            <el-icon class="icon-plus">
              <Plus />
            </el-icon>
            添加
          </el-button>
        </div>
        <div class="questions-list">
          <div v-for="(question, index) in form.questions"
               :key="index"
               class="question-item">
            <el-input
              v-model="question.text"
              class="question-input"
              :placeholder="'问题 ' + (index + 1)"
            />
            <el-button
              @click="removeQuestion(index)"
              type="danger"
              :icon="Delete"
              circle
              size="small"
            />
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch, inject } from 'vue'
import { QuestionFilled, Plus, Delete } from '@element-plus/icons-vue'

// 注入parent
const parent = inject('parent')

// 定义组件属性
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})


// 定义事件
const emit = defineEmits(['update:modelValue'])

// 对话框显示状态
const dialogVisible = ref(props.modelValue)


const form = ref({
  questions: []
})

// 监听modelValue的变化
watch(() => props.modelValue, (newVal) => {
  form.value = parent.dsl;
  form.value.questions=form.value.questions || []
  dialogVisible.value = newVal
})

// 监听dialogVisible的变化
watch(() => dialogVisible.value, (newVal) => {
  emit('update:modelValue', newVal)
})


// 添加问题
const addQuestion = () => {
  if (form.value.questions.length < 10) {
    form.value.questions.push({ text: '' })
  }
}

// 删除问题
const removeQuestion = (index) => {
  form.value.questions.splice(index, 1)
}

</script>

<style lang="scss" scoped>
.greeting-editor {
  .greeting-section,
  .questions-section {
    margin-bottom: 20px;
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;

    .title-with-help {
      display: flex;
      align-items: center;
      gap: 8px;

      .help-icon {
        font-size: 16px;
        color: #909399;
        cursor: help;
      }

      .question-count {
        font-size: 12px;
        color: #909399;
        margin: 0 8px;
      }
    }
  }

  .greeting-input {
    :deep(.el-textarea__inner) {
      min-height: 60px;
      max-height: 120px;
    }
  }

  .questions-list {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .question-item {
      display: flex;
      align-items: center;
      gap: 8px;

      .question-input {
        flex: 1;
      }
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style> 