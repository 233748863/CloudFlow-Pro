<template>
	<div class="panel-content">
		<!-- 输入变量部分 -->
		<div class="mb-2 panel-section">
			<div class="flex justify-between items-center panel-header">
				<span>变量输入</span>
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

		<!-- 消息列表部分 -->
		<div class="mb-2 panel-section">
			<div class="flex justify-between items-center panel-header">
				<span>对话消息</span>
				<el-button type="primary" size="small" @click="addMessage">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>
			<div class="param-item">
				<el-draggable v-model="messages" :animation="200" item-key="index" handle=".drag-handle" class="w-full">
					<template #item="{ element: message, index }">
						<div class="mb-2">
							<div style="display: flex; align-items: center; margin-bottom: 5px">
								<el-icon class="cursor-move drag-handle">
									<Rank />
								</el-icon>
								<el-select v-model="message.role" class="w-full">
									<el-option v-for="option in roleOptions" :key="option.value" :label="option.label" :value="option.value" />
								</el-select>
								<el-button v-if="index !== 0" @click="removeMessage(index)">
									<el-icon>
										<Delete />
									</el-icon>
								</el-button>
							</div>
							<el-input v-model="message.content" type="textarea" :rows="3" placeholder="使用${变量名}格式引用上方定义的变量" />
						</div>
					</template>
				</el-draggable>
			</div>
		</div>

		<!-- 模型参数配置 -->
		<div class="mb-2 panel-section">
			<div class="panel-header">
				<span>模型配置</span>
			</div>

			<el-form label-position="top">
				<div class="param-item param-item-margin">
					<div class="flex items-center">
						<span class="mr-2">大模型：</span>
						<model-select v-model="modelConfig.model" class="flex-1" />
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

		<!-- 输出变量部分 -->
		<div class="panel-section">
			<div class="panel-header">
				<span>输出变量</span>
			</div>

			<div class="params-list">
				<div v-for="(output, index) in outputParams" :key="index" class="mb-2">
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
import { Plus, Delete, Rank } from '@element-plus/icons-vue';
import common from './common';
import draggable from 'vuedraggable';
import ModelSelect from '../components/ModelSelect.vue';

export default {
	name: 'LlmPanel',
	mixins: [common],
	components: {
		Plus,
		Delete,
		Rank,
		'el-draggable': draggable,
		ModelSelect,
	},
	data() {
		return {
			messages: this.node.llmParams.messages,
			modelConfig: this.node.llmParams.modelConfig || {
				model: '',
				max_tokens: 50,
				temperature: 0.7,
				top_p: 1,
			},
			modelList: [],
			roleOptions: [
				{ value: 'SYSTEM', label: 'SYSTEM' },
				{ value: 'USER', label: 'USER' },
				{ value: 'AI', label: 'ASSISTANT' },
			],
		};
	},
	methods: {
		addMessage() {
			this.messages.push({
				role: 'USER',
				content: '',
			});
		},
		removeMessage(index) {
			if (this.messages.length > 1) {
				this.messages.splice(index, 1);
			}
		},
	},
};
</script>

<style scoped>
.cursor-move {
	margin-right: 10px;
}
.w-full {
	margin-right: 15px;
}
</style>
