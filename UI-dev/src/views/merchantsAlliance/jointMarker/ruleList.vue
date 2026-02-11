<template>
  <div class="flex flex-col gap-4 p-4 h-[calc(100vh-85px)]">
    <!-- 查询条件 -->
    <el-card v-if="state.showSearch">
      <el-form :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="state.searchForm.name" placeholder="请输入规则名称" style="width: 180px" />
        </el-form-item>
        <el-form-item label="触发事件" prop="triggerEvent">
          <el-select v-model="state.searchForm.triggerEvent" placeholder="请选择触发事件" style="width: 180px">
            <el-option label="全部" value="" />
            <el-option
              v-for="option in triggerEventOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="getRuleListData">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 联合营销规则列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row justify-between items-center">
          <el-button type="primary" @click="handleCreateRule">创建联合营销规则</el-button>
          <right-toolbar
            v-model:show-search="state.showSearch"
            class="flex flex-row justify-end"
            @queryTable="getRuleListData"
          />
        </div>
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.ruleList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="规则ID" prop="id" width="150" />
        <el-table-column label="规则名称" min-width="180" prop="name" show-overflow-tooltip />
        <el-table-column label="计划ID" prop="planId" width="150" />
        <el-table-column label="触发事件" prop="triggerEvent" width="120">
          <template #default="scope">
            {{ getTriggerEventLabel(scope.row.triggerEvent) }}
          </template>
        </el-table-column>
        <el-table-column label="最小订单金额" prop="minOrderAmount" width="120" />
        <el-table-column label="每日限制(每用户)" prop="dailyLimitPerUser" width="140" />
        <el-table-column label="总限制" prop="totalLimit" width="100" />
        <el-table-column label="商品范围类型" prop="productScopeType" width="120" show-overflow-tooltip />
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="scope">
            <el-button size="small" type="primary" @click="handleEditRule(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDeleteRule(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑规则弹窗 -->
    <RuleCreate
      v-model:is-show="state.dialogVisible"
      :is-edit="state.isEdit"
      :rule-data="state.selectedRuleData"
      @success="handleRuleSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { JointMarketingRuleListResponse } from '/@/api/merchantsAlliance/jointMarket/types'
import { deleteRule, getRuleList } from '/@/api/merchantsAlliance/jointMarket'
import { ElMessage, ElMessageBox } from 'element-plus'
import RuleCreate from './components/ruleCreate.vue'

const route = useRoute()
// 状态管理
const state = reactive({
  loading: false,
  ruleList: [] as JointMarketingRuleListResponse[],
  showSearch: true,
  isEdit: false,
  planId: '',
  searchForm: {
    name: '',
    triggerEvent: '',
  },
  dialogVisible: false,
  selectedRuleData: {} as JointMarketingRuleListResponse,
})

// 查询规则列表
const getRuleListData = async () => {
  try {
    // 添加planId检查
    if (!state.planId) {
      ElMessage.warning('计划ID不能为空')
      return
    }

    state.loading = true
    const res = await getRuleList(state.planId)
    if (res.code === 0) {
      // 过滤规则列表
      let filteredRules = res.data || [] as JointMarketingRuleListResponse[]

      // 根据规则名称过滤
      if (state.searchForm.name) {
        filteredRules = filteredRules.filter((rule) =>
          rule.name.toLowerCase().includes(state.searchForm.name.toLowerCase()))
      }

      // 根据触发事件过滤
      if (state.searchForm.triggerEvent) {
        filteredRules = filteredRules.filter((rule) => rule.triggerEvent === state.searchForm.triggerEvent)
      }

      state.ruleList = filteredRules || []
    } else {
      ElMessage.error('获取规则列表失败')
    }
  } catch (e) {
    ElMessage.error('获取规则列表异常')
  } finally {
    state.loading = false
  }
}

// 重置查询条件
const resetQuery = () => {
  getRuleListData()
}

// 创建规则
const handleCreateRule = () => {
  // 添加planId检查
  if (!state.planId) {
    ElMessage.warning('计划ID不能为空，无法创建规则')
    return
  }
  state.isEdit = false
  state.selectedRuleData = {} as JointMarketingRuleListResponse
  state.dialogVisible = true
}

// 编辑规则
const handleEditRule = (rule: JointMarketingRuleListResponse) => {
  // 添加rule.id检查
  if (!rule.id) {
    ElMessage.warning('规则ID不能为空')
    return
  }
  state.isEdit = true
  state.selectedRuleData = rule
  state.dialogVisible = true
}

// 删除规则
const handleDeleteRule = async (ruleId: string) => {
  // 添加ruleId检查
  if (!ruleId) {
    ElMessage.warning('规则ID不能为空')
    return
  }

  try {
    await ElMessageBox.confirm('确定要删除这条规则吗？', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    const res = await deleteRule(ruleId)
    if (res.code === 0) {
      ElMessage.success('删除规则成功')
      getRuleListData()
    } else {
      ElMessage.error('删除规则失败')
    }
  } catch (e) {
    if (e === 'cancel') {
      return
    }
    ElMessage.error('删除规则异常')
  }
}

// 规则创建/编辑成功回调
const handleRuleSuccess = () => {
  getRuleListData()
}

// 触发事件选项
const triggerEventOptions = [
  { label: '订单完成', value: 'ORDER_COMPLETED' },
  { label: '优惠券使用', value: 'COUPON_USED' },
  { label: '会员注册', value: 'MEMBER_REGISTERED' },
]

// 获取触发事件标签
const getTriggerEventLabel = (value: string) => {
  const option = triggerEventOptions.find((opt) => opt.value === value)
  return option ? option.label : value
}

// 页面加载时获取规则列表
onMounted(() => {
  if (route.query.planId) {
    state.planId = route.query.planId as string
    getRuleListData()
  }
})
</script>

<style scoped lang="scss">
// 自定义样式可以在这里添加
</style>