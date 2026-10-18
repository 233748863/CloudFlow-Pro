"""Retire broken legacy fixtures from 06 during a fresh development seed only.

Never applied to a live business database. New deterministic fixtures are excluded
from every statement: their defects must be fixed in the generator. Missing
optional links become NULL; rows lacking a required parent are retired. Three
ordered passes cover the legacy dependency chains; the separate audit must pass.
"""
from demo_seed_model import DB, schema, relationships, POLYMORPHIC, TARGET_KEYS, parent_match, reconcile_match

MODEL = schema()
INDEX = {name: i+1 for i,name in enumerate(sorted(MODEL))}


def legacy(table):
    definition = MODEL[table]
    keys = []
    for key in definition['primary']:
        kind = definition['columns'][key]['type']
        if kind.startswith(('char','varchar','text')):
            keys.append(f"s.`{key}` NOT LIKE 'demo50\\_%'")
        else:
            # Composite relation rows have no independent generated identifier.
            parent = {'user_id':'sys_user','role_id':'sys_role','post_id':'sys_post','menu_id':'sys_menu'}.get(key,table) if len(definition['primary'])>1 else table
            keys.append(f"s.`{key}`<{1000000+INDEX[parent]*100000}")
            if parent == 'sys_menu':
                keys.append(f"s.`{key}` NOT BETWEEN 3000 AND 3049")
    if table == 'sys_audit_archive_policy':
        keys.append('s.id NOT BETWEEN 3500 AND 3549')
    if table in ('sys_user','sys_role','sys_tenant'):
        return '0=1'  # Preserve foundational identities unconditionally.
    if 'tenant_id' in definition['columns']:
        keys.append('s.tenant_id=100000')
    return ' AND '.join(keys)


def statement(table,column,target,key,zero=False,where='1=1'):
    valid = f"s.`{column}` IS NOT NULL AND CAST(s.`{column}` AS CHAR)<>''"
    if zero:
        valid += f" AND CAST(s.`{column}` AS CHAR)<>'0'"
    join = f"`{table}` s LEFT JOIN `{target}` p ON {parent_match(MODEL,table,column,target,key)}"
    predicate = f"{legacy(table)} AND ({where}) AND {valid} AND p.`{key}` IS NULL"
    if MODEL[table]['columns'][column]['nullable'] and column not in MODEL[table]['primary']:
        return f"UPDATE {join} SET s.`{column}`=NULL WHERE {predicate};"
    return f"DELETE s FROM {join} WHERE {predicate};"


def sql():
    refs,unknown = relationships(MODEL)
    if unknown:
        raise ValueError(unknown)
    # These old operator names can be resolved exactly to the same tenant's user.
    out = ['-- Legacy fixture retirement: fresh 01-07 initialization only.']
    for table,column in [('wf_template','created_by'),('wf_template_archive','archived_by'),('wf_hot_update_record','executed_by')]:
        out.append(f"UPDATE `{table}` s JOIN sys_user p ON p.user_name=s.`{column}` AND p.tenant_id=s.tenant_id SET s.`{column}`=CAST(p.user_id AS CHAR) WHERE {legacy(table)};")
    # Former event labels mixed several incompatible entity IDs and are obsolete.
    out.append("DELETE s FROM wf_transaction_message s WHERE " + legacy('wf_transaction_message') + " AND s.business_type IN ('ANNOUNCEMENT','DUTY_NOTICE','SYS_NOTICE','TASK_REMINDER','WORKFLOW_DEPLOY','WORKFLOW_NOTIFY','WORKFLOW_ROLLBACK');")
    statements = [statement(**ref) for ref in refs if ref['table'] != 'wf_audit_log']
    source = (DB / '06.cloudflow-business-seed.sql').read_text(encoding='utf-8-sig').upper()
    for (table,column),(discriminator,targets) in POLYMORPHIC.items():
        if table == 'wf_audit_log':
            continue  # Immutable audit fixtures must be correct at their source.
        # Restrict to values actually present in the old seed to keep SQL compact.
        for value,target in targets.items():
            if "'"+value+"'" not in source:
                continue
            statements.append(statement(table,column,target,TARGET_KEYS.get(target,MODEL[target]['primary'][0]),
                where=f"UPPER(CAST(s.`{discriminator}` AS CHAR))='{value}'"))
    statements.append('DELETE s FROM wf_reconcile_alert s WHERE '+legacy('wf_reconcile_alert')+' AND NOT '+reconcile_match(MODEL)+';')
    for index in range(3):
        out.append(f'-- Legacy dependency pass {index+1}; no generated fixture can match.')
        out.extend(statements)
    return '\n'.join(out)
