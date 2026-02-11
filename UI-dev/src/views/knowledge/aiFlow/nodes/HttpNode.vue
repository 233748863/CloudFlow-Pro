<template>
  <div class="output-params"
       v-if="node.method || node.httpParams.url">
    <div class="param-item">
      <span class="param-name">{{ node.httpParams.method }}</span>
      <span class="param-value">{{ node.httpParams.url }}</span>
    </div>
  </div>
</template>

<script>
import common from './common.ts'
export default {
  name: 'HttpNode',
  mixins: [common]
}
</script>

<style scoped>
/* 添加样式 */
.output-params {
  padding: 8px 12px;
}

.param-item {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  padding: 3px 10px;
  font-size: 13px;
  color: #333;
  border-radius: 4px;
  font-size: 12px;
  background-color: rgb(242, 244, 247);
  overflow: hidden;
}
.param-icon {
  color: rgb(41 112 255);
  font-weight: bold;
}
.param-name {
  padding: 2px 5px;
  background-color: #fff;
  box-sizing: border-box;
  margin-right: 4px;
  font-size: 10px;
  font-weight: bold;
  border-radius: 4px;
}

.param-value {
  color: #666;
  font-weight: 500;
}
</style>