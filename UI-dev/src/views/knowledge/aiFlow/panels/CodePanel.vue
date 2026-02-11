<template>
	<div class="panel-content">
		<!-- 输入参数配置 -->
		<div class="panel-section mb-2">
			<div class="panel-header flex justify-between items-center">
				<span>输入变量</span>
				<el-button type="primary" size="small" @click="addParam">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>

			<div class="params-list">
				<div v-for="(param, index) in inputParams" :key="index" class="mb-4">
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

		<!-- 代码编辑区域 -->
		<div class="panel-section mb-2">
			<div class="panel-header">
				<span>代码编辑</span>
			</div>
			<code-editor v-model="node.codeParams.code" :json="false" :readonly="false" theme="nord" height="250px" />
		</div>

		<!-- 输出参数配置 -->
		<div class="panel-section">
			<div class="panel-header flex justify-between items-center">
				<span>输出变量</span>
				<el-button type="primary" size="small" @click="addOutput">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>

			<div class="params-list">
				<div v-for="(output, index) in outputParams" :key="index" class="mb-4">
					<div class="param-item">
						<el-row :gutter="12">
							<el-col :span="9">
								<el-input v-model="output.name" placeholder="变量名" />
							</el-col>
							<el-col :span="12">
								<el-select v-model="output.type" placeholder="类型" class="w-full">
									<el-option label="String" value="String" />
									<el-option label="Number" value="Number" />
									<el-option label="Boolean" value="Boolean" />
									<el-option label="Object" value="Object" />
									<el-option label="Array" value="Array" />
								</el-select>
							</el-col>
							<el-col :span="3">
								<el-button @click="removeOutput(index)">
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
	</div>
</template>

<script>
import { Plus, Delete } from '@element-plus/icons-vue';
import common from './common.ts';
import './panel.css';
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';

export default {
	name: 'CodePanel',
	components: {
		CodeEditor,
		Plus,
		Delete,
	},
	mixins: [common],
	data() {
		return {
			code: this.node.code || '',
		};
	},
};
</script>

<style>
/* 组件特定样式可以在这里添加 */
</style>
