<template>
  <el-dialog v-model="state.showDialog" :title="state.dialogTitle" width="800px" destroy-on-close>
    <el-form
      ref="createRuleFormRef"
      :model="state.ruleForm"
      :rules="createRuleFormRules"
      label-width="120px"
      size="default"
    >
      <el-form-item label="规则名称" prop="name">
        <el-input v-model="state.ruleForm.name" placeholder="请输入规则名称" style="width: 100%" />
      </el-form-item>

      <el-form-item label="计划ID" prop="planId">
        <el-input v-model="state.ruleForm.planId" placeholder="请输入计划ID" style="width: 100%" />
      </el-form-item>

      <el-form-item label="触发事件" prop="triggerEvent">
        <el-select v-model="state.ruleForm.triggerEvent" placeholder="请选择触发事件" style="width: 100%">
          <el-option label="订单完成" value="ORDER_COMPLETED" />
          <el-option label="优惠券使用" value="COUPON_USED" />
          <el-option label="会员注册" value="MEMBER_REGISTERED" />
        </el-select>
      </el-form-item>

      <el-form-item label="最小订单金额" prop="minOrderAmount">
        <el-input-number
          v-model="state.ruleForm.minOrderAmount"
          :min="0"
          :precision="2"
          :step="0.01"
          placeholder="请输入最小订单金额"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="商品范围类型" prop="productScopeType">
        <el-select v-model="state.ruleForm.productScopeType" placeholder="请选择商品范围类型" style="width: 100%">
          <el-option label="全部商品" value="ALL_PRODUCTS" />
          <el-option label="指定商品" value="SPECIFIC_PRODUCTS" />
          <el-option label="商品分类" value="PRODUCT_CATEGORIES" />
        </el-select>
      </el-form-item>

      <el-form-item label="商品范围ID列表" prop="productScopeIds">
        <el-input
          v-model="state.ruleForm.productScopeIdsString"
          placeholder="请输入商品范围ID，多个ID用逗号分隔"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="触发商户ID列表" prop="triggerMerchantIds">
        <el-input
          v-model="state.ruleForm.triggerMerchantIdsString"
          placeholder="请输入触发商户ID，多个ID用逗号分隔"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="触发门店ID列表" prop="triggerStoreIds">
        <el-input
          v-model="state.ruleForm.triggerStoreIdsString"
          placeholder="请输入触发门店ID，多个ID用逗号分隔"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="每日限制(每用户)" prop="dailyLimitPerUser">
        <el-input-number
          v-model="state.ruleForm.dailyLimitPerUser"
          :min="0"
          placeholder="请输入每日限制数量"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="总限制" prop="totalLimit">
        <el-input-number
          v-model="state.ruleForm.totalLimit"
          :min="0"
          placeholder="请输入总限制数量"
          style="width: 100%"
        />
      </el-form-item>

      <!-- 奖励列表 -->
      <el-form-item label="奖励设置" prop="rewards">
        <el-card v-for="(reward, index) in state.ruleForm.rewards" :key="index" class="mb-4">
          <template #header>
            <div class="flex justify-between items-center">
              <span>奖励 {{ index + 1 }}</span>
              <el-button
                v-if="state.ruleForm.rewards.length > 1"
                size="small"
                type="danger"
                @click="removeReward(index)"
              >
                删除
              </el-button>
            </div>
          </template>

          <el-form :model="reward" label-width="100px" size="small">
            <el-form-item label="奖励提供方ID">
              <el-input v-model="reward.providerMerchantId" placeholder="请输入奖励提供方商户ID" style="width: 100%" />
            </el-form-item>

            <el-form-item label="奖励内容ID">
              <el-input v-model="reward.rewardContentId" placeholder="请输入奖励内容ID" style="width: 100%" />
            </el-form-item>

            <el-form-item label="奖励数量">
              <el-input-number
                v-model="reward.rewardQuantity"
                :min="1"
                placeholder="请输入奖励数量"
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item label="库存限制">
              <el-input-number v-model="reward.stockLimit" :min="1" placeholder="请输入库存限制" style="width: 100%" />
            </el-form-item>

            <!-- 分配列表 -->
            <el-form-item label="分配设置">
              <el-button class="mb-2" size="small" type="primary" @click="addAllocation(index)">添加分配规则</el-button>

              <div
                v-for="(allocation, allocIndex) in reward.allocations"
                :key="allocIndex"
                class="mb-3 p-2 border rounded"
              >
                <div class="flex justify-between items-center mb-2">
                  <span>分配规则 {{ allocIndex + 1 }}</span>
                  <el-button
                    v-if="reward.allocations.length > 1"
                    size="small"
                    type="danger"
                    @click="removeAllocation(index, allocIndex)"
                  >
                    删除
                  </el-button>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <el-form-item label="付款方商户ID">
                    <el-input
                      v-model="allocation.payerMerchantId"
                      placeholder="请输入付款方商户ID"
                      style="width: 100%"
                    />
                  </el-form-item>

                  <el-form-item label="收款方商户ID">
                    <el-input
                      v-model="allocation.payeeMerchantId"
                      placeholder="请输入收款方商户ID"
                      style="width: 100%"
                    />
                  </el-form-item>

                  <el-form-item label="收款方角色">
                    <el-select v-model="allocation.payeeRole" placeholder="请选择收款方角色" style="width: 100%">
                      <el-option label="主商户" value="MAIN_MERCHANT" />
                      <el-option label="参与商户" value="PARTICIPANT_MERCHANT" />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="分配类型">
                    <el-select v-model="allocation.allocationType" placeholder="请选择分配类型" style="width: 100%">
                      <el-option label="百分比" value="PERCENTAGE" />
                      <el-option label="固定金额" value="FIXED_AMOUNT" />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="分配值">
                    <el-input-number
                      v-model="allocation.allocationValue"
                      :min="0"
                      :precision="2"
                      :step="0.01"
                      placeholder="请输入分配值"
                      style="width: 100%"
                    />
                  </el-form-item>

                  <el-form-item label="触发阶段">
                    <el-select v-model="allocation.triggerPhase" placeholder="请选择触发阶段" style="width: 100%">
                      <el-option label="订单创建" value="ORDER_CREATED" />
                      <el-option label="订单完成" value="ORDER_COMPLETED" />
                      <el-option label="退款" value="REFUND" />
                    </el-select>
                  </el-form-item>
                </div>

                <el-form-item label="描述">
                  <el-input
                    v-model="allocation.description"
                    :rows="2"
                    placeholder="请输入分配规则描述"
                    style="width: 100%"
                    type="textarea"
                  />
                </el-form-item>
              </div>
            </el-form-item>
          </el-form>
        </el-card>

        <el-button class="mt-2" size="small" type="success" @click="addReward">添加奖励</el-button>
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="state.showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveRule">{{ state.saveButtonText }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import {
  JointMarketingRuleAllocations,
  JointMarketingRuleCreateRequest,
  JointMarketingRuleRewards,
} from '/@/api/merchantsAlliance/jointMarket/types'
import { createRule, updateRule } from '/@/api/merchantsAlliance/jointMarket'
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  isShow: {
    type: Boolean,
    default: false,
  },
  ruleData: {
    type: Object,
    default: null,
  },
  isEdit: {
    type: Boolean,
    default: false,
  },
})

const emits = defineEmits(['update:isShow', 'success'])

// 创建新的分配规则
const createNewAllocation = (): JointMarketingRuleAllocations => ({
  payerMerchantId: '',
  payeeMerchantId: '',
  payeeRole: 'MAIN_MERCHANT',
  allocationType: 'PERCENTAGE',
  allocationValue: 0,
  triggerPhase: 'ORDER_COMPLETED',
  description: '',
})

// 创建新的奖励规则
const createNewReward = (): JointMarketingRuleRewards => ({
  providerMerchantId: '',
  rewardContentId: '',
  rewardQuantity: 1,
  stockLimit: 100,
  allocations: [createNewAllocation()],
})

// 表单状态管理
const state = reactive({
  showDialog: false,
  dialogTitle: '创建联合营销规则',
  saveButtonText: '确定',
  ruleForm: {
    id: '',
    planId: '',
    name: '',
    triggerEvent: 'ORDER_COMPLETED',
    minOrderAmount: 0,
    productScopeType: 'ALL_PRODUCTS',
    productScopeIds: [] as number[],
    productScopeIdsString: '',
    triggerMerchantIds: [] as number[],
    triggerMerchantIdsString: '',
    triggerStoreIds: [] as number[],
    triggerStoreIdsString: '',
    dailyLimitPerUser: 0,
    totalLimit: 0,
    rewards: [createNewReward()],
  },
})

const createRuleFormRef = ref<any>(null)

// 表单验证规则
const createRuleFormRules = {
  name: [
    { required: true, message: '请输入规则名称', trigger: 'blur' },
    { max: 100, message: '规则名称不能超过100个字符', trigger: 'blur' },
  ],
  planId: [{ required: true, message: '请输入计划ID', trigger: 'blur' }],
  triggerEvent: [{ required: true, message: '请选择触发事件', trigger: 'change' }],
  minOrderAmount: [
    { required: true, message: '请输入最小订单金额', trigger: 'blur' },
    { type: 'number', min: 0, message: '最小订单金额不能为负数', trigger: 'blur' },
  ],
  productScopeType: [{ required: true, message: '请选择商品范围类型', trigger: 'change' }],
}

// 添加奖励
const addReward = () => {
  state.ruleForm.rewards.push(createNewReward())
}

// 移除奖励
const removeReward = (index: number) => {
  if (state.ruleForm.rewards.length > 1) {
    state.ruleForm.rewards.splice(index, 1)
  } else {
    ElMessage.warning('至少需要保留一个奖励规则')
  }
}

// 添加分配规则
const addAllocation = (rewardIndex: number) => {
  state.ruleForm.rewards[rewardIndex].allocations.push(createNewAllocation())
}

// 移除分配规则
const removeAllocation = (rewardIndex: number, allocIndex: number) => {
  if (state.ruleForm.rewards[rewardIndex].allocations.length > 1) {
    state.ruleForm.rewards[rewardIndex].allocations.splice(allocIndex, 1)
  } else {
    ElMessage.warning('每个奖励至少需要保留一个分配规则')
  }
}

// 解析逗号分隔的字符串为数字数组
const parseStringToNumberArray = (str: string): number[] => {
  if (!str) return []
  return str
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => !isNaN(item))
}

// 保存规则
const saveRule = async () => {
  try {
    await createRuleFormRef.value.validate()

    // 转换字符串为数字数组
    state.ruleForm.productScopeIds = parseStringToNumberArray(state.ruleForm.productScopeIdsString)
    state.ruleForm.triggerMerchantIds = parseStringToNumberArray(state.ruleForm.triggerMerchantIdsString)
    state.ruleForm.triggerStoreIds = parseStringToNumberArray(state.ruleForm.triggerStoreIdsString)

    // 验证奖励列表
    if (!state.ruleForm.rewards || state.ruleForm.rewards.length === 0) {
      ElMessage.error('请至少添加一个奖励规则')
      return
    }

    // 构建请求参数
    const ruleData = {
      id: state.ruleForm.id,
      planId: state.ruleForm.planId,
      name: state.ruleForm.name,
      triggerEvent: state.ruleForm.triggerEvent,
      minOrderAmount: state.ruleForm.minOrderAmount,
      productScopeType: state.ruleForm.productScopeType,
      productScopeIds: state.ruleForm.productScopeIds,
      triggerMerchantIds: state.ruleForm.triggerMerchantIds,
      triggerStoreIds: state.ruleForm.triggerStoreIds,
      dailyLimitPerUser: state.ruleForm.dailyLimitPerUser,
      totalLimit: state.ruleForm.totalLimit,
      rewards: state.ruleForm.rewards,
    } as JointMarketingRuleCreateRequest

    let res
    if (props.isEdit) {
      // 更新规则
      res = await updateRule(ruleData)
    } else {
      // 创建规则
      res = await createRule(ruleData)
    }

    if (res.code === 0) {
      ElMessage.success(props.isEdit ? '更新成功' : '创建成功')
      state.showDialog = false
      emits('success', ruleData)
      // 重置表单
      resetForm()
    }
  } catch (e) {
    ElMessage.error(props.isEdit ? '更新失败' : '创建失败')
  }
}

// 重置表单
const resetForm = () => {
  if (createRuleFormRef.value) {
    createRuleFormRef.value.resetFields()
  }
  state.ruleForm = {
    id: '',
    planId: '',
    name: '',
    triggerEvent: 'ORDER_COMPLETED',
    minOrderAmount: 0,
    productScopeType: 'ALL_PRODUCTS',
    productScopeIds: [],
    productScopeIdsString: '',
    triggerMerchantIds: [],
    triggerMerchantIdsString: '',
    triggerStoreIds: [],
    triggerStoreIdsString: '',
    dailyLimitPerUser: 0,
    totalLimit: 0,
    rewards: [createNewReward()],
  }
  state.isEdit = false
  state.dialogTitle = '创建联合营销规则'
  state.saveButtonText = '确定'
}

// 监听 isShow 变化，同步更新弹窗显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal) {
      state.showDialog = true
    }
  }
)

// 监听弹窗关闭状态
watch(
  () => state.showDialog,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
      // 弹窗关闭时重置表单
      resetForm()
    }
  }
)

// 监听ruleData变化，处理编辑数据
watch(
  () => props.ruleData,
  (newVal) => {
    if (newVal) {
      state.isEdit = true
      state.dialogTitle = '修改联合营销规则'
      state.saveButtonText = '保存修改'

      // 转换数字数组为字符串
      const productScopeIdsString = newVal.productScopeIds?.join(',') || ''
      const triggerMerchantIdsString = newVal.triggerMerchantIds?.join(',') || ''
      const triggerStoreIdsString = newVal.triggerStoreIds?.join(',') || ''

      state.ruleForm = {
        ...newVal,
        productScopeIdsString,
        triggerMerchantIdsString,
        triggerStoreIdsString,
        rewards: newVal.rewards?.length > 0 ? newVal.rewards : [createNewReward()],
      }

      // 确保每个奖励都有分配规则
      state.ruleForm.rewards.forEach((reward) => {
        if (!reward.allocations || reward.allocations.length === 0) {
          reward.allocations = [createNewAllocation()]
        }
      })
    }
  },
  { deep: true }
)
</script>

<style scoped lang="scss">
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>