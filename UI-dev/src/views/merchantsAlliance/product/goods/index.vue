<template>
  <div class="bg-#f9fafb p4">
    <div class="mx-auto">
      <!-- 头部 -->
      <el-card class="mb6" shadow="never">
        <div class="flex justify-between items-center mb6">
          <div>
            <h1 class="text-2xl font-bold text-#111827">商品管理</h1>
            <p class="text-#6b7280 mt1">管理所有商品信息和库存</p>
          </div>
        </div>

        <!-- 搜索和筛选 -->
        <div class="flex justify-between mt">
          <div class="flex gap4">
            <el-tree-select
              v-model="state.params.categoryId"
              :data="state.categoryTreeOpts"
              :props="{ value: 'id', label: 'name', children: 'children' }"
              class="w60"
              placeholder="商品分类"
              clearable
            />
            <el-select v-model="state.params.status" class="w60" placeholder="商品状态" clearable>
              <el-option label="已上架" value="PUBLISHED" />
              <el-option label="草稿" value="DRAFT" />
              <el-option label="已归档" value="ARCHIVED" />
            </el-select>
            <el-select v-model="state.params.type" class="w60" placeholder="商品类型" clearable>
              <el-option label="实物商品" value="PHYSICAL" />
              <el-option label="服务商品" value="SERVICE" />
            </el-select>
            <el-input v-model="state.params.name" class="w70" placeholder="搜索商品名称、编码或品牌...">
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary">筛选</el-button>
          </div>

          <el-button icon="Plus" type="primary" @click="handleAdd">新增商品</el-button>
        </div>
      </el-card>

      <!-- 统计卡片 -->
      <!--<div class="grid grid-cols-5 gap4 mb6">-->
      <!--  <el-card class="stat-card" shadow="hover">-->
      <!--    <div class="flex items-center justify-between">-->
      <!--      <div>-->
      <!--        <p class="text-#6b7280 text-sm">总商品数</p>-->
      <!--        <p class="text-2xl font-bold text-#111827 mt1">2,456</p>-->
      <!--      </div>-->
      <!--      <div class="bg-#dbeafe p3 rd-lg">-->
      <!--        <el-icon :size="24" color="#3b82f6"><Box /></el-icon>-->
      <!--      </div>-->
      <!--    </div>-->
      <!--  </el-card>-->
      <!--  <el-card class="stat-card" shadow="hover">-->
      <!--    <div class="flex items-center justify-between">-->
      <!--      <div>-->
      <!--        <p class="text-#6b7280 text-sm">在售商品</p>-->
      <!--        <p class="text-2xl font-bold text-#16a34a mt1">1,892</p>-->
      <!--      </div>-->
      <!--      <div class="bg-#dcfce7 p3 rd-lg">-->
      <!--        <el-icon :size="24" color="#16a34a"><Check /></el-icon>-->
      <!--      </div>-->
      <!--    </div>-->
      <!--  </el-card>-->
      <!--  <el-card class="stat-card" shadow="hover">-->
      <!--    <div class="flex items-center justify-between">-->
      <!--      <div>-->
      <!--        <p class="text-#6b7280 text-sm">已下架</p>-->
      <!--        <p class="text-2xl font-bold text-#ea580c mt1">423</p>-->
      <!--      </div>-->
      <!--      <div class="bg-#ffedd5 p3 rd-lg">-->
      <!--        <el-icon :size="24" color="#ea580c"><Warning /></el-icon>-->
      <!--      </div>-->
      <!--    </div>-->
      <!--  </el-card>-->
      <!--  <el-card class="stat-card" shadow="hover">-->
      <!--    <div class="flex items-center justify-between">-->
      <!--      <div>-->
      <!--        <p class="text-#6b7280 text-sm">库存预警</p>-->
      <!--        <p class="text-2xl font-bold text-#dc2626 mt1">86</p>-->
      <!--      </div>-->
      <!--      <div class="bg-#fee2e2 p3 rd-lg">-->
      <!--        <el-icon :size="24" color="#dc2626"><BellFilled /></el-icon>-->
      <!--      </div>-->
      <!--    </div>-->
      <!--  </el-card>-->
      <!--  <el-card class="stat-card" shadow="hover">-->
      <!--    <div class="flex items-center justify-between">-->
      <!--      <div>-->
      <!--        <p class="text-#6b7280 text-sm">库存总值</p>-->
      <!--        <p class="text-2xl font-bold text-#9333ea mt1">¥8.9M</p>-->
      <!--      </div>-->
      <!--      <div class="bg-#f3e8ff p3 rd-lg">-->
      <!--        <el-icon :size="24" color="#9333ea"><Money /></el-icon>-->
      <!--      </div>-->
      <!--    </div>-->
      <!--  </el-card>-->
      <!--</div>-->

      <!-- 商品表格 -->
      <el-card shadow="never">
        <el-table :data="state.data" stripe>
          <el-table-column type="selection" width="55" />
          <el-table-column label="商品信息" min-width="300">
            <template #default="{ row }">
              <div class="flex items-center gap3">
                <el-image :src="getImageUrl(row.mainImage)" class="w16 h16 rd-lg" fit="cover" />
                <div class="flex-1">
                  <p class="font-medium text-#111827 mb1">{{ row.name }}</p>
                  <!--<p class="text-xs text-#6b7280">编码: {{ row.code }}</p>-->
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="分类" prop="categoryName" width="120" />
          <el-table-column align="center" label="品牌" prop="brand" width="120" />
          <el-table-column align="center" label="价格" width="120">
            <template #default="{ row }">
              <div v-if="row.skus.length > 0">
                <p class="text-#dc2626 font-medium">¥{{ row.skus[0].price }}</p>
                <p class="text-xs text-#9ca3af line-through">¥{{ row.skus[0].originalPrice }}</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="库存" prop="stock" width="100">
            <template #default="{ row }">
              <span :class="row.stock < 100 ? 'text-#dc2626 font-medium' : 'text-#111827'">
                {{ row.skus.reduce((acc: number, cur: any) => acc + cur.stock, 0) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column align="center" label="销量" prop="sales" width="100" />
          <el-table-column align="center" label="状态" width="100">
            <template #default="{ row }">
              <dict-tag :options="productStatus" :value="row.status" />
            </template>
          </el-table-column>
          <el-table-column align="center" label="创建时间" prop="createdTime" width="180" />
          <el-table-column align="center" fixed="right" label="操作" width="180">
            <template #default="{ row }">
              <el-button type="primary" link @click="handleView(row.id, row.name)">
                <el-icon><View /></el-icon>
              </el-button>
              <el-button type="success" link @click="handleEdit(row.id, row.name)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button type="danger" link @click="handleDelete(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <el-pagination
          v-model:current-page="state.params.page"
          v-model:page-size="state.params.pageSize"
          :background="true"
          :page-sizes="[10, 20, 30, 50, 100]"
          :total="state.params.total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadData"
          @size-change="loadData"
        />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts" name="merchant-product-goods-index">
import { Delete, Edit, Search, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Product } from '/@/api/merchantsAlliance/product/goods/types'
import { categoryTreeApi } from '/@/api/merchantsAlliance/product/category/api'
import { ICategory } from '/@/api/merchantsAlliance/product/category/types'
import { goodsListApi, goodsRemoveApi } from '/@/api/merchantsAlliance/product/goods/api'
import { useDict } from '/@/hooks/dict'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const router = useRouter()

const { product_status: productStatus } = useDict('product_status')

const baseUrl = import.meta.env.VITE_ADMIN_PROXY_PATH

const state = reactive({
  params: {
    name: '',
    categoryId: '',
    status: '',
    type: '',
    page: 1,
    pageSize: 10,
    total: 0,
  },
  data: [] as Product[],
  categoryTreeOpts: [] as ICategory[],
})

// 新增商品
const handleAdd = () => {
  router.push({ path: '/merchantsAlliance/product/goods/product-form', query: { tagsViewName: '添加商品' } })
}

// 编辑商品
const handleEdit = (id: string, productName: string) => {
  router.push({
    path: `/merchantsAlliance/product/goods/product-form`,
    query: { id, tagsViewName: `编辑商品：${productName}` },
  })
}

const handleView = (id: string, productName: string) => {
  router.push({
    path: `/merchantsAlliance/product/goods/product-detail`,
    query: { id, tagsViewName: `查看商品：${productName}` },
  })
}

const loadData = async () => {
  const resp = await goodsListApi(state.params)
  if (resp.code === 0) {
    state.data = resp.data.records
    state.params.total = resp.data.total
  }
}

const loadCategoryTreeOpts = async () => {
  const resp = await categoryTreeApi()
  if (resp.code === 0) {
    state.categoryTreeOpts = resp.data
  }
}

const handleDelete = (row: Product) => {
  ElMessageBox.confirm(`确定要删除商品"${row.name}"吗？`, '删除确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      const resp = await goodsRemoveApi(row.id)
      if (resp.code === 0) {
        ElMessage.success('删除成功')
        await loadData()
      }
    })
    .catch(() => {
      ElMessage.info('已取消删除')
    })
}

onMounted(() => {
  loadCategoryTreeOpts()
  loadData()
})
</script>

<style scoped>
.stat-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
}
</style>
