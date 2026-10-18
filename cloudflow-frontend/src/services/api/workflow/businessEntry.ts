export interface WorkflowBusinessEntry {
  path: string;
  permission: string;
  label: string;
}

const businessEntries = new Map<string, WorkflowBusinessEntry>([
  ['overtime_request', { path: '/hr/ess/overtime', permission: 'hr:overtime:mine', label: '我的加班' }],
  ['hr_shift_request', { path: '/hr/ess/shift-requests', permission: 'hr:shift-request:mine', label: '我的调班' }],
  ['oa_consumable_request', { path: '/admin/consumable-request', permission: 'oa:consumable-request:list', label: '耗材领用' }],
]);

export function getWorkflowBusinessEntry(processKey?: string): WorkflowBusinessEntry | null {
  return businessEntries.get(processKey?.trim() || '') || null;
}
