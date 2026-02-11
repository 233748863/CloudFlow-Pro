<template>
  <div class="w-full flex flex-col h-full gap-4">
    <el-card v-show="showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small">
        <div class="flex flex-row gap-5 items-center">
          <el-form-item class="flex-[2] w-full" label="图片名称" prop="imageName">
            <el-input v-model="state.searchForm.imageName" class="w-full" placeholder="请输入图片名称" />
          </el-form-item>
          <el-form-item class="flex-[4] w-full" label="轮播图类型" prop="targetTypes">
            <el-select
              v-model="state.searchForm.targetTypes"
              class="w-full"
              placeholder="请选择轮播图类型"
              clearable
              multiple
            >
              <el-option
                v-for="(key, value, index) in TARGET_TYPES"
                :key="index"
                :label="key"
                :value="value"
                class="w-full"
              />
            </el-select>
          </el-form-item>
          <el-form-item class="flex-[3] w-full" label="查询时间范围">
            <el-date-picker
              v-model="state.searchForm.searchDateRange"
              end-placeholder="结束日期"
              range-separator="至"
              start-placeholder="开始日期"
              style="width: 200px"
              type="daterange"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
        </div>
        <div class="flex flex-row gap-5">
          <el-form-item label="排序">
            <div class="flex items-center gap-2">
              <el-radio-group v-model="state.searchForm.orderByCreatedTime">
                <el-radio-button :value="true">按创建时间降序</el-radio-button>
                <el-radio-button :value="false">按创建时间升序</el-radio-button>
              </el-radio-group>
              <el-radio-group v-model="state.searchForm.orderByWeight">
                <el-radio-button :value="false">按权重降序</el-radio-button>
                <el-radio-button :value="true">按权重升序</el-radio-button>
              </el-radio-group>
            </div>
          </el-form-item>
          <el-form-item class="flex-[2] w-full" label="启用状态" prop="enable">
            <el-select v-model="state.searchForm.enable" class="w-full" placeholder="请选择是否只查询已启用">
              <el-option class="w-full" label="全部" value="全部" />
              <el-option :value="true" class="w-full" label="已启用" />
              <el-option :value="false" class="w-full" label="未启用" />
            </el-select>
          </el-form-item>
          <el-form-item class="flex-[2]">
            <el-button :loading="state.isLoading" icon="Search" type="primary" @click="handelSearch">查询</el-button>
            <el-button icon="Refresh" @click="resetQuery">重置</el-button>
          </el-form-item>
        </div>
      </el-form>
    </el-card>
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row items-center justify-between">
          <el-button type="primary" @click="state.showDialog = true">添加轮播图</el-button>
          <right-toolbar
            v-model:show-search="showSearch"
            class="flex flex-row justify-end"
            @queryTable="getPlatformBannerData"
          />
        </div>
      </template>
      <el-table
        v-loading="state.isLoading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.carouselMapList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="排序权重" prop="sortWeight" width="90">
          <template #default="{ row }">
            <el-input v-if="row.isEdit" v-model="row.sortWeight" placeholder="请输入排序权重" type="number" />
            <span v-else>{{ row.sortWeight }}</span>
          </template>
        </el-table-column>
        <el-table-column label="图片名称" prop="imageName" width="150">
          <template #default="{ row }">
            <el-input v-if="row.isEdit" v-model="row.imageName" placeholder="请输入图片名称" />
            <span v-else>{{ row.imageName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" prop="targetType" width="120">
          <template #default="{ row }">
            <el-select
              v-if="row.isEdit"
              v-model="row.targetType"
              placeholder="请选择类型"
              @change="handleTargetTypeChange(row)"
            >
              <el-option v-for="(key, value, index) in TARGET_TYPES" :key="index" :label="key" :value="value" />
            </el-select>
            <span v-else>{{ TARGET_TYPES[row.targetType] }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目标id" prop="targetId" width="200">
          <template #default="{ row }">
            <el-select
              v-if="row.targetType === 'MERCHANT'"
              v-model="row.targetId"
              :disabled="!row.isEdit"
              :loading="state.loadingMerchant"
              :remote-method="localSearchMerchant"
              placeholder="请选择目标商家"
              filterable
              remote
            >
              <el-option
                v-for="item in state.merchants"
                :key="item.merchantId"
                :label="item.merchantName"
                :value="item.merchantId"
              />
            </el-select>
            <el-select
              v-else-if="row.targetType === 'INDUSTRY'"
              v-model="row.targetId"
              :disabled="!row.isEdit"
              :loading="state.loadingIndustry"
              :remote-method="loadIndustryList"
              placeholder="请选择目标行业"
              filterable
              remote
            >
              <el-option v-for="item in state.industryList" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-input v-else v-model="row.targetId" :disabled="!row.isEdit" placeholder="请输入目标id" />
          </template>
        </el-table-column>
        <el-table-column label="图片url" prop="imageUrl" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.imageUrl" class="relative mr-4 transform">
              <el-image
                :preview-src-list="[getImageUrl(row.imageUrl)]"
                :preview-teleported="true"
                :src="getImageUrl(row.imageUrl)"
                class="w-40 aspect-[2/1] rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                v-if="row.isEdit"
                class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                @click="row.imageUrl = ''"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="row.isEdit && !row.imageUrl"
              :auto-upload="true"
              :before-upload="beforeBannerImageUpload"
              :http-request="(options: any) => handleHttpUpload(options, row)"
              :show-file-list="false"
              accept="image/*"
              class="w-40 aspect-[2/1] bg-[#fff] flex justify-center items-center"
              list-type="text"
            >
              <el-icon>
                <Plus />
              </el-icon>
              <div>上传图片</div>
            </el-upload>
          </template>
        </el-table-column>
        <el-table-column label="背景颜色" prop="bgc" width="100">
          <template #default="{ row }">
            <el-color-picker
              v-if="row.isEdit"
              v-model="row.bgColor"
              :predefine="PREDEFINE_COLORS"
              size="large"
              show-alpha
            />
            <div v-else class="w-full flex items-center justify-center">
              <div :style="{ backgroundColor: row.bgColor }" class="w-8 h-6 flex items-center justify-center"></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="上线时间" prop="showStartTime" width="150">
          <template #default="{ row }">
            <el-date-picker
              v-if="row.isEdit"
              v-model="row.showStartTime"
              placeholder="请选择上线时间"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
            <span v-else>{{ row.showStartTime }}</span>
          </template>
        </el-table-column>
        <el-table-column label="下线时间" prop="showEndTime" width="150">
          <template #default="{ row }">
            <el-date-picker
              v-if="row.isEdit"
              v-model="row.showEndTime"
              placeholder="请选择下线时间"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
            <span v-else>{{ row.showEndTime }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createTime" width="150">
          <template #default="{ row }">
            <span>{{ row.createTime }}</span>
          </template>
        </el-table-column>
        <el-table-column label="是否启用" prop="enabled" width="100">
          <template #default="{ row }">
            <el-switch v-if="row.isEdit" v-model="row.enable" :active-value="true" :inactive-value="false" />
            <span v-else>{{ row.enable ? '是' : '否' }}</span>
          </template>
        </el-table-column>
        <el-table-column align="center" fixed="right" label="操作" width="120">
          <template #default="{ row }">
            <div v-if="!row.isEdit && row.id">
              <el-button size="small" type="danger" link @click="handleDeletePlatformBanner(row)">
                {{ '删除' }}
              </el-button>
              <el-button
                :type="row.enable ? 'warning' : 'success'"
                size="small"
                link
                @click="handleEnablePlatformBanner(row)"
              >
                {{ row.enable ? '禁用' : '启用' }}
              </el-button>
              <el-button size="small" type="primary" link @click="handelEdit(row)">
                {{ '编辑' }}
              </el-button>
            </div>
            <div v-else-if="row.isEdit" class="w-full flex items-center justify-center">
              <el-button size="small" type="success" link @click="handleSaveEdit(row)">
                {{ '保存' }}
              </el-button>
              <el-button size="small" type="danger" link @click="handleCancelEdit(row)">{{ '取消' }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <!-- 分页 -->
        <el-pagination
          v-model:current-page="state.pagination.currentPage"
          v-model:page-size="state.pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="state.pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
        />
      </template>
    </el-card>
    <banner-add-dialog v-model:is-show="state.showDialog" @success="handleCreate"></banner-add-dialog>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'
import {
  deletePlatformBanner,
  enablePlatformBanner,
  getPlatformBanner,
  modifyPlatformBanner,
  rebuildPlatformBannerCache,
} from '/@/api/merchantsAlliance/app'
import {
  BannerData,
  PlatformBannerRequest,
  PREDEFINE_COLORS,
  ROUTE_PATH,
  TARGET_TYPES,
} from '/@/api/merchantsAlliance/app/types'
import { ElCheckbox, ElMessage, ElMessageBox, ElSwitch, UploadRequestOptions } from 'element-plus'
import request from '/@/utils/request'
import BannerAddDialog from '/@/views/merchantsAlliance/appDataMT/form/components/bannerAddDialog.vue'
import { beforeBannerImageUpload, getImageUrl } from '/@/views/merchantsAlliance/way'
import { PlatformIndustry } from '/@/api/merchantsAlliance/store/types'
import { getJointMarketingPlanMerchantList } from '/@/api/merchantsAlliance/merchant/merchant'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import { JointMarketingPlanMerchantListRecords } from '/@/api/merchantsAlliance/merchant/types'

const emit = defineEmits(['updateData'])

const showSearch = ref(true)

const state = reactive({
  carouselMapList: [] as BannerData[],
  editRows: {} as Record<string, BannerData>,
  isLoading: false,
  isDeleteConfirm: false,
  searchForm: {
    pageNum: 1,
    pageSize: 10,
    imageName: '',
    targetTypes: [],
    enable: '全部',
    orderByWeight: true,
    orderByCreatedTime: true,
    searchDateRange: [],
    startDate: '',
    endDate: '',
  },
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  showDialog: false,
  loadingIndustry: false,
  industryList: [] as PlatformIndustry[],
  loadingMerchant: false,
  merchants: [] as JointMarketingPlanMerchantListRecords[],
})

// 处理分页改变
function handleCurrentChange(pageNum: number) {
  state.pagination.currentPage = pageNum
  state.searchForm.pageNum = pageNum
  getPlatformBannerData()
}

// 处理每页数量改变
function handleSizeChange(pageSize: number) {
  state.pagination.pageSize = pageSize
  state.searchForm.pageSize = pageSize
  getPlatformBannerData()
}

// 加载行业列表
const loadIndustryList = async (name: string) => {
  try {
    state.loadingIndustry = true
    const response = await getIndustryList({ name: name || '', page: 1, pageSize: 20 })
    state.industryList = response.data.records || ([] as PlatformIndustry[])
  } catch (err) {
    ElMessage.error('获取行业列表失败')
  } finally {
    state.loadingIndustry = false
  }
}

// 本地搜索商家
async function localSearchMerchant(queryString: string) {
  state.loadingMerchant = true
  try {
    const res = await getJointMarketingPlanMerchantList({
      pageNum: 1,
      pageSize: 10,
      merchantName: queryString,
    })
    if (res.code === 0) {
      state.merchants = res.data.records || []
    }
  } catch (e) {
    ElMessage.error('查询失败')
  }
  state.loadingMerchant = false
}

// 获取轮播图数据
async function getPlatformBannerData() {
  state.isLoading = true
  try {
    state.searchForm.pageSize = state.pagination.pageSize
    state.searchForm.pageNum = state.pagination.currentPage
    const params = {
      ...state.searchForm,
      enable: state.searchForm.enable === '全部' ? undefined : state.searchForm.enable,
    } as PlatformBannerRequest
    const res = await getPlatformBanner(params)
    if (res.code === 0) {
      state.carouselMapList = res.data.records
      state.pagination.total = res.data.total
      state.pagination.currentPage = res.data.current
      state.pagination.pageSize = res.data.size
      state.industryList = res.data.records.map((item: any) => ({
        id: item.targetId,
        name: item.name,
        enable: true,
      }))
    }
  } catch (err) {
    console.log(err)
  } finally {
    state.isLoading = false
  }
}

// 上传图片
async function handleHttpUpload({ file, onError }: UploadRequestOptions, row: BannerData) {
  let formData = new FormData()
  formData.append('file', file)
  formData.append('dir', 'carouselMap')
  try {
    const response = await request({
      url: '/admin/sys-file/upload',
      method: 'post',
      headers: {
        'Content-Type': 'multipart/form-data',
        'Enc-Flag': 'false',
      },
      data: formData,
    })
    if (response.code === 0) {
      row.imageUrl = response.data.url
    } else {
      onError(response.msg as any)
    }
  } catch (error) {
    onError(error as any)
  }
}

// 处理删除轮播图
async function handleDeletePlatformBanner(row: BannerData) {
  try {
    let isDeleted = true
    if (!state.isDeleteConfirm) {
      isDeleted = await ElMessageBox({
        title: '删除确认',
        message: () =>
          h('p', null, [
            h('p', { class: 'text-[16px]' }, '确认删除轮播图吗?'),
            h(ElCheckbox, {
              modelValue: state.isDeleteConfirm,
              'onUpdate:modelValue': (val: boolean) => {
                state.isDeleteConfirm = val
              },
              label: '不再提醒',
            }),
          ]),
        showCancelButton: true,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          return true
        })
        .catch(() => {
          return false
        })
    }
    if (isDeleted) {
      const res = await deletePlatformBanner({ id: row.id })
      if (res.code === 0) {
        if (row.enable) {
          await rebuildPlatformBannerCache()
          emit('updateData', state.carouselMapList)
        }
        state.carouselMapList = state.carouselMapList.filter((item) => item.id !== row.id)
      } else {
        ElMessage({
          type: 'error',
          message: '删除失败',
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 处理启用/禁用轮播图
async function handleEnablePlatformBanner(row: BannerData) {
  const res = await enablePlatformBanner({ id: row.id })
  if (res.code === 0) {
    row.enable = !row.enable
    await rebuildPlatformBannerCache()
    emit('updateData', state.carouselMapList)
  }
}

// 处理查询
function handelSearch() {
  state.pagination.currentPage = 1
  state.pagination.pageSize = 10
  if (state.searchForm.searchDateRange.length === 2) {
    state.searchForm.startDate = state.searchForm.searchDateRange[0] ?? ''
    state.searchForm.endDate = state.searchForm.searchDateRange[1] ?? ''
  }
  getPlatformBannerData()
}

// 处理编辑
function handelEdit(row: BannerData) {
  row.isEdit = true
  state.editRows[row.id] = { ...row }
}

// 处理保存编辑
async function handleSaveEdit(row: BannerData) {
  try {
    const res = await modifyPlatformBanner(row)
    if (res.code === 0) {
      Object.assign(row, res.data)
      if (row.enable) {
        await rebuildPlatformBannerCache()
        emit('updateData', state.carouselMapList)
      }
      row.isEdit = false
      delete state.editRows[row.id]
    }
  } catch (error) {
    console.log(error)
    ElMessage({
      type: 'error',
      message: '保存失败',
    })
  }
}

// 处理取消编辑
function handleCancelEdit(row: BannerData) {
  Object.assign(row, state.editRows[row.id], { isEdit: false })
  delete state.editRows[row.id]
}

// 处理创建轮播图
async function handleCreate(row: BannerData) {
  state.carouselMapList.unshift(row)
  if (row.enable) {
    await rebuildPlatformBannerCache()
    emit('updateData', state.carouselMapList)
  }
}

// 处理目标类型改变
function handleTargetTypeChange(row: BannerData) {
  if (row.targetType) {
    row.routePath = ROUTE_PATH[row.targetType]
  } else {
    row.routePath = ''
  }
}

onMounted(() => {
  getPlatformBannerData()
})
</script>

<style scoped lang="scss">
:deep(.el-select) {
  width: 100% !important;
}
</style>
