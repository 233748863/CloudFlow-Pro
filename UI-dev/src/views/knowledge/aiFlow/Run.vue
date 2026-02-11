<template>
  <div class="workflow-designer">
    <!-- 添加未发布遮罩组件 -->
    <UnpublishedMask :visible="!form.enabled" />

    <!-- 执行面板 -->
    <div class="execution-panel"
         v-if="form.enabled">
      <div class="panel-header">
        <h3>流程运行{{ id }}</h3>
      </div>

      <div class="panel-content">
        <!-- 参数输入区域 -->
        <div class="left-panel">
          <div class="variable-inputs">
            <div v-for="(param, index) in startNodeParams"
                 :key="index"
                 class="input-item">
              <div class="input-label"
                   :class="{ 'required': param.required }">
                {{ param.name }}
              </div>
              <div class="input-value">
                <input v-if="param.inputType === 'input'"
                       v-model="param.value"
                       class="param-input"
                       :disabled="isRunning"
                       :class="{ 'error': showError && param.required && !param.value }"
                       :placeholder="'请输入' + param.name" />
                <input v-else-if="param.inputType === 'number'"
                       type="number"
                       v-model.number="param.value"
                       class="param-input"
                       :disabled="isRunning"
                       :class="{ 'error': showError && param.required && !param.value }"
                       :placeholder="'请输入' + param.name" />
                <textarea v-else-if="param.inputType === 'textarea'"
                          v-model="param.value"
                          class="param-textarea"
                          :disabled="isRunning"
                          :class="{ 'error': showError && param.required && !param.value }"
                          :placeholder="'请输入' + param.name"
                          rows="3"></textarea>
                <select v-else-if="param.inputType === 'select'"
                        v-model="param.value"
                        class="param-select"
                        :disabled="isRunning"
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

            <el-button type="primary"
                       class="run-btn"
                       :disabled="isRunning"
                       @click="handleParamRun">
              {{ isRunning ? '运行中...' : '运行' }}
            </el-button>
          </div>

          <!-- 执行状态和结果区域 -->
          <div class="execution-detail"
               v-if="executionNodes.length">
            <div class="detail-card">
              <div class="detail-row">
                <div class="detail-item">
                  <div class="label">状态</div>
                  <div class="value"
                       :class="executionStatus.class">
                    {{ executionStatus.text }}
                  </div>
                </div>
                <div class="detail-item">
                  <div class="label">运行时间</div>
                  <div class="value">{{ formatTotalTime(executionTime) }}</div>
                </div>
                <div class="detail-item">
                  <div class="label">总 TOKEN 数</div>
                  <div class="value">{{ totalTokens }} Tokens</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="right-panel">
          <!-- 执行进度和结果区域 -->
          <node-list :nodes="executionNodes"
                     @end="handleEnd"
                     v-if="executionNodes.length" />

          <!-- 最终执行结果 -->
          <div class="execution-result"
               v-if="executionResult">
            <h4>执行结果</h4>
            <pre>{{ JSON.stringify(executionResult, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Loading, Check, CircleClose, ArrowRight } from '@element-plus/icons-vue'
import { getObj } from '/@/api/knowledge/aiFlow';
import NodeList from './components/NodeList.vue'
import NodeCommon from './mixins/Node.ts'
import UnpublishedMask from './components/UnpublishedMask.vue'

export default {
  name: 'WorkflowRun',
  mixins: [NodeCommon],
  components: {
    Loading,
    Check,
    CircleClose,
    ArrowRight,
    NodeList,
    UnpublishedMask
  },
  provide () {
    return {
      parent: this,
      nodes: this.nodes,
    }
  },
  data () {
    return {
      form: { enabled: true },
      executionNodes: [],
      executionResult: null,
      executionTime: 0,
      totalTokens: 0,
      startNodeParams: [], // 添加开始节点参数
      showError: false,
      isRunning: false // 添加运行状态控制
    }
  },
  computed: {
    executionStatus () {
      const lastNode = this.executionNodes[this.executionNodes.length - 1]
      if (!lastNode) return { text: '等待中', class: 'status-pending' }

      const statusMap = {
        'running': { text: '运行中', class: 'status-running' },
        'success': { text: '成功', class: 'status-success' },
        'error': { text: '失败', class: 'status-error' },
        'skipped': { text: '已跳过', class: 'status-skipped' }
      }

      return statusMap[lastNode.status] || { text: '等待中', class: 'status-pending' }
    },
  },
  created () {
    this.loadFromStorage()
  },
  methods: {
    // 修改 loadFromStorage 方法
    async loadFromStorage () {
      try {
        const res = await getObj(this.id)
        this.form = res.data.data;
        const { dsl = '{}' } = this.form
        const data = JSON.parse(dsl)
        this.nodes = data.nodes || []
        this.connections = data.connections || []
        this.env = data.env || []
        this.handleRunClick()
      } catch (error) {
        console.error('加载工作流失败:', error)
      }
    },

    formatTotalTime (time) {
      if (!time) return '0ms'
      return `${Number(time).toFixed(3)}ms`
    },
    handleParamRun () {
      const hasError = this.startNodeParams.some(param => param.required && !param.value)
      this.showError = hasError

      if (hasError) {
        return
      }

      this.runWorkflow(this.startNodeParams)
      this.showError = false
    },
    handleEnd (status) {
      this.isRunning = false
    }
  }
}
</script>

<style lang="scss" scoped>
@use './styles/flow.scss';
.workflow-designer {
  width: 100%;
  height: 100vh;
  background: #f8f9fc;
  position: relative;
  overflow: hidden;
  display: flex;
}

.execution-panel {
  width: 100%;
  height: 100%;
  background: white;
  border-left: 1px solid #e6e6e6;
  display: flex;
  color: #333;
  flex-direction: column;
}

.panel-header {
  padding: 15px;
  border-bottom: 1px solid #e6e6e6;
  background: #f8f9fc;
  h3 {
    margin: 0;
    font-size: 16px;
    color: #303133;
  }
}

.panel-content {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.left-panel {
  padding: 15px;
  width: 350px;
  height: 100%;
  background: #fff;
  border-right: 1px solid #dcdfe6;
}
.right-panel {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 20px;
}

.execution-detail {
  margin-top: 20px;
}

.detail-card {
  background: #f0f9eb;
  border-radius: 8px;
  border: 1px solid #e1f3d8;
  box-sizing: border-box;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}


.detail-item {
  flex: 1;
  text-align: center;
  padding: 8px 0;

  &:not(:last-child) {
    border-right: 1px solid rgba(225, 243, 216, 0.8);
  }

  .label {
    color: #606266;
    font-size: 12px;
    margin-bottom: 4px;
  }

  .value {
    color: #67c23a;
    font-size: 14px;
    font-weight: 500;

    &.status-success {
      color: #67c23a;
    }

    &.status-error {
      color: #f56c6c;
    }

    &.status-running {
      color: #409eff;
    }

    &.status-pending {
      color: #909399;
    }
  }
}

.run-btn {
  width: 100%;
}
.execution-result {
  margin-top: 20px;

  h4 {
    margin-bottom: 10px;
    color: #303133;
  }

  pre {
    background: #f5f7fa;
    padding: 15px;
    border-radius: 4px;
    overflow-x: auto;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.5;
  }
}
</style>
