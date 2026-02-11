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

		<!-- 代码编辑区域 -->
		<div class="panel-section mb-2">
			<div class="panel-header">
				<span>分支判断代码</span>
			</div>
			<code-editor v-model="node.switchParams.code" :json="false" :readonly="false" theme="nord" height="250px" />
		</div>

		<!-- 分支列表配置 -->
		<div class="panel-section mb-2">
			<div class="panel-header flex justify-between items-center">
				<span>分支列表</span>
				<el-button type="primary" size="small" @click="addCase">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>

			<div class="params-list">
				<div v-for="(item, index) in node.switchParams.cases" :key="index" class="mb-2">
					<div class="param-item">
						<el-row :gutter="12">
							<el-col :span="9">
								<el-input v-model="item.name" placeholder="分支名称" />
							</el-col>
							<el-col :span="12">
								<el-input v-model="item.value" placeholder="分支值" />
							</el-col>
							<el-col :span="3">
								<el-button @click="removeCase(index)">
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

		<!-- 输出变量 -->
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
import { Plus, Delete } from '@element-plus/icons-vue';
import common from './common.ts';
import './panel.css';
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';

export default {
	name: 'SwitchPanel',
	inject: ['parent'],
	components: {
		CodeEditor,
		Plus,
		Delete,
	},
	mixins: [common],
	data() {
		return {};
	},
	props: {
		node: {
			type: Object,
			required: true,
		},
	},
	methods: {
		addCase() {
			if (!this.node.switchParams.cases) {
				this.node.switchParams.cases = [];
			}
			this.node.switchParams.cases.push({
				name: `分支${this.node.switchParams.cases.length + 1}`,
				value: this.node.switchParams.cases.length,
			});

			// 通知父组件更新连线
			this.$nextTick(() => {
				this.parent.updateNodeConnections(this.node);
			});
		},
		removeCase(index) {
			this.node.switchParams.cases.splice(index, 1);

			// 通知父组件更新连线
			this.$nextTick(() => {
				this.parent.updateNodeConnections(this.node, index);
			});
		},
	},
};
</script>

<style lang="scss" scoped>
/* 组件特定样式可以在这里添加 */
</style>
