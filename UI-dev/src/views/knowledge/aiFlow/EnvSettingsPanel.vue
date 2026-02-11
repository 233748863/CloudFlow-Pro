<template>
	<el-dialog title="环境变量设置" v-model="visible" width="650px" class="env-settings-dialog">
		<div class="space-y-4">
			<!-- 顶部操作区 -->
			<div class="flex justify-between items-center pb-3 border-b border-gray-200">
				<div class="text-sm text-gray-500">
					<span>设置流程中全局可使用的变量</span>
				</div>

				<el-button
					class="flex gap-1 items-center text-white bg-blue-500 rounded-md transition-colors hover:bg-blue-600"
					type="primary"
					@click="addEnvVariable"
				>
					<i class="el-icon-plus"></i>
					<span>添加</span>
				</el-button>
			</div>

			<!-- 变量列表 -->
			<div class="space-y-2">
				<transition-group name="env-list">
					<div
						v-for="(item, index) in parent.env"
						:key="index"
						class="flex gap-3 items-center p-2 rounded-lg transition-colors group hover:bg-gray-50"
					>
						<div class="w-2/5">
							<el-input v-model="item.name" placeholder="请输入变量名" class="w-full" />
						</div>
						<div class="w-1/2">
							<el-input v-model="item.value" placeholder="请输入变量值" class="w-full" />
						</div>
						<div class="w-auto">
							<el-button icon="delete" class="text-gray-400 transition-colors hover:text-red-500" @click="deleteEnvVariable(index)" />
						</div>
					</div>
				</transition-group>
			</div>

			<!-- 空状态提示 -->
			<div v-if="!parent.env.length" class="py-8">
				<el-empty description="暂无环境变量" :image-size="100" class="flex flex-col items-center">
					<el-button type="primary" class="mt-4 text-white bg-blue-500 rounded-md transition-colors hover:bg-blue-600" @click="addEnvVariable">
						添加第一个环境变量
					</el-button>
				</el-empty>
			</div>
		</div>

		<!-- 底部操作区 -->
		<template #footer>
			<div class="flex gap-2 justify-end">
				<el-button @click="visible = false">取消</el-button>
				<el-button type="primary" @click="visible = false">确认</el-button>
			</div>
		</template>
	</el-dialog>
</template>

<script>
export default {
	name: 'EnvSettingsPanel',
	inject: ['parent'],
	props: {
		modelValue: {
			type: Boolean,
			default: false,
		},
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
	},
	data() {
		return {
			keyPattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
		};
	},
	created() {
		// Ensure parent.env is initialized as an array
		if (!this.parent.env || !Array.isArray(this.parent.env)) {
			this.parent.env = [];
		}
	},
	methods: {
		addEnvVariable() {
			// Ensure parent.env is an array before pushing
			if (!Array.isArray(this.parent.env)) {
				this.parent.env = [];
			}
			this.parent.env.push({
				name: '',
				value: '',
			});
		},

		deleteEnvVariable(index) {
			if (Array.isArray(this.parent.env)) {
				this.parent.env.splice(index, 1);
			}
		},
	},
};
</script>

<style lang="scss">
.env-settings-dialog {
	/* 基础样式通过 Tailwind 实现 */

	/* 动画效果 */
	.env-list-enter-active,
	.env-list-leave-active {
		transition: all 0.3s ease;
	}

	.env-list-enter-from,
	.env-list-leave-to {
		opacity: 0;
		transform: translateY(-10px);
	}

	:deep(.el-input) {
		.el-input__wrapper {
			@apply border border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all;
		}
	}

	:deep(.el-button) {
		@apply transition-all duration-200;

		&.is-disabled {
			@apply opacity-50 cursor-not-allowed;
		}
	}
}
</style>
