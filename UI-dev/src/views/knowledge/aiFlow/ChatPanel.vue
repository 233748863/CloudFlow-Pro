<template>
  <el-drawer
    v-model="visible"
    :title="'流程运行' + id"
    :size="500"
    @close="$emit('close')"
    direction="rtl"
    class="chat-drawer">
    <div class="chat-container">
      <!-- 参数填写区域 -->
      <div class="message system-message"
           v-if="hasStartParams">
        <div class="message-content">
          <div class="param-list">
            <template v-for="(param, index) in startParams">
              <div :key="index"
                   v-if="param.type!='message'"
                   class="param-item">
                <div class="param-label"
                     :class="{ 'required': param.required }">
                  {{ param.name }}
                </div>
                <div class="param-content">
                  <input v-if="param.inputType === 'input'"
                         v-model="param.value"
                         class="param-input"
                         :class="{ 'error': showError && param.required && !param.value }"
                         :placeholder="'请输入' + param.name" />
                  <input v-else-if="param.inputType === 'number'"
                         type="number"
                         v-model.number="param.value"
                         class="param-input"
                         :class="{ 'error': showError && param.required && !param.value }"
                         :placeholder="'请输入' + param.name" />
                  <textarea v-else-if="param.inputType === 'textarea'"
                            v-model="param.value"
                            class="param-textarea"
                            :class="{ 'error': showError && param.required && !param.value }"
                            :placeholder="'请输入' + param.name"
                            rows="3"></textarea>
                  <select v-else-if="param.inputType === 'select'"
                          v-model="param.value"
                          class="param-select"
                          :class="{ 'error': showError && param.required && !param.value }">
                    <option value="">请选择{{ param.name }}</option>
                    <option v-for="option in param.options"
                            :key="option.value"
                            :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
      <!-- 聊天消息区域 -->
      <ChatMessage :messages="messageList" ref="chatMessages"/>

      <!-- 底部输入区域 -->
      <div class="chat-input">
        <div class="input-area">
          <textarea v-model="message"
                    class="chat-textarea"
                    :rows="1"
                    :disabled="parent.isRunning"
                    placeholder="输入消息提问，Enter 发送，Shift + Enter 换行"
                    @keyup.enter="handleSend"></textarea>
          <el-button class="btn-send"
                  type="primary"
                  @click.stop="handleSend"
                  :disabled="parent.isRunning"
                  :title="parent.isRunning ? '等待回复...' : '发送'">
            <el-icon>
              <Position />
            </el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import { Close, Loading, Check, CircleClose, ArrowRight, Position } from '@element-plus/icons-vue'
import NodeList from './components/NodeList.vue'
import ChatMessage from './components/ChatMessage.vue'

export default {
  name: 'ChatPanel',
  inject: ['parent'],
  components: {
    ChatMessage,
    Close,
    Loading,
    Check,
    CircleClose,
    ArrowRight,
    Position,
    NodeList
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    id: {
      type: [String, Number],
      default: ''
    },
    executionNodes: {
      type: Array,
      default: () => []
    },
    finalResult: {
      type: Object,
      default: null
    },
    executionTime: {
      type: Number,
      default: 0
    },
    totalTokens: {
      type: Number,
      default: 0
    },
    startParams: {
      type: Array,
      default: () => []
    }
  },
  data () {
    return {
      showError: false,
      message: '',
      chatHistory: []
    }
  },
  computed: {
    visible: {
      get() {
        return this.modelValue
      },
      set(value) {
        this.$emit('update:modelValue', value)
      }
    },
    hasStartParams () {
      // 过滤掉type为message的参数,只返回其他类型参数的长度
      return this.startParams && this.startParams.filter(param => param.type !== 'message').length > 0
    },
    messageList () {
      let message = []
      this.chatHistory.forEach(item => {
        message.push(item)
      })
      if (this.executionNodes.length > 0 && this.parent.isRunning) {
        message.push({
          role: 'assistant',
          nodes: this.executionNodes
        })
      }
      return message;
    }
  },
  methods: {
    handleSend () {
      if (this.parent.isRunning || !this.message.trim()) return

      let messageObj = this.startParams.find(param => param.type == 'message')
      messageObj.value = this.message

      const hasError = this.startParams.some(param => param.required && !param.value)
      this.showError = hasError

      if (hasError) {
        return
      }

      this.chatHistory.push({
        role: 'user',
        content: this.message
      })

      this.$emit('run', this.startParams)

      this.message = ''
      this.showError = false
    },

    scrollToBottom () {
      this.$nextTick(() => {
        const chatMessages = this.$refs.chatMessages.$el
        if (chatMessages) {
          chatMessages.scrollTop = chatMessages.scrollHeight
        }
      })
    },

    formatTotalTime (time) {
      if (!time) return '0ms'
      return `${Number(time).toFixed(3)}ms`
    }
  },
  watch: {
    executionNodes: {
      handler (node) {
        this.scrollToBottom()
      },
      deep: true
    },
    finalResult: {
      handler (val) {
        this.chatHistory.push({
          role: 'assistant',
          nodes: this.executionNodes,
          result: val.result
        })
        this.parent.isRunning = false
      },
      deep: true
    },
    'parent.isRunning' (newVal) {
      if (!newVal) {
        this.scrollToBottom()
      }
    }
  }
}
</script>

<style scoped lang="scss">
@use './styles/flow.scss';

.chat-drawer {
  :deep(.el-drawer__body) {
    padding: 0;
  }
}

.chat-container {
  box-sizing: border-box;
  height: calc(100vh - 80px);
  position: relative;
}

.param-title {
  font-weight: 500;
  margin-bottom: 12px;
  color: #67c23a;
}

.execution-result {
  margin-top: 20px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 4px;
  line-height: 25px;
  font-size: 12px;

  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
    padding: 8px;
    border-radius: 4px;
  }
}
.chat-input {
  position: absolute;
  bottom: 0;
  width: 100%;
}
.chat-messages {
  height: calc(100vh - 150px);
  overflow-y: auto;
}

.system-message {
  padding: 16px;

  .param-list {
    margin-bottom: 16px;
  }

  .param-item {
    margin-bottom: 12px;
    display: flex;
    align-items: center;

    .param-label {
      width: 100px;
      font-size: 14px;
      color: #606266;
      margin-bottom: 8px;
      text-align: right;
    }

    .param-content {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .param-input,
    .param-select,
    .param-textarea {
      width: 100%;
      padding: 0 12px;
      border: 1px solid #dcdfe6;
      border-radius: 4px;
      font-size: 14px;
      color: #606266;
      background-color: #fff;
      transition: border-color 0.2s;
      outline: none;
      box-sizing: border-box;

      &:hover {
        border-color: #c0c4cc;
      }

      &:focus {
        border-color: #409eff;
      }

      &::placeholder {
        color: #c0c4cc;
      }

      &.error {
        border-color: #f56c6c;
      }
    }

    .param-input,
    .param-select {
      height: 32px;
      line-height: 32px;
    }

    .param-textarea {
      min-height: 80px;
      padding: 8px 12px;
      line-height: 1.5;
      resize: vertical;
    }

    .error-tip {
      font-size: 12px;
      color: #f56c6c;
      line-height: 1.4;
      padding-left: 2px;
    }
  }
}
</style>
