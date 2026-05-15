export const WorkflowPermissions = {
  TEMPLATE_MANAGE: 'workflow:template:add',
  TEMPLATE_VIEW: 'workflow:template:list',
  TEMPLATE_USE: 'workflow:template:view',

  VERSION_VIEW: 'workflow:definition:view',
  VERSION_ROLLBACK: 'workflow:deploy:manage',

  EXPORT_OWN: 'workflow:definition:view',
  EXPORT_ALL: 'workflow:definition:view',
  IMPORT: 'workflow:import:manage',
  IMPORT_BATCH: 'workflow:import:manage',
  PROCESS_MANAGE: 'workflow:definition:list',
} as const;
