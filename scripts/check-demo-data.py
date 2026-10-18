"""Read-only table coverage and explicitly classified relationship checks.

NULL optional links are permitted. Existing non-null links must resolve in the
same tenant; root parent IDs may be zero. Business IDs use their discriminator.
External provider identifiers and event keys are classified in demo_seed_model.
This does not run service workflows, performance tests or external integrations.
"""
import argparse
import json
from demo_seed_model import schema, relationships, POLYMORPHIC, TARGET_KEYS, parent_match, reconcile_match
from demo_seed_server import connect


def audit(db):
    model = schema()
    refs, unknown = relationships(model)
    if unknown:
        raise RuntimeError("Unclassified relationships: " + repr(unknown))
    failures, counts = [], {}
    checked = 0
    with db.cursor() as cursor:
        cursor.execute("SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'")
        tables = sorted(row[0] for row in cursor.fetchall())
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
            counts[table] = cursor.fetchone()[0]
        for name in ("sys_log_archive", "sys_api_error_log_archive"):
            source = name.removesuffix("_archive")
            if name in tables:
                model[name] = model[source]
                refs += [dict(ref, table=name) for ref in refs.copy() if ref["table"] == source]

        def check(table, column, target, key, where="1=1", zero=False):
            nonlocal checked
            valid = f"s.`{column}` IS NOT NULL AND CAST(s.`{column}` AS CHAR)<>''"
            if zero:
                valid += f" AND CAST(s.`{column}` AS CHAR)<>'0'"
            # Leave the target key intact so MySQL can use its index.
            sql = (f"SELECT COUNT(*) FROM `{table}` s WHERE ({where}) AND {valid} "
                   f"AND NOT EXISTS(SELECT 1 FROM `{target}` p WHERE {parent_match(model,table,column,target,key)})")
            cursor.execute(sql)
            bad = cursor.fetchone()[0]
            checked += 1
            if bad:
                failures.append(dict(table=table, column=column, target=target, where=where, invalid_rows=bad))

        for ref in refs:
            check(**ref)
        for (table, column), (discriminator, targets) in POLYMORPHIC.items():
            if discriminator not in model[table]["columns"]:
                raise RuntimeError(f"Invalid discriminator {table}.{discriminator}")
            cursor.execute(f"SELECT DISTINCT UPPER(CAST(`{discriminator}` AS CHAR)) FROM `{table}` WHERE `{column}` IS NOT NULL AND CAST(`{column}` AS CHAR) NOT IN ('','0')")
            values = [row[0] for row in cursor.fetchall()]
            for value in values:
                target = targets.get(value)
                if not target:
                    # Certain documented non-table scopes have an opaque code.
                    if table == "crm_sla_policy" and value in {"CUSTOMER_LEVEL", "INDUSTRY"}:
                        continue
                    failures.append(dict(table=table, column=column, invalid_type=value))
                    continue
                check(table, column, target, TARGET_KEYS.get(target, model[target]["primary"][0]),
                      f"UPPER(CAST(s.`{discriminator}` AS CHAR))={db.escape(value)}")
        # These checks compare independent business sources, not generated IDs.
        invariants = {
            'reconcile_business_instance': 'SELECT COUNT(*) FROM wf_reconcile_alert s WHERE NOT ' + reconcile_match(model),
            'portal_contact_customer': 'SELECT COUNT(*) FROM sys_portal_user s JOIN crm_contact c ON c.contact_id=s.ref_biz_id AND c.tenant_id=s.tenant_id WHERE s.customer_id<>c.customer_id',
            'purchase_receipt_chain': 'SELECT COUNT(*) FROM biz_purchase_receipt r JOIN biz_purchase_item i ON i.id=r.item_id AND i.tenant_id=r.tenant_id WHERE r.purchase_id<>i.purchase_id OR r.consumable_id<>i.consumable_id OR r.received_quantity<=0',
            'purchase_line_amount': 'SELECT COUNT(*) FROM biz_purchase_item WHERE amount<>ROUND(quantity*unit_price,2) OR received_quantity<0 OR received_quantity>quantity',
            'purchase_received_quantity': 'SELECT COUNT(*) FROM biz_purchase_item i WHERE COALESCE(i.received_quantity,0)<>(SELECT COALESCE(SUM(r.received_quantity),0) FROM biz_purchase_receipt r WHERE r.tenant_id=i.tenant_id AND r.item_id=i.id)',
            'purchase_total_amount': 'SELECT COUNT(*) FROM biz_purchase_request p WHERE p.total_amount<>(SELECT COALESCE(SUM(i.amount),0) FROM biz_purchase_item i WHERE i.tenant_id=p.tenant_id AND i.purchase_id=p.id)',
            'stock_ledger_totals': 'SELECT COUNT(*) FROM oa_consumable c WHERE c.quantity<>(SELECT COALESCE(SUM(l.quantity),0) FROM oa_consumable_ledger l WHERE l.tenant_id=c.tenant_id AND l.consumable_id=c.consumable_id) OR c.stock_amount<>(SELECT COALESCE(SUM(l.amount),0) FROM oa_consumable_ledger l WHERE l.tenant_id=c.tenant_id AND l.consumable_id=c.consumable_id) OR c.avg_cost<>IF(c.quantity=0,0,ROUND(c.stock_amount/c.quantity,2))',
            'stock_ledger_source': "SELECT COUNT(*) FROM oa_consumable_ledger l JOIN biz_purchase_receipt r ON r.id=l.source_biz_id AND r.tenant_id=l.tenant_id JOIN biz_purchase_item i ON i.id=r.item_id AND i.tenant_id=r.tenant_id WHERE l.source_biz_type='PURCHASE_RECEIPT' AND (l.source_item_id<>i.id OR l.consumable_id<>r.consumable_id OR l.quantity<>r.received_quantity OR l.amount<>ROUND(l.quantity*i.unit_price,2))",
            'stock_generic_log': "SELECT COUNT(*) FROM oa_consumable_ledger l JOIN oa_asset_log a ON a.log_id=l.asset_log_id AND a.tenant_id=l.tenant_id WHERE a.ref_type<>'2' OR a.ref_id<>l.consumable_id OR a.quantity_change<>l.quantity",
            'opportunity_line_amount': 'SELECT COUNT(*) FROM crm_opportunity_item WHERE line_amount<>ROUND(quantity*unit_price*discount_rate/100,2) OR tax_amount<>ROUND(line_amount*tax_rate/100,2)',
            'deal_allocation_totals': 'SELECT COUNT(*) FROM crm_deal_event e WHERE e.amount<>(SELECT COALESCE(SUM(a.allocated_amount),0) FROM crm_deal_allocation a WHERE a.tenant_id=e.tenant_id AND a.event_id=e.event_id)',
            'deal_team_snapshot': 'SELECT COUNT(*) FROM crm_deal_allocation a JOIN crm_deal_event e ON e.event_id=a.event_id AND e.tenant_id=a.tenant_id WHERE NOT EXISTS(SELECT 1 FROM crm_deal_team t WHERE t.tenant_id=e.tenant_id AND t.biz_type=e.biz_type AND t.biz_id=e.biz_id AND t.team_version=e.team_version AND t.sales_user_id=a.sales_user_id AND t.allocated_percentage=a.allocated_percentage AND t.role_type=a.role_type)',
            'message_delivery_source': 'SELECT COUNT(*) FROM sys_message_delivery d JOIN sys_message_record r ON r.record_id=d.record_id AND r.tenant_id=d.tenant_id WHERE NOT(d.outbox_event_id<=>r.outbox_event_id) OR d.channel_type<>r.channel_type',
            'settlement_amounts': 'SELECT COUNT(*) FROM hr_final_settlement WHERE net_amount<>total_payable-total_receivable-asset_recovery_cost+severance_amount',
            'settlement_detail_totals': "SELECT COUNT(*) FROM hr_final_settlement s WHERE s.total_receivable<>(SELECT COALESCE(SUM(i.amount),0) FROM hr_final_settlement_item i WHERE i.tenant_id=s.tenant_id AND i.settlement_id=s.settlement_id AND i.item_type='RECEIVABLE')",
            'settlement_training_source': "SELECT COUNT(*) FROM hr_final_settlement_item i JOIN hr_training_recovery r ON r.recovery_id=i.source_biz_id AND r.tenant_id=i.tenant_id JOIN hr_final_settlement s ON s.settlement_id=i.settlement_id AND s.tenant_id=i.tenant_id WHERE i.source_biz_type='HR_TRAINING_RECOVERY' AND (s.employee_id<>r.employee_id OR r.status<>'CONFIRMED' OR i.amount<>r.assessed_amount-r.collected_amount)",
            'workflow_draft_form': 'SELECT COUNT(*) FROM wf_form_draft d JOIN wf_process_definition p ON p.definition_id=d.definition_id AND p.tenant_id=d.tenant_id WHERE NOT(d.form_id<=>p.form_id)',
            'workflow_gateway_branch': "SELECT COUNT(*) FROM wf_parallel_join j JOIN wf_gateway_activation a ON a.activation_id=j.activation_id AND a.tenant_id=j.tenant_id WHERE j.instance_id<>a.instance_id OR j.gateway_id<>a.gateway_id OR j.join_type<>a.join_type OR j.expected_count<>a.expected_count OR NOT JSON_CONTAINS(a.activated_branches,JSON_QUOTE(j.branch_key)) OR a.expected_count<>JSON_LENGTH(a.activated_branches)",
            'disabled_integrations': "SELECT (SELECT COUNT(*) FROM sys_im_config WHERE status<>'DISABLED' OR sync_enabled<>0 OR login_enabled<>0 OR message_enabled<>0 OR todo_enabled<>0)+(SELECT COUNT(*) FROM sys_data_source_config WHERE status<>'DISABLED')+(SELECT COUNT(*) FROM sys_oauth2_client WHERE status<>'DISABLED')",
            'safe_delivery_fixtures': "SELECT (SELECT COUNT(*) FROM sys_message_delivery WHERE status NOT IN ('SKIPPED','CANCELLED'))+(SELECT COUNT(*) FROM crm_mass_email_recipient WHERE status NOT IN ('SKIPPED','CANCELLED'))+(SELECT COUNT(*) FROM crm_email_record WHERE send_status<>'DRAFT' OR send_time IS NOT NULL)",
            'official_2026_calendars': "SELECT COUNT(*) FROM sys_holiday_calendar c LEFT JOIN (SELECT d.calendar_id,COUNT(*) total,SUM(template.date_id IS NOT NULL AND d.date_type=template.date_type AND d.triple_pay_flag=template.triple_pay_flag) matched FROM sys_holiday_date d LEFT JOIN sys_holiday_date template ON template.calendar_id=100 AND template.year_no=2026 AND template.holiday_date=d.holiday_date WHERE d.year_no=2026 GROUP BY d.calendar_id) dates ON dates.calendar_id=c.calendar_id WHERE c.tenant_id BETWEEN 100000 AND 100049 AND (COALESCE(dates.total,0)<>28 OR COALESCE(dates.matched,0)<>28)",
        }
        for name, sql in invariants.items():
            cursor.execute(sql)
            bad = cursor.fetchone()[0]
            checked += 1
            if bad:
                failures.append(dict(invariant=name, invalid_rows=bad))
    expected = set(schema()) | {"sys_log_archive", "sys_api_error_log_archive"}
    return dict(tables=len(tables), rows=sum(counts.values()), empty_tables=[t for t,c in counts.items() if not c],
                missing_tables=sorted(expected-set(tables)), unexpected_tables=sorted(set(tables)-expected),
                relationship_checks=checked, failures=failures)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=80)
    args = parser.parse_args()
    ssh, db, _ = connect()
    try:
        result = audit(db)
        failures = result.pop("failures")
        print(json.dumps(dict(result, failure_groups=len(failures)), ensure_ascii=False))
        for failure in failures[:args.limit]:
            print(json.dumps(failure, ensure_ascii=False))
        if failures or result["empty_tables"] or result["missing_tables"] or result["unexpected_tables"]:
            raise SystemExit(1)
    finally:
        db.close()
        ssh.close()
