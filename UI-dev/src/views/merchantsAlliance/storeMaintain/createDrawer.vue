<template>
  <el-drawer
    v-model="state.showDrawer"
    :before-close="exitCreate"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="70%"
    title="创建门店"
  >
    <template #header>
      <span class="font-bold">新建门店</span>
    </template>
    <el-card>
      <el-form ref="createStoreFormRef" :model="state.createStoreForm" :rules="rules" label-width="120px">
        <el-form-item v-if="auth('is_admin')" label="商家" prop="merchantId">
          <el-select
            v-model="state.createStoreForm.merchantId"
            :loading="state.loadingMerchant"
            :remote-method="localSearchMerchant"
            placeholder="请选择商家"
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
        </el-form-item>
        <div class="grid grid-cols-2 gap-4 items-center">
          <el-form-item label="门店名称" prop="name">
            <el-input v-model="state.createStoreForm.name" placeholder="请输入门店名称" />
          </el-form-item>
          <el-form-item label="联系电话" prop="phone">
            <el-input v-model="state.createStoreForm.phone" placeholder="请输入联系电话" />
          </el-form-item>
          <el-form-item label="营业时间" prop="businessHours">
            <el-time-picker
              v-model="state.createStoreForm.businessHours"
              end-placeholder="休业时间"
              format="HH:mm"
              label="营业时间"
              range-separator="-"
              start-placeholder="开业时间"
              value-format="HH:mm"
              is-range
            />
          </el-form-item>

          <el-form-item label="行业" prop="industryId">
            <el-select
              v-model="state.createStoreForm.industryId"
              :loading="loadingIndustry"
              :remote-method="loadIndustryList"
              placeholder="请选择行业类型"
              filterable
              remote
            >
              <el-option
                v-for="industry in industryList"
                :key="industry.id"
                :label="industry.name"
                :value="industry.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item class="no-full-width" label="门店地址" prop="regionCode">
            <ChinaArea v-model="state.createStoreForm.regionCode" :type="3" class="w-full" />
          </el-form-item>
          <el-form-item label="详细地址" prop="addressDetail">
            <el-input
              v-model="state.createStoreForm.addressDetail"
              :rows="1"
              placeholder="请输入详细地址"
              type="textarea"
            />
          </el-form-item>
          <el-form-item class="no-full-width" label="店铺简介" prop="description">
            <el-input
              v-model="state.createStoreForm.description"
              :rows="6"
              placeholder="请输入店铺简介"
              type="textarea"
            />
          </el-form-item>

          <!-- 门店LOGO上传 -->
          <el-form-item class=".el-form-item:last-of-type" label="Logo" prop="logoUrl">
            <div v-if="state.createStoreForm.logoUrl" class="relative mr-4 transform">
              <el-image
                :preview-src-list="[getImageUrl(state.createStoreForm.logoUrl)]"
                :preview-teleported="true"
                :src="getImageUrl(state.createStoreForm.logoUrl)"
                class="w-40 h-40 rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                @click="() => (state.createStoreForm.logoUrl = '')"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="!state.createStoreForm.logoUrl"
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
        </div>

        <!-- 门店图片上传 -->
        <el-form-item label="门店图片" prop="images">
          <div v-if="state.createStoreForm.images?.length > 0" class="relative mr-4 transform">
            <el-image
              v-for="(image, index) in state.createStoreForm.images"
              :key="index"
              :initial-index="index"
              :preview-src-list="state.createStoreForm.images?.map((item: string) => getImageUrl(item))"
              :preview-teleported="true"
              :src="getImageUrl(image)"
              class="w-40 h-40 rounded-md transition-transform duration-300"
              fit="cover"
            />
            <div
              class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
              @click="() => state.createStoreForm.images.splice(index, 1)"
            >
              <el-icon>
                <Close />
              </el-icon>
            </div>
          </div>
          <el-upload
            v-if="!(state.createStoreForm.images?.length >= 5)"
            :auto-upload="true"
            :before-upload="beforeImageUpload"
            :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'image'})"
            :show-file-list="false"
            accept="image/*"
            list-type="picture-card"
          >
            <el-icon>
              <Plus />
            </el-icon>
            <div>上传门店图片</div>
          </el-upload>
        </el-form-item>

        <!-- 营业执照号 -->
        <el-form-item label="营业执照号" prop="licenseNo">
          <el-input v-model="state.createStoreForm.licenseNo" placeholder="请输入营业执照号" />
        </el-form-item>
        <!-- 资质图片上传 -->
        <el-form-item label="资质图片" prop="licenseImages">
          <div v-if="state.createStoreForm.licenseImages?.length > 0" class="relative mr-4 transform">
            <el-image
              v-for="(image, index) in state.createStoreForm.licenseImages"
              :key="index"
              :initial-index="index"
              :preview-src-list="state.createStoreForm.licenseImages?.map((item: string) => getImageUrl(item))"
              :preview-teleported="true"
              :src="getImageUrl(image)"
              class="w-40 h-40 rounded-md transition-transform duration-300"
              fit="cover"
            />
            <div
              class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
              @click="() => state.createStoreForm.licenseImages.splice(index, 1)"
            >
              <el-icon>
                <Close />
              </el-icon>
            </div>
          </div>
          <el-upload
            v-if="!(state.createStoreForm.licenseImages?.length >= 5)"
            :auto-upload="true"
            :before-upload="beforeLicenseImageUpload"
            :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'license'})"
            :show-file-list="false"
            accept="image/*"
            list-type="picture-card"
          >
            <el-icon>
              <Plus />
            </el-icon>
            <div>上传资质图片</div>
          </el-upload>
        </el-form-item>
      </el-form>
    </el-card>
    <template v-slot:footer>
      <!-- 提交按钮 -->
      <div class="flex flex-row gap-4 items-center justify-end">
        <el-button :loading="state.isSaving" type="primary" @click="saveCreate">
          {{ state.isSaving ? '保存中...' : '保存' }}
        </el-button>
        <el-button @click="exitCreate">取消</el-button>
      </div>
    </template>
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
import { PlatformIndustry, StoreCreateRequest } from '/@/api/merchantsAlliance/store/types'
import { storeCreate } from '/@/api/merchantsAlliance/store/store'
import request from '/@/utils/request'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import { JointMarketingPlanMerchantListRecords } from '/@/api/merchantsAlliance/merchant/types'
import { getJointMarketingPlanMerchantList } from '/@/api/merchantsAlliance/merchant/merchant'
import { auth } from '/@/utils/authFunction'

const props = defineProps({
  isShow: {
    type: Boolean,
    default: false,
  },
})

const emits = defineEmits(['update:isShow', 'success'])

const uploadUrl = '/admin/sys-file/upload'
const dir = 'store'
const loadingIndustry = ref(false)
// 行业列表
const industryList = ref([] as PlatformIndustry[])
// 加载行业列表
const loadIndustryList = async (name: string) => {
  try {
    loadingIndustry.value = true
    const response = await getIndustryList({ name: name || '', page: 1, pageSize: 20 })
    industryList.value = response.data.records || ([] as PlatformIndustry[])
  } catch (err) {
    ElMessage.error('获取行业列表失败')
  } finally {
    loadingIndustry.value = false
  }
}

const state = reactive({
  showDrawer: false,
  isSaving: false,
  createStoreForm: {
    name: '',
    description: '',
    industryId: undefined,
    regionCode: '440000,441200,441284,441284450',
    addressDetail: '',
    phone: '',
    logoUrl: '',
    images: [] as string[],
    businessHours: [] as string[],
    licenseNo: '',
    licenseImages: [] as string[],
  } as StoreCreateRequest<string[]>,
  merchants: [] as JointMarketingPlanMerchantListRecords[],
  loadingMerchant: false,
})

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

// 表单引用
const createStoreFormRef = ref<any>(null)
// 表单验证规则
const rules = reactive({
  name: [{ required: true, message: '请输入店铺名称', trigger: ['blur', 'input'] }],
  industryId: [{ required: true, message: '请选择行业类型', trigger: ['blur', 'change'] }],
  regionCode: [{ required: true, message: '请选择区域', trigger: ['blur', 'change'] }],
  addressDetail: [{ required: true, message: '请输入详细地址', trigger: ['blur', 'input'] }],
  phone: [{ required: true, message: '请输入联系电话', trigger: ['blur', 'input'] }],
  logoUrl: [{ required: true, message: '请上传店铺logo', trigger: ['blur', 'change'] }],
  businessHours: [{ required: true, message: '请选择营业时间', trigger: ['blur', 'change'] }],
  licenseNo: [{ required: true, message: '请输入营业执照号', trigger: ['blur', 'input'] }],
  licenseImages: [{ required: true, message: '请上传资质图片', trigger: ['blur', 'change'] }],
})

// 重置表单
const resetForm = () => {
  state.createStoreForm = {
    name: '',
    description: '',
    industryId: undefined,
    regionCode: '',
    addressDetail: '',
    phone: '',
    logoUrl: '',
    images: [],
    businessHours: [],
    licenseNo: '',
    licenseImages: [],
  } as StoreCreateRequest<string[]>
}

// 处理创建店铺
const saveCreate = async () => {
  state.isSaving = true
  try {
    // 表单验证
    await createStoreFormRef.value.validate()
    const query = {
      ...state.createStoreForm,
      businessHours: state.createStoreForm.businessHours?.join('-'),
    } as StoreCreateRequest<string>
    const res = await storeCreate(query)
    if (res.code === 0) {
      ElMessage.success('创建成功')
      state.showDrawer = false
      resetForm()
      emits('success', true)
    }
  } catch (e) {
    ElMessage.error('创建失败')
  } finally {
    state.isSaving = false
  }
}

// 退出创建
const exitCreate = async () => {
  await ElMessageBox.confirm('确定要退出创建吗？未保存数据将丢失。', '操作确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
  state.showDrawer = false
}

// 图片上传处理函数
interface ExtendedUploadRequestOptions extends UploadRequestOptions {
  uploadType?: 'logo' | 'image' | 'license'
}

// 图片上传处理函数
const handleHttpUpload = async ({ file, onError, uploadType }: ExtendedUploadRequestOptions) => {
  let formData = new FormData()
  formData.append('file', file)
  formData.append('dir', dir)
  try {
    const response = await request({
      url: uploadUrl,
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
    // 不要调用options.onSuccess，因为我们已经自己处理了成功回调
  } catch (error) {
    onError(error as any)
  }
}
// 处理Logo上传成功
const handleLogoUploadSuccess = (response: any) => {
  state.createStoreForm.logoUrl = response.data.url || ''
}
// 处理图片上传成功
const handleImageUploadSuccess = (response: any) => {
  if (!state.createStoreForm.images) {
    state.createStoreForm.images = []
  }
  state.createStoreForm.images.push(response.data.url || '')
}
// 处理营业执照图片上传成功
const handleLicenseImageUploadSuccess = (response: any) => {
  if (!state.createStoreForm.licenseImages) {
    state.createStoreForm.licenseImages = []
  }
  state.createStoreForm.licenseImages.push(response.data.url || '')
}
// 加载行业分类列表
onMounted(() => {})

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal) {
      state.showDrawer = true
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

<style scoped lang="scss">
:deep(.el-form-item:last-of-type) {
  margin-bottom: 18px !important;
}
</style>
