<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Code2, Copy, Database, FileCode2, Layers, RefreshCcw, Save, Search, Settings2, Table2 } from 'lucide-vue-next'
import { Button, Input, Panel, Select, StatusBadge, TextArea, type SelectOption } from '@/components/common'
import { getProcessDefinitions, type ProcessDefinitionSummary } from '@/services/api/workflow'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber, normalizeRows } from '@/pages/hr/hrUtils'

interface FieldRow {
  name: string
  label: string
  type: string
  required: boolean
  searchable: boolean
  tableVisible: boolean
}

const toast = useToastStore()
const loading = ref(false)
const workflows = ref<ProcessDefinitionSummary[]>([])
const selectedWorkflowId = ref('')
const keyword = ref('')
const activeFile = ref('entity')
const moduleForm = ref({
  moduleName: 'system',
  packageName: 'com.cloudflow.system',
  entityName: 'DemoRecord',
  tableName: 'sys_demo_record',
  pageName: 'DemoRecordPage',
  routePath: '/system/demo-record',
  author: 'CloudFlow'
})
const fields = ref<FieldRow[]>([
  { name: 'recordId', label: '记录ID', type: 'Long', required: true, searchable: false, tableVisible: false },
  { name: 'recordName', label: '记录名称', type: 'String', required: true, searchable: true, tableVisible: true },
  { name: 'status', label: '状态', type: 'String', required: true, searchable: true, tableVisible: true },
  { name: 'remark', label: '备注', type: 'String', required: false, searchable: false, tableVisible: true }
])

const fileOptions: SelectOption[] = [
  { value: 'entity', label: 'Entity.java' },
  { value: 'controller', label: 'Controller.java' },
  { value: 'api', label: 'api.ts' },
  { value: 'vue', label: 'Page.vue' }
]
const typeOptions: SelectOption[] = [
  { value: 'String', label: 'String' },
  { value: 'Long', label: 'Long' },
  { value: 'Integer', label: 'Integer' },
  { value: 'BigDecimal', label: 'BigDecimal' },
  { value: 'LocalDate', label: 'LocalDate' },
  { value: 'LocalDateTime', label: 'LocalDateTime' },
  { value: 'Boolean', label: 'Boolean' }
]
const workflowOptions = computed<SelectOption[]>(() => [
  { value: '', label: loading.value ? '正在加载已发布流程' : '不绑定流程' },
  ...workflows.value.map((item) => ({
    value: String(item.definitionId || item.processKey || ''),
    label: `${item.processName || item.processKey || '未命名流程'} · ${item.processKey || '-'}`
  }))
])
const filteredFields = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return fields.value
  return fields.value.filter((item) => [item.name, item.label, item.type].some((part) => part.toLowerCase().includes(value)))
})
const selectedWorkflow = computed(() => workflows.value.find((item) => String(item.definitionId || item.processKey || '') === selectedWorkflowId.value) || null)
const summary = computed(() => ({
  workflows: workflows.value.length,
  fields: fields.value.length,
  searchable: fields.value.filter((item) => item.searchable).length,
  visible: fields.value.filter((item) => item.tableVisible).length
}))
const previewTitle = computed(() => fileOptions.find((item) => item.value === activeFile.value)?.label || 'Preview')
const previewCode = computed(() => buildPreview(activeFile.value))

function upperFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : ''
}
function lowerFirst(value: string) {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : ''
}
function addField() {
  fields.value.push({ name: `field${fields.value.length + 1}`, label: '新字段', type: 'String', required: false, searchable: false, tableVisible: true })
}
function removeField(index: number) {
  if (fields.value.length <= 1) return toast.error('至少保留一个字段')
  fields.value.splice(index, 1)
}
function toggleField(index: number, key: 'required' | 'searchable' | 'tableVisible') {
  fields.value[index][key] = !fields.value[index][key]
}
async function copyPreview() {
  try {
    await navigator.clipboard.writeText(previewCode.value)
    toast.success('代码片段已复制')
  } catch {
    toast.error('复制失败')
  }
}
async function fetchWorkflows() {
  loading.value = true
  try {
    const response = await getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false, pageNum: 1, pageSize: 200 })
    workflows.value = normalizeRows<ProcessDefinitionSummary>(response)
  } catch (error) {
    workflows.value = []
    toast.error(getErrorMessage(error, '已发布流程加载失败'))
  } finally {
    loading.value = false
  }
}
function buildPreview(kind: string) {
  const entityName = moduleForm.value.entityName.trim() || 'DemoRecord'
  const variableName = lowerFirst(entityName)
  const packageName = moduleForm.value.packageName.trim() || 'com.cloudflow.system'
  const apiBase = moduleForm.value.routePath.trim() || '/system/demo-record'
  const selectedFields = fields.value.filter((item) => item.name.trim())

  if (kind === 'controller') {
    return `package ${packageName}.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("${apiBase}")
public class ${entityName}Controller {

    @GetMapping("/list")
    public Object list(${entityName} query) {
        return null;
    }

    @PostMapping
    public Object add(@RequestBody ${entityName} ${variableName}) {
        return null;
    }

    @PutMapping
    public Object edit(@RequestBody ${entityName} ${variableName}) {
        return null;
    }
}`
  }

  if (kind === 'api') {
    const typeFields = selectedFields.map((field) => `  ${field.name}${field.required ? '' : '?'}: ${tsType(field.type)}`).join('\n')
    return `import request from '@/services/api/request'

export interface ${entityName} {
${typeFields}
}

export const list${entityName} = (params?: Partial<${entityName}>) =>
  request.get<${entityName}[]>('${apiBase}/list', { params })

export const add${entityName} = (data: ${entityName}) =>
  request.post<void>('${apiBase}', data)

export const update${entityName} = (data: ${entityName}) =>
  request.put<void>('${apiBase}', data)`
  }

  if (kind === 'vue') {
    const columns = selectedFields.filter((field) => field.tableVisible).map((field) => `  { key: '${field.name}', label: '${field.label}' }`).join(',\n')
    return `<script setup lang="ts">
import { ref } from 'vue'
import { DataTable, type Column } from '@/components/common'

interface ${entityName} {
${selectedFields.map((field) => `  ${field.name}${field.required ? '' : '?'}: ${tsType(field.type)}`).join('\n')}
}

const loading = ref(false)
const rows = ref<${entityName}[]>([])
const columns: Column<${entityName}>[] = [
${columns}
]
<\/script>

<template>
  <DataTable :columns="columns" :data="rows" :loading="loading" />
</template>`
  }

  return `package ${packageName}.domain;

public class ${entityName} {
${selectedFields.map((field) => `    /** ${field.label} */\n    private ${javaType(field.type)} ${field.name};`).join('\n\n')}
}`
}
function javaType(type: string) {
  return type === 'BigDecimal' ? 'java.math.BigDecimal' : type === 'LocalDate' ? 'java.time.LocalDate' : type === 'LocalDateTime' ? 'java.time.LocalDateTime' : type
}
function tsType(type: string) {
  if (['Long', 'Integer', 'BigDecimal'].includes(type)) return 'number'
  if (type === 'Boolean') return 'boolean'
  return 'string'
}

watch(selectedWorkflow, (workflow) => {
  if (!workflow) return
  const key = String(workflow.processKey || 'workflow_record').replace(/[^a-zA-Z0-9_/-]/g, '_')
  moduleForm.value.entityName = upperFirst(key.split(/[-_/]/).filter(Boolean).map(upperFirst).join('')) || moduleForm.value.entityName
  moduleForm.value.tableName = key.includes('_') ? key : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '')
  moduleForm.value.routePath = `/workflow/generated/${key.toLowerCase().replace(/_/g, '-')}`
})

onMounted(() => void fetchWorkflows())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"><Code2 class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />System Code</div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">源码生成</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">按模块、字段和已发布流程生成前后端代码草稿</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchWorkflows"><RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />刷新流程</Button>
        <Button @click="copyPreview"><Copy class="h-4 w-4" />复制预览</Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">已发布流程</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.workflows) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">字段数</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ formatNumber(summary.fields) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">查询字段</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ formatNumber(summary.searchable) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">表格字段</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.visible) }}</div></div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div class="space-y-4">
        <Panel title="生成配置">
          <template #icon><Settings2 class="h-4 w-4 text-slate-500" /></template>
          <div class="space-y-4">
            <label class="space-y-2"><span class="text-sm font-medium">流程来源</span><Select v-model="selectedWorkflowId" :options="workflowOptions" searchable /></label>
            <div v-if="selectedWorkflow" class="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-sm text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/25 dark:text-cyan-100">
              {{ selectedWorkflow.processName || selectedWorkflow.processKey }} · {{ selectedWorkflow.processKey || '-' }} · v{{ selectedWorkflow.version || 0 }}
            </div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <Input v-model="moduleForm.moduleName" label="模块名" />
              <Input v-model="moduleForm.packageName" label="包名" />
              <Input v-model="moduleForm.entityName" label="实体名" />
              <Input v-model="moduleForm.tableName" label="表名" />
              <Input v-model="moduleForm.pageName" label="页面组件" />
              <Input v-model="moduleForm.routePath" label="路由/API 基准路径" />
            </div>
          </div>
        </Panel>

        <Panel title="字段建模">
          <template #icon><Table2 class="h-4 w-4 text-slate-500" /></template>
          <template #actions><Button size="sm" variant="outline" @click="addField"><Plus class="h-3.5 w-3.5" />字段</Button></template>
          <div class="space-y-3">
            <Input v-model="keyword" placeholder="搜索字段">
              <template #prefix><Search class="h-4 w-4" /></template>
            </Input>
            <div class="space-y-2">
              <div v-for="field in filteredFields" :key="field.name" class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <Input v-model="field.name" label="字段名" />
                  <Input v-model="field.label" label="显示名" />
                  <label class="space-y-2"><span class="text-sm font-medium">类型</span><Select v-model="field.type" :options="typeOptions" /></label>
                  <div class="flex items-end justify-end gap-2">
                    <Button size="sm" variant="outline" @click="toggleField(fields.indexOf(field), 'required')"><StatusBadge :label="field.required ? '必填' : '可空'" :tone="field.required ? 'green' : 'slate'" /></Button>
                    <Button size="sm" variant="outline" @click="toggleField(fields.indexOf(field), 'searchable')"><StatusBadge :label="field.searchable ? '查询' : '不查'" :tone="field.searchable ? 'cyan' : 'slate'" /></Button>
                    <Button size="icon" variant="ghost" @click="removeField(fields.indexOf(field))"><Trash2 class="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="代码预览">
        <template #icon><FileCode2 class="h-4 w-4 text-slate-500" /></template>
        <template #actions>
          <div class="w-48"><Select v-model="activeFile" :options="fileOptions" /></div>
        </template>
        <div class="space-y-4">
          <div class="grid gap-3 md:grid-cols-3">
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="flex items-center gap-2 text-xs text-slate-500"><Layers class="h-3.5 w-3.5" />模块</div><div class="mt-1 font-semibold">{{ moduleForm.moduleName }}</div></div>
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="flex items-center gap-2 text-xs text-slate-500"><Database class="h-3.5 w-3.5" />表名</div><div class="mt-1 font-semibold">{{ moduleForm.tableName }}</div></div>
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div class="flex items-center gap-2 text-xs text-slate-500"><FileCode2 class="h-3.5 w-3.5" />文件</div><div class="mt-1 font-semibold">{{ previewTitle }}</div></div>
          </div>
          <TextArea :model-value="previewCode" readonly :rows="26" />
          <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs leading-6 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
            当前页面只生成代码草稿，不写入后端文件；后续接入独立代码生成 Controller 后可扩展为下载 ZIP 或提交生成任务。
          </div>
          <div class="flex justify-end"><Button variant="outline" @click="copyPreview"><Save class="h-4 w-4" />复制 {{ previewTitle }}</Button></div>
        </div>
      </Panel>
    </div>
  </div>
</template>
