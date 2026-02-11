<template>
  <div>
    <div v-if="visible"
         class="more-menu"
         :style="menuStyle">
      <!-- 拷贝 -->
      <div class="menu-item"
           @click="copyNode">
        <span>复制</span>
      </div>

      <!-- 更换类型 -->
      <div class="menu-item"
           @click="handleShowChangeType">
        <span>更换类型</span>
        <i class="el-icon-arrow-right"></i>
      </div>

      <!-- 删除 -->
      <div class="menu-item"
           @click="deleteNode" v-if="node.type !== 'start'">
        <span>删除</span>
      </div>
    </div>

    <!-- 使用 NodeContextMenu 组件 -->
    <NodeContextMenu v-model:visible="showChangeType"
                     :position="changeTypeMenuPosition"
                     :node="node"
                     add-position="replace"
                     @add="handleChangeType" />
  </div>
</template>

<script>
import NodeContextMenu from './NodeContextMenu.vue'
import { getNodeConfig } from './nodes/nodeTypes.ts'

export default {
  name: 'NodeMoreMenu',
  inject: ['parent'],
  components: {
    NodeContextMenu
  },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    position: {
      type: Object,
      default: () => ({ x: 0, y: 0 })
    },
    node: {
      type: Object,
      default: null
    }
  },
  emits: ['update:visible'],
  data () {
    return {
      showChangeType: false,
      changeTypeMenuPosition: { x: 0, y: 0 }
    }
  },
  computed: {
    menuStyle () {
      return {
        left: `${this.position.x}px`,
        top: `${this.position.y}px`
      }
    }
  },
  methods: {
    // 复制节点
    copyNode () {
      if (!this.node) return

      // 创建节点的深拷贝
      const nodeCopy = JSON.parse(JSON.stringify(this.node))

      // 生成新的唯一ID
      nodeCopy.id = `node_${Date.now()}`

      // 设置新节点的位置(在原节点右下方20px处)
      nodeCopy.x = this.node.x + 20
      nodeCopy.y = this.node.y + 20

      // 更新节点列表
      this.parent.nodes = [...this.parent.nodes, nodeCopy]

      // 关闭菜单
      this.$emit('update:visible', false)
    },

    // 删除节点
    deleteNode () {
      if (!this.node) return

      // 删除节点的所有端点
      this.parent.jsPlumbInstance.removeAllEndpoints(this.node.id)

      // 从节点列表中删除节点
     this.parent.nodes= this.parent.nodes.filter(n => n.id !== this.node.id)

      // 关闭菜单
      this.$emit('update:visible', false)
    },

    // 更换节点类型
    changeNodeType (newType) {
      if (!this.node || !newType) return

      // 获取新节点类型的配置
      const nodeConfig = getNodeConfig(newType)

      // 找到当前节点的索引
      const nodeIndex = this.parent.nodes.findIndex(n => n.id === this.node.id)
      if (nodeIndex === -1) return

      // 保存原节点的位置和ID
      const { x, y, id } = this.node

      // 创建新节点，保持原有的位置和ID
      const newNode = {
        ...nodeConfig,
        id,
        x,
        y,
      }

      // 更新节点列表
      const newNodes = [...this.parent.nodes]
      newNodes[nodeIndex] = newNode
      this.parent.nodes = newNodes

      // 关闭菜单
      this.$emit('update:visible', false)
      this.showChangeType = false
    },

    handleShowChangeType (event) {
      // 计算子菜单位置，在父菜单右侧显示
      const menuEl = this.$el.querySelector('.more-menu')
      if (menuEl) {
        const rect = menuEl.getBoundingClientRect()
        // 检查右侧空间是否足够
        const rightSpace = window.innerWidth - rect.right
        const leftSpace = rect.left

        // 如果右侧空间不足，且左侧空间足够，则显示在左侧
        if (rightSpace < 200 && leftSpace > 200) {
          this.changeTypeMenuPosition = {
            x: rect.left - 5,  // 左侧偏移5px
            y: rect.top
          }
        } else {
          this.changeTypeMenuPosition = {
            x: rect.right + 5, // 右侧偏移5px
            y: rect.top
          }
        }
      }
      this.showChangeType = true
      // 阻止事件冒泡，防止触发外部点击事件
      event?.stopPropagation()
    },

    handleChangeType (type) {
      this.changeNodeType(type)
    }
  },
  mounted () {
    // 点击外部关闭菜单
    const handleClickOutside = (e) => {
      if (!this.$el.contains(e.target)) {
        this.$emit('update:visible', false)
        this.showChangeType = false
      }
    }
    document.addEventListener('click', handleClickOutside)

    // 保存引用以便在组件销毁时移除
    this.handleClickOutside = handleClickOutside
  },
  beforeDestroy () {
    // 移除事件监听器
    document.removeEventListener('click', this.handleClickOutside)
  }
}
</script>

<style scoped>
.more-menu {
  opacity: 0.9;
  position: fixed;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 160px;
  z-index: 1000;
}

.menu-item {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 13px;
  color: rgb(71 84 103 / 1);
  transition: all 0.2s;
  position: relative;
}

.menu-item:hover {
  background-color: #f5f5f5;
}

.el-icon-arrow-right {
  font-size: 12px;
  color: #909399;
}
</style> 