<template>
  <div class="w-full h-full flex flex-col bg-[#f5f7fa] border-solid border">
    <!--    头部-->
    <div :style="{ backgroundColor: bgColor }" class="flex flex-row py-2 px-1">
      <div class="flex-[1] flex flex-row items-center">
        <el-icon>
          <Location />
        </el-icon>
        <div>炬旺科技</div>
      </div>
      <el-input :prefix-icon="Search" class="flex-[3] rounded-full" placeholder="Pick a date" disabled />
      <div class="flex-[1]"></div>
    </div>

    <!--    tap导航-->
    <div
      :class="isWidget === 0 ? 'widget-selected' : 'widget-hoverable'"
      class="overflow-hidden w-full min-h-1/25"
      @click="isWidget = 0"
    >
      <div
        :style="{ backgroundColor: bgColor }"
        class="w-100% h-full flex flex-row overflow-x-auto overscroll-none gap-4"
      >
        <div v-for="(item, index) in props.industryNavList" :key="index" class="">
          {{ item.name }}
        </div>
      </div>
    </div>
    <!--    轮播图-->
    <div
      :class="isWidget === 1 ? 'widget-selected' : 'widget-hoverable'"
      class="w-full aspect-[2/1]"
      @click="isWidget = 1"
    >
      <div :style="{ background: `linear-gradient(to bottom, ${bgColor}, #f7f8fa)` }" class="w-full h-full px-10px">
        <el-carousel height="100%" style="height: 100%" @change="handleCarouselChange" class="rounded-10px">
          <el-carousel-item v-for="(item, index) in props.carouselMapList" :key="index" style="height: 100%">
            <el-image v-if="item.imageUrl" :src="getImageUrl(item.imageUrl)" class="h-full w-full" fit="fill" />
            <el-image
              v-else
              class="h-full w-full"
              fit="fill"
              src="https://cube.elemecdn.com/6/94/4d3ea53c084bad6931a56d5158a48jpeg.jpeg"
            />
          </el-carousel-item>
        </el-carousel>
      </div>
    </div>
    <!--    商品分类-->
    <div
      :class="isWidget === 2 ? 'widget-selected' : 'widget-hoverable'"
      class="flex items-center justify-center min-h-1/10 mt-10px"
      @click="isWidget = 2"

    >
      <div class="grid grid-cols-5 mx-10px w-full h-full items-center justify-center rounded-10px bg-[#fff] p-10px">
        <div
          v-for="(item, index) in props.classifyNavList"
          :key="index"
          class="flex flex-col items-center justify-center gap-5px"
        >
          <el-image :src="getImageUrl(item.imageUrl)" height="15vw" radius="2" width="15%" />
          <div class="overflow-hidden text-ellipsis whitespace-nowrap text-12px">
            {{ item.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import { BannerData, PlatformNaviMenuData } from '/@/api/merchantsAlliance/app/types'
import { PropType } from 'vue'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const props = defineProps({
  widget: {
    type: Number,
    default: 0,
  },
  carouselMapList: {
    type: Array as PropType<BannerData[]>,
    default: () => [] as BannerData[],
  },
  classifyNavList: {
    type: Array as PropType<PlatformNaviMenuData[]>,
    default: () => [] as PlatformNaviMenuData[],
  },
  industryNavList: {
    type: Array as PropType<PlatformNaviMenuData[]>,
    default: () => [] as PlatformNaviMenuData[],
  },
})

const emit = defineEmits(['update:widget'])

const isWidget = ref(0)
const bgColor = ref('rgb(245, 247, 250)')

// 轮播图切换时，更新背景颜色
const handleCarouselChange = (index: number) => {
  bgColor.value = props.carouselMapList[index].bgColor || 'rgb(245, 247, 250)'
}

watch(
  () => isWidget.value,
  (newVal) => {
    emit('update:widget', newVal)
  }
)
</script>

<style scoped lang="scss">
.widget-hoverable {
  @apply border-2 border-dashed border-[#dcdfe6] z-[101];
}

.widget-selected {
  @apply border-2 border-solid border-primary z-[102];
  box-shadow: 0 0 0 2px rgba(var(--color-primary), 0.1);
}

:deep(.el-tabs__header) {
  margin: 0 !important;
}
</style>
