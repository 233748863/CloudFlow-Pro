<template>
	<div class="panel-content">
		<!-- 请求方法 -->
		<div class="panel-section mb-2">
			<div class="panel-header">
				<span>请求方法</span>
			</div>
			<div class="param-item">
				<el-row :gutter="12">
					<el-col :span="6">
						<el-select v-model="node.httpParams.method" class="w-full">
							<el-option value="GET" label="GET" />
							<el-option value="POST" label="POST" />
							<el-option value="PUT" label="PUT" />
							<el-option value="DELETE" label="DELETE" />
						</el-select>
					</el-col>
					<el-col :span="18">
						<el-input v-model="node.httpParams.url" placeholder="请求URL 可使用 ${变量名} 格式引用定义的变量" />
					</el-col>
				</el-row>
			</div>
		</div>

		<!-- 请求参数 -->
		<div class="panel-section mb-2">
			<div class="panel-header flex justify-between items-center">
				<span>请求参数</span>
				<el-button type="primary" size="small" @click="addHttpParam">
					<el-icon>
						<Plus />
					</el-icon>
					添加
				</el-button>
			</div>

			<el-tabs v-model="activeTab">
				<el-tab-pane label="Params" name="params">
					<div class="params-list">
						<div v-for="(param, index) in node.httpParams.paramsParams" :key="index" class="mb-2">
							<div class="param-item">
								<el-row :gutter="12">
									<el-col :span="9">
										<el-input v-model="param.name" placeholder="参数名称" />
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
				</el-tab-pane>

				<el-tab-pane label="Body" name="body" v-if="['POST', 'PUT'].includes(node.httpParams.method)">
					<el-radio-group v-model="node.httpParams.contentType" size="small" class="mb-2">
						<el-radio label="none">无</el-radio>
						<el-radio label="form-data">Form Data</el-radio>
						<el-radio label="json">JSON</el-radio>
					</el-radio-group>

					<template v-if="node.httpParams.contentType === 'form-data'">
						<div class="params-list">
							<div v-for="(param, index) in node.httpParams.bodyParams" :key="index" class="mb-2">
								<div class="param-item">
									<el-row :gutter="12">
										<el-col :span="9">
											<el-input v-model="param.name" placeholder="参数名称" />
										</el-col>
										<el-col :span="12">
											<el-select v-model="param.type" placeholder="变量值" class="w-full">
												<el-option-group v-for="item in previousOutputParams" :key="item.name" :label="item.name">
													<el-option v-for="param in item.list" :key="param.name" :label="param.name" :value="`${item.id}.${param.name}`" />
												</el-option-group>
											</el-select>
										</el-col>
										<el-col :span="3">
											<el-button @click="removeBody(index)">
												<el-icon>
													<Delete />
												</el-icon>
											</el-button>
										</el-col>
									</el-row>
								</div>
							</div>
						</div>
					</template>

					<template v-else-if="node.httpParams.contentType === 'json'">
						<el-row class="param-item-margin">
							<el-alert type="info" show-icon :closable="false">
								<template #title>
									<el-text size="small">请严格检查是否符合 JSON 格式，支持使用 ${变量名} 引用变量</el-text>
								</template>
							</el-alert>
						</el-row>
						<el-row>
							<code-editor v-model="node.httpParams.jsonBody" :json="true" :readonly="false" theme="nord" height="250px" />
						</el-row>
					</template>
				</el-tab-pane>

				<el-tab-pane label="Headers" name="headers">
					<div class="params-list">
						<div v-for="(header, index) in node.httpParams.headerParams" :key="index" class="mb-2">
							<div class="param-item">
								<el-row :gutter="12">
									<el-col :span="9">
										<el-input v-model="header.name" placeholder="Header名称" />
									</el-col>
									<el-col :span="12">
										<el-select v-model="header.value" placeholder="变量值" class="w-full">
											<el-option-group v-for="item in previousOutputParams" :key="item.name" :label="item.name">
												<el-option v-for="param in item.list" :key="param.name" :label="param.name" :value="`${item.id}.${param.name}`" />
											</el-option-group>
										</el-select>
									</el-col>
									<el-col :span="3">
										<el-button @click="removeHeader(index)">
											<el-icon>
												<Delete />
											</el-icon>
										</el-button>
									</el-col>
								</el-row>
							</div>
						</div>
					</div>
				</el-tab-pane>
			</el-tabs>
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
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';

export default {
	name: 'HttpPanel',
	components: {
		CodeEditor,
		Plus,
		Delete,
	},
	mixins: [common],
	data() {
		return {
			activeTab: 'params', // 默认显示Params标签页
		};
	},
	methods: {
		addHttpParam() {
			if (this.activeTab === 'params') {
				this.node.httpParams.paramsParams.push({});
			} else if (this.activeTab === 'headers') {
				this.node.httpParams.headerParams.push({});
			} else {
				this.node.httpParams.bodyParams.push({});
			}
		},
		addParam() {
			this.node.httpParams.paramsParams.push({});
		},
		removeParam(index) {
			this.node.httpParams.paramsParams.splice(index, 1);
		},
		addHeader() {
			this.node.httpParams.headerParams.push({});
		},
		removeHeader(index) {
			this.node.httpParams.headerParams.splice(index, 1);
		},
		addBody() {
			this.node.httpParams.bodyParams.push({});
		},
		removeBody(index) {
			this.node.httpParams.bodyParams.splice(index, 1);
		},
	},
};
</script>

<style>
/* 组件特定样式可以在这里添加 */
</style>
