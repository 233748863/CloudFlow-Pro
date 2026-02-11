<template>
  <div class="flex flex-row gap-4 p-4 h-[calc(100vh-85px)]">
    <div class="flex-[1] ">11</div>
    <div class="flex-[2]  flex flex-col items-center">
      <div class="w-full aspect-[9/16]">
        <page-index
          v-model:widget="state.widget"
          :carousel-map-list="state.carouselMapList"
          :classify-nav-list="state.classifyNavList"
          :industry-nav-list="state.industryNavList"
        />
      </div>
      <el-button :icon="Refresh" type="success" @click="reset">刷新</el-button>
    </div>
    <div class="flex-[5] overflow-auto">
      <tap-nav-form v-if="state.widget === 0" @update-data="getIndustryNavData" />
      <carousel-map-form v-if="state.widget === 1" @update-data="getCarouselMapData" />
      <classify-nav-form v-if="state.widget === 2" @update-data="getClassifyNavData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import pageIndex from './pages/index.vue'
import CarouselMapForm from '/@/views/merchantsAlliance/appDataMT/form/carouselMapForm.vue'
import ClassifyNavForm from '/@/views/merchantsAlliance/appDataMT/form/classifyNavForm.vue'
import TapNavForm from '/@/views/merchantsAlliance/appDataMT/form/tapNavForm.vue'
import { getMiniBannerIndex, getPlatformNaviMenuTree } from '/@/api/merchantsAlliance/app'
import { BannerData, PlatformNaviMenuTreeResponse } from '/@/api/merchantsAlliance/app/types'
import { Refresh } from '@element-plus/icons-vue'

const state = reactive({
  // 0: tap导航 1: 轮播图 2: 商品分类
  widget: 0,
  // 轮播图
  carouselMapList: [] as BannerData[],
  // tap导航
  industryNavList: [] as PlatformNaviMenuTreeResponse[],
  // 商品分类
  classifyNavList: [] as PlatformNaviMenuTreeResponse[],
})

// 获取轮播图数据
const getCarouselMapData = async () => {
  try {
    const resp = await getMiniBannerIndex()
    if (resp.code === 0) {
      state.carouselMapList = resp.data
    }
  } catch (error) {
    console.error(error)
  }
}

// 获取商品分类导航列表
const getClassifyNavData = async () => {
  try {
    const resp = await getPlatformNaviMenuTree({
      type: 'MID',
      merchantId: '0',
    })
    if (resp.code === 0) {
      state.classifyNavList = resp.data
    }
  } catch (error) {
    console.error(error)
  }
}

// 获取行业导航列表
const getIndustryNavData = async () => {
  try {
    const resp = await getPlatformNaviMenuTree({
      type: 'TOP',
      merchantId: '0',
    })
    if (resp.code === 0) {
      state.industryNavList = resp.data
    }
  } catch (error) {
    console.error(error)
  }
}

// 刷新数据
function reset() {
  getClassifyNavData()
  getCarouselMapData()
  getIndustryNavData()
}

onMounted(() => {
  getClassifyNavData()
  getCarouselMapData()
  getIndustryNavData()
})
</script>

<style scoped lang="scss"></style>
