<template>
  <el-drawer
    v-model="state.showDrawer"
    :loading="state.isLoading"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="70%"
    title="门审核记录"
  >
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <el-table
        v-loading="state.isLoading"
        :cell-style="() => ({ textAlign: 'center' })"
        :data="state.auditHistoryList"
        :header-cell-style="() => ({ textAlign: 'center' })"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="审核ID" prop="auditId" width="80" />
        <el-table-column label="审核类型" prop="auditType" width="100" >
          <template #default="scope">
            <el-tag :type="auditTypes.textColor[scope.row.auditType]">{{ auditTypes.textMap[scope.row.auditType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核状态" prop="auditStatus" width="200" >
          <template #default="scope">
            <el-tag :type="auditStatuses.textColor[scope.row.auditStatus]">{{ auditStatuses.textMap[scope.row.auditStatus] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" prop="createdTime" width="200" />
        <el-table-column label="审核时间" prop="auditTime" width="200" />
        <el-table-column label="审核备注" min-width="200" prop="auditRemark" />
        <el-table-column label="修改原因" min-width="200" prop="modifyReason" />
      </el-table>
    </el-card>
  </el-drawer>
</template>

<script setup lang="ts">
import { StoreListAuditResponse } from '/@/api/merchantsAlliance/store/types'
import { getStoreListAudit } from '/@/api/merchantsAlliance/store/store'
import { ElMessage } from 'element-plus'
import { useDict } from '/@/hooks/dict'

const { audit_statuses, audit_type } = useDict('audit_statuses', 'audit_type')
// 审核状态映射
const auditStatuses = computed(() => {
  const textMap = audit_statuses.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = audit_statuses.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.remarks }), {})
  return { textMap: textMap, textColor: textColor }
})
// 审核类型映射
const auditTypes = computed(() => {
  const textMap = audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.remarks }), {})
  return { textMap: textMap, textColor: textColor }
})
const props = defineProps({
  isShow: {
    type: Boolean,
    required: true,
    default: false,
  },
  storeId: {
    type: String,
    required: true,
    default: '',
  },
})

const emits = defineEmits(['update:isShow'])

const state = reactive({
  showDrawer: false,
  isLoading: false,
  auditHistoryList: [] as StoreListAuditResponse[], // 商家店铺审核历史列表记录
})

const getAuditHistoryList = async () => {
  state.isLoading = true
  try {
    const res = await getStoreListAudit({
      storeId: props.storeId,
      sortDesc: true,
    })
    state.auditHistoryList = res.data || []
  } catch (error) {
    ElMessage.error('获取审核历史列表失败')
  } finally {
    state.isLoading = false
  }
}

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.storeId) {
      state.showDrawer = true
      getAuditHistoryList()
    } else if (newVal) {
      state.showDrawer = false
      ElMessage.error('获取审核历史列表失败')
    }
  }
)
watch(
  () => state.showDrawer,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
    }
  }
)
</script>

<style scoped lang="scss"></style>
