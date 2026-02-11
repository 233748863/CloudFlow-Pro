<template>
	<div class="workflow-toolbar">
		<div class="toolbar-box">
			<!-- 主工具栏分组 -->
			<div class="toolbar-group">
				<el-tooltip content="检查工作流" placement="bottom">
					<el-button class="toolbar-btn" @click="handleCheck">
						<el-icon>
							<List />
						</el-icon>
						<span v-if="validation && !validation.isValid" class="badge">
							{{ validation.errors.length }}
						</span>
					</el-button>
				</el-tooltip>

				<el-tooltip content="环境设置" placement="bottom">
					<el-button class="toolbar-btn" @click="handleEnvSettings">
						<el-icon>
							<Setting />
						</el-icon>
					</el-button>
				</el-tooltip>

				<el-tooltip content="数据结构" placement="bottom">
					<el-button class="toolbar-btn" @click="handlePreview">
						<el-icon>
							<Document />
						</el-icon>
					</el-button>
				</el-tooltip>

				<el-tooltip content="API 信息" placement="bottom">
					<el-button class="toolbar-btn" @click="showApi = true">
						<el-icon>
							<Connection />
						</el-icon>
					</el-button>
				</el-tooltip>

				<template v-if="parent.isChatFlow">
					<el-tooltip content="开场白设置" placement="bottom">
						<el-button class="toolbar-btn" @click="showGreetingEditor = true">
							<el-icon>
								<ChatDotRound />
							</el-icon>
						</el-button>
					</el-tooltip>
				</template>
			</div>

			<!-- 运行按钮 -->
			<el-button class="run-btn" :disabled="!canRun" icon="video-play" @click="handleCommand('run')"> 运行 </el-button>
			<!-- 发布按钮 -->
			<el-dropdown @command="handleCommand">
				<el-button class="publish-btn" type="primary" icon="circle-check" @click="handleSave"> 保存 </el-button>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item command="share" v-if="parent.isChatFlow">
							<el-icon><Share /></el-icon>
							分享流程
						</el-dropdown-item>
						<el-dropdown-item command="runs">
							<el-icon><Upload /></el-icon>
							保存并发布
						</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>

			<!-- 关闭按钮 -->
			<el-tooltip content="关闭" placement="bottom">
				<el-button class="close-btn" @click="handleClose">
					<el-icon>
						<CloseBold />
					</el-icon>
				</el-button>
			</el-tooltip>

			<!-- 面板组件 -->
			<json-preview-panel v-model="showPreview" />
			<checkListPanel v-show="showCheck" v-model:validation="validation" @close="showCheck = false" />
			<envSettingsPanel v-model="showEnv" @close="closeEnvPanel" />
			<api-panel v-model="showApi" :flow-id="parent.id" />
			<!-- 添加开场白编辑器组件 -->
			<greeting-editor v-model="showGreetingEditor" />
		</div>
	</div>
</template>

<script>
import { putObj } from '/@/api/knowledge/aiFlow';
import { List, Setting, Upload, Document, Share, ChatDotRound, CloseBold, Connection } from '@element-plus/icons-vue';
import JsonPreviewPanel from './JsonPreviewPanel.vue';
import CheckListPanel from './CheckListPanel.vue';
import EnvSettingsPanel from './EnvSettingsPanel.vue';
import ApiPanel from './ApiPanel.vue';
import { useRouter } from 'vue-router';
import GreetingEditor from './GreetingEditor.vue';

export default {
	name: 'Toolbar',
	inject: ['parent'],
	components: {
		CheckListPanel,
		EnvSettingsPanel,
		JsonPreviewPanel,
		GreetingEditor,
		ApiPanel,
		Upload,
		Share,
		List,
		Setting,
		Document,
		Connection,
		ChatDotRound,
		CloseBold,
	},
	setup() {
		const router = useRouter();

		const update = async (data) => {
			return putObj(data);
		};

		return { router, update };
	},
	data() {
		return {
			showEmbed: false,
			showGreetingEditor: false,
			showApi: false,
			validation: {
				errors: [],
				isValid: false,
			},
			showEnv: false,
			showPreview: false,
			showCheck: false,
		};
	},
	computed: {
		canRun() {
			return this.validation && this.validation.isValid;
		},
	},
	methods: {
		handlePreview() {
			this.showPreview = !this.showPreview;
		},
		async handleSave() {
			this.showPreview = false;

			const { nodes, connections } = this.parent;
			// 构建完整的工作流状态
			const state = {
				nodes,
				connections,
				env: this.parent.env,
				greeting: this.parent.dsl.greetingText,
				questions: this.parent.dsl.questions,
			};

			try {
				// 构建工作流DSL数据
				const workflowData = {
					id: this.parent.id,
					dsl: JSON.stringify(state),
				};

				// 调用API保存工作流
				await this.update(workflowData);

				this.$message.success('保存成功');
			} catch (error) {
				this.$message.error('保存失败：' + error.message);
			}
		},

		handleCheck() {
			this.showCheck = !this.showCheck;
		},
		handleRun() {
			this.$emit('run');
		},
		handleEnvSettings() {
			this.showEnv = true;
		},
		handleWorkflowRun() {
			this.handleSave();
			// 根据工作流类型打开对应的运行页面
			const flowType = this.parent.isChatFlow ? 'chatflow' : 'flow';
			window.open(flow.runUrl(flowType, this.parent.id), '_blank');
		},
		// 关闭环境设置面板
		closeEnvPanel() {
			this.showEnv = false;
		},
		// 添加下拉菜单命令处理方法
		handleCommand(command) {
			switch (command) {
				case 'save':
					this.handleSave();
					break;
				case 'share':
					this.showEmbed = true;
					break;
				case 'run':
					this.handleRun();
					break;
				case 'runs':
					this.handleWorkflowRun();
					break;
			}
		},
		// 添加关闭方法
		handleClose() {
			this.$router.go(-1); // 返回上一页
		},
	},
	emits: ['run'],
};
</script>

<style lang="scss" scoped>
.workflow-toolbar {
	padding: 5px 0;
	position: absolute;
	right: 0;
	background: #fff;
	z-index: 100;
}
.toolbar-box {
	display: flex;
	gap: 12px;
	align-items: center;
	padding: 0 20px;
}

.toolbar-group {
	display: flex;
	gap: 4px;
	padding: 4px;

	.toolbar-btn {
		margin: 0;
		padding: 8px 12px;
		height: auto;
	}
}

.publish-btn {
	margin-left: 4px;
}

.run-btn {
	margin-top: 0;
	margin-left: 8px;
}

.close-btn {
	margin-left: 8px;
}

.badge {
	padding: 0 6px;
	background: #ff4d4f;
	border-radius: 10px;
	color: white;
	font-size: 12px;
	line-height: 16px;
}
</style>
