<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 加载状态 -->
    <div v-if="state.loading" v-loading="state.loading" class="my-10" element-loading-text="加载中..."></div>

    <!-- 内容区域 -->
    <div v-else>
      <!-- 基本信息卡片 -->
      <el-card class="mb-4">
        <template #header>
          <div class="flex flex-row items-center justify-between">
            <span>基本信息</span>
            <div v-if="!state.merchantInfo.auditing" class="flex flex-row gap-4 items-center">
              <el-button v-if="!isInfoEditing" type="primary" @click="handleBindCode">绑定微信</el-button>
              <el-button v-if="!isInfoEditing" type="primary" @click="handleEdit('info')">编辑</el-button>
              <el-button v-if="isInfoEditing" @click="cancelInfoEdit">取消</el-button>
              <el-button v-if="isInfoEditing" :loading="infoSaving" type="primary" @click="saveInfoChanges">
                保存
              </el-button>
            </div>
            <div v-else>
              <span class="text-yellow-500">审核中...</span>
            </div>
          </div>
        </template>

        <!-- 基本信息表单 -->
        <el-form
          ref="infoFormRef"
          :disabled="!isInfoEditing"
          :model="state.merchantInfo"
          :rules="formRules.merchantInfo"
          label-width="120px"
        >
          <div class="grid grid-cols-3 gap-4">
            <el-form-item label="商家名称" prop="name">
              <el-input v-model="state.merchantInfo.name" placeholder="请输入商家名称" />
            </el-form-item>
            <el-form-item label="子商户ID" prop="subMchId">
              <el-input
                v-model.number="state.merchantInfo.subMchId"
                placeholder="请输入子商户ID(用于收款)"
                type="number"
                clearable
              />
            </el-form-item>
            <el-form-item label="联系人姓名" prop="contactName">
              <el-input v-model="state.merchantInfo.contactName" placeholder="请输入联系人姓名" />
            </el-form-item>

            <el-form-item label="联系人手机" prop="contactPhone">
              <el-input v-model="state.merchantInfo.contactPhone" placeholder="请输入联系人手机" />
            </el-form-item>
            <el-form-item label="区域代理ID" prop="agentId">
              <el-input v-model.number="state.merchantInfo.agentId" placeholder="请输入区域代理ID" />
            </el-form-item>

            <el-form-item label="行业类型" prop="industryId">
              <el-select
                v-model="state.merchantInfo.industryId"
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

            <el-form-item label="所在地区" prop="regionCode">
              <ChinaArea
                v-model="state.merchantInfo.regionCode"
                :type="3"
                class="w-full"
                placeholder="请选择所在地区"
              />
            </el-form-item>
            <el-form-item label="详细地址" prop="addressDetail">
              <el-input
                v-model="state.merchantInfo.addressDetail"
                :rows="1"
                placeholder="请输入商家详细地址"
                type="textarea"
              />
            </el-form-item>

            <el-form-item label="商家状态" prop="enable">
              <el-switch v-model="state.merchantInfo.enable" />
            </el-form-item>

            <el-form-item :span="2" label="商家简介" prop="description">
              <el-input
                v-model="state.merchantInfo.description"
                :rows="8"
                placeholder="请输入商家简介"
                type="textarea"
              />
            </el-form-item>
            <!-- 商家Logo -->
            <el-form-item label="商家Logo" prop="logoUrl">
              <div v-if="state.merchantInfo.logoUrl" class="relative mr-4 transition-transform duration-300">
                <el-image
                  :preview-src-list="[getImageUrl(state.merchantInfo.logoUrl)]"
                  :preview-teleported="true"
                  :src="getImageUrl(state.merchantInfo.logoUrl)"
                  class="w-40 h-40 rounded-md transition-transform duration-300"
                  fit="cover"
                />
                <div
                  v-if="isInfoEditing"
                  class="absolute top-0 right-0 transition-transform duration-300 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center hover:scale-150"
                  @click="state.merchantInfo.logoUrl = ''"
                >
                  <el-icon>
                    <Close />
                  </el-icon>
                </div>
              </div>
              <el-upload
                v-if="isInfoEditing && !state.merchantInfo.logoUrl"
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
          <!-- 商家图片 -->
          <el-form-item label="商家图片" prop="images">
            <div
              v-for="(image, index) in state.merchantInfo.images"
              :key="index"
              class="relative mr-4 transition-transform duration-300"
            >
              <el-image
                :initial-index="index"
                :preview-src-list="state.merchantInfo.images.map((item: string) => getImageUrl(item))"
                :preview-teleported="true"
                :src="getImageUrl(image)"
                class="w-40 h-40 rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                v-if="isInfoEditing"
                class="absolute top-0 right-0 transition-transform duration-300 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center hover:scale-150"
                @click="state.merchantInfo.images.splice(index, 1)"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="isInfoEditing && (!state.merchantInfo.images || state.merchantInfo.images?.length < 5)"
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
          <el-form-item v-if="isInfoEditing" label="修改原因" prop="modifyReason">
            <el-input
              v-model="state.merchantInfo.modifyReason"
              :rows="4"
              placeholder="请输入修改原因"
              type="textarea"
            />
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 资质信息卡片 -->
      <el-card class="mb-4">
        <template #header>
          <div class="flex flex-row items-center justify-between">
            <span>资质信息</span>
            <div v-if="!state.merchantInfo.auditing" class="flex flex-row gap-4 items-center">
              <el-button v-if="!isQualificationEditing" type="primary" @click="handleEdit('qualification')">
                编辑
              </el-button>
              <el-button v-if="isQualificationEditing" @click="cancelQualificationEdit">取消</el-button>
              <el-button
                v-if="isQualificationEditing"
                :loading="qualificationSaving"
                type="primary"
                @click="saveQualificationChanges"
              >
                保存
              </el-button>
            </div>
            <div v-else>
              <span class="text-yellow-500">审核中...</span>
            </div>
          </div>
        </template>
        <!-- 资质信息表单 -->
        <el-form
          ref="qualificationFormRef"
          :disabled="!isQualificationEditing"
          :model="state.merchantQualification"
          :rules="formRules.merchantQualification"
          label-width="120px"
        >
          <div class="grid grid-cols-2 gap-4">
            <el-form-item label="法人姓名" prop="legalPerson">
              <el-input v-model="state.merchantQualification.legalPerson" placeholder="请输入法人姓名" />
            </el-form-item>

            <el-form-item label="营业执照号" prop="licenseNo">
              <el-input v-model="state.merchantQualification.licenseNo" placeholder="请输入营业执照号" />
            </el-form-item>
          </div>

          <!-- 资质图片上传 -->
          <el-form-item label="资质图片" prop="licenseImages">
            <div
              v-for="(image, index) in state.merchantQualification.licenseImages"
              :key="index"
              class="relative mr-4 transition-transform duration-300"
            >
              <el-image
                :initial-index="index"
                :preview-src-list="state.merchantQualification.licenseImages.map((item: string) => getImageUrl(item))"
                :preview-teleported="true"
                :src="getImageUrl(image)"
                class="w-40 h-40 rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                v-if="isQualificationEditing"
                class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                @click="state.merchantQualification.licenseImages.splice(index, 1)"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="
                isQualificationEditing &&
                (!state.merchantQualification.licenseImages || state.merchantQualification.licenseImages?.length < 5)
              "
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
          <!-- 修改原因 -->
          <el-form-item v-if="isQualificationEditing" label="修改原因" prop="modifyReason">
            <el-input
              v-model="state.merchantQualification.modifyReason"
              :rows="4"
              placeholder="请输入修改原因"
              type="textarea"
            />
          </el-form-item>
        </el-form>
      </el-card>
    </div>
    <!-- 微信绑定弹窗 -->
    <el-dialog v-model="state.isBindCode" title="微信绑定" width="500px">
      <el-image :src="state.bindCodeQrcode" class="w-full h-full" fit="contain" />
      <template #footer>
        <span class="dialog-footer">
          <el-button type="danger" @click="handleDeleteStore">解绑</el-button>
          <el-button @click="state.isBindCode = false">绑定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { Close, Plus } from '@element-plus/icons-vue'
import ChinaArea from '/@/components/ChinaArea/index.vue'
import {
  getMerchantInfo,
  getMerchantQualification,
  updateMerchantInfo,
  uploadMerchantQualification,
} from '/@/api/merchantsAlliance/merchant/maintain'
import {
  MerchantInfoResponse,
  MerchantInfoUpdateRequest,
  MerchantQualificationResponse,
  MerchantQualificationUploadRequest,
} from '/@/api/merchantsAlliance/merchant/types'
import request from '/@/utils/request'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import {
  beforeImageUpload,
  beforeLicenseImageUpload,
  beforeLogoUpload,
  getImageUrl,
} from '/@/views/merchantsAlliance/way'
import { PlatformIndustry } from '/@/api/merchantsAlliance/store/types'
import { bindCode } from '/@/api/merchantsAlliance/merchant/merchant'
// 表单引用
const infoFormRef = ref<any>(null)
const qualificationFormRef = ref<any>(null)

// 状态管理
const infoSaving = ref(false) // 基本信息保存状态
const qualificationSaving = ref(false) // 资质信息保存状态
const isInfoEditing = ref(false) // 基本信息编辑状态
const isQualificationEditing = ref(false) // 资质信息编辑状态

// 行业分类列表
const industryList = ref([] as PlatformIndustry[])
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

// 商家状态管理
const state = reactive({
  loadingIndustry: false,
  // 加载状态
  loading: false,
  // 微信绑定状态
  isBindCode: false,
  // 微信绑定二维码
  bindCodeQrcode: '',
  // 商家基本信息
  merchantInfo: {} as MerchantInfoResponse,
  // 商家基本信息原始值
  originalMerchantInfo: {} as MerchantInfoResponse,
  // 商家资质信息
  merchantQualification: {} as MerchantQualificationResponse,
  // 商家资质信息原始值
  originalMerchantQualification: {} as MerchantQualificationResponse,
})
// 表单验证规则
const formRules = {
  merchantInfo: {
    name: [{ required: true, message: '请输入商家名称', trigger: 'blur' }],
    contactName: [{ required: true, message: '请输入联系人姓名', trigger: 'blur' }],
    contactPhone: [{ required: true, message: '请输入商家联系电话', trigger: 'blur' }],
    address: [{ required: true, message: '请输入商家地址', trigger: 'blur' }],
    industryId: [{ required: true, message: '请选择行业分类', trigger: 'change' }],
    regionCode: [{ required: true, message: '请输入地区编码', trigger: 'blur' }],
    logoUrl: [{ required: true, message: '请上传商家logo图片', trigger: 'change' }],
    modifyReason: [{ required: true, message: '请输入修改原因', trigger: 'blur' }],
    subMchId: [{ required: true, message: '请输入子商户ID', trigger: 'blur' }],
  },
  merchantQualification: {
    legalPerson: [{ required: true, message: '请输入法人姓名', trigger: 'blur' }],
    licenseNo: [{ required: true, message: '请输入营业执照号', trigger: 'blur' }],
    licenseImages: [{ required: true, type: 'array', message: '请上传商家资质图片', trigger: 'change' }],
    modifyReason: [{ required: true, message: '请输入修改原因', trigger: 'blur' }],
  },
}

// 上传相关配置
const uploadUrl = '/admin/sys-file/upload'

// 目录配置
const dir = 'merchant'

// 加载商家信息
const loadMerchantInfo = async () => {
  try {
    state.loading = true

    // 并行加载基本信息和资质信息
    const [infoResponse, qualificationResponse] = await Promise.all([getMerchantInfo(), getMerchantQualification()])
    state.merchantInfo = infoResponse.data || {}
    state.merchantQualification = qualificationResponse.data || {}

    // 保存原始数据用于取消编辑
    state.originalMerchantInfo = { ...state.merchantInfo }
    state.originalMerchantQualification = { ...state.merchantQualification }
  } catch (err: any) {
    ElMessage.error(err.msg || '获取商家信息失败')
  } finally {
    state.loading = false
  }
}

const handleEdit = (type: 'info' | 'qualification') => {
  if (type === 'info') {
    if (isQualificationEditing.value) {
      ElMessageBox.confirm('是否要切换到基本信息编辑模式？未保存的更改将会丢失。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }).then(() => {
        isQualificationEditing.value = false
        isInfoEditing.value = true
      })
    } else {
      isInfoEditing.value = true
    }
  } else if (type === 'qualification') {
    if (isInfoEditing.value) {
      ElMessageBox.confirm('是否要切换到资质信息编辑模式？未保存的更改将会丢失。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }).then(() => {
        isInfoEditing.value = false
        isQualificationEditing.value = true
      })
    } else {
      isQualificationEditing.value = true
    }
  }
}
// 取消资质信息编辑
const cancelQualificationEdit = () => {
  ElMessageBox.confirm('确定要取消编辑吗？未保存的更改将会丢失。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    // 恢复原始数据
    state.merchantQualification = { ...state.originalMerchantQualification }
    isQualificationEditing.value = false
    // 重置表单验证
    if (qualificationFormRef.value) {
      qualificationFormRef.value.resetFields()
    }
  })
  isQualificationEditing.value = false
}

// 保存资质信息更改
const saveQualificationChanges = async () => {
  try {
    // 表单验证
    await qualificationFormRef.value.validate()
    qualificationSaving.value = true

    // 准备资质信息更新数据
    const qualificationUpdateData: MerchantQualificationUploadRequest = {
      legalPerson: state.merchantQualification.legalPerson,
      licenseNo: state.merchantQualification.licenseNo,
      licenseImages: state.merchantQualification.licenseImages,
      modifyReason: state.merchantQualification.modifyReason || '',
    }
    // 调用更新接口
    try {
      await uploadMerchantQualification(qualificationUpdateData)
      ElMessage.success('资质信息更新成功')
      isQualificationEditing.value = false
      // 刷新商家资质信息
      await loadMerchantInfo()
    } catch (err: any) {
      ElMessage.error(err.msg || '更新资质信息失败')
    }
  } catch (err: any) {
    const [, firstValue]: any = Object.entries(err)[0]
    ElMessage.error(firstValue[0].message ? firstValue[0].message : '保存失败，请重试')
    return
  } finally {
    qualificationSaving.value = false
  }
}

// 取消基本信息编辑
const cancelInfoEdit = () => {
  ElMessageBox.confirm('确定要取消编辑吗？未保存的更改将会丢失。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      // 恢复原始数据
      state.merchantInfo = { ...state.originalMerchantInfo }
      isInfoEditing.value = false
      // 重置表单验证
      if (infoFormRef.value) {
        infoFormRef.value.resetFields()
      }
    })
    .catch(() => {
      // 用户取消操作
    })
}

// 保存基本信息更改
const saveInfoChanges = async () => {
  try {
    // 表单验证
    await infoFormRef.value.validate()
    infoSaving.value = true
    isInfoEditing.value = false
    // 准备基础信息更新数据
    const infoUpdateData: MerchantInfoUpdateRequest = {
      name: state.merchantInfo.name,
      logoUrl: state.merchantInfo.logoUrl,
      images: state.merchantInfo.images,
      description: state.merchantInfo.description,
      contactName: state.merchantInfo.contactName,
      contactPhone: state.merchantInfo.contactPhone,
      industryId: state.merchantInfo.industryId,
      regionCode: state.merchantInfo.regionCode,
      addressDetail: state.merchantInfo.addressDetail,
      modifyReason: state.merchantInfo.modifyReason || '',
    }
    // 调用更新接口
    try {
      await updateMerchantInfo(infoUpdateData)

      // 更新成功
      ElMessage.success('保存成功')
      // 更新原始数据
      await loadMerchantInfo()
    } catch (err: any) {
      ElMessage.error(err.msg || '更新基本信息失败')
    }
  } catch (err: any) {
    const [, firstValue]: any = Object.entries(err)[0]
    ElMessage.error(firstValue[0].message ? firstValue[0].message : '保存失败，请重试')
  } finally {
    infoSaving.value = false
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

// Logo上传成功处理
const handleLogoUploadSuccess = (response: any) => {
  if (response.code === 0 && response.data) {
    state.merchantInfo.logoUrl = response.data.url
    ElMessage.success('Logo上传成功')
  } else {
    ElMessage.error(response.msg || 'Logo上传失败')
  }
}

// 图片上传成功处理
const handleImageUploadSuccess = (response: any) => {
  if (response.code === 0 && response.data) {
    // 确保images是一个数组
    if (!state.merchantInfo.images) {
      state.merchantInfo.images = []
    }
    state.merchantInfo.images.push(response.data.url)
    ElMessage.success('图片上传成功')
  } else {
    ElMessage.error(response.msg || '图片上传失败')
  }
}

// 资质图片上传成功处理
const handleLicenseImageUploadSuccess = (response: any) => {
  if (response.code === 0 && response.data) {
    // 确保licenseImages是一个数组
    if (!state.merchantQualification.licenseImages) {
      state.merchantQualification.licenseImages = []
    }
    state.merchantQualification.licenseImages.push(response.data.url)
    ElMessage.success('资质图片上传成功')
  } else {
    ElMessage.error(response.msg || '资质图片上传失败')
  }
}

// 处理绑定码二维码
function getQrCodeSrc(bindCodeQrcodeBase64: string) {
  // 如果bindCodeQrcode已经包含data:image前缀，直接返回
  if (bindCodeQrcodeBase64.startsWith('data:image')) {
    return bindCodeQrcodeBase64
  }
  // 如果是纯Base64字符串，添加前缀
  if (bindCodeQrcodeBase64) {
    try {
      // 尝试解析JSON（如果API返回的是JSON格式的Base64数据）
      const decodedStr = atob(bindCodeQrcodeBase64)
      console.log('解码后的字符串:', decodedStr)

      const parsed = JSON.parse(decodedStr)
      console.log('解析后的对象:', parsed)

      // 检查是否为微信接口错误
      if (parsed && typeof parsed === 'object' && parsed.errcode) {
        // 处理微信接口错误
        let errorMsg = `微信绑定失败: ${parsed.errmsg} (错误码: ${parsed.errcode})`

        // 针对特定错误码提供更详细的解决方案
        if (parsed.errcode === 41030) {
          errorMsg += '\n错误原因：微信小程序页面路径配置错误'
          errorMsg += '\n解决方案：请联系后端开发人员检查微信小程序页面路径配置'
        }

        ElMessage.error(errorMsg)
        return ''
      }

      // 如果解析后的是字符串，添加前缀
      if (typeof parsed === 'string') {
        return parsed.startsWith('data:image') ? parsed : `data:image/png;base64,${parsed}`
      }

      // 如果是其他类型的对象，返回空并显示错误
      ElMessage.error('二维码数据格式错误：返回了非字符串类型的数据')
      return ''
    } catch (e) {
      console.error('解析二维码数据失败:', e)
      // 如果不是JSON，直接添加前缀
      return `data:image/png;base64,${bindCodeQrcodeBase64}`
    }
  }
  return ''
}

// 处理绑定码
async function handleBindCode() {
  try {
    const bindCodeResponse = await bindCode(state.merchantInfo.id)
    if (bindCodeResponse.code === 0 && bindCodeResponse.data) {
      state.bindCodeQrcode = getQrCodeSrc(bindCodeResponse.data)
      console.log(111, state.bindCodeQrcode)
      state.isBindCode = true
    } else {
      ElMessage.error(bindCodeResponse.msg || '获取绑定码失败')
    }
  } catch (err: any) {
    ElMessage.error(err.msg || '绑定失败')
  }
}

// 页面加载时获取商家信息
onMounted(() => {
  // 加载商家基本信息
  loadMerchantInfo()
})
</script>

<style lang="scss" scoped>
:deep(.el-form-item:last-of-type) {
  margin-bottom: 18px !important;
}
</style>
