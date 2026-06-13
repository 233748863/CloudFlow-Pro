/**
 * CRM API 服务层 —— 聚合入口（barrel）
 *
 * 原 836 行单文件按业务域拆分为 ./crm/* 子模块，
 * 此处通过通配再导出保持对外类型兼容，同时组装出原 crmApi 对象以保证调用方零改动。
 */

export * from './crm/types';

import * as lead from './crm/lead';
import * as catalog from './crm/catalog';
import * as customer from './crm/customer';
import * as workspace from './crm/workspace';
import * as contact from './crm/contact';
import * as opportunity from './crm/opportunity';
import * as service from './crm/service';
import * as pool from './crm/pool';
import * as approval from './crm/approval';

export const crmApi = {
  // 线索
  listLeads: lead.listLeads,
  addLead: lead.addLead,
  editLead: lead.editLead,
  convertLead: lead.convertLead,
  removeLead: lead.removeLead,

  // 产品 / 价目表 / 销售目标
  listProducts: catalog.listProducts,
  addProduct: catalog.addProduct,
  editProduct: catalog.editProduct,
  removeProduct: catalog.removeProduct,
  listPriceBooks: catalog.listPriceBooks,
  addPriceBook: catalog.addPriceBook,
  editPriceBook: catalog.editPriceBook,
  removePriceBook: catalog.removePriceBook,
  listSalesTargets: catalog.listSalesTargets,
  addSalesTarget: catalog.addSalesTarget,
  editSalesTarget: catalog.editSalesTarget,
  removeSalesTarget: catalog.removeSalesTarget,

  // 客户 + 看板
  listCustomers: customer.listCustomers,
  addCustomer: customer.addCustomer,
  editCustomer: customer.editCustomer,
  removeCustomer: customer.removeCustomer,
  getCustomerWorkspace: customer.getCustomerWorkspace,
  getDashboardSummary: customer.getDashboardSummary,
  getDashboardWorkplace: customer.getDashboardWorkplace,

  // 客户工作台跨模块草稿
  createWorkspaceContractDraft: workspace.createWorkspaceContractDraft,
  createWorkspaceProjectDraft: workspace.createWorkspaceProjectDraft,
  createWorkspaceBudgetDraft: workspace.createWorkspaceBudgetDraft,
  createWorkspaceInvoiceDraft: workspace.createWorkspaceInvoiceDraft,
  bindWorkspaceInvoice: workspace.bindWorkspaceInvoice,
  voidWorkspaceInvoice: workspace.voidWorkspaceInvoice,
  confirmWorkspaceReceivable: workspace.confirmWorkspaceReceivable,

  // 联系人 + 跟进
  listContacts: contact.listContacts,
  addContact: contact.addContact,
  editContact: contact.editContact,
  removeContact: contact.removeContact,
  listFollowUps: contact.listFollowUps,
  addFollowUp: contact.addFollowUp,
  editFollowUp: contact.editFollowUp,
  removeFollowUp: contact.removeFollowUp,

  // 商机 + 报价
  listOpportunities: opportunity.listOpportunities,
  addOpportunity: opportunity.addOpportunity,
  editOpportunity: opportunity.editOpportunity,
  winOpportunity: opportunity.winOpportunity,
  loseOpportunity: opportunity.loseOpportunity,
  getOpportunityBoard: opportunity.getOpportunityBoard,
  updateOpportunityStage: opportunity.updateOpportunityStage,
  createProjectDraft: opportunity.createProjectDraft,
  removeOpportunity: opportunity.removeOpportunity,
  listQuotes: opportunity.listQuotes,
  getQuoteDetail: opportunity.getQuoteDetail,
  addQuote: opportunity.addQuote,
  editQuote: opportunity.editQuote,
  submitQuote: opportunity.submitQuote,
  sendQuote: opportunity.sendQuote,
  acceptQuote: opportunity.acceptQuote,
  expireQuote: opportunity.expireQuote,
  createContractDraft: opportunity.createContractDraft,
  removeQuote: opportunity.removeQuote,

  // 应收 + 续约 + 工单
  listReceivables: service.listReceivables,
  addReceivable: service.addReceivable,
  editReceivable: service.editReceivable,
  confirmReceivable: service.confirmReceivable,
  bindReceivableInvoice: service.bindReceivableInvoice,
  getReceivableAging: service.getReceivableAging,
  removeReceivable: service.removeReceivable,
  listRenewals: service.listRenewals,
  addRenewal: service.addRenewal,
  editRenewal: service.editRenewal,
  submitRenewal: service.submitRenewal,
  removeRenewal: service.removeRenewal,
  listTickets: service.listTickets,
  addTicket: service.addTicket,
  editTicket: service.editTicket,
  resolveTicket: service.resolveTicket,
  closeTicket: service.closeTicket,
  removeTicket: service.removeTicket,

  // 审批
  submitCustomerClaim: approval.submitCustomerClaim,
  submitCustomerLevelChange: approval.submitCustomerLevelChange,
  submitOpportunityDowngrade: approval.submitOpportunityDowngrade,
  submitRefund: approval.submitRefund,

  // 公海池 + 分配规则
  listCustomerPool: pool.listCustomerPool,
  listCustomerPoolLogs: pool.listCustomerPoolLogs,
  releaseCustomer: pool.releaseCustomer,
  claimCustomer: pool.claimCustomer,
  assignCustomer: pool.assignCustomer,
  triggerAutoRelease: pool.triggerAutoRelease,
  listAssignmentRules: pool.listAssignmentRules,
  addAssignmentRule: pool.addAssignmentRule,
  editAssignmentRule: pool.editAssignmentRule,
  removeAssignmentRule: pool.removeAssignmentRule,
};
