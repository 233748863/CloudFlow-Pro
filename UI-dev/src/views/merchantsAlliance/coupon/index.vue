<template>
  <div class="layout-padding">
    <div class="my pt rd-1 bg-#fff b-1 b-solid b-#e4e7ed">
      <el-row v-show="showSearch" class="ml10" shadow="hover">
        <el-form ref="queryRef" :inline="true" :model="state.queryForm" @keyup.enter="getDataList">
          <el-form-item :label="$t('coupon.name')" prop="name">
            <el-input v-model="state.queryForm.name" :placeholder="$t('coupon.inputNameTip')" class="w40" />
          </el-form-item>
          <el-form-item :label="$t('coupon.couponStatuses')" prop="couponStatuses">
            <el-select
              v-model="state.queryForm.couponStatuses"
              :placeholder="$t('coupon.placeholder.select')"
              class="!w40"
              multiple
            >
              <el-option v-for="item in couponStatuses" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('coupon.types')" prop="types">
            <el-select
              v-model="state.queryForm.types"
              :placeholder="$t('coupon.placeholder.select')"
              class="!w40"
              multiple
            >
              <el-option v-for="item in couponType" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('coupon.validityTypes')" prop="validityTypes">
            <el-select
              v-model="state.queryForm.validityTypes"
              :placeholder="$t('coupon.placeholder.select')"
              class="!w40"
              multiple
            >
              <el-option v-for="item in validityType" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('coupon.scopes')" prop="scopes">
            <el-select
              v-model="state.queryForm.scopes"
              :placeholder="$t('coupon.placeholder.select')"
              class="!w40"
              multiple
            >
              <el-option v-for="item in couponScope" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item prop="enable">
            <el-checkbox v-model="state.queryForm.enable">{{ $t('coupon.enable') }}</el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-button icon="search" type="primary" @click="getDataList">
              {{ $t('common.queryBtn') }}
            </el-button>
            <el-button icon="Refresh" @click="resetQuery">{{ $t('common.resetBtn') }}</el-button>
          </el-form-item>
        </el-form>
      </el-row>
    </div>
    <div class="layout-padding-auto layout-padding-view">
      <el-row>
        <div class="mb8 w-full">
          <el-button v-auth="'merchant_coupon_add'" class="ml10" icon="folder-add" type="primary" @click="toCouponForm">
            {{ $t('common.addBtn') }}
          </el-button>
          <el-button
            v-auth="'merchant_user_del'"
            :disabled="multiple"
            class="ml10"
            icon="Delete"
            type="primary"
            plain
            @click="handleDelete(selectObjs)"
          >
            {{ $t('common.delBtn') }}
          </el-button>
          <right-toolbar
            v-model:show-search="showSearch"
            :export="'merchant_coupon_export'"
            class="ml10"
            style="float: right; margin-right: 20px"
            @exportExcel="exportExcel"
            @queryTable="getDataList"
          />
        </div>
      </el-row>
      <el-table
        v-loading="state.loading"
        :cell-style="tableStyle.cellStyle"
        :data="state.dataList"
        :header-cell-style="tableStyle.headerCellStyle"
        row-key="couponId"
        style="width: 100%"
        border
        @selection-change="handleSelectionChange"
      >
        <el-table-column :selectable="handleSelectable" align="center" type="selection" width="50" />
        <el-table-column :label="$t('coupon.index')" type="index" width="50" />
        <el-table-column :label="$t('coupon.name')" prop="name" show-overflow-tooltip />
        <el-table-column :label="$t('coupon.types')" prop="type" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.type.desc }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('coupon.validityTypes')" prop="validityType" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.validityType.desc }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('coupon.scopes')" prop="scope" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.scope.desc }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('coupon.totalQuantity')" prop="totalQuantity" show-overflow-tooltip />
        <el-table-column :label="$t('coupon.minSpendAmount')" prop="minSpendAmount" show-overflow-tooltip />
        <el-table-column :label="$t('coupon.discount')" prop="discount" width="220px" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.type.value === 'CASH' ? `￥${scope.row.discountAmount}` : scope.row.discountRate }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('coupon.couponStatuses')" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.couponStatus.desc }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('coupon.createTime')" prop="createTime" show-overflow-tooltip />
        <el-table-column :label="$t('common.action')" width="250">
          <template #default="scope">
            <el-button
              v-auth="'merchant_coupon_edit'"
              icon="view"
              type="primary"
              text
              @click="toDetail(scope.row.couponTemplateId)"
            >
              {{ $t('common.queryBtn') }}
            </el-button>

            <span v-auth="'merchant_coupon_del'" style="margin-left: 12px">
              <el-button icon="delete" type="primary" text @click="handleDelete(scope.row.couponTemplateId)">
                {{ $t('coupon.button.invalidate') }}
              </el-button>
            </span>
          </template>
        </el-table-column>
      </el-table>
      <pagination v-bind="state.pagination" @current-change="currentChangeHandle" @size-change="sizeChangeHandle" />
    </div>
  </div>
</template>

<script setup lang="ts" name="coupon">
import { pageList, removeCouponApi } from '/@/api/merchantsAlliance/coupon/coupon'
import { useDict } from '/@/hooks/dict'
import { BasicTableProps, useTable } from '/@/hooks/table'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()

const {
  coupon_status: couponStatuses,
  coupon_type: couponType,
  coupon_scope: couponScope,
  coupon_validity_type: validityType,
} = useDict('coupon_status', 'coupon_type', 'coupon_scope', 'coupon_validity_type')

// 定义变量内容
const queryRef = ref()
const showSearch = ref(true)

// 多选rows
const selectObjs = ref([]) as any

// 是否可以多选
const multiple = ref(true)

const state: BasicTableProps = reactive<BasicTableProps>({
  queryForm: {
    name: '',
    page: 1,
    pageSize: 10,
    merchantId: 1,
    scopes: [],
    types: [],
    couponStatuses: [],
    validityTypes: [],
    orderByDesc: undefined,
    enable: undefined,
  },
  pageList: pageList, // H
  descs: ['create_time'],
})

// table hook
const { getDataList, currentChangeHandle, sizeChangeHandle, downBlobFile, tableStyle } = useTable(state)

// 清空搜索条件
const resetQuery = () => {
  queryRef.value.resetFields()
  getDataList()
}

// 导出excel
const exportExcel = () => {
  downBlobFile('/admin/role/export', Object.assign(state.queryForm, { ids: selectObjs }), 'role.xlsx')
}

// 是否可以多选
const handleSelectable = (row: any) => {
  return row.couponId !== '1'
}

// 多选事件
const handleSelectionChange = (objs: { couponId: string }[]) => {
  selectObjs.value = objs.map(({ couponId }) => couponId)
  multiple.value = !objs.length
}

const toCouponForm = () => router.push('/merchantsAlliance/coupon/coupon-form')

const toDetail = (id: string) => router.push(`/merchantsAlliance/coupon/detail?id=${id}`)

const handleDelete = async (id: string) => {
  ElMessageBox.confirm('确定要作废该优惠券吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    const resp = await removeCouponApi({ couponTemplateId: id })
    if (resp.code === 0) {
      getDataList()
      ElMessage.success(resp.msg || '删除成功')
    } else {
      ElMessage.error(resp.msg || '删除失败，请稍后再试')
    }
  })
}
</script>
