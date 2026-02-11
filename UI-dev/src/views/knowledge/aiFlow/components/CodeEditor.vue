<template>
	<div class="code-editor">
		<textarea ref="textarea" v-show="false"></textarea>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
// 主题
import 'codemirror/theme/idea.css';
import 'codemirror/theme/nord.css';
import 'codemirror/theme/xq-light.css';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/display/autorefresh';
// 搜索
import 'codemirror/addon/scroll/annotatescrollbar.js';
import 'codemirror/addon/search/matchesonscrollbar.js';
import 'codemirror/addon/search/match-highlighter.js';
import 'codemirror/addon/search/jump-to-line.js';
import 'codemirror/addon/dialog/dialog.js';
import 'codemirror/addon/dialog/dialog.css';
import 'codemirror/addon/search/searchcursor.js';
import 'codemirror/addon/search/search.js';
// 折叠
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
// 格式化
import formatter from '../utils/formatter';
import { validatejson, validatenull } from '../utils/validate';
import { ElMessage } from 'element-plus';

// 定义组件属性
const props = defineProps({
	modelValue: {
		type: String,
		required: true,
		default: '',
	},
	height: {
		type: String,
		required: true,
		default: '450px',
	},
	mode: {
		type: String,
		default: 'javascript',
	},
	theme: {
		type: String,
		default: 'idea',
	},
	readonly: {
		type: Boolean,
		default: false,
	},
	json: {
		type: Boolean,
		default: false,
	},
});

// 定义事件
const emit = defineEmits(['update:modelValue']);

// 定义DOM引用
const textarea = ref<HTMLTextAreaElement | null>(null);
// 编辑器实例
let editor: any = null;

// 格式化代码方法
const prettyCode = () => {
	if (props.json && editor) {
		const val = editor.getValue();
		if (validatenull(val)) {
			ElMessage.warning('请先填写数据');
			return;
		}
		if (!validatejson(val)) {
			ElMessage.warning('数据 JSON 格式错误');
			return;
		}
		editor.setValue(formatter.prettyCode(val));
	}
};

// 组件挂载后初始化编辑器
onMounted(() => {
	editor = CodeMirror.fromTextArea(textarea.value, {
		mode: props.mode,
		theme: props.theme,
		readOnly: props.readonly,
		autoRefresh: true,
		lineNumbers: true,
		lineWrapping: true,
		tabSize: 2,
		foldGutter: true,
		gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
		extraKeys: {
			// 绑定快捷键 Ctrl-F / Cmd-F 开启搜索
			'Ctrl-F': 'findPersistent',
			'Cmd-F': 'findPersistent',
			// 如果需要，您还可以添加 "Ctrl-R"/"Cmd-R" 绑定替换功能
			'Ctrl-R': 'replace',
			'Cmd-R': 'replace',
		},
	});

	// 设置高度
	editor.setSize('auto', props.height);

	// 设置文本
	const editorValue = props.json ? formatter.prettyCode(props.modelValue) : props.modelValue;
	editor.setValue(editorValue);

	// 监听变化
	editor.on('change', () => {
		emit('update:modelValue', editor.getValue());
	});
});

// 监听属性变化
watch(
	() => props.modelValue,
	(newVal) => {
		if (editor && newVal !== editor.getValue()) {
			const editorValue = props.json ? formatter.prettyCode(props.modelValue) : props.modelValue;
			editor.setValue(editorValue);
		}
	}
);

watch(
	() => props.height,
	(newHeight) => {
		if (editor) {
			editor.setSize('auto', newHeight);
		}
	}
);

// 暴露方法给父组件
defineExpose({
	prettyCode,
});
</script>

<style scoped>
.code-editor {
	line-height: 1.2 !important;
	width: calc(100% - 4px);
	height: 100%;
	border: 1px solid #ccc; /* 添加边框样式 */
}
</style>
