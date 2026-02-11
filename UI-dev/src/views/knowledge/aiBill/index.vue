<template>
  <div class="layout-padding">
    <div class="layout-padding-auto layout-padding-view">

      <!-- 顶部折线图-->
      <bill-line-chart/>

      <el-row v-show="showSearch">
        <el-form :model="state.queryForm" ref="queryRef" :inline="true" @keyup.enter="getDataList">
          <el-form-item label="用户名" prop="username">
            <el-input placeholder="请输入用户名" v-model="state.queryForm.username"/>
          </el-form-item>
          <el-form-item label="系统调用" prop="tokenType">
            <el-radio-group v-model="state.queryForm.tokenType">
              <el-radio :key="index" :label="item.value" border v-for="(item, index) in yes_no_type">{{
                  item.label
                }}
              </el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button icon="search" type="primary" @click="getDataList">
              查询
            </el-button>
            <el-button icon="Refresh" @click="resetQuery">重置</el-button>
          </el-form-item>
        </el-form>
      </el-row>
      <el-row>
        <div class="mb8" style="width: 100%">
          <el-button plain :disabled="multiple" icon="Delete" type="primary"
                     v-auth="'knowledge_aiBill_del'" @click="handleDelete(selectObjs)">
            删除
          </el-button>
          <right-toolbar v-model:showSearch="showSearch" :export="'knowledge_aiBill_export'"
                         @exportExcel="exportExcel" class="ml10 mr20" style="float: right;"
                         @queryTable="getDataList"></right-toolbar>
        </div>
      </el-row>
      <el-table :data="state.dataList" v-loading="state.loading" border
                :cell-style="tableStyle.cellStyle" :header-cell-style="tableStyle.headerCellStyle"
                @selection-change="selectionChangHandle"
                @sort-change="sortChangeHandle">
        <el-table-column type="selection" width="40" align="center"/>
        <el-table-column type="index" label="#" width="40"/>
        <el-table-column prop="createBy" label="用户名" show-overflow-tooltip/>
        <el-table-column prop="model" label="模型名称" show-overflow-tooltip/>
        <el-table-column prop="tokens" label="tokens" sortable="custom" show-overflow-tooltip/>
        <el-table-column prop="promptTokens" label="prompt tokens" show-overflow-tooltip/>
        <el-table-column prop="completionTokens" label="completion" show-overflow-tooltip/>
        <el-table-column prop="ip" label="IP地址" show-overflow-tooltip/>
        <el-table-column prop="tokenType" label="系统调用" show-overflow-tooltip>
          <template #default="scope">
            <dict-tag :options="yes_no_type" :value="scope.row.tokenType"></dict-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="调用时间" show-overflow-tooltip/>
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button icon="delete" text type="primary" v-auth="'knowledge_aiBill_del'"
                       @click="handleDelete([scope.row.id])">删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" v-bind="state.pagination"/>
    </div>

    <!-- 编辑、新增  -->
    <form-dialog ref="formDialogRef" @refresh="getDataList(false)"/>

  </div>
</template>

<script setup lang="ts" name="systemAiBill">
import {BasicTableProps, useTable} from "/@/hooks/table";
import {fetchList, delObjs} from "/@/api/knowledge/aiBill";
import {useMessage, useMessageBox} from "/@/hooks/message";
import {useDict} from '/@/hooks/dict';

// 引入组件
const FormDialog = defineAsyncComponent(() => import('./form.vue'));
const BillLineChart = defineAsyncComponent(() => import('./line-chart.vue'));

// 定义查询字典

const {yes_no_type} = useDict('yes_no_type')
// 定义变量内容
const formDialogRef = ref()
// 搜索变量
const queryRef = ref()
const showSearch = ref(true)
// 多选变量
const selectObjs = ref([]) as any
const multiple = ref(true)

const state: BasicTableProps = reactive<BasicTableProps>({
  queryForm: {},
  pageList: fetchList,
  descs: ['create_time']
})

//  table hook
const {
  getDataList,
  currentChangeHandle,
  sizeChangeHandle,
  sortChangeHandle,
  downBlobFile,
  tableStyle
} = useTable(state)

// 清空搜索条件
const resetQuery = () => {
  // 清空搜索条件
  queryRef.value?.resetFields()
  // 清空多选
  selectObjs.value = []
  getDataList()
}

// 导出excel
const exportExcel = () => {
  downBlobFile('/knowledge/aiBill/export', Object.assign(state.queryForm, {ids: selectObjs}), 'aiBill.xlsx')
}

// 多选事件
const selectionChangHandle = (objs: { id: string }[]) => {
  selectObjs.value = objs.map(({id}) => id);
  multiple.value = !objs.length;
};

// 删除操作
const handleDelete = async (ids: string[]) => {
  try {
    await useMessageBox().confirm('此操作将永久删除');
  } catch {
    return;
  }

  try {
    await delObjs(ids);
    getDataList();
    useMessage().success('删除成功');
  } catch (err: any) {
    useMessage().error(err.msg);
  }
};
</script>
