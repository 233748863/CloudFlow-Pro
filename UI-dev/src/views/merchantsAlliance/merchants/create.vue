<template>
  <div class="layout-padding-auto">
    <el-card class="shadow-md" title="商家入驻">
      <el-form ref="formRef" :model="state.merchantCreateRequest" :rules="rules" class="mt-4" label-width="120px">
        <!-- 基本信息 -->
        <div class="border-b pb-4 mb-4">
          <h3 class="text-lg font-medium mb-4">基本信息</h3>
          <el-form-item v-if="auth('is_admin')" label="商家ID" prop="merchantId">
            <el-select v-model="state.merchantCreateRequest.merchantId" placeholder="请选择商家" filterable>
              <el-option
                v-for="merchant in merchantList"
                :key="merchant.id"
                :label="merchant.name"
                :value="merchant.id"
              />
            </el-select>
          </el-form-item>
          <div class="grid grid-cols-2 gap-4 items-center">
            <el-form-item label="商家名称" prop="merchantName">
              <el-input v-model="state.merchantCreateRequest.merchantName" placeholder="请输入商家名称" clearable />
            </el-form-item>

            <el-form-item label="行业类型" prop="industryId">
              <el-select
                v-model="state.merchantCreateRequest.industryId"
                :loading="state.loadingIndustry"
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

            <el-form-item label="商家Logo" prop="logoUrl">
              <div v-if="state.merchantCreateRequest.logoUrl" class="relative mr-4 transform">
                <el-image
                  :preview-src-list="[getImageUrl(state.merchantCreateRequest.logoUrl)]"
                  :preview-teleported="true"
                  :src="getImageUrl(state.merchantCreateRequest.logoUrl)"
                  class="w-40 h-40 rounded-md transition-transform duration-300"
                  fit="cover"
                />
                <div
                  class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                  @click="state.merchantCreateRequest.logoUrl = ''"
                >
                  <el-icon>
                    <Close />
                  </el-icon>
                </div>
              </div>
              <el-upload
                v-if="!state.merchantCreateRequest.logoUrl"
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

            <el-form-item label="商家描述" prop="description">
              <el-input
                v-model="state.merchantCreateRequest.description"
                :rows="8"
                placeholder="请输入商家描述"
                type="textarea"
              />
            </el-form-item>

            <el-form-item label="商家图片" prop="images">
              <div
                v-for="(image, index) in state.merchantCreateRequest.images"
                :key="index"
                class="relative mr-4 transform transition-transform duration-300"
              >
                <el-image
                  :preview-src-list="[getImageUrl(image)]"
                  :preview-teleported="true"
                  :src="getImageUrl(image)"
                  class="w-40 h-40 rounded-md transition-transform duration-300"
                  fit="cover"
                />
                <div
                  class="absolute top-0 right-0 bg-red transition-transform duration-300 text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center hover:scale-150"
                  @click="state.merchantCreateRequest.images.splice(index, 1)"
                >
                  <el-icon>
                    <Close />
                  </el-icon>
                </div>
              </div>
              <el-upload
                v-if="state.merchantCreateRequest.images?.length < 5"
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
                <div>上传商家Logo</div>
              </el-upload>
            </el-form-item>
          </div>
        </div>

        <!-- 联系人信息 -->
        <div class="border-b pb-4 mb-4">
          <h3 class="text-lg font-medium mb-4">联系人信息</h3>
          <div class="grid grid-cols-3 gap-4 items-center">
            <el-form-item label="联系人姓名" prop="contactName">
              <el-input v-model="state.merchantCreateRequest.contactName" placeholder="请输入联系人姓名" clearable />
            </el-form-item>

            <el-form-item label="联系人手机号" prop="contactPhone">
              <el-input
                v-model="state.merchantCreateRequest.contactPhone"
                maxlength="11"
                placeholder="请输入联系人手机号"
                clearable
              />
            </el-form-item>
            <el-form-item class=".el-form-item:last-of-type" label="代理商ID" prop="agentId">
              <el-input
                v-model.number="state.merchantCreateRequest.agentId"
                placeholder="请输入代理商ID"
                type="number"
                clearable
              />
            </el-form-item>
            <el-form-item label="子商户ID" prop="subMchId">
              <el-input
                v-model.number="state.merchantCreateRequest.subMchId"
                placeholder="请输入子商户ID(用于收款)"
                type="number"
                clearable
              />
            </el-form-item>
            <el-form-item label="所在地区" prop="regionCode">
              <ChinaArea v-model="state.merchantCreateRequest.regionCode" class="w-full" placeholder="请选择所在地区" />
            </el-form-item>

            <el-form-item label="详细地址" prop="addressDetail">
              <el-input
                v-model="state.merchantCreateRequest.addressDetail"
                :rows="2"
                placeholder="请输入详细地址"
                type="textarea"
                clearable
              />
            </el-form-item>
          </div>
        </div>

        <!-- 资质信息 -->
        <div class="mb-4">
          <h3 class="text-lg font-medium mb-4">资质信息</h3>
          <div class="grid grid-cols-2 gap-4 items-center">
            <el-form-item label="法人姓名" prop="legalPerson">
              <el-input v-model="state.merchantCreateRequest.legalPerson" placeholder="请输入法人姓名" clearable />
            </el-form-item>
            <el-form-item class=".el-form-item:last-of-type" label="营业执照号" prop="licenseNo">
              <el-input v-model="state.merchantCreateRequest.licenseNo" placeholder="请输入营业执照号" clearable />
            </el-form-item>
          </div>
          <el-form-item label="资质图片" prop="licenseImages">
            <div
              v-for="(image, index) in state.merchantCreateRequest.licenseImages"
              :key="index"
              class="relative mr-4 transform transition-transform duration-300"
            >
              <el-image
                :preview-src-list="[getImageUrl(image)]"
                :initial-index="index"
                :preview-teleported="true"
                :src="getImageUrl(image)"
                class="w-40 h-40 rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                @click="state.merchantCreateRequest.licenseImages.splice(index, 1)"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="state.merchantCreateRequest.licenseImages.length < 5"
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
        </div>

        <div class="flex justify-end gap-4 mt-6">
          <el-button @click="resetForm">重置</el-button>
          <el-button :loading="loading" :v-auth="'merchant_merchant_create'" type="primary" @click="submitForm">
            提交
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, UploadRequestOptions } from 'element-plus'
import { createMerchant } from '/@/api/merchantsAlliance/merchant/merchant'
import { JointMarketingPlanMerchantListRecords, MerchantCreateRequest } from '/@/api/merchantsAlliance/merchant/types'
import { PlatformIndustry } from '/@/api/merchantsAlliance/store/types'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import { Close, Plus } from '@element-plus/icons-vue'
import request from '/@/utils/request'
import {
  beforeImageUpload,
  beforeLicenseImageUpload,
  beforeLogoUpload,
  getImageUrl,
} from '/@/views/merchantsAlliance/way'
import { auth } from '/@/utils/authFunction'
import ChinaArea from '/@/components/ChinaArea/index.vue'

const formRef = ref() // 表单实例引用
const loading = ref(false) // 提交按钮加载状态
const industryList = ref([] as PlatformIndustry[]) // 行业列表

const uploadUrl = '/admin/sys-file/upload'
const dir = 'merchant'

const state = reactive({
  loadingIndustry: false,
  merchantCreateRequest: {
    regionCode: '440000,441200,441284,441284450',
    images: [] as string[],
    licenseImages: [] as string[],
  } as MerchantCreateRequest,
})

const merchantList = ref([] as JointMarketingPlanMerchantListRecords[]) // 商家列表

// 表单验证规则
const rules = {
  merchantName: [
    { required: true, message: '请输入商家名称', trigger: 'blur' },
    { min: 2, max: 50, message: '商家名称长度在 2 到 50 个字符', trigger: 'blur' },
  ],
  industryId: [{ required: true, message: '请选择行业', trigger: 'change' }],
  logoUrl: [{ required: true, message: '请上传商家Logo', trigger: 'change' }],
  contactName: [
    { required: true, message: '请输入联系人姓名', trigger: 'blur' },
    { min: 2, max: 20, message: '联系人姓名长度在 2 到 20 个字符', trigger: 'blur' },
  ],
  contactPhone: [
    { required: true, message: '请输入联系人手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' },
  ],
  regionCode: [
    { required: true, message: '请输入地址', trigger: 'blur' },
    { min: 5, max: 200, message: '地址长度在 5 到 200 个字符', trigger: 'blur' },
  ],
  addressDetail: [
    { required: true, message: '请输入详细地址', trigger: 'blur' },
    { min: 5, max: 200, message: '详细地址长度在 5 到 200 个字符', trigger: 'blur' },
  ],
  legalPerson: [
    { required: true, message: '请输入法人姓名', trigger: 'blur' },
    { min: 2, max: 20, message: '法人姓名长度在 2 到 20 个字符', trigger: 'blur' },
  ],
  licenseNo: [
    { required: true, message: '请输入营业执照号', trigger: 'blur' },
    { min: 10, max: 30, message: '营业执照号长度在 10 到 30 个字符', trigger: 'blur' },
  ],
  subMchId: [{ required: true, message: '请输入子商户ID(用于收款)', trigger: 'blur' }],
  licenseImages: [{ required: true, type: 'array', message: '请上传营业执照图片', trigger: 'change' }],
}

// 加载行业列表
const loadIndustryList = async (name: string) => {
  try {
    state.loadingIndustry = true
    const response = await getIndustryList({ name: name || '', page: 1, pageSize: 20 })
    industryList.value = response.data.records || ([] as PlatformIndustry[])
  } catch (err) {
    ElMessage.error('获取行业列表失败')
  } finally {
    state.loadingIndustry = false
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
  state.merchantCreateRequest.logoUrl = response.data.url || ''
}
// 处理图片上传成功
const handleImageUploadSuccess = (response: any) => {
  if (!state.merchantCreateRequest.images) {
    state.merchantCreateRequest.images = []
  }
  state.merchantCreateRequest.images.push(response.data.url || '')
}
// 处理营业执照图片上传成功
const handleLicenseImageUploadSuccess = (response: any) => {
  if (!state.merchantCreateRequest.licenseImages) {
    state.merchantCreateRequest.licenseImages = []
  }
  state.merchantCreateRequest.licenseImages.push(response.data.url || '')
}

// 重置表单
function resetForm() {
  formRef.value.resetFields()
  state.merchantCreateRequest = {} as MerchantCreateRequest
}

// 提交表单
async function submitForm() {
  try {
    await formRef.value.validate()
    loading.value = true
    try {
      await createMerchant(state.merchantCreateRequest)
      ElMessage.success('商家创建成功')
      resetForm()
    } catch (error: any) {
      ElMessage.error(error?.msg || '商家创建失败，请重试')
    }
    // 实际项目中可能需要重定向到列表页
    // router.push('/merchantsAlliance/merchants/list')
  } catch (err: any) {
    const [, firstValue]: any = Object.entries(err)[0]
    ElMessage.error(firstValue[0].message ? firstValue[0].message : '创建失败，请重试')
  } finally {
    loading.value = false
  }
}

onMounted(() => {})
</script>

<style scoped lang="scss">
.delete-btn {
  margin-top: 4px;
  font-size: 12px;
  color: #f56c6c;
}

.delete-btn:hover {
  color: #f78989;
}

:deep(.el-form-item:last-of-type) {
  margin-bottom: 18px !important;
}
</style>
