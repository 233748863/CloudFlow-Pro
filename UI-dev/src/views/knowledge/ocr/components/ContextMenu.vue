<template>
  <transition name="el-zoom-in-center">
    <div
      v-show="isShow"
      class="el-dropdown__popper el-popper is-light is-pure custom-contextmenu"
      :style="`top: ${y}px; left: ${x}px;`"
    >
      <ul class="el-dropdown-menu">
        <li
          v-for="item in menuItems"
          :key="item.text"
          class="el-dropdown-menu__item"
          @click="handleItemClick(item)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.text }}</span>
        </li>
      </ul>
      <div class="el-popper__arrow" :style="{ left: '10px' }"></div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  x: Number,
  y: Number,
  menuItems: Array,
});

const emit = defineEmits(['itemClick', 'close']);

const isShow = ref(false);

const handleItemClick = (item) => {
  emit('itemClick', item);
  isShow.value = false;
};

const show = () => {
  isShow.value = true;
};

const hide = () => {
  isShow.value = false;
};

defineExpose({ show, hide });
</script>

<style scoped>
.custom-contextmenu {
  position: fixed;
  z-index: 2190;
  min-width: 120px;
  background-color: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.el-dropdown-menu__item {
  font-size: 14px;
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.el-dropdown-menu__item:hover {
  background-color: #f5f7fa;
}

.el-icon {
  margin-right: 8px;
}
</style>