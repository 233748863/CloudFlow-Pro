<!-- 缩略图组件 -->
<template>
  <div class="mini-map" :style="{ width: width + 'px', height: height + 'px' }">
    <!-- 缩略图容器 -->
    <div class="mini-map-container" ref="container">
      <!-- 缩略图内容 -->
      <div class="mini-map-content" 
           :style="{ transform: `translate(${contentPosition.x}px, ${contentPosition.y}px) scale(${scale})` }">
        <!-- 节点缩略图 -->
        <div v-for="node in nodes" 
             :key="node.id" 
             class="mini-node"
             :style="{ 
               left: `${node.x}px`, 
               top: `${node.y}px`,
               backgroundColor: getNodeColor(node.type)
             }">
        </div>
        <!-- 连线缩略图 -->
        <svg class="mini-connections" :style="{ width: `${bounds.width}px`, height: `${bounds.height}px` }">
          <path v-for="(conn, index) in connections"
                :key="index"
                :d="getConnectionPath(conn)"
                class="mini-connection-path"/>
        </svg>
      </div>
      <!-- 视口指示器 -->
      <div class="viewport-indicator"
           :style="{ 
             transform: `translate(${viewportPosition.x}px, ${viewportPosition.y}px)`,
             width: `${viewportSize.width}px`,
             height: `${viewportSize.height}px`
           }"
           @mousedown.prevent="startDrag">
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MiniMap',
  props: {
    // 缩略图宽度
    width: {
      type: Number,
      default: 200
    },
    // 缩略图高度
    height: {
      type: Number,
      default: 150
    },
    // 节点数据
    nodes: {
      type: Array,
      default: () => []
    },
    // 连接数据
    connections: {
      type: Array,
      default: () => []
    },
    // 画布缩放比例
    zoom: {
      type: Number,
      default: 1
    },
    // 画布位置
    position: {
      type: Object,
      default: () => ({ x: 0, y: 0 })
    },
    // 添加容器尺寸属性
    containerSize: {
      type: Object,
      default: () => ({
        width: 0,
        height: 0
      })
    }
  },
  data() {
    return {
      scale: 0.1,
      isDragging: false,
      dragStart: { x: 0, y: 0 },
      bounds: {
        minX: 0,
        minY: 0,
        width: 3000,
        height: 3000
      }
    }
  },
  computed: {
    // 计算内容位置，使其居中显示
    contentPosition() {
      const offsetX = (this.width - this.bounds.width * this.scale) / 2
      const offsetY = (this.height - this.bounds.height * this.scale) / 2
      return {
        x: offsetX,
        y: offsetY
      }
    },
    // 修改视口位置计算
    viewportPosition() {
      // 确保位置不会超出边界
      const maxX = this.width - this.viewportSize.width
      const maxY = this.height - this.viewportSize.height
      
      let x = (-this.position.x * this.scale) + this.contentPosition.x
      let y = (-this.position.y * this.scale) + this.contentPosition.y
      
      // 限制在有效范围内
      x = Math.max(0, Math.min(x, maxX))
      y = Math.max(0, Math.min(y, maxY))
      
      return { x, y }
    },
    // 修改视口尺寸计算
    viewportSize() {
      // 计算缩略图内容的实际显示范围
      const contentWidth = this.bounds.width * this.scale
      const contentHeight = this.bounds.height * this.scale
      
      // 计算视口尺寸比例
      const viewportRatioX = this.width / (this.bounds.width / this.zoom)
      const viewportRatioY = this.height / (this.bounds.height / this.zoom)
      
      // 确保视口尺寸不会小于最小值或大于缩略图尺寸
      return {
        width: Math.min(this.width, Math.max(50, contentWidth * viewportRatioX)),
        height: Math.min(this.height, Math.max(30, contentHeight * viewportRatioY))
      }
    }
  },
  watch: {
    // 监听节点变化，重新计算边界和缩放
    nodes: {
      handler() {
        this.$nextTick(this.updateBoundsAndScale)
      },
      deep: true
    }
  },
  methods: {
    // 获取节点颜色
    getNodeColor(type) {
      const colors = {
        start: '#10B981',
        end: '#EF4444',
        http: '#3B82F6',
        switch: '#F59E0B',
        code: '#8B5CF6',
        db: '#6366F1',
        llm: '#EC4899',
        notice: '#14B8A6',
        question: '#F97316',
        default: '#6B7280'
      }
      return colors[type] || colors.default
    },
    // 获取连接路径
    getConnectionPath(conn) {
      const source = this.nodes.find(n => n.id === conn.sourceId)
      const target = this.nodes.find(n => n.id === conn.targetId)
      if (!source || !target) return ''

      const x1 = source.x
      const y1 = source.y
      const x2 = target.x
      const y2 = target.y

      // 计算控制点
      const dx = Math.abs(x2 - x1) * 0.5
      const cp1x = x1 + dx
      const cp1y = y1
      const cp2x = x2 - dx
      const cp2y = y2

      return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
    },
    // 开始拖动视口
    startDrag(event) {
      this.isDragging = true
      const rect = this.$refs.container.getBoundingClientRect()
      this.dragStart = {
        x: event.clientX - rect.left - this.viewportPosition.x,
        y: event.clientY - rect.top - this.viewportPosition.y
      }
      
      window.addEventListener('mousemove', this.onDrag)
      window.addEventListener('mouseup', this.stopDrag)
    },
    // 拖动中
    onDrag(event) {
      if (!this.isDragging) return
      
      const rect = this.$refs.container.getBoundingClientRect()
      let x = event.clientX - rect.left - this.dragStart.x
      let y = event.clientY - rect.top - this.dragStart.y
      
      // 添加边界限制
      const maxX = this.width - this.viewportSize.width
      const maxY = this.height - this.viewportSize.height
      x = Math.max(0, Math.min(x, maxX))
      y = Math.max(0, Math.min(y, maxY))
      
      // 计算相对于内容的位置
      const relativeX = (x - this.contentPosition.x) / this.scale
      const relativeY = (y - this.contentPosition.y) / this.scale
      
      this.$emit('update:position', {
        x: -relativeX,
        y: -relativeY
      })
    },
    // 停止拖动
    stopDrag() {
      this.isDragging = false
      window.removeEventListener('mousemove', this.onDrag)
      window.removeEventListener('mouseup', this.stopDrag)
    },
    // 更新边界和缩放
    updateBoundsAndScale() {
      if (!this.nodes.length) return

      // 计算节点边界
      const nodePositions = this.nodes.map(node => ({
        left: node.x - 100,  // 考虑节点宽度
        right: node.x + 100,
        top: node.y - 50,   // 考虑节点高度
        bottom: node.y + 50
      }))

      // 计算整体边界
      const minX = Math.min(...nodePositions.map(p => p.left))
      const maxX = Math.max(...nodePositions.map(p => p.right))
      const minY = Math.min(...nodePositions.map(p => p.top))
      const maxY = Math.max(...nodePositions.map(p => p.bottom))

      // 添加边距
      const PADDING = 100
      this.bounds = {
        minX: minX - PADDING,
        minY: minY - PADDING,
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2
      }

      // 计算合适的缩放比例
      const scaleX = this.width / this.bounds.width
      const scaleY = this.height / this.bounds.height
      this.scale = Math.min(scaleX, scaleY, 0.2) // 限制最大缩放比例为0.2
    }
  },
  mounted() {
    this.updateBoundsAndScale()
  }
}
</script>

<style lang="scss" scoped>
.mini-map {
  position: absolute;
  left: 20px;
  bottom: 60px;
  background: #fff;
  border-radius: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 1;
  
  .mini-map-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  
  .mini-map-content {
    position: absolute;
    transform-origin: 0 0;
  }
  
  .mini-node {
    position: absolute;
    width: 20px;
    height: 10px;
    border-radius: 2px;
    transform: translate(-50%, -50%);
  }
  
  .mini-connections {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    
    .mini-connection-path {
      fill: none;
      stroke: #94a3b8;
      stroke-width: 1px;
    }
  }
  
  .viewport-indicator {
    position: absolute;
    border: 1px solid #3b82f6;
    background: rgba(59, 130, 246, 0.05); // 降低默认透明度,提高对比度
    pointer-events: all;
    cursor: move;
    border-radius: 4px; // 添加圆角
    transition: all 0.2s ease; // 添加过渡动画
    
    &:hover {
      background: rgba(59, 130, 246, 0.15); // 提高hover时的透明度
      border-color: #2563eb; // hover时加深边框颜色
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); // hover时加深阴影
    }
    
    &:active {
      background: rgba(59, 130, 246, 0.2); // 点击时加深背景色
      border-color: #1d4ed8; // 点击时进一步加深边框
    }
  }
}
</style> 