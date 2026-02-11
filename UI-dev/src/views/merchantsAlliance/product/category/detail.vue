<template>
  <el-dialog v-model="show">
    <div class="bg-#f9fafb p4">
      <div class="mx-auto">
        <el-card shadow="never">
          <!-- 头部 -->
          <div class="flex items-center justify-between mb pb border-b border-gray-200">
            <div class="flex items-center gap3">
              <el-button circle @click="handleBack">
                <el-icon><ArrowLeft /></el-icon>
              </el-button>
              <div>
                <h1 class="text-2xl font-bold text-#111827">分类详情</h1>
                <p class="text-#6b7280 text-sm mt1">查看分类完整信息</p>
              </div>
            </div>
            <el-button type="primary" @click="handleEdit">
              <el-icon class="mr2"><Edit /></el-icon>
              编辑
            </el-button>
          </div>

          <!-- 基本信息 -->
          <div class="mb8">
            <h2 class="text-lg font-semibold text-#111827 mb flex items-center gap2">
              <el-icon color="#3b82f6"><Collection /></el-icon>
              基本信息
            </h2>
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="bg-#f9fafb p4 rd-lg mb">
                  <p class="text-sm text-#6b7280 mb1">分类名称</p>
                  <p class="text-base font-medium text-#111827">{{ categoryDetail.name }}</p>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="bg-#f9fafb p4 rd-lg mb">
                  <p class="text-sm text-#6b7280 mb1">分类编码</p>
                  <p class="text-base font-medium text-#111827">{{ categoryDetail.code }}</p>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="bg-#f9fafb p4 rd-lg mb">
                  <p class="text-sm text-#6b7280 mb1">上级分类</p>
                  <p class="text-base font-medium text-#111827">{{ categoryDetail.parent }}</p>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="bg-#f9fafb p4 rd-lg mb">
                  <p class="text-sm text-#6b7280 mb1">排序</p>
                  <p class="text-base font-medium text-#111827">{{ categoryDetail.sort }}</p>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="bg-#f9fafb p4 rd-lg mb">
                  <p class="text-sm text-#6b7280 mb1">状态</p>
                  <el-tag :type="categoryDetail.status === 'active' ? 'success' : 'info'">
                    {{ categoryDetail.status === 'active' ? '启用' : '停用' }}
                  </el-tag>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="bg-#f9fafb p4 rd-lg mb">
                  <p class="text-sm text-#6b7280 mb1">创建时间</p>
                  <p class="text-base font-medium text-#111827">{{ categoryDetail.createTime }}</p>
                </div>
              </el-col>
            </el-row>
          </div>

          <!-- 统计信息 -->
          <div class="mb8">
            <h2 class="text-lg font-semibold text-#111827 mb flex items-center gap2">
              <el-icon color="#3b82f6"><DataAnalysis /></el-icon>
              统计信息
            </h2>
            <el-row :gutter="20">
              <el-col :span="8">
                <el-card class="text-center" shadow="hover">
                  <p class="text-3xl font-bold text-#2563eb">{{ categoryDetail.products }}</p>
                  <p class="text-sm text-#6b7280 mt2">关联商品数</p>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card class="text-center" shadow="hover">
                  <p class="text-3xl font-bold text-#16a34a">12</p>
                  <p class="text-sm text-#6b7280 mt2">子分类数</p>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card class="text-center" shadow="hover">
                  <p class="text-3xl font-bold text-#9333ea">98.5%</p>
                  <p class="text-sm text-#6b7280 mt2">商品上架率</p>
                </el-card>
              </el-col>
            </el-row>
          </div>

          <!-- 描述信息 -->
          <div>
            <h2 class="text-lg font-semibold text-#111827 mb">分类描述</h2>
            <div class="bg-#f9fafb p4 rd-lg">
              <p class="text-#374151">{{ categoryDetail.description }}</p>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ICategory } from '/@/api/merchantsAlliance/product/category/types'
import { ref } from 'vue'
import { ArrowLeft, Edit, Collection, DataAnalysis } from '@element-plus/icons-vue'

const show = ref(false)
const categoryDetail = ref<ICategory>({
  id: 1,
  name: '电子产品',
  code: 'ELEC001',
  parent: '-',
  products: 156,
  sort: 1,
  status: 'active',
  createTime: '2024-01-15',
  description: '包含所有电子产品类别，如手机、电脑、平板、智能穿戴设备等数码电子产品。',
})

const handleBack = () => {
  console.log('返回列表')
}

const handleEdit = () => {
  console.log('编辑分类')
}

const openDialog = (category: ICategory) => {
  categoryDetail.value = category
  show.value = true
}

defineExpose({ openDialog })
</script>
