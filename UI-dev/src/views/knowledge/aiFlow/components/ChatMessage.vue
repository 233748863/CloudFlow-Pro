<template>
  <div class="messages">
    <div v-for="(msg, index) in messages"
         :key="index"
         class="message"
         :class="[msg.role]"
         @contextmenu.prevent="showContextMenu($event, msg, index)">
      <div class="avatar">
        <img :src="msg.role === 'user' ? currentUserAvatar : botAvatar"
             alt="avatar" />
      </div>
      <div style="width: 100%;">
        <!-- 消息时间显示 - 移到content外面 -->
        <div class="time">{{ getMessageTime(msg) }}</div>
        <div class="content">
          <!-- 思考内容区域，添加可折叠功能，默认展开 -->
          <div class="collapsible_wrapper"
               v-if="msg.reasoning_content">
            <div class="collapsible_tag"
                 @click="toggleContent(index, 'reasoning')">
              <el-icon class="collapsible-icon"
                       :class="{ 'is-rotate': contentVisible[index]?.reasoning !== false }">
                <ArrowDown />
              </el-icon>
              <span>深度思考</span>
            </div>
            <div class="collapsible_content"
                 v-show="contentVisible[index]?.reasoning !== false">
              {{ msg.reasoning_content }}
            </div>
          </div>
          <template v-if="msg.content">
            <div v-html="parseMarkdown(msg.content)"></div>
            <div class="questions"
                 v-if="msg.questions">
              <el-tag v-for="(question, qIndex) in msg.questions"
                      :key="qIndex"
                      type="primary"
                      @click="handleQuestionClick(question.text)">
                {{ question.text }}
              </el-tag>
            </div>
          </template>
          <div v-else-if="msg.nodes"
               class="collapsible_wrapper">
            <div class="collapsible_tag"
                 @click="toggleContent(index, 'nodes')">
              <el-icon class="collapsible-icon"
                       :class="{ 'is-rotate': contentVisible[index]?.nodes !== false }">
                <ArrowDown />
              </el-icon>
              <span>执行步骤</span>
            </div>
            <div class="collapsible_content"
                 v-show="contentVisible[index]?.nodes !== false">
              <node-list :nodes="msg.nodes" />
            </div>
            <div v-if="msg.result"
                 v-html="parseMarkdown(msg.result)">
            </div>
          </div>
          <template v-if="loading && messages.indexOf(msg) === messages.length - 1">
            <div class="typing-indicator">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <!-- 右键菜单 -->
    <el-dialog v-model="editDialogVisible"
               title="编辑消息"
               width="50%"
               :before-close="handleEditDialogClose">
      <el-input v-model="editingContent"
                type="textarea"
                :rows="10"
                placeholder="请输入消息内容" />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleEditDialogClose">取消</el-button>
          <el-button type="primary"
                     @click="saveEditedMessage">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 自定义右键菜单 -->
    <div v-show="contextMenuVisible"
         class="context-menu"
         :style="{ top: contextMenuTop + 'px', left: contextMenuLeft + 'px' }">
      <div class="context-menu-item"
           @click="copyMessage">
        <el-icon>
          <Document />
        </el-icon>
        <span>复制</span>
      </div>
      <div class="context-menu-item"
           @click="editMessage">
        <el-icon>
          <Edit />
        </el-icon>
        <span>编辑</span>
      </div>
      <div class="context-menu-item"
           @click="deleteMessage">
        <el-icon>
          <Delete />
        </el-icon>
        <span>删除</span>
      </div>
      <div class="context-menu-item"
           @click="speakMessage">
        <el-icon>
          <Microphone />
        </el-icon>
        <span>朗读</span>
      </div>
    </div>
  </div>

</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
// 按需导入常用的语言
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
// 导入暗色主题样式
import 'highlight.js/styles/atom-one-dark.css'
// 导入Element Plus图标
import { ArrowDown, Document, Edit, Delete, Microphone } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import NodeList from '/@/views/knowledge/aiFlow/components/NodeList.vue'
import {dateTimeStr} from "/@/utils/formatTime";

// 定义组件接收的props
const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  messages: {
    type: Array,
    required: true
  },
  currentUserAvatar: {
    type: String,
    default: '/img/chat/icon.png'
  },
  botAvatar: {
    type: String,
    default: '/img/chat/chatgpt.png'
  }
})

// 定义组件触发的事件
const emit = defineEmits(['item-click', 'change'])

// 注册语言
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('java', java)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('markdown', markdown)

// 配置marked的代码高亮选项
onMounted(() => {
  marked.setOptions({
    highlight: function (code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value
        } catch (e) {
          console.error(e)
          return code
        }
      }
      return hljs.highlightAuto(code).value
    },
    breaks: true, // 支持换行符
    gfm: true, // 启用GitHub风格Markdown
    sanitize: false, // 允许HTML标签以支持代码高亮
    langPrefix: 'hljs language-', // 添加代码块的class前缀
  })
})

// 使用reactive创建响应式对象，用于跟踪内容的显示状态
const contentVisible = reactive({})

// 右键菜单相关状态
const contextMenuVisible = ref(false)
const contextMenuTop = ref(0)
const contextMenuLeft = ref(0)
const currentMessage = ref(null)
const currentMessageIndex = ref(-1)

// 编辑对话框相关状态
const editDialogVisible = ref(false)
const editingContent = ref('')

/**
 * 切换内容的显示/隐藏状态
 * @param {number} index - 消息索引
 * @param {string} type - 内容类型 ('reasoning' 或 'nodes')
 */
const toggleContent = (index, type) => {
  if (!contentVisible[index]) {
    contentVisible[index] = {}
  }
  contentVisible[index][type] = contentVisible[index][type] === false ? true : false
}

/**
 * 获取消息的时间
 * @param {Object} msg - 消息对象
 * @returns {string} - 格式化后的时间字符串
 */
const getMessageTime = (msg) => {
  // 如果消息对象中已有时间属性，则直接使用
  if (msg.time) {

    return parseDate(msg.time,dateTimeStr)
  }
  // 否则生成当前时间并赋值给消息对象
  const currentTime = parseDate(new Date(),dateTimeStr)
  // 为消息对象添加时间属性
  msg.time = new Date().toISOString()
  return currentTime
}

/**
 * 显示右键菜单
 * @param {Event} event - 鼠标事件对象
 * @param {Object} msg - 消息对象
 * @param {number} index - 消息索引
 */
const showContextMenu = (event, msg, index) => {
  // 阻止默认右键菜单
  event.preventDefault()
  // 设置菜单位置
  contextMenuTop.value = event.clientY
  contextMenuLeft.value = event.clientX
  // 保存当前消息和索引
  currentMessage.value = msg
  currentMessageIndex.value = index
  // 显示菜单
  contextMenuVisible.value = true
}

/**
 * 隐藏右键菜单
 */
const hideContextMenu = () => {
  contextMenuVisible.value = false
}

/**
 * 复制消息内容到剪贴板
 */
const copyMessage = () => {
  if (!currentMessage.value) return

  // 获取要复制的文本内容
  const textToCopy = currentMessage.value.content ||
    currentMessage.value.reasoning_content ||
    (currentMessage.value.result || '')

  // 使用Clipboard API复制文本
  navigator.clipboard.writeText(textToCopy)
    .then(() => {
      ElMessage.success('复制成功')
    })
    .catch(err => {
      ElMessage.error('复制失败: ' + err)
    })

  // 隐藏菜单
  hideContextMenu()
}

/**
 * 打开编辑对话框
 */
const editMessage = () => {
  if (!currentMessage.value) return

  // 设置编辑内容
  editingContent.value = currentMessage.value.content ||
    currentMessage.value.reasoning_content ||
    (currentMessage.value.result || '')

  // 显示编辑对话框
  editDialogVisible.value = true

  // 隐藏菜单
  hideContextMenu()
}

/**
 * 关闭编辑对话框
 */
const handleEditDialogClose = () => {
  editDialogVisible.value = false
  editingContent.value = ''
}

/**
 * 保存编辑后的消息
 */
const saveEditedMessage = () => {
  if (currentMessageIndex.value === -1 || !currentMessage.value) return

  // 更新时间
  currentMessage.value.time = dayjs().toISOString()
  // 更新消息内容
  currentMessage.value.content = editingContent.value

  // 发送编辑消息事件
  emit('change')

  // 关闭对话框
  handleEditDialogClose()

  ElMessage.success('消息已更新')
}

/**
 * 删除消息
 */
const deleteMessage = () => {
  if (currentMessageIndex.value === -1) return

  // 从消息数组中删除当前消息
  props.messages.splice(currentMessageIndex.value, 1)

  // 发送删除消息事件
  emit('change')

  // 隐藏菜单
  hideContextMenu()

  ElMessage.success('消息已删除')
}

/**
 * 使用浏览器API朗读消息
 */
const speakMessage = () => {
  if (!currentMessage.value) return

  // 获取要朗读的文本
  const textToSpeak = currentMessage.value.content ||
    currentMessage.value.reasoning_content ||
    (currentMessage.value.result || '')

  // 检查浏览器是否支持语音合成
  if ('speechSynthesis' in window) {
    // 创建语音合成实例
    const utterance = new SpeechSynthesisUtterance(textToSpeak)

    // 设置语音属性
    utterance.lang = 'zh-CN' // 设置语言为中文
    utterance.rate = 1.0 // 设置语速
    utterance.pitch = 1.0 // 设置音调

    // 开始朗读
    window.speechSynthesis.speak(utterance)

    ElMessage.success('正在朗读消息')
  } else {
    ElMessage.error('您的浏览器不支持语音合成')
  }

  // 隐藏菜单
  hideContextMenu()
}

/**
 * 处理问题点击事件
 * @param {string} text - 问题文本
 */
const handleQuestionClick = (text) => {
  emit('item-click', text)
}

/**
 * 解析Markdown内容并支持代码高亮
 * @param {string} content - 需要解析的Markdown内容
 * @returns {string} - 解析后的HTML字符串
 */
const parseMarkdown = (content) => {
  if (!content) return ''
  return marked(content)
}

// 点击页面其他区域时隐藏右键菜单
const handleDocumentClick = () => {
  hideContextMenu()
}

// 组件挂载时添加全局点击事件监听
onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

// 组件卸载前移除全局点击事件监听
onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped lang="scss">

// 可折叠内容区域通用样式
.collapsible_wrapper {
  overflow: hidden;
}

.collapsible_tag {
  display: inline-flex;
  align-items: center;
  padding: 0px 8px;
  background-color: #f0f0f0;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
  border: 1px solid #e0e0e0;
  margin-bottom: 6px;

  &:hover {
    background-color: #e8e8e8;
    border-color: #d0d0d0;
  }

  .collapsible-icon {
    margin-right: 6px;
    transition: transform 0.3s;
    font-size: 12px;
    color: #909399;

    &.is-rotate {
      transform: rotate(180deg);
    }
  }

  span {
    font-size: 12px;
    color: #606266;
    font-weight: 500;
  }
}

.collapsible_content {
  position: relative;
  margin: 5px 0;
  padding: 0px 12px;
  box-sizing: border-box;
  font-size: 13px;
  &:before {
    position: absolute;
    top: 0;
    left: 0;
    content: ' ';
    height: 100%;
    width: 2px;
    background-color: #e5e5e5;
  }
}

// 右键菜单样式
.context-menu {
  position: fixed;
  z-index: 9999;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 5px 0;
  min-width: 120px;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background-color 0.3s;

  &:hover {
    background-color: #f5f7fa;
  }

  .el-icon {
    margin-right: 8px;
    font-size: 16px;
  }

  span {
    font-size: 14px;
  }
}

:deep(pre) {
  background-color: #282c34; // Atom One Dark 背景色
  border-radius: 6px;
  padding: 16px;
  overflow: auto;
  font-size: 14px;
  line-height: 1.45;
  margin-bottom: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

:deep(code) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: #3a404b; // Atom One Dark 次要背景色
  color: #abb2bf; // Atom One Dark 文本颜色
  border-radius: 3px;
}

:deep(pre code) {
  padding: 0;
  margin: 0;
  font-size: 100%;
  word-break: normal;
  white-space: pre;
  background: transparent;
  border: 0;
  color: #abb2bf; // Atom One Dark 文本颜色
}

// 添加代码块的滚动条样式
:deep(pre)::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

:deep(pre)::-webkit-scrollbar-thumb {
  background: #3a404b;
  border-radius: 4px;
}

:deep(pre)::-webkit-scrollbar-track {
  background: #282c34;
  border-radius: 4px;
}
</style>
