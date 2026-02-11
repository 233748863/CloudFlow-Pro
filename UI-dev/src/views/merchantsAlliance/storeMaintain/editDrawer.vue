<template>
  <!-- 门店信息编辑 -->
  <el-drawer
    v-model="state.showDrawer"
    :before-close="exitEdit"
    :direction="'rtl'"
    :loading="state.isLoading"
    :resizable="true"
    header-class="mb-0"
    size="70%"
    title="门店信息编辑"
  >
    <!-- 基本信息 -->
    <el-card class="mb-4" title="基本信息">
      <template #header>
        <div class="flex flex-row items-center justify-between">
          <span>基本信息</span>
          <div v-if="!state.isAuditing" class="flex flex-row gap-4 items-center">
            <el-button v-if="!isEdits.storeInfo" type="primary" @click="handleEdits('info')">编辑</el-button>
            <el-button v-if="isEdits.storeInfo" @click="exitEdit('info')">取消</el-button>
            <el-button
              v-if="isEdits.storeInfo"
              :loading="state.saving"
              type="primary"
              @click="saveStoreChanges('info')"
            >
              提交审核
            </el-button>
          </div>
          <div v-else class="flex flex-row items-center">
            <span class="text-yellow-500">审核中...</span>
          </div>
        </div>
      </template>
      <el-form
        ref="updateStoreInfoFormRef"
        :disabled="!isEdits.storeInfo"
        :model="state.updateStoreInfoForm"
        :rules="formRules.updateStoreInfoRules"
        label-width="120px"
      >
        <div class="grid grid-cols-2 gap-4 items-center">
          <!-- 门店名称 -->
          <el-form-item label="门店名称" prop="name">
            <el-input v-model="state.updateStoreInfoForm.name" placeholder="请输入门店名称" />
          </el-form-item>
          <!-- 行业类型 -->
          <el-form-item label="行业类型" prop="industryId">
            <el-select
              v-model="state.updateStoreInfoForm.industryId"
              :loading="state.loadingIndustry"
              :remote-method="loadIndustryList"
              placeholder="请选择行业类型"
              remote
              filterable
            >
              <el-option v-for="item in industryList" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <!-- 门店地址 -->
          <el-form-item class="no-full-width" label="门店区域" prop="regionCode">
            <ChinaArea v-model="state.updateStoreInfoForm.regionCode" :type="3" class="w-full"></ChinaArea>
          </el-form-item>
          <!-- 详细地址 -->
          <el-form-item label="详细地址" prop="addressDetail">
            <el-input
              v-model="state.updateStoreInfoForm.addressDetail"
              :rows="1"
              placeholder="请输入详细地址"
              type="textarea"
            />
          </el-form-item>
          <!-- 商家Logo -->
          <el-form-item label="商家Logo" prop="logoUrl">
            <div v-if="state.updateStoreInfoForm.logoUrl" class="relative mr-4 transform">
              <el-image
                :preview-src-list="[getImageUrl(state.updateStoreInfoForm.logoUrl)]"
                :preview-teleported="true"
                :src="getImageUrl(state.updateStoreInfoForm.logoUrl)"
                class="w-40 h-40 rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                v-if="isEdits.storeInfo"
                class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                @click="state.updateStoreInfoForm.logoUrl = ''"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="!state.updateStoreInfoForm.logoUrl && isEdits.storeInfo"
              :auto-upload="true"
              :before-upload="beforeLogoUpload"
              :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'logo'})"
              :show-file-list="false"
              accept="image/*"
              list-type="picture-card"
            >
              <el-icon>
                <Plus />
              </el-icon>
              <div>上传商家Logo</div>
            </el-upload>
          </el-form-item>
          <!-- 门店描述 -->
          <el-form-item class=".el-form-item:last-of-type" label="门店简介" prop="description">
            <el-input
              v-model="state.updateStoreInfoForm.description"
              :rows="6"
              placeholder="请输入门店简介"
              type="textarea"
            />
          </el-form-item>
        </div>

        <!-- 联系电话 -->
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="state.updateStoreInfoForm.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <!-- 门店图片上传 -->
        <el-form-item label="门店图片" prop="images">
          <div
            v-for="(image, index) in state.updateStoreInfoForm.images"
            :key="index"
            class="relative mr-4 transition-transform duration-300"
          >
            <el-image
              :initial-index="index"
              :preview-src-list="state.updateStoreInfoForm.images?.map((item: string) => getImageUrl(item))"
              :preview-teleported="true"
              :src="getImageUrl(image)"
              class="w-40 h-40 rounded-md transition-transform duration-300"
              fit="cover"
            />
            <div
              v-if="isEdits.storeInfo"
              class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
              @click="state.updateStoreInfoForm.images?.splice(index, 1)"
            >
              <el-icon>
                <Close />
              </el-icon>
            </div>
          </div>
          <el-upload
            v-if="!(state.updateStoreInfoForm.images?.length >= 5) && isEdits.storeInfo"
            :auto-upload="true"
            :before-upload="beforeImageUpload"
            :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'image'})"
            :show-file-list="false"
            accept="image/*"
            list-type="picture-card"
            multiple
          >
            <el-icon>
              <Plus />
            </el-icon>
            <div>上传门店图片</div>
          </el-upload>
        </el-form-item>
        <!-- 修改原因 -->
        <el-form-item v-if="isEdits.storeInfo" label="修改原因" prop="modifyReason">
          <el-input
            v-model="state.updateStoreInfoForm.modifyReason"
            :rows="2"
            placeholder="请输入修改原因"
            type="textarea"
          />
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 资质信息 -->
    <el-card title="资质信息">
      <template #header>
        <div class="flex flex-row items-center justify-between">
          <span>资质信息</span>
          <div v-if="!state.isAuditing" class="flex flex-row gap-4 items-center">
            <el-button v-if="!isEdits.storeQualification" type="primary" @click="handleEdits('qualification')">
              编辑
            </el-button>
            <el-button v-if="isEdits.storeQualification" @click="exitEdit('qualification')">取消</el-button>
            <el-button
              v-if="isEdits.storeQualification"
              :loading="state.saving"
              type="primary"
              @click="saveStoreChanges('qualification')"
            >
              提交审核
            </el-button>
          </div>
          <div v-else class="flex flex-row items-center">
            <span class="text-warning">审核中...</span>
          </div>
        </div>
      </template>
      <el-form
        ref="updateStoreQualificationFormRef"
        :disabled="!isEdits.storeQualification"
        :model="state.updateStoreQualificationForm"
        :rules="formRules.updateStoreQualificationRules"
        label-width="120px"
      >
        <el-form-item label="营业执照号" prop="licenseNo">
          <el-input v-model="state.updateStoreQualificationForm.licenseNo" placeholder="请输入营业执照号" />
        </el-form-item>
        <el-form-item label="资质图片" prop="licenseImages">
          <div
            v-for="(image, index) in state.updateStoreQualificationForm.licenseImages"
            :key="index"
            class="relative mr-4 transition-transform duration-300"
          >
            <el-image
              :initial-index="index"
              :preview-src-list="state.updateStoreQualificationForm.licenseImages?.map((item: string) => getImageUrl(item))"
              :preview-teleported="true"
              :src="getImageUrl(image)"
              class="w-40 h-40 rounded-md transition-transform duration-300"
              fit="cover"
            />
            <div
              v-if="isEdits.storeQualification"
              class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
              @click="state.updateStoreQualificationForm.licenseImages.splice(index, 1)"
            >
              <el-icon>
                <Close />
              </el-icon>
            </div>
          </div>
          <el-upload
            v-if="!(state.updateStoreQualificationForm?.licenseImages?.length >= 5) && isEdits.storeQualification"
            :auto-upload="true"
            :before-upload="beforeLicenseImageUpload"
            :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'license'})"
            :show-file-list="false"
            accept="image/*"
            list-type="picture-card"
            multiple
          >
            <el-icon>
              <Plus />
            </el-icon>
            <div>上传资质图片</div>
          </el-upload>
        </el-form-item>
        <el-form-item v-if="isEdits.storeQualification" label="修改原因" prop="modifyReason">
          <el-input
            v-model="state.updateStoreQualificationForm.modifyReason"
            :rows="2"
            placeholder="请输入修改原因"
            type="textarea"
          />
        </el-form-item>
      </el-form>
    </el-card>
  </el-drawer>
</template>

<script setup lang="ts">
import {
  beforeImageUpload,
  beforeLicenseImageUpload,
  beforeLogoUpload,
  getImageUrl,
} from '/@/views/merchantsAlliance/way'
import ChinaArea from '/@/components/ChinaArea/index.vue'
import { Close, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, UploadRequestOptions } from 'element-plus'
import {
  getStoreInfo,
  getStoreQualification,
  updateStoreInfo,
  updateStoreQualification,
} from '/@/api/merchantsAlliance/store/store'
import {
  PlatformIndustry,
  StoreInfoResponse,
  StoreQualificationResponse,
  UpdateStoreInfoRequest,
  UpdateStoreQualificationRequest,
} from '/@/api/merchantsAlliance/store/types'
import { ref } from 'vue'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import request from '/@/utils/request'

const UPLOAD_URL = '/admin/sys-file/upload'
const UPLOAD_DIR = 'store'

// 门店资质信息编辑抽屉属性
const props = defineProps({
  isShow: {
    type: Boolean,
    default: () => false,
  },
  storeId: {
    type: String,
    default: undefined,
  },
})

// 门店资质信息编辑抽屉事件
const emits = defineEmits(['update:isShow', 'error'])

// 门店信息编辑抽屉状态
const state = reactive({
  isLoading: false,
  loadingIndustry: false,
  saving: false,
  showDrawer: false,
  isAuditing: false,
  updateStoreInfoForm: {
    storeId: props.storeId,
    industryId: undefined,
    name: '',
    description: '',
    phone: '',
    logoUrl: '',
    images: [],
    regionCode: '',
    addressDetail: '',
    modifyReason: '',
  } as UpdateStoreInfoRequest,
  updateStoreQualificationForm: {
    storeId: props.storeId,
    licenseNo: '',
    licenseImages: [],
    modifyReason: '',
  } as UpdateStoreQualificationRequest,
})

const updateStoreInfoFormRef = ref<any>(null)
const updateStoreQualificationFormRef = ref<any>(null)

// 门店信息编辑抽屉表单验证规则
const formRules = reactive({
  updateStoreInfoRules: {
    industryId: [{ required: true, message: '请选择行业分类', trigger: 'blur' }],
    name: [{ required: true, message: '请输入门店名称', trigger: 'blur' }],
    phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
    logoUrl: [{ required: true, message: '请上传门店logo', trigger: 'blur' }],
    images: [{ required: true, message: '请上传门店图片', trigger: 'blur' }],
    regionCode: [{ required: true, message: '请选择区域', trigger: 'blur' }],
    addressDetail: [{ required: true, message: '请输入详细地址', trigger: 'blur' }],
    modifyReason: [{ required: true, message: '请输入修改原因', trigger: 'blur' }],
  },
  updateStoreQualificationRules: {
    licenseNo: [{ required: true, message: '请输入资质编号', trigger: 'blur' }],
    licenseImages: [{ required: true, message: '请上传资质图片', trigger: 'blur' }],
    modifyReason: [{ required: true, message: '请输入修改原因', trigger: 'blur' }],
  },
})

// 门店信息编辑抽屉是否编辑状态
const isEdits = reactive({
  storeInfo: false,
  storeQualification: false,
})

// 行业列表
const industryList = ref([] as PlatformIndustry[])
// 加载行业分类列表
const loadIndustryList = async (name?: string) => {
  try {
    state.loadingIndustry = true
    const response = await getIndustryList({ name: name || '', page: 1, pageSize: 20 })
    industryList.value = response.data.records || []
  } catch (err) {
    ElMessage.error('获取行业分类列表失败')
  } finally {
    state.loadingIndustry = false
  }
}

// 退出编辑
const exitEdit = async (type?: 'info' | 'qualification') => {
  await ElMessageBox.confirm('确定要退出编辑吗？未保存数据将丢失。', '操作确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
  if (type === 'info') {
    isEdits.storeInfo = false
  } else if (type === 'qualification') {
    isEdits.storeQualification = false
  } else {
    isEdits.storeInfo = false
    isEdits.storeQualification = false
    state.showDrawer = false
  }
}

// 切换编辑类型
const handleEdits = async (type: 'info' | 'qualification') => {
  if (type === 'info') {
    if (isEdits.storeQualification) {
      await ElMessageBox.confirm('确定要切换到门店信息编辑吗？未保存门店资质信息将丢失。', '操作确认', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
      isEdits.storeQualification = false
      isEdits.storeInfo = true
    } else {
      isEdits.storeInfo = true
    }
  } else if (type === 'qualification') {
    if (isEdits.storeInfo) {
      await ElMessageBox.confirm('确定要切换到门店资质编辑吗？未保存门店信息将丢失。', '操作确认', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
      isEdits.storeQualification = true
      isEdits.storeInfo = false
    } else {
      isEdits.storeQualification = true
    }
  }
}

// 获取商家店铺详情
const getStoreDetail = async () => {
  try {
    state.isLoading = true
    if (!props.storeId) {
      ElMessage.error('门店ID不能为空')
      emits('error', false)
      return
    }
    const [infoResponse, qualificationResponse] = await Promise.all([
      getStoreInfo(props.storeId),
      getStoreQualification(props.storeId),
    ])
    const infoData = infoResponse.data as StoreInfoResponse
    const qualificationData = qualificationResponse.data as StoreQualificationResponse
    if (infoResponse.code === 0 && qualificationResponse.code === 0) {
      Object.assign(state.updateStoreInfoForm, infoData)
      Object.assign(state.updateStoreQualificationForm, qualificationData)
      state.isAuditing = qualificationData.auditing || infoData.auditing
      if (infoData.industryId) {
        const res = await getIndustryList({ id: infoData.industryId })
        if (res.code === 0) {
          industryList.value = res.data.records || []
        }
      }
    }
  } catch (error) {
    ElMessage.error('获取门店详情失败')
    emits('error', false)
  } finally {
    state.isLoading = false
  }
}

// 保存门店信息变更
const saveStoreChanges = async (type: 'info' | 'qualification') => {
  try {
    state.saving = true
    if (type === 'info') {
      await updateStoreInfoFormRef.value.validate()
      await updateStoreInfo(state.updateStoreInfoForm)
      isEdits.storeInfo = false
    } else if (type === 'qualification') {
      await updateStoreQualificationFormRef.value.validate()
      await updateStoreQualification(state.updateStoreQualificationForm)
      isEdits.storeQualification = false
    }
    ElMessage.success('门店信息更新成功')
    state.showDrawer = false
    emits('update:isShow', false)
  } catch (error) {
    ElMessage.error('门店信息更新失败')
  } finally {
    state.saving = false
  }
}

// 图片上传处理函数
interface ExtendedUploadRequestOptions extends UploadRequestOptions {
  uploadType?: 'logo' | 'image' | 'license'
}

// 图片上传处理函数
const handleHttpUpload = async ({ file, onError, uploadType }: ExtendedUploadRequestOptions) => {
  let formData = new FormData()
  formData.append('file', file)
  formData.append('dir', UPLOAD_DIR)
  try {
    const response = await request({
      url: UPLOAD_URL,
      method: 'post',
      headers: {
        'Content-Type': 'multipart/form-data',
        'Enc-Flag': 'false',
      },
      data: formData,
    })

    // 根据uploadType调用不同的成功处理函数
    if (uploadType === 'logo') {
      handleLogoUploadSuccess(response)
    } else if (uploadType === 'image') {
      handleImageUploadSuccess(response)
    } else if (uploadType === 'license') {
      handleLicenseImageUploadSuccess(response)
    }
  } catch (error) {
    onError(error as any)
  }
}
// 处理Logo上传成功
const handleLogoUploadSuccess = (response: any) => {
  state.updateStoreInfoForm.logoUrl = response.data.url || ''
}
// 处理图片上传成功
const handleImageUploadSuccess = (response: any) => {
  if (!state.updateStoreInfoForm.images) {
    state.updateStoreInfoForm.images = []
  }
  state.updateStoreInfoForm.images.push(response.data.url || '')
}
// 处理营业执照图片上传成功
const handleLicenseImageUploadSuccess = (response: any) => {
  if (!state.updateStoreQualificationForm.licenseImages) {
    state.updateStoreQualificationForm.licenseImages = []
  }
  state.updateStoreQualificationForm.licenseImages.push(response.data.url || '')
}

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.storeId) {
      state.showDrawer = true
      getStoreDetail()
    } else if (newVal) {
      state.showDrawer = false
      ElMessage.error('获取门店详情失败')
      emits('error', false)
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
onMounted(() => {
  loadIndustryList()
})
</script>

<style scoped lang="scss"></style>