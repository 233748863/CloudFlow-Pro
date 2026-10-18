import type { ReactNode } from 'react';
import type { PortalContract, PortalContractTerm, PortalContractMilestone, PortalContractPayment } from '@/services/portalContractTypes';
import { portalContractMoney, portalTermStatus, portalMilestoneStatus, portalPaymentStatus } from '@/utils/portalContractDisplay';
import './contract-portal.css';

const termCategories: Record<string, string> = { DELIVERY: '交付', PAYMENT: '付款', SERVICE: '服务', QUALITY: '质量', CONFIDENTIALITY: '保密', IP: '知识产权', OTHER: '其他' };
const parties: Record<string, string> = { OUR: '门户所属企业', COUNTERPARTY: '合同相对方', BOTH: '双方' };
const milestoneTypes: Record<string, string> = { DELIVERY: '交付', PAYMENT: '付款', ACCEPTANCE: '验收', OTHER: '其他' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-cf-muted">{label}</dt><dd className="mt-1">{children || '未填写'}</dd></div>;
}

export function ContractTermContent({ term }: { term: PortalContractTerm }) {
  return <div className="contract-public-content space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">条款 {term.termNo} · {termCategories[term.termCategory] || '其他'}</p><span className="text-xs text-cf-muted">{portalTermStatus(term.status)}</span></div>
    <p className="whitespace-pre-wrap">{term.termContent}</p>
    <div><p className="text-xs text-cf-muted">履约要求</p><p className="mt-1 whitespace-pre-wrap">{term.requirement || '未填写'}</p></div>
    <dl className="contract-public-grid"><Field label="责任方">{parties[term.responsibleParty] || '待核对'}</Field><Field label="履约期限">{term.deadlineDate}</Field><Field label="履约日期">{term.fulfilledDate}</Field></dl>
  </div>;
}

export function ContractMilestoneContent({ milestone }: { milestone: PortalContractMilestone }) {
  return <div className="contract-public-content space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">节点 {milestone.milestoneNo} · {milestone.milestoneName}</p><span className="text-xs text-cf-muted">{portalMilestoneStatus(milestone.status)}</span></div>
    <dl className="contract-public-grid"><Field label="节点类型">{milestoneTypes[milestone.milestoneType] || '其他'}</Field><Field label="金额">{portalContractMoney(milestone.amount, milestone.currency)}</Field><Field label="计划日期">{milestone.plannedDate}</Field><Field label="实际日期">{milestone.actualDate}</Field></dl>
  </div>;
}

export function ContractPaymentContent({ payment }: { payment: PortalContractPayment }) {
  return <div className="contract-public-content space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">计划 {payment.paymentNo} · {payment.paymentName}</p><span className="text-xs text-cf-muted">{portalPaymentStatus(payment.status)}</span></div>
    <dl className="contract-public-grid"><Field label="计划金额">{portalContractMoney(payment.amount, payment.currency)}</Field><Field label="实际金额">{portalContractMoney(payment.actualAmount, payment.currency)}</Field><Field label="计划日期">{payment.planDate}</Field><Field label="实际日期">{payment.actualDate}</Field></dl>
  </div>;
}

export default function PortalContractContent({ contract }: { contract: PortalContract }) {
  return <div className="space-y-6">
    <section aria-label="公开履约条款"><h3 className="font-semibold">履约条款</h3><div className="mt-3 space-y-3">{contract.terms.map(term => <article className="contract-public-item" key={term.termId}><ContractTermContent term={term} /></article>)}</div>{!contract.terms.length && <p className="mt-3 text-sm text-cf-muted">暂无已公开的履约条款。</p>}</section>
    <section aria-label="公开关键节点"><h3 className="font-semibold">关键节点</h3><div className="mt-3 space-y-3">{contract.milestones.map(milestone => <article className="contract-public-item" key={milestone.id}><ContractMilestoneContent milestone={milestone} /></article>)}</div>{!contract.milestones.length && <p className="mt-3 text-sm text-cf-muted">暂无已公开的关键节点。</p>}</section>
    <section aria-label="公开付款计划"><h3 className="font-semibold">付款计划</h3><div className="mt-3 space-y-3">{contract.paymentSchedules.map(payment => <article className="contract-public-item" key={payment.id}><ContractPaymentContent payment={payment} /></article>)}</div>{!contract.paymentSchedules.length && <p className="mt-3 text-sm text-cf-muted">暂无已公开的付款计划。</p>}</section>
  </div>;
}
