<template>
  <!-- 对话详情抽屉 -->
  <el-drawer v-model="visible"
             title="对话详情"
             size="500"
             :before-close="handleClose"
             class="chat-detail-drawer">
    <div v-loading="loading">
      <ChatMessage :messages="messages"
                   v-if="messages.length > 0"
                   ref="messageContainer" />
      <el-empty v-else
                description="暂无对话记录">
      </el-empty>
    </div>
  </el-drawer>
</template>

<script>
import { marked } from 'marked'
import { Cpu } from '@element-plus/icons-vue'
import ChatMessage from './ChatMessage.vue'
export default {
  name: 'ChatDetail',
  components: {
    Cpu,
    ChatMessage
  },

  props: {
    // 对话ID
    conversationId: {
      type: [String, Number],
      default: ''
    },
    // 是否显示弹窗
    modelValue: {
      type: Boolean,
      default: false
    }
  },

  data () {
    return {
      loading: false,
      messages: []
    }
  },

  computed: {
    visible: {
      get () {
        return this.modelValue
      },
      set (val) {
        this.$emit('update:modelValue', val)
      }
    }
  },

  watch: {
    conversationId: {
      handler (val) {
        if (val) {
          this.loadMessages()
        }
      },
      immediate: true
    }
  },

  methods: {
    // 加载消息列表
    async loadMessages () {
      if (!this.conversationId) return

      this.loading = true
      try {
        const res = null
        this.messages = res.data.data.records || []
      } catch (error) {
        console.error('加载消息失败:', error)
        this.$message.error('加载消息失败')
      } finally {
        this.loading = false
      }
    },

    // 解析 Markdown
    parseMarkdown (text) {
      if (!text) return ''
      return marked(text)
    },

    // 关闭弹窗
    handleClose () {
      this.visible = false
    },

    /**
     * 处理消息编辑事件
     * @param {Object} data - 包含索引和更新后消息的对象
     */
    handleMessageEdited(data) {
      // 更新消息数组中的消息
      if (data && data.index >= 0 && data.index < this.messages.length) {
        this.messages[data.index] = data.message;

        // 发送更新事件给父组件
        this.$emit('message-updated', this.messages);
      }
    },

    /**
     * 处理消息删除事件
     * @param {Number} index - 要删除的消息索引
     */
    handleMessageDeleted(index) {
      // 从消息数组中删除消息
      if (index >= 0 && index < this.messages.length) {
        this.messages.splice(index, 1);

        // 发送更新事件给父组件
        this.$emit('message-updated', this.messages);
      }
    }
  }
}
</script>

<style lang="scss">

.chat-detail-drawer {
  .el-drawer__body{
    padding: 0;
  }
}
</style>
