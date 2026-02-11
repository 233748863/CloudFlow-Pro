<template>
  <div class="min-h-screen bg-#f9fafb">
    <div class="mx-auto p4">
      <!-- 主要内容区 -->
      <el-row :gutter="12">
        <!-- 左侧 - 商品图片和基本信息 -->
        <el-col :span="16">
          <!-- 商品图片展示 -->
          <el-card class="mb" shadow="hover">
            <div class="flex gap4">
              <div class="flex-1">
                <div class="aspect-square rd-lg overflow-hidden bg-#f3f4f6 mb">
                  <el-image
                    :initial-index="selectedImage"
                    :preview-src-list="images.map((img:string) => getImageUrl(img))"
                    :src="getImageUrl(images[selectedImage])"
                    class="w100 h100"
                    fit="cover"
                  />
                </div>
                <div class="flex gap3">
                  <div
                    v-for="(img, idx) in images"
                    :key="idx"
                    :class="selectedImage === idx ? 'b-#3b82f6' : 'b-#ccc'"
                    class="w20 h20 rd-lg overflow-hidden cursor-pointer b-1 b-solid"
                    @click="selectedImage = idx"
                  >
                    <el-image :src="getImageUrl(img)" class="w100 h100" fit="cover" />
                  </div>
                </div>
              </div>

              <div class="flex-1">
                <div class="flex items-start justify-between mb3">
                  <h2 class="text-2xl font-bold text-#111827">{{ product.name }}</h2>
                  <el-tag>
                    {{ StatusMapper[product.status] }}
                  </el-tag>
                </div>
                <!-- 商品评价 -->
                <div class="flex items-center gap3 mb">
                  <el-rate v-model="product.rating" disabled show-score />
                  <span class="text-#6b7280">|</span>
                  <span class="text-#4b5563">{{ product.reviewCount }} 条评价</span>
                </div>
                <!-- 商品标签 -->
                <div class="space-y-3 mb">
                  <div class="flex gap2">
                    <el-tag v-for="(tag, idx) in product.tags" :key="idx" effect="plain" type="primary">
                      {{ tag }}
                    </el-tag>
                  </div>

                  <el-divider />
                  <!-- 商品分类 -->
                  <div>
                    <p class="text-sm text-#6b7280 mb1">商品分类</p>
                    <p class="text-#111827">{{ product.categoryName }}</p>
                  </div>
                  <!-- 商品类型 -->
                  <div>
                    <p class="text-sm text-#6b7280 mb1">商品类型</p>
                    <p class="text-#111827">{{ TypeMapper[product.type] }}</p>
                  </div>
                  <!-- 商品属性 -->
                  <div>
                    <p class="text-sm text-#6b7280 mb1">商品属性</p>
                    <div class="text-#222 text-3.8">
                      <div v-for="(attr, key) in product.attributes" :key="key">
                        {{ attr.label }}：{{ attr.values.join('、') }}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-#6b7280 mb1">商品描述</p>
                    <p class="text-#111827">{{ product.description }}</p>
                  </div>
                </div>

                <view v-if="product.detailDescription" class="flex flex-col gap-2px">
                  <p class="text-sm text-#6b7280">商品详情</p>
                  <view
                    v-for="(description, index) in product.detailDescription"
                    :key="index"
                    class="flex flex-col gap-1px text-14px"
                  >
                    <view class="font-bold">
                      {{ description.name }}
                    </view>
                    <view v-if="description.type === 'DESCRIBE'">
                      {{ description.label }}
                    </view>
                    <view v-else>
                      <view
                        v-for="(attr, attrIndex) in description.value"
                        :key="attrIndex"
                        class="flex flex-row justify-between pl-10px"
                      >
                        <view>
                          {{ attr.project }}
                        </view>
                        <view>
                          {{ attr.quantity }}
                        </view>
                      </view>
                    </view>
                  </view>
                </view>
              </div>
            </div>
          </el-card>

          <!-- SKU信息表格 -->
          <el-card class="mb" shadow="hover">
            <template #header>
              <div class="flex items-center gap2">
                <el-icon>
                  <Box />
                </el-icon>
                <span class="font-semibold">SKU 规格信息</span>
              </div>
            </template>

            <el-table :data="product.skus" border stripe>
              <el-table-column label="SKU图片" prop="skuImage" width="100">
                <template #default="{ row }">
                  <el-image
                    :preview-src-list="[getImageUrl(row.skuImage)]"
                    :preview-teleported="true"
                    :src="getImageUrl(row.skuImage)"
                    class="w20 h20"
                    fit="cover"
                  />
                </template>
              </el-table-column>
              <el-table-column label="SKU名称" prop="skuName" width="120" />
              <el-table-column label="SKU编码" prop="skuCode" width="140" />
              <el-table-column label="销售价格" width="110">
                <template #default="{ row }">
                  <span class="font-semibold text-#111827">
                    {{
                      row.price !== undefined && row.price !== null
                        ? row.price.toLocaleString('zh-CN', {
                            style: 'currency',
                            currency: 'CNY',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '-'
                    }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="原价" width="100">
                <template #default="{ row }">
                  <span class="text-#4b5563">
                    {{
                      row.originalPrice !== undefined && row.originalPrice !== null
                        ? row.originalPrice.toLocaleString('zh-CN', {
                            style: 'currency',
                            currency: 'CNY',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '-'
                    }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="库存" width="120">
                <template #default="{ row }">
                  <el-tag :type="row.stock > 500 ? 'success' : row.stock > 100 ? 'warning' : 'danger'" size="small">
                    {{ row.stock }} 件
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="规格属性" prop="specAttributes">
                <template #default="{ row }">
                  <div v-for="(attr, key) in Object.keys(row.specAttributes)" :key="key">
                    {{ attr }}：{{ row.specAttributes[attr] }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                    {{ row.enabled ? '启用' : '禁用' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- 商品详情图片 -->
          <el-card shadow="hover">
            <template #header>
              <span class="font-semibold">详情图片</span>
            </template>
            <div class="space-y-4">
              <el-image
                v-for="(item, idx) in product.detailImages"
                :key="idx"
                :src="getImageUrl(item)"
                class="w100 rd-lg"
              />
            </div>
          </el-card>
        </el-col>

        <!-- 右侧 - 附加信息 -->
        <el-col :span="8">
          <el-card class="text-center mb" shadow="hover">
            <el-button v-if="product.status === 'PUBLISHED'" type="info" @click="toggleProductStatus('DRAFT')">
              下架商品
            </el-button>
            <el-button v-if="product.status === 'DRAFT'" type="success" @click="toggleProductStatus('PUBLISHED')">
              上架商品
            </el-button>
            <el-button type="primary" @click="handleEdit">编辑商品</el-button>
            <el-button type="warning" @click="toggleProductStatus('ARCHIVED')">商品归档</el-button>
            <el-button type="danger" @click="handleDelete">删除商品</el-button>
          </el-card>

          <!-- 数据统计卡片 -->
          <el-card class="mb" shadow="hover">
            <el-row :gutter="16">
              <el-col :span="12" class="mb">
                <el-card class="b-l-4 b-l-solid b-l-#ef4444">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-#6b7280 text-sm mb1">用户收藏</p>
                      <p class="text-2xl font-bold text-#111827">{{ product.stats?.favorites.toLocaleString() }}</p>
                    </div>
                    <div class="bg-#fee2e2 p2 rd-10 flex justify-center items-center">
                      <el-icon :size="24" color="#ef4444">
                        <Star />
                      </el-icon>
                    </div>
                  </div>
                  <p class="text-xs text-#9ca3af mt2">较上周 +12.5%</p>
                </el-card>
              </el-col>

              <el-col :span="12">
                <el-card class="b-l-4 b-l-solid b-l-#3b82f6">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-#6b7280 text-sm mb1">浏览数量</p>
                      <p class="text-2xl font-bold text-#111827">{{ product.stats?.views.toLocaleString() }}</p>
                    </div>
                    <div class="bg-#dbeafe p2 rd-10 flex justify-center">
                      <el-icon :size="24" color="#3b82f6">
                        <View />
                      </el-icon>
                    </div>
                  </div>
                  <p class="text-xs text-#9ca3af mt2">较上周 +8.3%</p>
                </el-card>
              </el-col>

              <el-col :span="12">
                <el-card class="b-l-4 b-l-solid border-l-#22c55e">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-#6b7280 text-sm mb1">销售数量</p>
                      <p class="text-2xl font-bold text-#111827">{{ product.stats?.sales.toLocaleString() }}</p>
                    </div>
                    <div class="bg-#dcfce7 p2 rd-10 flex justify-center">
                      <el-icon :size="24" color="#10b981">
                        <ShoppingCart />
                      </el-icon>
                    </div>
                  </div>
                  <p class="text-xs text-#9ca3af mt2">较上周 +15.7%</p>
                </el-card>
              </el-col>
              <el-col :span="12">
                <el-card class="b-l-4 b-l-solid b-l-#a855f7">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-#6b7280 text-sm mb1">成交均价</p>
                      <p class="text-2xl font-bold text-#111827">{{ product.stats?.avgPrice }}</p>
                    </div>
                    <div class="bg-#f3e8ff p2 rd-10 flex justify-center">
                      <el-icon :size="24" color="#a855f7">
                        <TrendCharts />
                      </el-icon>
                    </div>
                  </div>
                  <p class="text-xs text-#9ca3af mt2">较上周 +2.1%</p>
                </el-card>
              </el-col>
            </el-row>
          </el-card>

          <!-- 销售趋势 -->
          <el-card class="mb" shadow="hover">
            <template #header>
              <span class="font-semibold">近7日销售趋势</span>
            </template>
            <div class="space-y-3">
              <div v-for="(item, idx) in salesTrend" :key="idx">
                <div class="flex justify-between text-sm mb1">
                  <span class="text-#4b5563">{{ item.day }}</span>
                  <span class="text-#111827 font-medium">{{ item.sales }} 单</span>
                </div>
                <el-progress :percentage="item.percentage" :show-text="false" />
              </div>
            </div>
          </el-card>

          <!-- 库存预警 -->
          <el-card class="mb" shadow="hover">
            <template #header>
              <span class="font-semibold">库存预警</span>
            </template>
            <div v-for="item in product.skus" :key="item.id" class="mb w100 rd-2 bg-#f9f9f9 shadow-sm">
              <div class="flex items-center justify-between p3 rd-2">
                <div>
                  <p class="text-lg font-semibold">{{ item.skuName }}</p>
                  <p class="text-xs">预警库存: {{ item.warningStock }}</p>
                </div>
                <div class="font-semibold">{{ item.stock }} 件</div>
              </div>
            </div>
          </el-card>

          <!-- 商品评分 -->
          <el-card shadow="hover">
            <template #header>
              <span class="font-semibold">用户评分</span>
            </template>
            <div class="text-center mb">
              <div class="text-4xl font-bold text-#111827 mb2">{{ product.rating }}</div>
              <el-rate v-model="product.rating" class="mb2" disabled />
              <p class="text-sm text-#6b7280">{{ product.reviewCount }} 条评价</p>
            </div>
            <el-divider />
            <div class="space-y-2">
              <div v-for="rating in [5, 4, 3, 2, 1]" :key="rating" class="flex items-center gap2">
                <span class="text-sm text-#4b5563 w12">{{ rating }}星</span>
                <el-progress
                  :percentage="getRatingPercentage(rating)"
                  :show-text="false"
                  class="w100"
                  color="#facc15"
                />
                <span class="text-sm text-#4b5563 w10 text-right">{{ getRatingPercentage(rating) }}%</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Box, ShoppingCart, Star, TrendCharts, View } from '@element-plus/icons-vue'
import { goodsDetailApi, goodsRemoveApi, goodsStatusApi } from '/@/api/merchantsAlliance/product/goods/api'
import {
  ISkus,
  Product,
  ProductAttributes,
  SalesTrendItem,
  StatusMapper,
  TypeMapper,
} from '/@/api/merchantsAlliance/product/goods/types'
import mittBus from '/@/utils/mitt'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const route = useRoute()
const router = useRouter()

// 响应式数据
const selectedImage = ref<number>(0)

// 创建一个扩展的 Product 类型，覆盖 attributes 字段的类型
type ExtendedProduct = Omit<Product, 'attributes'> & {
  attributes: ProductAttributes
}

const images = ref<(string | null)[]>([])

// 商品详情数据
const product = reactive<ExtendedProduct>({
  createdTime: '',
  detailDescription: [],
  idempotencyKey: '',
  skus: [],
  sortWeight: 0,
  id: '',
  name: '',
  categoryName: '',
  categoryId: '', // 添加必需的 categoryId 属性
  brandId: '', // 添加必需的 brandId 属性
  type: 'PHYSICAL',
  status: 'DRAFT',
  tags: [],
  attributes: {}, // 现在可以正确地初始化为空对象
  // 商品描述
  description: '',
  mainImage: '',
  detailImages: [],
  stats: { favorites: 1847, views: 28563, sales: 3256, avgPrice: '¥599' },
  rating: 4.8,
  reviewCount: 892,
})

const salesTrend = ref<SalesTrendItem[]>([
  { day: '周一', sales: 458, percentage: 85 },
  { day: '周二', sales: 392, percentage: 72 },
  { day: '周三', sales: 521, percentage: 95 },
  { day: '周四', sales: 445, percentage: 82 },
  { day: '周五', sales: 498, percentage: 90 },
  { day: '周六', sales: 356, percentage: 65 },
  { day: '周日', sales: 412, percentage: 76 },
])

const handleEdit = () => {
  router.push({
    path: '/merchantsAlliance/product/goods/product-form',
    query: { id: product.id, tagsViewName: `编辑商品：${product.name}` },
  })
}

const getRatingPercentage = (rating: number): number => {
  const percentages: Record<number, number> = { 5: 70, 4: 20, 3: 5, 2: 3, 1: 2 }
  return percentages[rating] || 0
}

const loadData = async (id: string) => {
  const { data } = await goodsDetailApi(id)
  Object.assign(product, data)
  images.value.unshift(data.mainImage)
  data.skus.forEach((item: ISkus) => {
    if (item.skuImage) images.value.push(item.skuImage)
  })
  console.log(data)
}

// 切换商品状态
const toggleProductStatus = async (status: Product['status']) => {
  const resp = await goodsStatusApi(product.id, status)
  if (resp.code === 0) {
    await loadData(product.id)
    product.status = status
    ElMessage.success('操作成功')
  } else {
    ElMessage.error(resp.msg || '操作失败，请稍后再试')
  }
}

// 删除商品
const handleDelete = async () => {
  const resp = await goodsRemoveApi(product.id)
  if (resp.code === 0) {
    ElMessage.success('删除成功')
    mittBus.emit('onCurrentContextmenuClick', { contextMenuClickId: 1, ...route })
  }
}

onMounted(async () => await loadData(route.query.id as string))
</script>
