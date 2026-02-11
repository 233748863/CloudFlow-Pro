<template>
	<div class="panel-content">
		<!-- 输出变量配置区域 -->
		<div class="panel-section">
			<div class="panel-header flex justify-between items-center">
				<span>输出变量</span>
				<el-button v-if="parent.isFlow" type="primary" size="small" @click="addParam">
					<el-icon>
						<Plus />
					</el-icon>
					添加输出
				</el-button>
			</div>

			<!-- 输出变量列表 -->
			<div class="params-list">
				<div v-for="(param, index) in inputParams" :key="index" class="mb-2">
					<div class="param-item">
						<el-row :gutter="12">
							<el-col :span="9">
								<el-input v-model="param.name" :disabled="!parent.isFlow" placeholder="变量名" />
							</el-col>
							<el-col :span="12">
								<el-select v-model="param.type" placeholder="变量值" class="w-full">
									<el-option-group v-for="item in previousOutputParams" :key="item.name" :label="item.name">
										<el-option v-for="param in item.list" :key="param.name" :label="param.name" :value="`${item.id}.${param.name}`" />
									</el-option-group>
								</el-select>
							</el-col>
							<el-col :span="3">
								<el-button v-if="parent.isFlow && index > 0" @click="removeParam(index)">
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

export default {
	name: 'EndPanel',
	components: {
		Plus,
		Delete,
	},
	mixins: [common],
};
</script>

<style>
/* 组件特定样式可以在这里添加 */
</style>
