<template>
  <div class="coupon-detail">
    <!-- Tab切换 -->
    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="info">
          <el-row :gutter="12">
            <!-- 左侧主要信息 -->
            <el-col :span="16">
              <div class="flex-col gap4 flex">
                <!-- 优惠券代码卡片 -->
                <el-card class="code-card" shadow="hover">
                  <div class="code-content">
                    <div class="flex items-center gap2">
                      <img
                        :src="couponData.logoUrl ? baseURL + couponData.logoUrl : ''"
                        alt=""
                        class="w20 h20 rd-2 b-1 b-solid b-#ccc"
                      />
                      <div>
                        <h1 class="text-2xl w110 line-clamp-1 overflow-hidden">{{ couponData.name }}</h1>
                        <p class="text-#eee">创建时间: {{ couponData.createTime }}</p>
                      </div>
                    </div>
                    <div class="code-right">
                      <el-tag size="large">
                        {{ couponData.couponStatus?.desc }}
                      </el-tag>
                    </div>
                  </div>
                </el-card>

                <!-- 优惠设置 -->
                <el-card shadow="hover">
                  <template #header>
                    <div class="card-header">
                      <el-icon color="#409EFF"><Money /></el-icon>
                      <span>优惠设置</span>
                    </div>
                  </template>
                  <el-row :gutter="24">
                    <el-col :span="8">
                      <div class="stat-item">
                        <div class="stat-label">折扣类型</div>
                        <div class="stat-value">
                          {{ couponData.type?.value === 'DISCOUNT' ? '折扣率' : '固定金额' }}
                        </div>
                      </div>
                    </el-col>
                    <el-col :span="8">
                      <div class="stat-item">
                        <div class="stat-label">折扣力度</div>
                        <div class="stat-value">
                          {{
                            couponData.type?.value === 'DISCOUNT'
                              ? `${(couponData.discountRate || 0) * 100}%`
                              : `¥${couponData.discountAmount}`
                          }}
                        </div>
                      </div>
                    </el-col>
                    <el-col :span="8">
                      <div class="stat-item">
                        <div class="stat-label">最低消费</div>
                        <div class="stat-value">
                          {{
                            couponData.minSpendAmount !== '无'
                              ? couponData.minSpendAmount
                              : `¥${couponData.discountAmount}`
                          }}
                        </div>
                      </div>
                    </el-col>
                    <!-- <el-col :span="12"> -->
                    <!-- 	<div class="stat-item"> -->
                    <!-- 		<div class="stat-label">最高优惠</div> -->
                    <!-- 		<div class="stat-value">¥{{ couponData.maxDiscount }}</div> -->
                    <!-- 	</div> -->
                    <!-- </el-col> -->
                  </el-row>
                </el-card>

                <!-- 有效期 -->
                <el-card shadow="hover">
                  <template #header>
                    <div class="card-header">
                      <el-icon color="#409EFF"><Calendar /></el-icon>
                      <span>有效期</span>
                    </div>
                  </template>
                  <el-row v-if="couponData.validityType?.value === 'FIXED_DATE_RANGE'" :gutter="24">
                    <el-col :span="12">
                      <el-descriptions :column="1">
                        <el-descriptions-item label="开始时间">{{ couponData.validStartTime }}</el-descriptions-item>
                      </el-descriptions>
                    </el-col>
                    <el-col :span="12">
                      <el-descriptions :column="1">
                        <el-descriptions-item label="结束时间">{{ couponData.validEndTime }}</el-descriptions-item>
                      </el-descriptions>
                    </el-col>
                  </el-row>
                  <el-row v-else :gutter="24">
                    <el-col :span="8">
                      <el-descriptions :column="1">
                        <el-descriptions-item>
                          领取后
                          <strong>{{ couponData.validDaysFromReceive }}</strong>
                          天有效
                        </el-descriptions-item>
                      </el-descriptions>
                    </el-col>
                  </el-row>
                </el-card>

                <!-- 使用限制 -->
                <el-card shadow="hover">
                  <template #header>
                    <div class="card-header">
                      <el-icon color="#409EFF"><User /></el-icon>
                      <span>使用限制</span>
                    </div>
                  </template>
                  <el-row :gutter="24">
                    <el-col :span="8">
                      <div class="stat-item">
                        <div class="stat-label">发放总量</div>
                        <div class="stat-value">{{ couponData.totalQuantity }}</div>
                      </div>
                    </el-col>
                    <el-col :span="8">
                      <div class="stat-item">
                        <div class="stat-label">已使用</div>
                        <div class="stat-value text-#67c23a">{{ couponData.usedCount || 0 }}</div>
                      </div>
                    </el-col>
                    <el-col :span="8">
                      <div class="stat-item">
                        <div class="stat-label">每人限领</div>
                        <div class="stat-value">{{ couponData.receiveLimitPerUser }}张</div>
                      </div>
                    </el-col>
                  </el-row>

                  <el-divider />

                  <div>
                    <div class="text-#909399 mb text-5">使用说明</div>
                    <p class="text-#303133 lh-3">{{ couponData.description }}</p>
                  </div>
                </el-card>
              </div>
            </el-col>

            <!-- 右侧适用范围 -->
            <el-col :span="8">
              <div class="gap4 flex flex-col">
                <div class="text-right">
                  <!-- <el-button v-if="couponData.couponStatus === 'PENDING'" :icon="Edit" size="large" type="primary"> -->
                  <!--   {{ $t('coupon.button.edit') }} -->
                  <!-- </el-button> -->
                  <el-button
                    v-if="couponData.couponStatus?.value === 'PENDING' || couponData.couponStatus?.value === 'UNUSED'"
                    :icon="Delete"
                    size="large"
                    type="danger"
                    @click="handleInvalidate"
                  >
                    {{ $t('coupon.button.invalidate') }}
                  </el-button>
                </div>

                <!-- 适用门店 -->
                <el-card shadow="hover">
                  <template #header>
                    <div class="card-header">
                      <el-icon color="#409EFF"><Shop /></el-icon>
                      <span>适用门店</span>
                    </div>
                  </template>

                  <el-alert
                    v-if="couponData.availableStores?.length === 0"
                    :closable="false"
                    title="全部门店适用"
                    type="info"
                  />
                  <div v-else>
                    <div v-for="store in couponData.availableStores" :key="store.id" class="rd-2 bg-#f5f7fa px4 py2">
                      <div class="list-item-title">{{ store.storeName }}</div>
                      <div class="list-item-desc">{{ store.storeAddress }}</div>
                    </div>
                    <el-divider class="my mb4" />
                    <div class="text-center text-#909399">共 {{ couponData.availableStores?.length || 0 }} 家门店</div>
                  </div>
                </el-card>

                <!-- 适用商品 -->
                <el-card shadow="hover">
                  <template #header>
                    <div class="card-header">
                      <el-icon color="#409EFF"><Goods /></el-icon>
                      <span>适用商品</span>
                    </div>
                  </template>

                  <el-alert
                    v-if="couponData.availableSkus?.length === 0"
                    :closable="false"
                    title="全部商品适用"
                    type="info"
                  />
                  <div v-else>
                    <div
                      v-for="product in couponData.availableSkus"
                      :key="product.id"
                      class="rd-2 bg-#f5f7fa px4 py2 my2"
                    >
                      <div class="list-item-title">{{ product.skuName }}</div>
                      <div class="list-item-desc">
                        <span v-show="product.categoryName">{{ product.categoryName }} ·</span>
                        <el-tag size="small" type="primary">
                          {{
                            product.price.toLocaleString('zh-CN', {
                              style: 'currency',
                              currency: 'CNY',
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          }}
                        </el-tag>
                      </div>
                    </div>
                    <el-divider class="my mb4" />
                    <div class="text-center text-#909399">共 {{ couponData.availableSkus?.length || 0 }} 款商品</div>
                  </div>
                </el-card>

                <!-- 发券商家 -->
                <el-card shadow="hover">
                  <template #header>
                    <div class="card-header">
                      <el-icon color="#409EFF"><House /></el-icon>
                      <span>发券商家</span>
                    </div>
                  </template>

                  <div
                    v-for="(merchant, idx) in couponData.applicableMerchants"
                    :key="idx"
                    class="rd-2 bg-#f5f7fa px4 py2 mb"
                  >
                    <div class="list-item-title">{{ merchant }}</div>
                  </div>
                  <el-divider class="my mb4" />
                  <div class="text-center text-#909399">
                    共
                    {{ couponData.applicableMerchants ? Object.keys(couponData.applicableMerchants).length : 0 }} 户商家
                  </div>
                </el-card>
              </div>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="使用统计" name="stats">
          <!-- 统计卡片 -->
          <el-row :gutter="24" style="margin-bottom: 24px">
            <el-col v-for="stat in usageStats" :key="stat.label" :span="6">
              <el-card shadow="hover">
                <div class="stat-item">
                  <div class="stat-label">{{ stat.label }}</div>
                  <div :style="{ color: stat.color, fontSize: '32px' }" class="stat-value">
                    {{ stat.value }}
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <!-- 使用趋势图占位 -->
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">
                <el-icon color="#409EFF"><TrendCharts /></el-icon>
                <span>使用趋势</span>
              </div>
            </template>
            <el-empty :image-size="200" description="图表展示区域" />
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="使用记录" name="usage">
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">
                <span>最近使用记录</span>
              </div>
            </template>
            <el-table :data="recentUsage" style="width: 100%" stripe>
              <el-table-column label="用户" prop="user" width="150" />
              <el-table-column label="订单号" prop="orderNo" width="180">
                <template #default="{ row }">
                  <span style="font-family: monospace">{{ row.orderNo }}</span>
                </template>
              </el-table-column>
              <el-table-column label="订单金额" prop="amount" width="120">
                <template #default="{ row }">¥{{ row.amount }}</template>
              </el-table-column>
              <el-table-column label="优惠金额" prop="discount" width="120">
                <template #default="{ row }">
                  <span style="color: #67c23a; font-weight: 500">-¥{{ row.discount }}</span>
                </template>
              </el-table-column>
              <el-table-column label="使用时间" prop="time" />
            </el-table>

            <div style="margin-top: 16px; text-align: right">
              <pagination :current-page="1" :page-size="5" :total="245" layout="total, prev, pager, next" background />
            </div>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { getDetailApi, invalidateApi } from '/@/api/merchantsAlliance/coupon/coupon'
import { Session } from '/@/utils/storage'
import { Calendar, Delete, Goods, House, Money, Shop, TrendCharts, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import { ICoupon } from '/@/api/merchantsAlliance/coupon/types'

const route = useRoute()

const baseURL = import.meta.env.VITE_API_URL

const activeTab = ref('info')

// 模拟优惠券数据
const couponData = reactive<ICoupon>({} as ICoupon)

// 使用统计数据
const usageStats = ref([
  { label: '领取次数', value: 387, color: '#409EFF' },
  { label: '使用次数', value: 245, color: '#67C23A' },
  { label: '剩余数量', value: 613, color: '#E6A23C' },
  { label: '使用率', value: '63.3%', color: '#9C27B0' },
])

// 最近使用记录
const recentUsage = ref([])

const handleInvalidate = async () => {
  const resp = await invalidateApi({
    merchantId: Session.getTenant(),
    couponTemplateId: couponData.couponTemplateId,
  })
  if (resp.code === 0) {
    ElMessage.success('优惠券已作废')
  } else {
    ElMessage.error(resp.msg || '优惠券作废失败，请稍后再试')
  }
}

const loadData = async (id: string) => {
  const resp = await getDetailApi({ couponTemplateId: id, merchantId: Session.getTenant() })
  if (resp.code === 0) {
    Object.assign(couponData, resp.data)
  }
}

onMounted(async () => await loadData(route.query.id as string))
</script>

<style scoped>
.coupon-detail {
  padding: 12px;
  background: #f0f2f5;
  min-height: 100vh;
}

.code-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.code-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.stat-item {
  padding: 12px 0;
}

.stat-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-value {
  color: #303133;
  font-size: 20px;
  font-weight: 600;
}

.list-item-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.list-item-desc {
  font-size: 12px;
  color: #909399;
}
</style>
