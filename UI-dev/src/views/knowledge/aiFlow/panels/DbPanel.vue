<template>
	<div class="panel-content">
		<!-- 输入变量部分 -->
		<div class="mb-2 panel-section">
			<div class="flex justify-between items-center panel-header">
				<span>变量输入</span>
				<el-button @click="addParam" type="primary" size="small">
					<el-icon><Plus /></el-icon>添加
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
									<el-icon><Delete /></el-icon>
								</el-button>
							</el-col>
						</el-row>
					</div>
				</div>
			</div>
		</div>

		<!-- 数据源选择 -->
		<div class="mb-2 panel-section">
			<div class="panel-header">
				<span>数据源选择</span>
			</div>
			<el-select v-model="node.dbParams.dbId" class="w-full" placeholder="请选择数据源" @change="handleDbChange">
				<el-option value="" label="请选择数据源" />
				<el-option v-for="db in dbList" :key="db.id" :value="db.id" :label="db.name" />
			</el-select>
		</div>

		<!-- SQL语句 -->
		<div class="mb-2 panel-section">
			<div class="panel-header">
				<span>SQL语句</span>
			</div>
			<code-editor v-model="node.dbParams.sql" :json="false" :readonly="false" theme="nord" height="250px" />
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
import {list} from "/@/api/gen/datasource";
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';
import { ref } from 'vue';


export default {
	name: 'DbPanel',
	components: {
		CodeEditor,
		Plus,
		Delete,
	},
	mixins: [common],
	data() {
		return {
			dbList: [
			],
		};
	},
	created() {
		this.loadDbList();
	},
	methods: {
		async loadDbList() {
			const {data} = await list()
			this.dbList = data
		},
		handleDbChange() {
			if (!this.node.dbParams.dbId) {
				this.node.dbParams.dbName = '';
				return;
			}
			const selectedDb = this.dbList.find((db) => db.id === this.node.dbParams.dbId);
			if (selectedDb) {
				this.node.dbParams.dbName = selectedDb.name;
			}
		},
	},
	setup() {
		const result = ref(null);
		return {
			result
		};
	},
};
</script>

<style>
/* 组件特定样式可以在这里添加 */
</style>
