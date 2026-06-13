/**
 * 工作流 API 服务层 —— 聚合入口（barrel）
 *
 * 原 1256 行单文件按业务域拆分为 ./workflow/* 子模块，
 * 此处通过通配再导出保持对外 API 兼容（命名导入 + default 整体导入均不变）。
 */

export * from "./workflow/types";
export * from "./workflow/instance";
export * from "./workflow/task";
export * from "./workflow/definition";
export * from "./workflow/form";
export * from "./workflow/users";
export * from "./workflow/copy";
export * from "./workflow/flowchart";
export * from "./workflow/import-export";
export * from "./workflow/batch";
export * from "./workflow/simulation";
export * from "./workflow/hot-update";

import {
  startProcess,
  getProcessInstance,
  getProcessTrace,
  getMyInstances,
  recallProcess,
  pauseProcess,
  resumeProcess,
  invalidateProcess,
} from "./workflow/instance";
import {
  getTodoTasks,
  getDoneTasks,
  completeTask,
  readTask,
  urgeTask,
  rejectTask,
  getTasksCount,
  getTaskStatistics,
  getTaskGroups,
  addSign,
  removeSign,
  delegateTask,
} from "./workflow/task";
import {
  getProcessDefinitions,
  getProcessDefinition,
  saveProcessDefinition,
  deployProcessDefinition,
  deleteProcessDefinition,
} from "./workflow/definition";
import {
  getFormDefinitions,
  getFormDefinition,
  saveFormDefinition,
} from "./workflow/form";
import { getUsers, getRoles } from "./workflow/users";
import {
  getMyCopyList,
  getCopyUnreadCount,
  markCopyAsRead,
  batchMarkCopyAsRead,
} from "./workflow/copy";
import {
  getFlowchartData,
  getFlowchartStructure,
} from "./workflow/flowchart";
import {
  exportWorkflow,
  exportWorkflows,
  validateImportFile,
  importWorkflow,
  importWorkflows,
} from "./workflow/import-export";
import {
  archiveWorkflows,
  checkOperationSafety,
  getArchivedWorkflows,
  restoreWorkflows,
  permanentDeleteWorkflows,
} from "./workflow/batch";
import { simulateProcess, validateDefinition } from "./workflow/simulation";
import {
  analyzeHotUpdate,
  prepareHotUpdate,
  executeHotUpdate,
  getHotUpdateHistory,
} from "./workflow/hot-update";

export default {
  startProcess,
  getProcessInstance,
  getProcessTrace,
  getMyInstances,

  getTodoTasks,
  getDoneTasks,
  completeTask,
  readTask,
  urgeTask,
  rejectTask,
  getTasksCount,
  getTaskStatistics,
  getTaskGroups,

  recallProcess,
  pauseProcess,
  resumeProcess,

  getProcessDefinitions,
  getProcessDefinition,
  saveProcessDefinition,
  deployProcessDefinition,
  deleteProcessDefinition,

  getFormDefinitions,
  getFormDefinition,
  saveFormDefinition,

  getUsers,
  getRoles,

  getMyCopyList,
  getCopyUnreadCount,
  markCopyAsRead,
  batchMarkCopyAsRead,

  addSign,
  removeSign,
  delegateTask,
  getFlowchartData,
  getFlowchartStructure,
  invalidateProcess,

  exportWorkflow,
  exportWorkflows,
  validateImportFile,
  importWorkflow,
  importWorkflows,

  archiveWorkflows,
  checkOperationSafety,
  getArchivedWorkflows,
  restoreWorkflows,
  permanentDeleteWorkflows,

  simulateProcess,
  validateDefinition,

  analyzeHotUpdate,
  prepareHotUpdate,
  executeHotUpdate,
  getHotUpdateHistory,
};
