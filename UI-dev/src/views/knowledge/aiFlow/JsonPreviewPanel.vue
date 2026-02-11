<template>
  <el-dialog
    title="数据结构"
    v-model="dialogVisible"
    width="800px"
    class="json-preview-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <div class="preview-content">
      <!-- 顶部标签页 -->
      <el-tabs v-model="activeTab" class="preview-tabs">
        <el-tab-pane
          v-for="tab in tabs"
          :key="tab.key"
          :label="tab.label"
          :name="tab.key"
        >
          <template #label>
            <span>{{ tab.label }}</span>
            <el-tag v-if="tab.key === 'nodes'" size="small" type="info" class="ml-2">
              {{ nodeCount }}
            </el-tag>
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- 代码编辑器 -->
      <div class="preview-body">
        <code-editor
            v-model="currentTabData"
            :json="true"
            :readonly="false"
            theme="nord"
            height="400px"
        />
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" @click="copyData">
          <el-icon><Document /></el-icon>
          复制内容
        </el-button>
        <el-button @click="dialogVisible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script>
import { Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import CodeEditor from "/@/views/knowledge/aiFlow/components/CodeEditor.vue";

export default {
  name: 'JsonPreviewPanel',
  components: {
    CodeEditor,
    Document
  },
  inject: ['parent'],
  props: {
    modelValue: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      activeTab: 'all',
      tabs: [
        { key: 'all', label: '全部数据' },
        { key: 'nodes', label: '节点数据' },
        { key: 'connections', label: '连线数据' },
        { key: 'execution', label: '执行顺序' }
      ]
    }
  },
  computed: {
    dialogVisible: {
      get() {
        return this.modelValue
      },
      set(value) {
        this.$emit('update:modelValue', value)
      }
    },
    data() {
      return {
        nodes: this.parent.nodes,
        connections: this.parent.connections,
        executionOrder: this.parent.workflowExecutionOrder,
      }
    },
    nodeCount() {
      return this.data.nodes ? this.data.nodes.length : 0
    },
    currentTabData: {
      get() {
        let data = ''
        switch (this.activeTab) {
          case 'nodes':
            data = this.data.nodes
            break
          case 'connections':
            data = this.data.connections
            break
          case 'execution':
            data = this.data.executionOrder
            break
          default:
            data = this.data
        }
        return JSON.stringify(data, null, 2)
      },
      set() {
        // 只读模式，不需要实现set
      }
    }
  },
  methods: {
    copyData() {
      navigator.clipboard.writeText(this.currentTabData)
        .then(() => {
          ElMessage({
            message: '复制成功',
            type: 'success',
            duration: 2000
          })
        })
        .catch(err => {
          ElMessage({
            message: '复制失败',
            type: 'error',
            duration: 2000
          })
          console.error('复制失败:', err)
        })
    }
  }
}
</script>

<style lang="scss" scoped>
.json-preview-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }

  .preview-content {
    .preview-tabs {
      padding: 0 15px;
    }

    .preview-body {
      padding: 10px 15px;
    }
  }

  .dialog-footer {
    padding: 15px;
    text-align: right;
  }

  :deep(.el-tabs__header) {
    margin-bottom: 15px;
  }

  :deep(.el-tag) {
    margin-left: 5px;
  }
}
</style>
