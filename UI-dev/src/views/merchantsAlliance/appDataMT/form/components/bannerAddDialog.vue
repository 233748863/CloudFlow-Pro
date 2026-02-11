<template>
  <el-dialog v-model="state.showDialog" title="新增轮播图" width="500px" draggable>
    <el-form ref="bannerAddFormRef" :model="state.bannerAddForm" :rules="bannerAddFormRules" label-width="100px">
      <el-form-item label="轮播图名称" prop="imageName">
        <el-input v-model="state.bannerAddForm.imageName" class="w-full" placeholder="请输入图片名称" />
      </el-form-item>
      <el-form-item label="排序权重" prop="sortWeight">
        <el-input v-model="state.bannerAddForm.sortWeight" placeholder="请输入排序权重" type="number" />
      </el-form-item>
      <el-form-item label="轮播图类型" prop="targetType">
        <el-select v-model="state.bannerAddForm.targetType" placeholder="请选择类型" @change="handleTargetTypeChange">
          <el-option v-for="(key, value, index) in TARGET_TYPES" :key="index" :label="key" :value="value" />
        </el-select>
      </el-form-item>
      <el-form-item label="目标id" prop="targetId">
        <el-select
          v-if="state.bannerAddForm.targetType === 'MERCHANT'"
          v-model="state.bannerAddForm.targetId"
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
          v-else-if="state.bannerAddForm.targetType === 'INDUSTRY'"
          v-model="state.bannerAddForm.targetId"
          :loading="state.loadingIndustry"
          :remote-method="loadIndustryList"
          placeholder="请选择目标行业"
          filterable
          remote
        >
          <el-option v-for="item in state.industryList" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-input v-else v-model="state.bannerAddForm.targetId" placeholder="请输入目标id" />
      </el-form-item>
      <el-form-item label="轮播图图片" prop="imageUrl">
        <div v-if="state.bannerAddForm.imageUrl" class="relative mr-4 transform">
          <el-image
            :preview-src-list="[getImageUrl(state.bannerAddForm.imageUrl)]"
            :preview-teleported="true"
            :src="getImageUrl(state.bannerAddForm.imageUrl)"
            class="w-40 aspect-[2/1] rounded-md transition-transform duration-300"
            fit="cover"
          />
          <div
            class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
            @click="state.bannerAddForm.imageUrl = ''"
          >
            <el-icon>
              <Close />
            </el-icon>
          </div>
        </div>
        <el-upload
          v-if="!state.bannerAddForm.imageUrl"
          :auto-upload="true"
          :before-upload="beforeBannerImageUpload"
          :http-request="(options: any) => handleHttpUpload(options)"
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
      </el-form-item>
      <el-form-item label="背景颜色" prop="bgColor">
        <el-color-picker v-model="state.bannerAddForm.bgColor" :predefine="PREDEFINE_COLORS" size="large" show-alpha />
      </el-form-item>
      <el-form-item label="是否启用" prop="enable">
        <el-switch v-model="state.bannerAddForm.enable" :active-value="true" :inactive-value="false" />
      </el-form-item>
      <el-form-item label="上线时间" prop="showStartTime">
        <el-date-picker
          v-model="state.bannerAddForm.showStartTime"
          placeholder="请选择上线时间"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
        />
      </el-form-item>
      <el-form-item label="下线时间" prop="showEndTime">
        <el-date-picker
          v-model="state.bannerAddForm.showEndTime"
          placeholder="请选择下线时间"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="state.showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveBanner">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage, UploadRequestOptions } from 'element-plus'
import { BannerData, PREDEFINE_COLORS, ROUTE_PATH, TARGET_TYPES } from '/@/api/merchantsAlliance/app/types'
import { Plus } from '@element-plus/icons-vue'
import { createPlatformBanner } from '/@/api/merchantsAlliance/app'
import { beforeBannerImageUpload, getImageUrl } from '/@/views/merchantsAlliance/way'
import request from '/@/utils/request'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import { PlatformIndustry } from '/@/api/merchantsAlliance/store/types'
import { JointMarketingPlanMerchantListRecords } from '/@/api/merchantsAlliance/merchant/types'
import { getJointMarketingPlanMerchantList } from '/@/api/merchantsAlliance/merchant/merchant'

const props = defineProps({
  isShow: {
    type: Boolean,
    default: false,
  },
})

const emits = defineEmits(['update:isShow', 'success'])

// 抽屉状态管理
const state = reactive({
  showDialog: false,
  loadingMerchant: false,
  loadingIndustry: false,
  merchants: [] as JointMarketingPlanMerchantListRecords[],
  industryList: [] as PlatformIndustry[],
  bannerAddForm: {
    imageName: '',
    summary: '',
    imageUrl: '',
    routePath: '',
    targetType: '',
    targetId: '',
    bgColor: '',
    sortWeight: 0,
    showStartTime: '',
    showEndTime: '',
    enable: true,
  } as BannerData,
})

const bannerAddFormRef = ref<any>(null)

const bannerAddFormRules = {
  imageName: [{ required: true, message: '请输入图片名称', trigger: 'blur' }],
  targetType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  targetId: [{ required: true, message: '请输入目标id', trigger: 'blur' }],
  bgColor: [{ required: true, message: '请选择背景颜色', trigger: 'change' }],
  imageUrl: [{ required: true, message: '请上传轮播图图片', trigger: 'change' }],
  enabled: [{ required: true, message: '请选择是否启用', trigger: 'change' }],
}

async function handleHttpUpload({ file, onError }: UploadRequestOptions) {
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
      state.bannerAddForm.imageUrl = response.data.url
    } else {
      onError(response.msg as any)
    }
  } catch (error) {
    onError(error as any)
  }
}

// 保存平台banner
const saveBanner = async () => {
  try {
    await bannerAddFormRef.value.validate()
    const query = {
      imageName: state.bannerAddForm.imageName || '',
      summary: state.bannerAddForm.summary || '',
      imageUrl: state.bannerAddForm.imageUrl || '',
      routePath: state.bannerAddForm.routePath || '',
      targetType: state.bannerAddForm.targetType || '',
      targetId: state.bannerAddForm.targetId || '',
      bgColor: state.bannerAddForm.bgColor || '',
      sortWeight: state.bannerAddForm.sortWeight || 0,
      showStartTime: state.bannerAddForm.showStartTime || '',
      showEndTime: state.bannerAddForm.showEndTime || '',
      enable: state.bannerAddForm.enable || false,
    } as BannerData
    const res = await createPlatformBanner(query)
    if (res.code === 0) {
      ElMessage.success('保存成功')
      state.showDialog = false
      emits('success', res.data)
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

// 处理目标类型改变
async function handleTargetTypeChange() {
  if (state.bannerAddForm.targetType) {
    state.bannerAddForm.routePath = ROUTE_PATH[state.bannerAddForm.targetType]
  } else {
    state.bannerAddForm.routePath = ''
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

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal) {
      state.showDialog = true
    }
  }
)
watch(
  () => state.showDialog,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
    }
  }
)
</script>

<style scoped lang="scss"></style>