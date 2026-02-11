<template>
  <div class="flex flex-col gap4 p4">
    <el-form ref="formRef" :model="formData" :rules="formRules" class="flex flex-col gap4" label-width="80px">
      <!-- 基本信息 -->
      <div class="flex flex-row gap4">
        <el-card class="flex-[4]" shadow="never">
          <template #header>
            <div class="font-bold">
              <span>基本信息</span>
            </div>
          </template>
          <el-row :gutter="20" class="flex flex-row gap4">
            <!-- 商品名称-->
            <el-col :span="7">
              <el-form-item label="商品名称" prop="name">
                <el-input
                  v-model="formData.name"
                  maxlength="20"
                  placeholder="请输入商品名称"
                  size="small"
                  show-word-limit
                />
              </el-form-item>
            </el-col>
            <!-- 商品状态-->
            <el-col :span="7">
              <el-form-item label="商品状态" prop="status">
                <el-select v-model="formData.status" placeholder="请选择商品状态" size="small">
                  <el-option label="草稿" value="DRAFT" />
                  <el-option label="已发布" value="PUBLISHED" />
                  <el-option label="已归档" value="ARCHIVED" />
                </el-select>
              </el-form-item>
            </el-col>
            <!-- 商品品牌-->
            <el-col :span="7">
              <el-form-item label="商品品牌" prop="brandId">
                <el-select v-model="formData.brandId" placeholder="请选择商品品牌" size="small">
                  <!-- 这里需要根据实际的品牌数据进行渲染 -->
                  <el-option v-for="brand in brandList" :key="brand.id" :label="brand.name" :value="brand.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <!-- 商品分类-->
            <el-col :span="7">
              <el-form-item label="商品分类" prop="categoryId">
                <el-tree-select
                  v-model="formData.categoryId"
                  :check-strictly="true"
                  :data="categoryTreeOpts"
                  :props="{ children: 'children', value: 'id', label: 'name' }"
                  :render-after-expand="false"
                  check-on-click-node="true"
                  node-key="id"
                  placeholder="请选择商品分类"
                  size="small"
                />
              </el-form-item>
            </el-col>
            <!-- 商品类型-->
            <el-col :span="7">
              <el-form-item label="商品类型" prop="type">
                <el-select v-model="formData.type" placeholder="请选择商品类型" size="small">
                  <el-option label="实物商品" value="PHYSICAL" />
                  <el-option label="服务商品" value="SERVICE" />
                </el-select>
              </el-form-item>
            </el-col>
            <!-- 排序权重-->
            <el-col :span="7">
              <el-form-item label="排序权重" prop="sortWeight">
                <el-input-number
                  v-model="formData.sortWeight"
                  :max="9999"
                  :min="0"
                  placeholder="请输入排序权重"
                  size="small"
                />
              </el-form-item>
            </el-col>
            <!-- 商品描述-->
            <el-col :span="14">
              <el-form-item label="商品描述" prop="description">
                <el-input
                  v-model="formData.description"
                  :rows="4"
                  maxlength="200"
                  placeholder="请输入商品描述"
                  size="small"
                  type="textarea"
                  show-word-limit
                />
              </el-form-item>
            </el-col>
            <!-- 商品主图-->
            <el-col :span="6">
              <el-form-item label="商品主图" prop="mainImage">
                <div v-if="formData.mainImage" class="relative mr-4 transition-transform duration-300">
                  <el-image
                    :initial-index="0"
                    :preview-src-list="[getImageUrl(formData.mainImage)]"
                    :preview-teleported="true"
                    :src="getImageUrl(formData.mainImage)"
                    class="w-20 h-20 rounded-md transition-transform duration-300"
                    fit="cover"
                  />
                  <div
                    class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                    @click="formData.mainImage = ''"
                  >
                    <el-icon>
                      <Close />
                    </el-icon>
                  </div>
                </div>
                <el-upload
                  v-if="!formData.mainImage"
                  v-model="formData.mainImage"
                  :auto-upload="true"
                  :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'mainImage'})"
                  :limit="1"
                  :show-file-list="false"
                  accept="image/*"
                  class="w-20 h-20 has-hover:border-blue-7 border border-dashed border-gray-300 rounded-6px"
                  list-type="picture"
                >
                  <el-icon class="w-20 h-20 text-gray">
                    <Plus />
                  </el-icon>
                </el-upload>
              </el-form-item>
            </el-col>
            <!-- 详情图片-->
            <el-col :span="24">
              <el-form-item label="详情图片" prop="detailImages">
                <div
                  v-for="(image, index) in formData.detailImages"
                  :key="index"
                  class="relative mr-4 transition-transform duration-300"
                >
                  <el-image
                    :initial-index="index"
                    :preview-src-list="formData.detailImages.map((item: string) => getImageUrl(item))"
                    :preview-teleported="true"
                    :src="getImageUrl(image)"
                    class="w-20 h-20 rounded-md transition-transform duration-300"
                    fit="cover"
                  />
                  <div
                    class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                    @click="formData.detailImages.splice(index, 1)"
                  >
                    <el-icon>
                      <Close />
                    </el-icon>
                  </div>
                </div>
                <el-upload
                  v-model="formData.detailImages"
                  :auto-upload="true"
                  :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'detailImage'})"
                  :show-file-list="false"
                  accept="image/*"
                  class="w-20 h-20 has-hover:border-blue-7 border border-dashed border-gray-300 rounded-6px"
                  list-type="picture"
                  multiple
                >
                  <el-icon class="w-20 h-20 text-gray">
                    <Plus />
                  </el-icon>
                </el-upload>
              </el-form-item>
            </el-col>
            <!-- 商品详情描述 -->
            <el-col :span="24">
              <el-form-item label="商品详情" prop="detailDescription">
                <div class="flex flex-col gap-3">
                  <div v-for="(description, i) in formData.detailDescription" :key="i" class="flex flex-col gap-1">
                    <div class="flex flex-row gap-1">
                      <el-input
                        v-model="description.name"
                        class="w-40"
                        placeholder="请输入详情属性名(例：套餐内容)"
                        size="small"
                        type="text"
                      />
                      <el-select
                        v-model="description.type"
                        class="w-40"
                        placeholder="请选择详情属性类型"
                        size="small"
                        type="text"
                      >
                        <el-option label="描述" value="DESCRIBE" />
                        <el-option label="属性" value="ATTRIBUTE" />
                      </el-select>
                      <el-button
                        v-if="description.type === 'ATTRIBUTE'"
                        size="small"
                        type="primary"
                        link
                        text
                        @click="addDescriptionValue(i)"
                      >
                        <el-icon>
                          <Plus />
                        </el-icon>
                        添加属性值
                      </el-button>
                      <el-button size="small" type="danger" link text @click="removeDescription(i)">
                        <el-icon>
                          <Delete />
                        </el-icon>
                        删除属性
                      </el-button>
                    </div>
                    <div v-if="description.type === 'ATTRIBUTE'" class="flex flex-row gap-1 flex-wrap">
                      <div v-for="(attr, j) in description.value" :key="j" class="flex flex-row gap-1">
                        <el-input
                          v-model="attr.project"
                          class="w-35"
                          placeholder="属性项目(例：牛肉)"
                          size="small"
                          type="text"
                        />
                        <el-input
                          v-model="attr.quantity"
                          class="w-35"
                          placeholder="属性数量(例：500g)"
                          size="small"
                          type="text"
                        />
                        <el-button size="small" type="danger" link text @click="removeDescriptionValue(i, j)">
                          <el-icon>
                            <Delete />
                          </el-icon>
                          删除属性值
                        </el-button>
                      </div>
                    </div>
                    <div v-else>
                      <el-input
                        v-model="description.label"
                        :rows="4"
                        maxlength="200"
                        placeholder="请输入商品描述"
                        size="small"
                        type="textarea"
                        show-word-limit
                      />
                    </div>
                  </div>
                  <el-button size="small" type="primary" link text @click="addDescription">
                    <el-icon>
                      <Plus />
                    </el-icon>
                    添加属性
                  </el-button>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>
        <!-- 规格属性 -->
        <el-card class="flex-[3]" shadow="never">
          <template #header>
            <div class="font-bold">
              <span>商品标签属性信息</span>
            </div>
          </template>
          <div class="flex flex-col gap4">
            <!-- 商品标签-->
            <div>
              <el-form-item :rules="skuRules.tags" label="商品标签" prop="tags">
                <el-input-tag v-model="formData.tags" placeholder="请输入标签" size="small" multiple />
              </el-form-item>
            </div>
            <!-- 商品属性-->
            <div>
              <el-form-item :rules="skuRules.attributes" label="商品规格" prop="attributes">
                <div class="flex flex-col gap-3">
                  <div v-for="(attr, i) in formData.attributes" :key="i" class="flex flex-col gap-1">
                    <div class="flex flex-row">
                      <el-input v-model="attr.label" class="w-40" placeholder="请输入属性名" size="small" type="text" />
                      <el-button size="small" type="primary" link text @click="addAttributeValue(i)">
                        <el-icon>
                          <Plus />
                        </el-icon>
                        添加属性值
                      </el-button>
                      <el-button size="small" type="danger" link text @click="removeAttribute(i)">
                        <el-icon>
                          <Delete />
                        </el-icon>
                        删除属性
                      </el-button>
                    </div>
                    <div class="flex flex-row flex-wrap gap-2">
                      <div v-for="(value, j) in attr.values" :key="j" class="flex flex-row gap-1">
                        <el-input
                          v-model="attr.values[j]"
                          class="w-40"
                          placeholder="请输入属性值"
                          size="small"
                          type="text"
                        >
                          <template #append>
                            <el-button size="small" type="danger" link text @click="removeAttributeValue(i, j)">
                              <el-icon>
                                <Delete />
                              </el-icon>
                            </el-button>
                          </template>
                        </el-input>
                      </div>
                    </div>
                  </div>
                  <el-button size="small" type="primary" text @click="addAttribute">
                    <el-icon>
                      <Plus />
                    </el-icon>
                    添加属性
                  </el-button>
                </div>
              </el-form-item>
            </div>
          </div>
        </el-card>
      </div>

      <!-- SKU管理 -->
      <el-card shadow="never">
        <template #header>
          <div class="flex flex-row gap4 font-bold items-center">
            <span>SKU管理</span>
            <el-button size="small" type="primary" @click="addSku">
              <el-icon>
                <Plus />
              </el-icon>
              添加SKU
            </el-button>
          </div>
        </template>
        <div v-if="formData.skus.length === 0" class="empty-sku">
          <el-empty description="请添加SKU" />
        </div>
        <div v-else>
          <div v-for="(sku, index) in formData.skus" :key="index">
            <el-divider content-position="left">
              <div class="flex flex-row gap4 items-center">
                {{ sku.skuName || 'SKU #' + (index + 1) }}
                <el-button :disabled="formData.skus.length <= 1" size="small" type="danger" @click="removeSku(index)">
                  <el-icon>
                    <Delete />
                  </el-icon>
                  删除
                </el-button>
                <el-button size="small" type="success" @click="copySku(index)">
                  <el-icon>
                    <Plus />
                  </el-icon>
                  复制
                </el-button>
              </div>
            </el-divider>
            <div class="flex flex-row gap4">
              <div class="flex flex-col gap-2">
                <el-form-item :prop="`skus.${index}.skuImage`" :rules="skuRules.skuImage" label="SKU图片">
                  <div v-if="sku.skuImage" class="relative mr-4 transition-transform duration-300">
                    <el-image
                      :initial-index="0"
                      :preview-src-list="getImageUrl(sku.skuImage)"
                      :preview-teleported="true"
                      :src="getImageUrl(sku.skuImage)"
                      class="w-35 h-35 rounded-md transition-transform duration-300"
                      fit="cover"
                    />
                    <div
                      class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                      @click="sku.skuImage = ''"
                    >
                      <el-icon>
                        <Close />
                      </el-icon>
                    </div>
                  </div>
                  <el-upload
                    v-if="!sku.skuImage"
                    v-model="sku.skuImage"
                    :auto-upload="true"
                    :http-request="(options: any) => handleHttpUpload({...options, uploadType: 'skuImage', index})"
                    :show-file-list="false"
                    accept="image/*"
                    class="w-35 h-35 has-hover:border-blue-7 border border-dashed border-gray-300 rounded-6px"
                    list-type="picture"
                  >
                    <el-icon class="w-35 h-35">
                      <Plus />
                    </el-icon>
                  </el-upload>
                </el-form-item>
              </div>
              <div class="flex flex-[2] flex-row flex-wrap gap-2">
                <!-- SKU名称 -->
                <el-col :span="8">
                  <el-form-item :prop="`skus.${index}.skuName`" :rules="skuRules.skuName" label="SKU名称">
                    <el-input
                      v-model="sku.skuName"
                      maxlength="20"
                      placeholder="请输入SKU名称"
                      size="small"
                      show-word-limit
                    />
                  </el-form-item>
                </el-col>
                <!-- SKU编码 -->
                <el-col :span="8">
                  <el-form-item :prop="`skus.${index}.skuCode`" :rules="skuRules.skuCode" label="SKU编码">
                    <el-input
                      v-model="sku.skuCode"
                      maxlength="20"
                      placeholder="请输入SKU编码"
                      size="small"
                      show-word-limit
                    />
                  </el-form-item>
                </el-col>
                <!-- 排序权重 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.sortWeight`" :rules="skuRules.sortWeight" label="排序权重">
                    <el-input-number
                      v-model="sku.sortWeight"
                      :max="9999"
                      :min="0"
                      placeholder="请输入排序权重"
                      size="small"
                    />
                  </el-form-item>
                </el-col>
                <!-- 销售价格 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.price`" :rules="skuRules.price" label="销售价格">
                    <el-input-number
                      v-model="sku.price"
                      :min="0"
                      :step="0.01"
                      placeholder="请输入销售价格"
                      size="small"
                    />
                  </el-form-item>
                </el-col>
                <!-- 原价 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.originalPrice`" :rules="skuRules.originalPrice" label="原价">
                    <el-input-number
                      v-model="sku.originalPrice"
                      :min="0"
                      :step="0.01"
                      placeholder="请输入原价"
                      size="small"
                    />
                  </el-form-item>
                </el-col>
                <!-- 库存 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.stock`" :rules="skuRules.stock" label="库存">
                    <el-input-number v-model="sku.stock" :min="0" placeholder="请输入库存" size="small" />
                  </el-form-item>
                </el-col>
                <!-- 预警库存 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.warningStock`" :rules="skuRules.warningStock" label="预警库存">
                    <el-input-number v-model="sku.warningStock" :min="0" placeholder="请输入预警库存" size="small" />
                  </el-form-item>
                </el-col>
                <!-- 重量 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.weight`" :rules="skuRules.weight" label="重量">
                    <el-input-number v-model="sku.weight" :min="0" :step="0.01" placeholder="请输入重量" size="small" />
                  </el-form-item>
                </el-col>
                <!-- 体积 -->
                <el-col :span="6">
                  <el-form-item :prop="`skus.${index}.volume`" :rules="skuRules.volume" label="体积">
                    <el-input-number v-model="sku.volume" :min="0" :step="0.01" placeholder="请输入体积" size="small" />
                  </el-form-item>
                </el-col>
                <!-- 启用状态 -->
                <el-col :span="2">
                  <el-form-item :prop="`skus.${index}.enabled`" :rules="skuRules.enabled" label="启用状态">
                    <el-switch v-model="sku.enabled" :active-value="'1'" :inactive-value="'0'" />
                  </el-form-item>
                </el-col>
              </div>
              <div class="flex flex-[1] flex-row gap-2 items-start">
                <el-form-item :prop="`skus.${index}.specAttributes`" :rules="skuRules.specAttributes" label="规格属性">
                  <div class="flex flex-row flex-wrap gap4 items-center">
                    <div v-for="(attr, i) in formData.attributes" :key="i" class="flex flex-row gap-1 items-center">
                      <div>{{ attr.label }}:</div>
                      <el-select
                        v-model="sku.specAttributes[attr.label]"
                        class="w-30"
                        placeholder="请选择规格"
                        size="small"
                      >
                        <el-option v-for="item in attr.values || []" :key="item" :label="item" :value="item" />
                      </el-select>
                    </div>
                  </div>
                </el-form-item>
              </div>
              <!--                <el-col :span="24">-->
              <!--                  <el-form-item-->
              <!--                    :prop="`skus.${index}.marketingConfig`"-->
              <!--                    :rules="skuRules.marketingConfig"-->
              <!--                    label="营销配置"-->
              <!--                  >-->
              <!--                    <el-input-->
              <!--                      v-model="sku.marketingConfig"-->
              <!--                      :rows="3"-->
              <!--                      placeholder="请输入营销配置（JSON格式）"-->
              <!--                      type="textarea"-->
              <!--                    />-->
              <!--                  </el-form-item>-->
              <!--                </el-col>-->
            </div>
          </div>
        </div>
      </el-card>
    </el-form>
    <el-card>
      <div class="flex justify-end">
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" @click="submitForm">{{ isEdit ? '保存' : '提交' }}</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElForm, ElMessage, FormInstance, type UploadRequestOptions } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { goodsDetailApi, goodsSaveApi } from '/@/api/merchantsAlliance/product/goods/api'
import { formRules, IGoodsFormData, ISkus, skuRules } from '/@/api/merchantsAlliance/product/goods/types'
import { Close, Delete, Plus } from '@element-plus/icons-vue'
import request from '/@/utils/request'
import { getImageUrl } from '/@/views/merchantsAlliance/way'
import { categoryTreeApi } from '/@/api/merchantsAlliance/product/category/api'
import mittBus from '/@/utils/mitt'

const uploadUrl = '/admin/sys-file/upload'
// 表单引用
const formRef = ref<FormInstance>()

// 路由和导航
const route = useRoute()
const router = useRouter()

// 判断是否为编辑模式
const isEdit = computed(() => !!route.query.id)

// 商品分类树选项
const categoryTreeOpts = ref([])

// 表单数据
const formData = reactive<IGoodsFormData>({
  id: '',
  name: '',
  status: 'DRAFT',
  brandId: '',
  categoryId: '',
  // 商品描述
  description: '',
  type: 'PHYSICAL',
  mainImage: '',
  detailImages: [],
  detailDescription: [],
  tags: [],
  attributes: [],
  sortWeight: 0,
  skus: [],
  idempotencyKey: '',
})

// 品牌列表（模拟数据，实际需要从API获取）
const brandList = ref([
  { id: '1', name: '品牌A' },
  { id: '2', name: '品牌B' },
  { id: '3', name: '品牌C' },
])

// 加载商品分类树选项
async function loadCategoryTreeOpts() {
  const resp = await categoryTreeApi()
  if (resp.code === 0) {
    categoryTreeOpts.value = resp.data
  }
}

// 初始化数据
onMounted(() => {
  if (isEdit.value) {
    loadGoodsDetail()
  } else {
    // 新增时自动添加一个SKU
    addSku()
  }
  loadCategoryTreeOpts()
})

// 加载商品详情
const loadGoodsDetail = async () => {
  try {
    const id = route.query.id as string
    const response = await goodsDetailApi(id)
    Object.assign(formData, response.data)
    // 确保SKU数组存在
    if (!formData.skus || !Array.isArray(formData.skus)) {
      formData.skus = []
      addSku()
    }
  } catch (error) {
    ElMessage.error('加载商品详情失败')
    console.error('加载商品详情失败:', error)
  }
}

// 添加SKU
const addSku = () => {
  const newSku: ISkus = {
    skuName: '',
    skuCode: '',
    price: 0,
    originalPrice: 0,
    stock: 0,
    warningStock: 0,
    specAttributes: {},
    skuImage: '',
    weight: 0,
    volume: 0,
    marketingConfig: '',
    enabled: '1',
    sortWeight: 0,
  }
  formData.skus.push(newSku)
}

// 删除SKU
const removeSku = (index: number) => {
  if (formData.skus.length > 1) {
    formData.skus.splice(index, 1)
  } else {
    ElMessage.warning('至少需要保留一个SKU')
  }
}
// 复制SKU
const copySku = (index: number) => {
  const skuToCopy = formData.skus[index]
  const newSku: ISkus = {
    ...skuToCopy,
    skuName: `00${formData.skus.length + 1}`,
    skuCode: `00${formData.skus.length + 1}`,
    price: skuToCopy.price,
    originalPrice: skuToCopy.originalPrice,
    stock: skuToCopy.stock,
    warningStock: skuToCopy.warningStock,
    specAttributes: { ...skuToCopy.specAttributes },
    skuImage: skuToCopy.skuImage,
    weight: formData.skus.length + 1,
    volume: skuToCopy.volume,
    marketingConfig: skuToCopy.marketingConfig,
    enabled: skuToCopy.enabled,
    sortWeight: skuToCopy.sortWeight,
  }
  formData.skus.push(newSku)
}

// 图片上传处理函数
interface ExtendedUploadRequestOptions extends UploadRequestOptions {
  uploadType?: 'mainImage' | 'detailImage' | 'skuImage'
  index?: number
}

// 图片上传处理函数
const handleHttpUpload = async ({ file, onError, uploadType, index }: ExtendedUploadRequestOptions) => {
  let formData = new FormData()
  formData.append('file', file)
  formData.append('dir', 'goods')
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
    if (uploadType === 'mainImage') {
      handleMainImageUploadSuccess(response)
    } else if (uploadType === 'detailImage') {
      handleDetailImageUploadSuccess(response)
    } else if (uploadType === 'skuImage') {
      handleSkuImageUploadSuccess(response, index!)
    }
    // 不要调用options.onSuccess，因为我们已经自己处理了成功回调
  } catch (error) {
    onError(error as any)
  }
}

// 处理主图片上传成功
function handleMainImageUploadSuccess(response: any) {
  formData.mainImage = response.data.url
}

// 处理详情图片上传成功
function handleDetailImageUploadSuccess(response: any) {
  formData.detailImages.push(response.data.url)
}

// 处理SKU图片上传成功
function handleSkuImageUploadSuccess(response: any, index: number) {
  formData.skus[index!].skuImage = response.data.url
}

// 添加属性值
const addAttributeValue = (index: number) => {
  if (!formData.attributes[index].values) {
    formData.attributes[index].values = []
  }
  formData.attributes[index].values.push(`属性值${formData.attributes[index].values.length + 1}`)
}

// 删除属性
const removeAttribute = (index: number) => {
  formData.attributes.splice(index, 1)
}

// 删除属性值
const removeAttributeValue = (index: number, valueIndex: number) => {
  formData.attributes[index].values.splice(valueIndex, 1)
}

// 添加属性
const addAttribute = () => {
  const index = formData.attributes.length
  formData.attributes.push({
    label: `属性${index + 1}`,
    values: [],
  })
}

// 添加详情描述
const addDescription = () => {
  if (!Array.isArray(formData.detailDescription)) {
    formData.detailDescription = []
  }
  formData.detailDescription.push({
    type: 'DESCRIBE',
    name: `描述${formData.detailDescription.length + 1}`,
    label: '',
  })
}

// 删除详情描述
const removeDescription = (index: number) => {
  formData.detailDescription.splice(index, 1)
}

// 添加详情描述值
const addDescriptionValue = (index: number) => {
  if (!formData.detailDescription[index].value) {
    formData.detailDescription[index].value = [] as { project: string; quantity: string }[]
  }
  formData.detailDescription[index].value?.push({
    project: '',
    quantity: '',
  })
}

// 删除详情描述值
const removeDescriptionValue = (index: number, valueIndex: number) => {
  formData.detailDescription[index].value?.splice(valueIndex, 1)
}

// 重置表单
const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields()
  }
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()

    // 过滤掉无效的SKU对象
    formData.skus = formData.skus.filter((sku) => {
      return sku.skuName && sku.skuCode && sku.price !== undefined && sku.stock !== undefined
    })

    // 验证并清理specAttributes
    for (let i = 0; i < formData.skus.length; i++) {
      const sku = formData.skus[i]
      const cleanedSpecAttributes = {} as Record<string, string>
      let isValid = true

      // 确保specAttributes是对象
      if (!sku.specAttributes || typeof sku.specAttributes !== 'object') {
        sku.specAttributes = {}
      }

      // 检查每个attribute是否都有值
      for (const attr of formData.attributes) {
        const attrValue = sku.specAttributes[attr.label]
        if (!attrValue) {
          isValid = false
          ElMessage.error(`"${sku.skuName}" 的 "${attr.label}" 属性值不能为空`)
          break
        }
        cleanedSpecAttributes[attr.label] = attrValue as string
      }

      if (!isValid) {
        return
      }

      // 更新为清理后的specAttributes
      sku.specAttributes = cleanedSpecAttributes
    }

    // 过滤掉无效的详情描述
    formData.detailDescription.filter((description) => {
      if(description.type === 'DESCRIBE') {
        description.value = undefined
      } else {
        description.label = undefined
      }
    })

    // 生成幂等键
    if (!formData.idempotencyKey) {
      formData.idempotencyKey = Date.now().toString()
    }

    // 提交数据
    await goodsSaveApi(formData, isEdit.value)

    ElMessage.success(isEdit.value ? '商品更新成功' : '商品创建成功')
    // 关闭当前标签页
    mittBus.emit('onCurrentContextmenuClick', { contextMenuClickId: 1, ...route })
    // 跳转到商品列表页
    router.push('/merchantsAlliance/product/goods/index')
  } catch (error) {
    ElMessage.error(isEdit.value ? '商品更新失败' : '商品创建失败')
    console.error('提交表单失败:', error)
  }
}
</script>

<style scoped></style>
