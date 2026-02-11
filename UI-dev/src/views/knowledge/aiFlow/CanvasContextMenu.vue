<template>
  <div v-if="visible"
       class="context-menu"
       :style="{
         position: 'fixed',
         left: position.x + 'px',
         top: position.y + 'px',
         zIndex: 1000
       }">
    <div class="menu-item"
         @click="handleCommand('addNode')">
      <el-icon class="menu-icon">
        <Plus />
      </el-icon>
      新增节点
    </div>
    <div class="menu-item"
         @click="handleCommand('importDSL')">
      <el-icon class="menu-icon">
        <Upload />
      </el-icon>
      导入DSL
    </div>
    <div class="menu-item"
         @click="handleCommand('exportDSL')">
      <el-icon class="menu-icon">
        <Download />
      </el-icon>
      导出DSL
    </div>
  </div>
</template>

<script>
import { ref, defineComponent, onMounted, onBeforeUnmount } from 'vue'
import { Plus, Upload, Download } from '@element-plus/icons-vue'

export default defineComponent({
  name: 'CanvasContextMenu',
  components: {
    Plus,
    Upload,
    Download
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    position: {
      type: Object,
      default: () => ({ x: 0, y: 0 })
    }
  },
  emits: ['update:visible', 'add-node', 'import-dsl', 'export-dsl'],
  setup (props, { emit }) {
    // 处理菜单命令
    const handleCommand = (command) => {
      switch (command) {
        case 'addNode':
          emit('add')
          break
        case 'importDSL':
          emit('import')
          break
        case 'exportDSL':
          emit('export')
          break
      }
      emit('update:visible', false)
    }

    // 点击外部关闭菜单的处理函数
    const handleClickOutside = (e) => {
      const contextMenu = document.querySelector('.context-menu')
      if (contextMenu && !contextMenu.contains(e.target)) {
        emit('update:visible', false)
      }
    }

    // 组件挂载时添加点击事件监听
    onMounted(() => {
      document.addEventListener('click', handleClickOutside)
    })

    // 组件销毁前移除事件监听
    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside)
    })

    return {
      handleCommand,
    }
  }
})
</script>

<style lang="scss" scoped>
.context-menu {
  opacity: 0.9;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.05);
  padding: 6px 0;
  min-width: 180px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  animation: menuFadeIn 0.15s ease-out;
}

.menu-item {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgb(71 84 103 / 1);
  font-size: 13px;
  white-space: nowrap;

  .menu-icon {
    margin-right: 8px;
    font-size: 16px;
  }

  &:hover {
    background-color: #f8fafc;
    transform: translateX(2px);
  }
}

.node-types {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;

  .el-radio {
    margin-right: 20px;
    margin-bottom: 10px;
  }
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

:deep(.el-dialog) {
  border-radius: 8px;
  overflow: hidden;

  .el-dialog__header {
    margin: 0;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .el-dialog__body {
    padding: 20px;
  }

  .el-dialog__footer {
    padding: 16px 20px;
    border-top: 1px solid #e5e7eb;
  }
}
</style> 