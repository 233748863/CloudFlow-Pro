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
								<el-select v-model="param.type" placeholder="变量值">
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

		<!-- 消息模板 -->
		<div class="mb-2 panel-section">
			<div class="panel-header">
				<span>消息模板</span>
			</div>

			<div class="mb-2 template-select">
				<el-select v-model="node.noticeParams.channelId" placeholder="请选择渠道" style="width: 200px" @change="handleChannelChange">
					<el-option v-for="channel in channelList" :key="channel.value" :value="channel.value" :label="channel.label" />
				</el-select>
				<el-select
					v-model="node.noticeParams.templateId"
					placeholder="请选择模板"
					style="width: 400px"
					:disabled="!node.noticeParams.channelId"
					@change="handleTemplateChange"
				>
					<el-option v-for="template in templateList" :key="template.configKey" :value="template.configKey" :label="template.configName" />
				</el-select>
			</div>
		</div>

		<!-- 消息内容 -->
		<div class="mb-2 panel-section">
			<div class="panel-header">
				<span>消息内容</span>
			</div>
			<code-editor v-model="node.noticeParams.templateCode" :json="false" :readonly="false" theme="nord" height="250px" />
		</div>
	</div>
</template>

<script>
import { Plus, Delete } from '@element-plus/icons-vue';
import common from './common';
import './panel.css';
import { list } from '/@/api/admin/message';
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';

export default {
	name: 'NoticePanel',
	components: {
		Plus,
		Delete,
		CodeEditor,
	},
	mixins: [common],
	data() {
		return {
			channelList: [
				{
					value: 'webhook',
					label: 'HOOK',
				},
				{
					value: 'sms',
					label: '短信',
				},
				{
					value: 'email',
					label: '邮件',
				},
			], // 渠道列表
			templateList: [], // 模板列表
		};
	},
	created() {},
	methods: {
		// 渠道变更处理
		async handleChannelChange() {
			if (this.node.noticeParams.channelId) {
				const { data } = await list({ messageType: this.node.noticeParams.channelId });
				this.templateList = data || [];
			}
		},
		// 模板变更处理
		handleTemplateChange() {
			// 存储模板ID和模板代码
			if (this.currentTemplate) {
				this.node.noticeParams.templateId = this.currentTemplate.configKey;
				this.node.noticeParams.templateCode = this.currentTemplate.templateCode;
			} else {
				this.node.noticeParams.templateCode = '';
			}
		},
	},
	computed: {
		// 获取当前选中的模板对象
		currentTemplate() {
			return this.templateList.find((template) => template.configKey === this.node.noticeParams.templateId) || {};
		},
	},
};
</script>

<style scoped>
.template-select {
	display: flex;
	gap: 10px;
}

.template-select .form-select {
	flex: 1;
}

.template-params {
	margin-bottom: 8px;
	padding: 8px;
	background-color: #f5f7fa;
	border-radius: 4px;
}

.template-param-title {
	font-size: 12px;
	color: #606266;
	margin-bottom: 4px;
}

.template-param-content {
	font-size: 14px;
	color: #303133;
	word-break: break-all;
}
</style>
