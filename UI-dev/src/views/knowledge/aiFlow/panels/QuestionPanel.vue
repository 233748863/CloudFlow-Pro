<template>
	<div class="panel-content">
		<!-- 输入参数配置 -->
		<div class="mb-2 panel-section">
			<div class="flex justify-between items-center panel-header">
				<span>输入变量</span>
				<el-button type="primary" size="small" @click="addParam">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>

			<div class="params-list">
				<div v-for="(param, index) in inputParams" :key="index" class="mb-2">
					<div class="param-item">
						<el-row :gutter="12">
							<el-col :span="9">
								<el-input v-model="param.name" placeholder="变量名" />
							</el-col>
							<el-col :span="12">
								<el-select v-model="param.type" placeholder="变量值" class="w-full">
									<el-option-group v-for="item in previousOutputParams" :key="item.name" :label="item.name">
										<el-option v-for="param in item.list" :key="param.name" :label="param.name" :value="`${item.id}.${param.name}`" />
									</el-option-group>
								</el-select>
							</el-col>
							<el-col :span="3">
								<el-button @click="removeParam(index)">
									<el-icon>
										<Delete />
									</el-icon>
								</el-button>
							</el-col>
						</el-row>
					</div>
				</div>
			</div>
		</div>

		<!-- 分类列表配置 -->
		<div class="mb-4 panel-section">
			<div class="flex justify-between items-center panel-header">
				<span>问题分类</span>
				<el-button type="primary" size="small" @click="addClass">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>

			<div class="params-list">
				<div v-for="(item, index) in node.questionParams?.categories" :key="index" class="mb-2">
					<div class="param-item">
						<el-row :gutter="12">
							<el-col :span="9">
								<el-input v-model="item.name" placeholder="分类名称" disabled>
									<template #prepend>分类</template>
								</el-input>
							</el-col>
							<el-col :span="12">
								<el-input v-model="item.value" placeholder="请输入主题内容" />
							</el-col>
							<el-col :span="3">
								<el-button @click="removeClass(index)">
									<el-icon>
										<Delete />
									</el-icon>
								</el-button>
							</el-col>
						</el-row>
					</div>
				</div>
			</div>
		</div>

		<!-- 模型参数配置 -->
		<div class="mb-4 panel-section">
			<div class="panel-header">
				<span>模型配置</span>
			</div>

			<el-form label-position="top">
				<div class="param-item param-item-margin">
					<div class="flex items-center">
						<span class="mr-2">调度模型：</span>
						<model-select v-model="modelConfig.model" :type="['Chat']" class="flex-1" />
					</div>
				</div>
				<div class="param-item param-item-margin">
					<el-row :gutter="12">
						<el-col :span="8">
							<el-form-item label="最大 Tokens">
								<el-input-number v-model="modelConfig.max_tokens" :min="1" :max="100" class="w-full" />
							</el-form-item>
						</el-col>
						<el-col :span="8">
							<el-form-item label="Temperature">
								<el-input-number v-model="modelConfig.temperature" :min="0" :max="2" :step="0.1" class="w-full" />
							</el-form-item>
						</el-col>
						<el-col :span="8">
							<el-form-item label="Top P">
								<el-input-number v-model="modelConfig.top_p" :min="0" :max="1" :step="0.1" class="w-full" />
							</el-form-item>
						</el-col>
					</el-row>
				</div>
			</el-form>
		</div>

		<!-- 输出变量展示 -->
		<div class="panel-section">
			<div class="panel-header">
				<span>输出变量</span>
			</div>

			<div class="params-list">
				<div v-for="(output, index) in outputParams" :key="index" class="mb-4">
					<div class="param-item">
						<el-row :gutter="12">
							<el-col :span="9">
								<el-text> 变量名： </el-text>
								<el-tag>{{ output.name }}</el-tag>
							</el-col>
							<el-col :span="2">
								<el-text>|</el-text>
							</el-col>
							<el-col :span="11">
								<el-text> 变量类型： </el-text>
								<el-tag>{{ output.type }}</el-tag>
							</el-col>
						</el-row>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { Plus, Delete } from '@element-plus/icons-vue';
import { reactive } from 'vue';
import common from './common.ts';
import './panel.css';
import ModelSelect from '../components/ModelSelect.vue';

export default {
	name: 'QuestionPanel',
	inject: ['parent'],
	components: {
		Plus,
		Delete,
		ModelSelect,
	},
	mixins: [common],
	props: {
		node: {
			type: Object,
			required: true,
		},
	},
	setup(props) {
		const modelConfig = reactive(
			props.node.questionParams.modelConfig || {
				model: '',
				max_tokens: 50,
				temperature: 0.7,
				top_p: 1,
			}
		);

		if (!props.node.questionParams.modelConfig) {
			props.node.questionParams.modelConfig = modelConfig;
		}

		return {
			modelConfig,
		};
	},
	methods: {
		addClass() {
			if (!this.node.questionParams?.categories) {
				this.node.questionParams.categories = [];
			}
			this.node.questionParams.categories.push({
				name: `${this.node.questionParams.categories.length + 1}`,
				value: '',
			});

			this.$nextTick(() => {
				this.parent.updateNodeConnections(this.node);
			});
		},
		removeClass(index) {
			this.node.questionParams.categories.splice(index, 1);

			this.$nextTick(() => {
				this.parent.updateNodeConnections(this.node, index);
			});
		},
	},
};
</script>

<style>
/* 组件特定样式可以在这里添加 */
</style>
