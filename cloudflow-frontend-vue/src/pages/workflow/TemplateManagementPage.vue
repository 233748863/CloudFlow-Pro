<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Edit3, FolderOpen, FolderPlus, Plus, RefreshCcw, Search, Trash2, X } from 'lucide-vue-next'
import { BaseDialog, Button, ConfirmDialog, DataTable, EmptyState, Input, Pagination, Panel, Select, TextArea, type Column, type SelectOption } from '@/components/common'
import request from '@/services/api/request'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

type TemplateStatus = 'active' | 'inactive'
type StatusFilter = 'all' | TemplateStatus
type DeleteTarget = { type: 'template' | 'category'; id: string; name: string }

interface TemplateItem extends Record<string, unknown> {
  id: string
  name: string
  description?: string
  categoryId: string
  categoryName?: string
  tags?: string[]
  usageCount?: number
  status: TemplateStatus
  definition?: unknown
  previewImage?: string
}

interface CategoryNode extends Record<string, unknown> {
  id: string
  name: string
  description?: string
  parentId?: string
  orderNum?: number
  templateCount?: number
  children?: CategoryNode[]
  depth?: number
}

const DEFAULT_TEMPLATE_DEFINITION = {
  nodes: [
    { id: 'start', type: 'START', title: '开始' },
    { id: 'end', type: 'END', title: '流程结束' }
  ],
  edges: [{ id: 'start->end', source: 'start', target: 'end' }]
}

const toast = useToastStore()

const templates = ref<TemplateItem[]>([])
const categories = ref<CategoryNode[]>([])
const loading = reactive({ templates: false, categories: false, saving: false })
const filters = reactive<{ keyword: string; status: StatusFilter }>({ keyword: '', status: 'all' })
const query = reactive<{ keyword: string; status: StatusFilter }>({ keyword: '', status: 'all' })
const selectedCategory = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const templateDialogOpen = ref(false)
const categoryDialogOpen = ref(false)
const editingTemplate = ref<TemplateItem | null>(null)
const editingCategory = ref<CategoryNode | null>(null)
const deleteTarget = ref<DeleteTarget | null>(null)
const tagInput = ref('')

const templateForm = reactive({
  name: '',
  description: '',
  categoryId: '',
  tags: [] as string[],
  definition: JSON.stringify(DEFAULT_TEMPLATE_DEFINITION, null, 2),
  previewImage: '',
  status: 'active' as TemplateStatus
})

const categoryForm = reactive({
  name: '',
  description: '',
  parentId: '',
  orderNum: 0
})

const statusOptions: SelectOption[] = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '仅启用' },
  { value: 'inactive', label: '仅禁用' }
]

const templateStatusOptions: SelectOption[] = [
  { value: 'active', label: '启用' },
  { value: 'inactive', label: '禁用' }
]

const flatCategories = computed(() => flattenCategoryTree(categories.value))
const selectedCategoryNode = computed(() => flatCategories.value.find((item) => item.id === selectedCategory.value) || null)
const hasActiveFilters = computed(() => Boolean(query.keyword || query.status !== 'all' || selectedCategory.value))
const columns: Column<TemplateItem>[] = [
  { key: 'name', label: '模板' },
  { key: 'categoryName', label: '分类' },
  { key: 'tags', label: '标签' },
  { key: 'usageCount', label: '使用次数' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', class: 'text-right' }
]

const categoryOptions = computed<SelectOption[]>(() => [
  { value: '', label: '无（顶级分类）' },
  ...flatCategories.value
    .filter((item) => item.id !== editingCategory.value?.id)
    .map((item) => ({ value: item.id, label: `${'　'.repeat(item.depth || 0)}${item.name}` }))
])

function flattenCategoryTree(nodes: CategoryNode[], depth = 0, result: CategoryNode[] = []) {
  nodes.forEach((node) => {
    result.push({ ...node, depth })
    if (node.children?.length) flattenCategoryTree(node.children, depth + 1, result)
  })
  return result
}

function resetTemplateForm() {
  templateForm.name = ''
  templateForm.description = ''
  templateForm.categoryId = ''
  templateForm.tags = []
  templateForm.definition = JSON.stringify(DEFAULT_TEMPLATE_DEFINITION, null, 2)
  templateForm.previewImage = ''
  templateForm.status = 'active'
  tagInput.value = ''
}

function resetCategoryForm() {
  categoryForm.name = ''
  categoryForm.description = ''
  categoryForm.parentId = ''
  categoryForm.orderNum = 0
}

function formatTags(tags: unknown) {
  const list = Array.isArray(tags) ? tags.map(String) : []
  if (list.length === 0) return '-'
  const visible = list.slice(0, 2).join(' / ')
  return list.length > 2 ? `${visible} +${list.length - 2}` : visible
}

function statusLabel(value: unknown) {
  return String(value) === 'active' ? '启用' : '禁用'
}

function openTemplateDialog(template?: TemplateItem) {
  editingTemplate.value = template || null
  resetTemplateForm()
  if (template) {
    templateForm.name = template.name || ''
    templateForm.description = template.description || ''
    templateForm.categoryId = template.categoryId || ''
    templateForm.tags = Array.isArray(template.tags) ? [...template.tags] : []
    templateForm.definition = JSON.stringify(template.definition || DEFAULT_TEMPLATE_DEFINITION, null, 2)
    templateForm.previewImage = template.previewImage || ''
    templateForm.status = template.status || 'active'
  }
  templateDialogOpen.value = true
}

function openCategoryDialog(category?: CategoryNode) {
  editingCategory.value = category || null
  resetCategoryForm()
  if (category) {
    categoryForm.name = category.name || ''
    categoryForm.description = category.description || ''
    categoryForm.parentId = category.parentId || ''
    categoryForm.orderNum = category.orderNum ?? 0
  }
  categoryDialogOpen.value = true
}

function addTag() {
  const tag = tagInput.value.trim()
  if (!tag) return
  if (templateForm.tags.includes(tag)) {
    toast.error('标签已存在')
    return
  }
  templateForm.tags = [...templateForm.tags, tag]
  tagInput.value = ''
}

function removeTag(tag: string) {
  templateForm.tags = templateForm.tags.filter((item) => item !== tag)
}

async function loadCategories() {
  loading.categories = true
  try {
    const data = await request.get<CategoryNode[]>('/workflow/templates/categories')
    categories.value = Array.isArray(data) ? data : []
  } catch (error) {
    categories.value = []
    toast.error(getErrorMessage(error, '加载模板分类失败'))
  } finally {
    loading.categories = false
  }
}

async function loadTemplates() {
  loading.templates = true
  try {
    const params: Record<string, string | number> = { pageNum: page.value, pageSize: pageSize.value, status: query.status }
    if (selectedCategory.value) params.categoryId = selectedCategory.value
    if (query.keyword.trim()) params.keyword = query.keyword.trim()
    const data = await request.get<{ records?: TemplateItem[]; rows?: TemplateItem[]; total?: number }>('/workflow/templates', { params })
    templates.value = Array.isArray(data?.records) ? data.records : Array.isArray(data?.rows) ? data.rows : []
    total.value = Number(data?.total || templates.value.length)
  } catch (error) {
    templates.value = []
    total.value = 0
    toast.error(getErrorMessage(error, '加载模板列表失败'))
  } finally {
    loading.templates = false
  }
}

function refreshAll() {
  void Promise.all([loadCategories(), loadTemplates()])
}

function searchRows() {
  query.keyword = filters.keyword.trim()
  query.status = filters.status
  page.value = 1
  void loadTemplates()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = 'all'
  query.keyword = ''
  query.status = 'all'
  selectedCategory.value = ''
  page.value = 1
  void loadTemplates()
}

async function saveTemplate() {
  if (!templateForm.name.trim()) {
    toast.error('请输入模板名称')
    return
  }
  if (!templateForm.categoryId) {
    toast.error('请选择模板分类')
    return
  }
  if (templateForm.tags.length === 0) {
    toast.error('请至少添加一个标签')
    return
  }

  let definitionData: unknown
  try {
    definitionData = JSON.parse(templateForm.definition)
  } catch {
    toast.error('流程定义 JSON 格式不正确')
    return
  }

  loading.saving = true
  try {
    const payload = {
      name: templateForm.name.trim(),
      description: templateForm.description.trim(),
      categoryId: templateForm.categoryId,
      tags: templateForm.tags,
      definition: definitionData,
      previewImage: templateForm.previewImage.trim(),
      status: templateForm.status
    }
    if (editingTemplate.value) await request.put(`/workflow/templates/${editingTemplate.value.id}`, payload)
    else await request.post('/workflow/templates', payload)
    templateDialogOpen.value = false
    toast.success(editingTemplate.value ? '模板已更新' : '模板已创建')
    await Promise.all([loadTemplates(), loadCategories()])
  } catch (error) {
    toast.error(getErrorMessage(error, '保存模板失败'))
  } finally {
    loading.saving = false
  }
}

async function saveCategory() {
  if (!categoryForm.name.trim()) {
    toast.error('请输入分类名称')
    return
  }
  loading.saving = true
  try {
    const payload = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim(),
      parentId: categoryForm.parentId || null,
      orderNum: Number(categoryForm.orderNum || 0)
    }
    if (editingCategory.value) await request.put(`/workflow/templates/categories/${editingCategory.value.id}`, payload)
    else await request.post('/workflow/templates/categories', payload)
    categoryDialogOpen.value = false
    toast.success(editingCategory.value ? '分类已更新' : '分类已创建')
    await Promise.all([loadCategories(), loadTemplates()])
  } catch (error) {
    toast.error(getErrorMessage(error, '保存分类失败'))
  } finally {
    loading.saving = false
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  loading.saving = true
  try {
    if (deleteTarget.value.type === 'template') await request.delete(`/workflow/templates/${deleteTarget.value.id}`)
    else await request.delete(`/workflow/templates/categories/${deleteTarget.value.id}`)
    if (selectedCategory.value === deleteTarget.value.id) selectedCategory.value = ''
    deleteTarget.value = null
    toast.success('删除成功')
    await Promise.all([loadCategories(), loadTemplates()])
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    loading.saving = false
  }
}

watch([page, pageSize, selectedCategory], () => void loadTemplates())

onMounted(() => {
  void Promise.all([loadCategories(), loadTemplates()])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <FolderOpen class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Template Management
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">模板管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">管理流程模板、分类、标签和模板定义 JSON</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading.templates || loading.categories" @click="refreshAll"><RefreshCcw class="h-4 w-4" />刷新</Button>
        <Button variant="outline" @click="openCategoryDialog()"><FolderPlus class="h-4 w-4" />新建分类</Button>
        <Button :disabled="flatCategories.length === 0" @click="openTemplateDialog()"><Plus class="h-4 w-4" />新建模板</Button>
      </div>
    </div>

    <Panel title="筛选">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]">
        <Input v-model="filters.keyword" label="关键词" placeholder="搜索模板名称" @enter="searchRows"><template #prefix><Search class="h-4 w-4" /></template></Input>
        <label class="space-y-1.5"><span class="text-sm font-medium">状态</span><Select v-model="filters.status" :options="statusOptions" /></label>
        <div class="flex items-end gap-2"><Button @click="searchRows">查询</Button><Button v-if="hasActiveFilters" variant="outline" @click="resetFilters">清空</Button></div>
      </div>
    </Panel>

    <div class="grid min-h-[620px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/90 xl:grid-cols-[248px_minmax(0,1fr)]">
      <aside class="border-b border-slate-200 dark:border-slate-800 xl:border-b-0 xl:border-r">
        <div class="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <div class="text-sm font-medium text-slate-900 dark:text-slate-100">分类</div>
          <div class="text-[11px] tabular-nums text-slate-400">{{ flatCategories.length }}</div>
        </div>
        <div class="max-h-[calc(100vh-312px)] overflow-y-auto px-1.5 py-1.5">
          <div v-if="loading.categories" class="py-10 text-center text-sm text-slate-500">正在加载分类...</div>
          <EmptyState v-else-if="flatCategories.length === 0" title="暂无分类" />
          <div v-else class="space-y-1">
            <button type="button" class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm" :class="!selectedCategory ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'" @click="selectedCategory = ''; page = 1">
              <span class="font-medium">全部分类</span><span class="text-[11px] tabular-nums text-slate-400">{{ total }}</span>
            </button>
            <div v-for="category in flatCategories" :key="category.id" class="group flex items-center gap-1 rounded-lg px-2 py-1.5" :class="selectedCategory === category.id ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'">
              <button type="button" class="min-w-0 flex-1 text-left" :style="{ paddingLeft: `${(category.depth || 0) * 10}px` }" @click="selectedCategory = category.id; page = 1">
                <span class="truncate text-sm">{{ category.name }}</span>
              </button>
              <span class="text-[11px] tabular-nums text-slate-400">{{ category.templateCount ?? 0 }}</span>
              <div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button size="icon" variant="ghost" @click="openCategoryDialog(category)"><Edit3 class="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" @click="deleteTarget = { type: 'category', id: category.id, name: category.name }"><Trash2 class="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main class="min-w-0">
        <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <div class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{{ selectedCategoryNode?.name || '模板列表' }}</div>
          <div class="text-[11px] tabular-nums text-slate-400">{{ total }}</div>
        </div>
        <DataTable :columns="columns" :data="templates" :loading="loading.templates" row-key="id">
          <template #cell-name="{ row }">
            <div class="max-w-[360px]">
              <div class="truncate font-medium text-slate-900 dark:text-slate-100">{{ row.name }}</div>
              <div class="mt-1 truncate text-sm text-slate-500">{{ row.description || '-' }}</div>
            </div>
          </template>
          <template #cell-tags="{ value }">{{ formatTags(value) }}</template>
          <template #cell-status="{ value }"><span class="text-xs text-slate-500">{{ statusLabel(value) }}</span></template>
          <template #cell-actions="{ row }">
            <div class="flex justify-end gap-1">
              <Button size="icon" variant="ghost" @click="openTemplateDialog(row)"><Edit3 class="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" @click="deleteTarget = { type: 'template', id: row.id, name: row.name }"><Trash2 class="h-4 w-4" /></Button>
            </div>
          </template>
        </DataTable>
        <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </main>
    </div>

    <BaseDialog :show="templateDialogOpen" :title="editingTemplate ? '编辑模板' : '新建模板'" width="extra-wide" @close="templateDialogOpen = false">
      <form class="space-y-4" @submit.prevent="saveTemplate">
        <div class="grid gap-4 md:grid-cols-2">
          <Input v-model="templateForm.name" label="模板名称" required />
          <label class="space-y-1.5"><span class="text-sm font-medium">分类 <span class="text-red-500">*</span></span><Select v-model="templateForm.categoryId" :options="categoryOptions.filter((item) => item.value !== '')" searchable /></label>
        </div>
        <TextArea v-model="templateForm.description" label="模板描述" :rows="2" />
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">标签 <span class="text-red-500">*</span></label>
          <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]"><Input v-model="tagInput" placeholder="输入标签" @enter="addTag" /><Button type="button" variant="outline" @click="addTag">添加</Button></div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="tag in templateForm.tags" :key="tag" type="button" class="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400" @click="removeTag(tag)">{{ tag }}<X class="h-3 w-3" /></button>
            <span v-if="templateForm.tags.length === 0" class="text-xs text-slate-400">-</span>
          </div>
        </div>
        <TextArea v-model="templateForm.definition" label="流程定义（JSON）" :rows="10" required />
        <div class="grid gap-4 md:grid-cols-2">
          <Input v-model="templateForm.previewImage" label="预览图 URL" />
          <label class="space-y-1.5"><span class="text-sm font-medium">状态</span><Select v-model="templateForm.status" :options="templateStatusOptions" /></label>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="templateDialogOpen = false">取消</Button><Button :disabled="loading.saving" @click="saveTemplate">{{ editingTemplate ? '保存修改' : '创建模板' }}</Button></div>
      </template>
    </BaseDialog>

    <BaseDialog :show="categoryDialogOpen" :title="editingCategory ? '编辑分类' : '新建分类'" width="normal" @close="categoryDialogOpen = false">
      <form class="space-y-4" @submit.prevent="saveCategory">
        <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
          <label class="space-y-1.5"><span class="text-sm font-medium">父分类</span><Select v-model="categoryForm.parentId" :options="categoryOptions" searchable /></label>
          <Input v-model="categoryForm.orderNum" type="number" label="排序号" />
        </div>
        <Input v-model="categoryForm.name" label="分类名称" required />
        <TextArea v-model="categoryForm.description" label="分类描述" :rows="3" />
      </form>
      <template #footer>
        <div class="flex justify-end gap-3"><Button variant="outline" @click="categoryDialogOpen = false">取消</Button><Button :disabled="loading.saving" @click="saveCategory">{{ editingCategory ? '保存修改' : '创建分类' }}</Button></div>
      </template>
    </BaseDialog>

    <ConfirmDialog :show="Boolean(deleteTarget)" :title="deleteTarget?.type === 'template' ? '确认删除模板' : '确认删除分类'" :message="deleteTarget?.type === 'template' ? `确认删除模板“${deleteTarget?.name || ''}”？` : `确认删除分类“${deleteTarget?.name || ''}”？`" confirm-text="删除" danger @cancel="deleteTarget = null" @confirm="confirmDelete" />
  </div>
</template>
