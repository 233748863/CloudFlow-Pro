<template>
  <div class="check-list-panel">
    <div class="preview-content">
      <div class="preview-header">
        <div class="header-title">
          <span>检查清单({{ validation.errors.length }})</span>
        </div>
        <el-button 
          class="close-btn" 
          type="primary"
          link
          @click="$emit('close')"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      <div class="preview-body">
        <div class="check-list">
          <template v-if="validation.errors.length > 0">
            <div v-for="(error, index) in validation.errors"
                 :key="index"
                 class="check-item">
              <div class="item-icon warning">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-type">{{ getErrorType(error) }}</div>
                <div class="item-message">{{ getErrorMessage(error) }}</div>
              </div>
            </div>
          </template>
          <div v-else
               class="check-item success">
            <div class="item-icon success">
              <el-icon><Select /></el-icon>
            </div>
            <div class="item-content">
              <div class="item-type success">检测通过</div>
              <div class="item-message">工作流程检测已通过，可以发布</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Warning, Close, Select } from '@element-plus/icons-vue'

export default {
  name: 'CheckListPanel',
  inject: ['parent'],
  components: {
    Warning,
    Close,
    Select
  },
  props: {
    validation: {
      type: Object,
      required: true
    }
  },
  emits: ['update:validation', 'close'],
  data () {
    return {
      showCheckList: false
    }
  },
  watch: {
    'parent.nodes': {
      handler: 'checkChanges',
      deep: true,
      immediate: true
    },
    'parent.connections': {
      handler: 'checkChanges',
      deep: true,
      immediate: true
    }
  },
  methods: {
    checkChanges () {
      const newValidation = this.validateWorkflow()
      this.$emit('update:validation', newValidation)
    },
    validateWorkflow () {
      const validation = {
        isValid: true,
        errors: [],
        warnings: []
      };

      try {
        if (!this.parent.nodes || this.parent.nodes.length === 0) {
          validation.errors.push({
            type: 'error',
            message: '工作流中没有节点'
          });
          validation.isValid = false;
          return validation;
        }

        const startNodes = this.parent.nodes.filter(node => node.type === 'start');
        const endNodes = this.parent.nodes.filter(node => node.type === 'end');

        if (startNodes.length === 0) {
          validation.errors.push({
            type: 'error',
            message: '工作流缺少开始节点'
          });
          validation.isValid = false;
        } else if (startNodes.length > 1) {
          validation.errors.push({
            type: 'error',
            message: '工作流只能有一个开始节点'
          });
          validation.isValid = false;
        }

        if (endNodes.length === 0) {
          validation.errors.push({
            type: 'error',
            message: '工作流缺少结束节点'
          });
          validation.isValid = false;
        }

        const nodeConnections = new Map();
        this.parent.nodes.forEach(node => {
          nodeConnections.set(node.id, {
            inbound: [],
            outbound: []
          });
        });

        this.parent.connections.forEach(conn => {
          const sourceConn = nodeConnections.get(conn.sourceId);
          const targetConn = nodeConnections.get(conn.targetId);

          if (sourceConn) {
            sourceConn.outbound.push(conn.targetId);
          }
          if (targetConn) {
            targetConn.inbound.push(conn.sourceId);
          }
        });

        this.parent.nodes.forEach(node => {
          const nodeConn = nodeConnections.get(node.id);

          if (node.type === 'start' && nodeConn.inbound.length > 0) {
            validation.errors.push({
              type: 'error',
              message: '开始节点不能有入边连接',
              nodeId: node.id
            });
            validation.isValid = false;
          }

          if (node.type === 'end' && nodeConn.outbound.length > 0) {
            validation.errors.push({
              type: 'error',
              message: '结束节点不能有出边连接',
              nodeId: node.id
            });
            validation.isValid = false;
          }

          if (nodeConn.inbound.length === 0 && nodeConn.outbound.length === 0 &&
            node.type !== 'start' && node.type !== 'end') {
            validation.warnings.push({
              type: 'warning',
              message: '存在孤立节点',
              nodeId: node.id
            });
          }
        });

        this.parent.nodes.forEach(node => {
          // switch (node.type) {
          //   case 'http':
          //     this.validateHttpNode(node, validation);
          //     break;
          //   case 'code':
          //     this.validateCodeNode(node, validation);
          //     break;
          // }
        });

        if (this.hasCircularDependency()) {
          validation.errors.push({
            type: 'error',
            message: '工作流中存在循环依赖'
          });
          validation.isValid = false;
        }

        return validation;
      } catch (error) {
        console.error('验证工作流时出错:', error);
        validation.errors.push({
          type: 'error',
          message: '验证工作流时出错: ' + error.message
        });
        validation.isValid = false;
        return validation;
      }
    },
    validateHttpNode (node, validation) {
      if (!node.url) {
        validation.errors.push({
          type: 'error',
          message: 'HTTP节点缺少URL',
          nodeId: node.id
        });
        validation.isValid = false;
      }

      if (!node.method) {
        validation.errors.push({
          type: 'error',
          message: 'HTTP节点缺少请求方法',
          nodeId: node.id
        });
        validation.isValid = false;
      }

      if (node.headers) {
        node.headers.forEach((header, index) => {
          if (!header.name) {
            validation.errors.push({
              type: 'error',
              message: `HTTP节点的第${index + 1}个请求头缺少名称`,
              nodeId: node.id
            });
            validation.isValid = false;
          }
        });
      }

      if (node.method !== 'GET' && node.bodyParams) {
        node.bodyParams.forEach((param, index) => {
          if (!param.name) {
            validation.errors.push({
              type: 'error',
              message: `HTTP节点的第${index + 1}个请求体参数缺少名称`,
              nodeId: node.id
            });
            validation.isValid = false;
          }
        });
      }
    },
    validateCodeNode (node, validation) {
      if (!node.code) {
        validation.errors.push({
          type: 'error',
          message: '代码节点缺少执行代码',
          nodeId: node.id
        });
        validation.isValid = false;
      } else {
        try {
          new Function(node.code);
        } catch (error) {
          validation.errors.push({
            type: 'error',
            message: `代码语法错误: ${error.message}`,
            nodeId: node.id
          });
          validation.isValid = false;
        }
      }
    },
    hasCircularDependency () {
      const visited = new Set();
      const recursionStack = new Set();

      const dfs = (nodeId) => {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        const connections = this.parent.connections.filter(conn => conn.sourceId === nodeId);
        for (const conn of connections) {
          const targetId = conn.targetId;

          if (!visited.has(targetId)) {
            if (dfs(targetId)) {
              return true;
            }
          } else if (recursionStack.has(targetId)) {
            return true;
          }
        }

        recursionStack.delete(nodeId);
        return false;
      };

      for (const node of this.parent.nodes) {
        if (!visited.has(node.id)) {
          if (dfs(node.id)) {
            return true;
          }
        }
      }

      return false;
    },
    getErrorType (error) {
      if (error.message.includes('缺少')) return '节点缺失'
      if (error.message.includes('未连接')) return '连接错误'
      if (error.message.includes('循环')) return '循环依赖'
      return '错误'
    },
    getErrorMessage (error) {
      let nodeName = ''
      if (error.nodeId) {
        const node = this.parent.nodes.find(n => n.id === error.nodeId)
        if (node) {
          nodeName = node.name || `${node.type}节点`
        }
      }

      if (nodeName) {
        return `${nodeName}: ${error.message}`
      }
      return error.message
    }
  }
}
</script>

<style lang="scss" scoped>
.check-list-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 1;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  width: 400px;
}

.preview-content {
  position: relative;
  width: 100%;
}

.preview-header {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  flex-direction: column;
  gap: 4px;

  span:first-child {
    font-size: 16px;
    font-weight: 500;
    color: #111827;
  }
}

.subtitle {
  font-size: 14px;
  color: #6b7280;
}

.preview-body {
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;

  &.success {
    background: #f0fdf4;
    border-color: #86efac;
  }
}

.item-icon {
  width: 24px;
  height: 24px;
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;

  &.warning {
    color: #f59e0b;
  }

  &.success {
    color: #22c55e;
  }

  .el-icon {
    font-size: 20px;
  }
}

.item-content {
  flex: 1;
}

.item-type {
  font-size: 14px;
  font-weight: 500;
  color: #f59e0b;
  margin-bottom: 4px;

  &.success {
    color: #22c55e;
  }
}

.item-message {
  font-size: 14px;
  color: #4b5563;
  line-height: 1.4;
}

.close-btn {
  padding: 4px;
  font-size: 18px;
}
</style> 