<template>
	<el-drawer v-model="visible" :title="'流程运行' + id" :size="800" @close="$emit('close')" class="execution-drawer">
		<!-- 添加标签页切换 -->
		<div class="tab-container">
			<div v-if="hasStartParams" class="tab-item" :class="{ active: activeTab === 'run' }" @click="activeTab = 'run'">运行</div>
			<div class="tab-item" :class="{ active: activeTab === 'result' }" @click="activeTab = 'result'">结果</div>
			<div class="tab-item" :class="{ active: activeTab === 'trace' }" @click="activeTab = 'trace'">追踪</div>
		</div>

		<div class="p-2.5 h-[calc(100vh-180px)] overflow-y-auto">
			<!-- 添加运行选项卡内容 -->
			<div v-show="activeTab === 'run'">
				<div class="p-4">
					<div class="mb-4 space-y-3">
						<div v-for="(param, index) in startParams" :key="index" class="flex items-center">
							<div class="flex-shrink-0 pr-3 w-24 text-sm text-right text-gray-600" :class="{ 'text-red-500': param.required }">
								{{ param.name }}
							</div>
							<div class="flex-1">
								<input
									v-if="param.inputType === 'input'"
									v-model="param.value"
									class="px-3 w-full h-9 text-sm leading-9 text-gray-700 rounded border border-gray-300 transition-colors outline-none hover:border-gray-400 focus:border-blue-500"
									:class="{ 'border-red-500': showError && param.required && !param.value }"
									:placeholder="'请输入' + param.name"
								/>
								<input
									v-else-if="param.inputType === 'number'"
									type="number"
									v-model.number="param.value"
									class="px-3 w-full h-9 text-sm leading-9 text-gray-700 rounded border border-gray-300 transition-colors outline-none hover:border-gray-400 focus:border-blue-500"
									:class="{ 'border-red-500': showError && param.required && !param.value }"
									:placeholder="'请输入' + param.name"
								/>
								<textarea
									v-else-if="param.inputType === 'textarea'"
									v-model="param.value"
									class="px-3 py-2 w-full text-sm leading-normal text-gray-700 rounded border border-gray-300 transition-colors outline-none resize-y min-h-20 hover:border-gray-400 focus:border-blue-500"
									:class="{ 'border-red-500': showError && param.required && !param.value }"
									:placeholder="'请输入' + param.name"
									rows="3"
								></textarea>
								<select
									v-else-if="param.inputType === 'select'"
									v-model="param.value"
									class="px-3 w-full h-9 text-sm leading-9 text-gray-700 bg-white rounded border border-gray-300 transition-colors appearance-none outline-none hover:border-gray-400 focus:border-blue-500"
									:class="{ 'border-red-500': showError && param.required && !param.value }"
								>
									<option value="">请选择{{ param.name }}</option>
									<option v-for="option in param.options" :key="option.value" :value="option.value">
										{{ option.label }}
									</option>
								</select>
								<div class="mt-1 text-xs text-red-500" v-if="showError && param.required && !param.value && false">
									请{{
										param.inputType === 'input' ? '输入' : param.inputType === 'textarea' ? '填写' : param.inputType === 'select' ? '选择' : '填写'
									}}{{ param.name }}
								</div>
							</div>
						</div>
					</div>
					<div class="flex justify-center">
						<el-button type="primary" class="w-[70%]" @click="handleRun"> 运行 </el-button>
					</div>
				</div>
			</div>

			<!-- 结果标签页 -->
			<div v-show="activeTab === 'result'">
				<div class="execution-detail">
					<div class="bg-green-50 rounded-lg border border-green-200">
						<div class="flex justify-between items-center">
							<div class="flex-1 py-2 text-center border-r border-green-200/80">
								<div class="mb-1 text-xs text-gray-600">状态</div>
								<div
									class="text-sm font-medium"
									:class="{
										'text-green-500': executionStatus.class === 'status-success',
										'text-red-500': executionStatus.class === 'status-error',
										'text-blue-500': executionStatus.class === 'status-running',
										'text-gray-400': executionStatus.class === 'status-pending',
									}"
								>
									{{ executionStatus.text }}
								</div>
							</div>
							<div class="flex-1 py-2 text-center border-r border-green-200/80">
								<div class="mb-1 text-xs text-gray-600">运行时间</div>
								<div class="text-sm font-medium text-green-500">{{ formatTotalTime(executionTime) }}</div>
							</div>
							<div class="flex-1 py-2 text-center">
								<div class="mb-1 text-xs text-gray-600">总 TOKEN 数</div>
								<div class="text-sm font-medium text-green-500">{{ totalTokens }} Tokens</div>
							</div>
						</div>
					</div>
				</div>
				<!-- 执行结果 -->
				<div class="p-4 mt-5" v-if="finalResult">
					<div class="panel-section">
						<div class="flex justify-between items-center mb-2 panel-header">
							<span class="text-sm font-medium">执行结果</span>
							<div class="flex gap-2">
								<el-button type="primary" size="small" @click="copyResult" class="flex items-center">
									<el-icon class="mr-1"><Document /></el-icon>
									复制
								</el-button>
							</div>
						</div>
						<code-editor v-model="resultJson" :json="true" :readonly="true" theme="nord" height="250px" />
					</div>
				</div>
			</div>

			<!-- 追踪标签页 -->
			<div v-show="activeTab === 'trace'" class="p-4">
				<!-- 执行进度状态指示器 -->
				<div v-if="isExecuting" class="flex flex-col justify-center items-center mb-6">
					<div class="flex justify-center items-center mb-3">
						<div class="loading loading-spinner loading-md text-primary"></div>
						<span class="ml-3 text-sm font-medium text-gray-700">正在执行中...</span>
					</div>
				</div>

				<!-- 执行完成状态 -->
				<div v-if="isExecutionComplete" class="flex justify-center items-center py-2 mb-6">
					<div class="flex justify-center items-center">
						<div
							class="flex justify-center items-center w-6 h-6 rounded-full"
							:class="{ 'bg-green-100': executionStatus.class === 'status-success', 'bg-red-100': executionStatus.class === 'status-error' }"
						>
							<i
								class="text-lg"
								:class="{
									'i-tabler-check text-green-500': executionStatus.class === 'status-success',
									'i-tabler-x text-red-500': executionStatus.class === 'status-error',
								}"
							></i>
						</div>
						<span
							class="ml-2 text-sm font-medium"
							:class="{ 'text-green-600': executionStatus.class === 'status-success', 'text-red-600': executionStatus.class === 'status-error' }"
						>
							{{ executionStatus.text }}
						</span>
					</div>
				</div>

				<!-- 执行进度 -->
				<node-list :nodes="executionNodes" @end="handleEnd" />
			</div>
		</div>
	</el-drawer>
</template>

<script>
import NodeList from './components/NodeList.vue';
import CodeEditor from './components/CodeEditor.vue';
import { Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

export default {
	name: 'ExecutionPanel',
	components: {
		NodeList,
		CodeEditor,
		Document,
	},
	props: {
		modelValue: {
			type: Boolean,
			default: false,
		},
		id: {
			type: [String, Number],
			default: '',
		},
		executionNodes: {
			type: Array,
			default: () => [],
		},
		finalResult: {
			type: Object,
			default: null,
		},
		executionTime: {
			type: [Number, String],
			default: 0,
		},
		totalTokens: {
			type: Number,
			default: 0,
		},
		startParams: {
			type: Array,
			default: () => [],
		},
	},
	data() {
		return {
			activeTab: '',
			showError: false,
			isExecuting: false,
		};
	},
	computed: {
		visible: {
			get() {
				return this.modelValue;
			},
			set(value) {
				this.$emit('update:modelValue', value);
			},
		},
		executionStatus() {
			const lastNode = this.executionNodes[this.executionNodes.length - 1];

			if (!lastNode) return { text: '等待中', class: 'status-pending' };

			const statusMap = {
				running: { text: '运行中', class: 'status-running' },
				success: { text: '成功', class: 'status-success' },
				error: { text: '失败', class: 'status-error' },
				skipped: { text: '已跳过', class: 'status-skipped' },
			};

			return statusMap[lastNode.status] || { text: '等待中', class: 'status-pending' };
		},
		hasStartParams() {
			return this.startParams && this.startParams.length > 0;
		},
		isExecutionComplete() {
			return this.executionNodes.length > 0 && (this.executionStatus.class === 'status-success' || this.executionStatus.class === 'status-error');
		},
		totalNodes() {
			return this.executionNodes.length;
		},
		completedNodes() {
			return this.executionNodes.filter((node) => node.status === 'success' || node.status === 'error' || node.status === 'skipped').length;
		},
		executionProgress() {
			if (this.totalNodes === 0) return 0;
			return (this.completedNodes / this.totalNodes) * 100;
		},
		resultJson() {
			return this.finalResult ? JSON.stringify(this.finalResult, null, 2) : '';
		},
	},
	watch: {
		finalResult() {
			this.activeTab = 'result';
			this.isExecuting = false;
		},
		isExecutionComplete(newVal) {
			if (newVal) {
				this.isExecuting = false;
			}
		},
	},
	created() {
		this.activeTab = this.hasStartParams ? 'run' : 'trace';
	},
	methods: {
		formatTotalTime(time) {
			if (!time) return '0秒';

			// 将毫秒转换为秒
			const seconds = Number(time) / 1000;

			// 保留3位小数并添加单位
			return `${seconds.toFixed(3)}秒`;
		},
		handleRun() {
			// 验证必填参数
			const hasError = this.startParams.some((param) => param.required && !param.value);
			this.showError = hasError;

			if (hasError) {
				return;
			}

			this.isExecuting = true;

			this.$emit('run', this.startParams);
			this.activeTab = 'trace';
			this.showError = false;
		},
		handleEnd() {
			this.isExecuting = false;
			//this.$emit('close');
		},
		copyResult() {
			if (this.resultJson) {
				navigator.clipboard
					.writeText(this.resultJson)
					.then(() => {
						ElMessage.success('复制成功');
					})
					.catch(() => {
						ElMessage.error('复制失败');
					});
			}
		},
	},
};
</script>

<style lang="scss">
.execution-drawer {
	.el-drawer__body {
		padding: 0;
	}
}

.tab-container {
	display: flex;
	border-bottom: 1px solid #e4e7ed;
	background: white;
	padding: 0 16px;
	position: sticky;
	top: 0;
	z-index: 10;
}

.tab-item {
	position: relative;
	padding: 12px 20px;
	cursor: pointer;
	color: #909399;
	font-size: 14px;
	transition: all 0.3s;
	user-select: none;
	margin-right: 32px;

	&:hover {
		color: #409eff;
	}

	&.active {
		color: #409eff;
		font-weight: 500;

		&:after {
			content: '';
			position: absolute;
			bottom: -1px;
			left: 0;
			right: 0;
			height: 2px;
			background: #409eff;
			border-radius: 1px;
		}
	}
}

.panel-section {
	background-color: #fff;
	border-radius: 4px;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	overflow: hidden;
}

.panel-header {
	padding: 8px 12px;
	font-weight: 500;
	color: #303133;
	background-color: #f5f7fa;
	border-bottom: 1px solid #e4e7ed;
}
</style>
