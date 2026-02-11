<template>
  <el-drawer title="提示词" v-model="promptVisible" close-on-click-modal>
    <div class="max-w-xl rounded-lg h-full py-4 dark:border-gray-700">
      <div class="mx-2">
        <input
          id="search-chats"
          type="text"
          class="w-full rounded-lg border border-slate-300 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 p-3 pr-10 text-sm text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
          placeholder="查询提示词"
          v-model="queryString"
          @keydown.enter="querySearchAsync"
          required
        />
      </div>

      <ul role="list" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2">
        <li class="col-span-2 rounded-lg mt-2 shadow dark:bg-gray-800" v-for="prompt in promptList">
          <div class="flex w-full items-center justify-between space-x-6 p-6">
            <button class="group flex-1 truncate" @click="selectPrompt(prompt)">
              <div class="flex items-center space-x-3">
                <h3 class="truncate text-sm font-medium text-slate-900 dark:text-gray-200 transition-colors group-hover:text-blue-600">
                  {{ prompt.act }}
                </h3>
              </div>
              <p class="mt-1 truncate text-sm text-slate-500 dark:text-gray-400">
                {{ prompt.prompt }}
              </p>
            </button>
          </div>
        </li>
      </ul>
    </div>
  </el-drawer>
</template>
<script setup lang="ts" name="AiPromptsDialog">
import {list} from "/@/api/knowledge/aiPrompt";

const emit = defineEmits(['refresh']);
const promptVisible = ref(false)
const promptList = ref([])
const queryString = ref('')


/**
 * 选中提示词
 * @param prompt
 */
const selectPrompt = (prompt: any) => {
  // Close the prompt dialog
  promptVisible.value = false
  // Emit a 'refresh' event with the selected prompt
  emit('refresh', prompt.prompt);
}

/**
 * 查询所有提示词.
 */
const querySearchAsync = async () => {
  const {data} = await list({act: queryString.value})
  promptList.value = data
}

/**
 * 打开提示词选择界面.
 */
const openDialog = () => {
  querySearchAsync()
  promptVisible.value = true
}

// Expose the openDialog function
defineExpose({
  openDialog
});
</script>
