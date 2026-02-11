<template>
  <div class="panel-content">
    <!-- 变量列表区域 -->
    <div class="panel-section">
      <div class="panel-header flex justify-between items-center">
        <span>变量列表</span>
        <el-button type="primary" size="small" @click="addOutput">
          <el-icon>
            <Plus/>
          </el-icon>
          添加
        </el-button>
      </div>

      <div class="params-list">
        <div v-for="(param, index) in inputParams" :key="index" class="mb-2">
          <div class="param-item">
            <div class="flex justify-between items-center">
              <div>
                <div>
                  <el-tag type="primary" size="small">
                    {{ getInputTypeLabel(param.inputType) }}
                  </el-tag>
                  <el-text>
                    ｜
                  </el-text>
                  <el-tag :type="param.required ? 'danger' : 'info'" size="small">
                    {{ param.required ? '必填' : '选填' }}
                  </el-tag>
                  <el-text>
                    ｜
                  </el-text>
                  <el-text>
                    {{ param.name }} ({{ param.type }})
                  </el-text>
                </div>
              </div>
              <div v-if="!param.disabled" class="flex gap-2">
                <el-button type="primary" size="small" @click="editParam(index)">
                  <el-icon>
                    <Edit/>
                  </el-icon>
                </el-button>
                <el-button size="small" @click="removeOutput(index)">
                  <el-icon>
                    <Delete/>
                  </el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 变量编辑对话框 -->
    <el-dialog
        v-model="editDialogVisible"
        :title="isEdit ? '编辑变量' : '添加变量'"
        width="600px"
        destroy-on-close
    >
      <el-form
          ref="paramForm"
          :model="editingParam"
          :rules="rules"
          label-position="top"
      >
        <el-form-item label="显示名称" prop="name">
          <el-input v-model="editingParam.name" placeholder="请输入显示名称"/>
        </el-form-item>

        <el-form-item label="变量名" prop="type">
          <el-input v-model="editingParam.type" placeholder="请输入变量名"/>
        </el-form-item>

        <el-form-item label="输入类型" prop="inputType">
          <el-select
              v-model="editingParam.inputType"
              class="w-full"
              @change="handleEditInputTypeChange"
          >
            <el-option
                v-for="item in inputTypeDict"
                :key="item.value"
                :label="item.label"
                :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="是否必填" prop="required">
          <el-select v-model="editingParam.required" class="w-full">
            <el-option :value="false" label="否"/>
            <el-option :value="true" label="是"/>
          </el-select>
        </el-form-item>

        <!-- 选项编辑表单 -->
        <template v-if="editingParam.inputType==='select'">
          <el-divider content-position="left">选项配置</el-divider>
          <div class="options-list">
            <div v-for="(option, index) in editingParam.editingOptions" :key="index" class="mb-2">
              <el-row :gutter="12">
                <el-col :span="9">
                  <el-form-item
                      :prop="'editingOptions.' + index + '.label'"
                      :rules="{ required: true, message: '请输入选项名称', trigger: 'blur' }"
                  >
                    <el-input v-model="option.label" placeholder="请输入选项名称"/>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item
                      :prop="'editingOptions.' + index + '.value'"
                      :rules="{ required: true, message: '请输入选项值', trigger: 'blur' }"
                  >
                    <el-input v-model="option.value" placeholder="请输入选项值"/>
                  </el-form-item>
                </el-col>
                <el-col :span="3">
                  <el-button @click="removeOption(index)">
                    <el-icon>
                      <Delete/>
                    </el-icon>
                  </el-button>
                </el-col>
              </el-row>
            </div>
            <el-button type="primary" @click="addOption">
              <el-icon>
                <Plus/>
              </el-icon>
              添加选项
            </el-button>
          </div>
        </template>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSave">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {Plus, Delete, Edit} from '@element-plus/icons-vue'
import common from './common.ts'

export default {
  name: 'StartPanel',
  components: {
    Plus,
    Delete,
    Edit
  },
  mixins: [common],
  data() {
    return {
      inputTypeDict: [
        {label: '输入框', value: 'input'},
        {label: '下拉框', value: 'select'},
        {label: '数字框', value: 'number'},
        {label: '文本框', value: 'textarea'},
      ],
      editDialogVisible: false,
      editingParam: {
        name: '',
        type: '',
        value: '',
        required: false,
        inputType: 'input',
        options: [],
        editingOptions: []
      },
      isEdit: false,
      rules: {
        name: [
          {required: true, message: '请输入显示名称', trigger: 'blur'},
          {min: 2, max: 20, message: '长度在 2 到 20 个字符', trigger: 'blur'}
        ],
        type: [
          {required: true, message: '请输入变量名', trigger: 'blur'},
          {
            pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/,
            message: '变量名只能包含字母、数字和下划线，且必须以字母开头',
            trigger: 'blur'
          }
        ],
        inputType: [
          {required: true, message: '请选择输入类型', trigger: 'change'}
        ],
        required: [
          {required: true, message: '请选择是否必填', trigger: 'change'}
        ]
      }
    }
  },
  mounted() {
    this.updateOutputParams()
  },
  methods: {
    addOutput() {
      this.isEdit = false
      this.editingParam = {
        name: '',
        type: '',
        value: '',
        required: false,
        inputType: 'input',
        options: [],
        editingOptions: []
      }
      this.editDialogVisible = true
    },
    editParam(index) {
      this.isEdit = true
      this.editingParamIndex = index
      const param = {...this.inputParams[index]}
      param.editingOptions = [...(param.options || [])].map(opt => ({...opt}))
      this.editingParam = param
      this.editDialogVisible = true
    },
    saveParam() {
      if (this.isEdit) {
        this.inputParams[this.editingParamIndex] = {...this.editingParam}
      } else {
        this.inputParams.push({...this.editingParam})
      }
      this.editDialogVisible = false
    },
    handleEditInputTypeChange() {
      if (this.editingParam.inputType === 'select' && (!this.editingParam.options || this.editingParam.options.length === 0)) {
        this.editingParam.options = []
      }
    },
    removeOutput(index) {
      this.inputParams.splice(index, 1)
    },
    updateOutputParams() {
      const outputParams = this.inputParams.map(param => ({
        name: param.type || '',
        type: param.type || '',
        value: '',
        required: param.required || false,
        inputType: param.inputType || 'input',
        options: param.options || []
      }))

      if (this.node) {
        this.node.outputParams = outputParams
      }
    },
    handleSave() {
      this.$refs.paramForm.validate(async (valid) => {
        if (valid) {
          if (this.editingParam.inputType === 'select') {
            this.editingParam.options = [...this.editingParam.editingOptions]
          }

          if (this.isEdit) {
            this.inputParams[this.editingParamIndex] = {...this.editingParam}
          } else {
            this.inputParams.push({...this.editingParam})
          }
          this.editDialogVisible = false
        } else {
          return false
        }
      })
    },
    addOption() {
      this.editingParam.editingOptions.push({
        label: '',
        value: ''
      })
    },
    removeOption(index) {
      this.editingParam.editingOptions.splice(index, 1)
    },
    getInputTypeLabel(type) {
      const found = this.inputTypeDict.find(item => item.value === type)
      return found ? found.label : '输入框'
    }
  },
  watch: {
    inputParams: {
      handler() {
        this.updateOutputParams()
      },
      deep: true
    }
  }
}
</script>

<style>
/* 组件特定样式可以在这里添加 */
</style>
