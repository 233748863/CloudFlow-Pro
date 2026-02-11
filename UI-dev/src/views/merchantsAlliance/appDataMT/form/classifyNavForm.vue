<template>
  <div class="w-full flex flex-col h-full gap-4">
    <el-card v-show="showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small">
        <div class="grid grid-cols-2 gap-5 items-center">
          <el-form-item class="w-full" label="分类名称" prop="name">
            <el-input v-model="state.searchForm.name" class="w-full" placeholder="请输入分类名称" />
          </el-form-item>
        </div>
        <div class="flex flex-row gap-5">
          <el-form-item label="排序">
            <div class="flex items-center gap-2">
              <el-radio-group v-model="state.searchForm.orderByCreatedTime">
                <el-radio-button :value="true">按创建时间降序</el-radio-button>
                <el-radio-button :value="false">按创建时间升序</el-radio-button>
              </el-radio-group>
              <el-radio-group v-model="state.searchForm.sortByWeight">
                <el-radio-button :value="false">按权重降序</el-radio-button>
                <el-radio-button :value="true">按权重升序</el-radio-button>
              </el-radio-group>
            </div>
          </el-form-item>
          <el-form-item class="flex-[2] w-full" label="启用状态" prop="enable">
            <el-select v-model="state.searchForm.enable" class="w-full" placeholder="请选择是否只查询已启用">
              <el-option class="w-full" label="全部" value="全部" />
              <el-option :value="true" class="w-full" label="已启用" />
              <el-option :value="false" class="w-full" label="未启用" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button icon="Search" type="primary" @click="handelSearch">查询</el-button>
            <el-button icon="Refresh" @click="resetQuery">重置</el-button>
          </el-form-item>
        </div>
      </el-form>
    </el-card>
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row items-center justify-between">
          <el-button type="primary" @click="handleAdd">添加分类导航</el-button>
          <right-toolbar
            v-model:show-search="showSearch"
            class="flex flex-row justify-end"
            @queryTable="getPlatformNaviMenu"
          />
        </div>
      </template>
      <el-table
        v-loading="state.isLoading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.classifyNavList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="排序权重" prop="sortWeight" width="100">
          <template #default="{ row }">
            <el-input v-if="row.isEdit" v-model="row.sortWeight" placeholder="请输入排序权重" type="number" />
            <span v-else>{{ row.sortWeight }}</span>
          </template>
        </el-table-column>
        <el-table-column label="分类名称" prop="name" width="200">
          <template #default="{ row }">
            <el-input v-if="row.isEdit" v-model="row.name" placeholder="请输入分类名称" />
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="商品分类" prop="categoryId" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tree-select
              v-model="row.targetId"
              :data="state.categoryTreeOpts"
              :disabled="row.isEdit !== true"
              :props="{ children: 'children', value: 'id', label: 'name' }"
              placeholder="请选择商品分类"
              check-strictly
              @node-click="(e:any) => handleCategoryChange(e, row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="目标id" prop="targetId" width="200">
          <template #default="{ row }">
            <span>{{ row.targetId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="图片url" prop="imageUrl" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.imageUrl" class="relative mr-4 transform">
              <el-image
                :preview-src-list="[getImageUrl(row.imageUrl)]"
                :preview-teleported="true"
                :src="getImageUrl(row.imageUrl)"
                class="w-20 aspect-[1/1] rounded-md transition-transform duration-300"
                fit="cover"
              />
              <div
                v-if="row.isEdit"
                class="absolute top-0 right-0 bg-red text-white rounded-full cursor-pointer w-4 h-4 flex items-center justify-center transition-transform duration-300 hover:scale-150"
                @click="row.imageUrl = ''"
              >
                <el-icon>
                  <Close />
                </el-icon>
              </div>
            </div>
            <el-upload
              v-if="row.isEdit && !row.imageUrl"
              :auto-upload="true"
              :before-upload="beforeBannerImageUpload"
              :http-request="(options: any) => handleHttpUpload(options, row)"
              :show-file-list="false"
              accept="image/*"
              class="w-40 aspect-[2/1] bg-[#fff] flex justify-center items-center"
              list-type="text"
            >
              <el-icon>
                <Plus />
              </el-icon>
              <div>上传图片</div>
            </el-upload>
          </template>
        </el-table-column>
        <el-table-column label="是否启用" prop="enable" width="100">
          <template #default="{ row }">
            <el-switch v-if="row.isEdit" v-model="row.enable" :active-value="true" :inactive-value="false" />
            <span v-else>{{ row.enable ? '是' : '否' }}</span>
          </template>
        </el-table-column>
        <el-table-column align="center" fixed="right" label="操作" width="120">
          <template #default="{ row }">
            <div v-if="!row.isEdit">
              <el-button size="small" type="danger" link @click="handleDelete(row)">
                {{ '删除' }}
              </el-button>
              <el-button :type="row.enable ? 'warning' : 'success'" size="small" link @click="handleEnable(row)">
                {{ row.enable ? '禁用' : '启用' }}
              </el-button>
              <el-button size="small" type="primary" link @click="handleEdit(row)">
                {{ '编辑' }}
              </el-button>
            </div>
            <div v-else class="w-full flex items-center justify-center">
              <el-button size="small" type="success" link @click="handleSave(row)">
                {{ '保存' }}
              </el-button>
              <el-button size="small" type="danger" link @click="handleCancelEdit(row)">{{ '取消' }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <!-- 分页 -->
        <el-pagination
          v-model:current-page="state.pagination.currentPage"
          v-model:page-size="state.pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="state.pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
        />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Close, Plus } from '@element-plus/icons-vue'
import { categoryTreeApi } from '/@/api/merchantsAlliance/product/category/api'
import { PlatformNaviMenuData, PlatformNaviMenuRequest } from '/@/api/merchantsAlliance/app/types'
import {
  addPlatformNaviMenu,
  deletePlatformNaviMenu,
  enablePlatformNaviMenu,
  getPlatformNaviMenuList,
  modifyPlatformNaviMenu,
} from '/@/api/merchantsAlliance/app'
import { ElCheckbox, ElMessage, ElMessageBox, UploadRequestOptions } from 'element-plus'
import { generateUUID } from '/@/utils/other'
import request from '/@/utils/request'
import { beforeBannerImageUpload, getImageUrl } from '/@/views/merchantsAlliance/way'

const emit = defineEmits(['updateData'])

const state = reactive({
  classifyNavList: [] as PlatformNaviMenuData[],
  editRows: {} as Record<string, PlatformNaviMenuData>,
  searchForm: {
    pageNum: 1,
    pageSize: 10,
    name: '',
    type: 'MID',
    merchantId: '0',
    enable: '全部',
    sortByWeight: true,
    orderByCreatedTime: true,
  },
  isDeleteConfirm: false,
  isLoading: false,
  categoryTreeOpts: [
    {
      id: '1',
      name: '全部',
      children: [
        {
          id: '2',
          name: '分类1',
        },
        {
          id: '3',
          name: '分类2',
        },
      ],
    },
  ],
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
})

const showSearch = ref(true)

const loadCategoryTreeOpts = async () => {
  const resp = await categoryTreeApi()
  if (resp.code === 0) {
    state.categoryTreeOpts = resp.data
  }
}

// 分类导航菜单查询
async function getPlatformNaviMenu() {
  state.isLoading = true
  state.searchForm.pageSize = state.pagination.pageSize
  state.searchForm.pageNum = state.pagination.currentPage
  const params = {
    ...state.searchForm,
    enable: state.searchForm.enable === '全部' ? undefined : state.searchForm.enable,
  } as PlatformNaviMenuRequest
  try {
    const resp = await getPlatformNaviMenuList(params)
    if (resp.code === 0) {
      state.classifyNavList = resp.data.records || []
      state.pagination.total = resp.data.total || 0
    } else {
      ElMessage({
        type: 'error',
        message: '获取分类导航菜单失败',
      })
    }
  } catch (error) {
    ElMessage({
      type: 'error',
      message: '获取分类导航菜单失败',
    })
  } finally {
    state.isLoading = false
  }
}

// 处理分页改变
function handleCurrentChange(pageNum: number) {
  state.pagination.currentPage = pageNum
  state.searchForm.pageNum = pageNum
  getPlatformNaviMenu()
}

// 处理每页数量改变
function handleSizeChange(pageSize: number) {
  state.pagination.pageSize = pageSize
  state.searchForm.pageSize = pageSize
  getPlatformNaviMenu()
}

// 分类导航菜单查询
function handelSearch() {
  state.pagination.currentPage = 1
  state.pagination.pageSize = 10
  getPlatformNaviMenu()
}

// 重置查询条件
function resetQuery() {
  state.pagination.currentPage = 1
  state.pagination.pageSize = 10
  state.searchForm = {
    pageNum: 1,
    pageSize: 10,
    name: '',
    type: 'MID',
    merchantId: '0',
    enable: '全部',
    sortByWeight: true,
    orderByCreatedTime: true,
  }
  getPlatformNaviMenu()
}

// 上传图片
async function handleHttpUpload({ file, onError }: UploadRequestOptions, row: PlatformNaviMenuData) {
  let formData = new FormData()
  formData.append('file', file)
  formData.append('dir', 'classifyNavMap')
  try {
    const response = await request({
      url: '/admin/sys-file/upload',
      method: 'post',
      headers: {
        'Content-Type': 'multipart/form-data',
        'Enc-Flag': 'false',
      },
      data: formData,
    })
    if (response.code === 0) {
      row.imageUrl = response.data.url
    } else {
      onError(response.msg as any)
    }
  } catch (error) {
    onError(error as any)
  }
}

// 添加分类导航菜单
function handleAdd() {
  const newClassifyNav = {
    name: '',
    targetId: '',
    parentId: '',
    type: 'MID',
    imageUrl: '',
    sortWeight: 0,
    enable: true,
    isEdit: true,
    platform: true,
    tempId: generateUUID(),
  } as PlatformNaviMenuData
  state.classifyNavList.push(newClassifyNav as PlatformNaviMenuData)
}

// 保存分类导航菜单
async function handleSave(row: PlatformNaviMenuData) {
  const params = {
    platform: true,
    name: row.name,
    targetId: row.targetId,
    type: 'MID',
    imageUrl: row.imageUrl,
    enable: row.enable,
    sortWeight: row.sortWeight,
  } as PlatformNaviMenuData
  try {
    if (row.id) {
      params.id = row.id
      const resp = await modifyPlatformNaviMenu(params)
      if (resp.code === 0) {
        Object.assign(resp, resp.data)
        row.isEdit = false
        if (row.enable) {
          emit('updateData', resp)
        }
      } else {
        ElMessage({
          type: 'error',
          message: '修改分类导航菜单失败',
        })
      }
    } else {
      const resp = await addPlatformNaviMenu(params)
      if (resp.code === 0) {
        Object.assign(resp, resp.data)
        row.isEdit = false
        if (row.enable) {
          emit('updateData', resp)
        }
      } else {
        ElMessage({
          type: 'error',
          message: '添加分类导航菜单失败',
        })
      }
    }
  } catch (error) {
    ElMessage({
      type: 'error',
      message: '添加分类导航菜单失败',
    })
  }
}

// 编辑分类导航菜单
function handleEdit(row: PlatformNaviMenuData) {
  state.editRows[row.id as string] = { ...row }
  row.isEdit = true
}

// 取消编辑分类导航菜单
function handleCancelEdit(row: PlatformNaviMenuData) {
  if (row.id) {
    Object.assign(row, state.editRows[row.id], { isEdit: false })
    delete state.editRows[row.id]
  } else {
    state.classifyNavList = state.classifyNavList.filter((item) => item.tempId !== row.tempId)
  }
}

// 启用/禁用分类导航菜单
async function handleEnable(row: PlatformNaviMenuData) {
  try {
    const resp = await enablePlatformNaviMenu({ id: row.id as string, platform: true })
    if (resp.code === 0) {
      row.enable = !row.enable
      emit('updateData', resp)
    } else {
      ElMessage({
        type: 'error',
        message: '启用分类导航菜单失败',
      })
    }
  } catch (error) {
    ElMessage({
      type: 'error',
      message: '启用分类导航菜单失败',
    })
  }
}

// 删除编辑分类导航菜单
async function handleDelete(row: PlatformNaviMenuData) {
  try {
    let isDeleted = true
    if (!state.isDeleteConfirm) {
      isDeleted = await ElMessageBox({
        title: '删除确认',
        message: () =>
          h('p', null, [
            h('p', { class: 'text-[16px]' }, '确认删除轮播图吗?'),
            h(ElCheckbox, {
              modelValue: state.isDeleteConfirm,
              'onUpdate:modelValue': (val: boolean) => {
                state.isDeleteConfirm = val
              },
              label: '不再提醒',
            }),
          ]),
        showCancelButton: true,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          return true
        })
        .catch(() => {
          return false
        })
    }
    if (isDeleted) {
      const resp = await deletePlatformNaviMenu({ id: row.id as string, platform: true })
      if (resp.code === 0) {
        if (row.enable) {
          emit('updateData', resp)
        }
        state.classifyNavList = state.classifyNavList.filter((item) => item.id !== row.id)
      } else {
        ElMessage({
          type: 'error',
          message: '删除失败',
        })
      }
    }
  } catch (error) {
    ElMessage({
      type: 'error',
      message: '删除失败',
    })
  }
}

const handleCategoryChange = (e: any, row: PlatformNaviMenuData) => {
  row.name = e.name
  row.targetId = e.id
}

onMounted(() => {
  loadCategoryTreeOpts()
  resetQuery()
})
</script>

<style scoped lang="scss"></style>
