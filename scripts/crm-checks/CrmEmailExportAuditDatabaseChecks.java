package com.cloudflow.crm.service.email;

import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmTargetList;
import java.nio.charset.StandardCharsets;

final class CrmEmailExportAuditDatabaseChecks {
    static void run(CrmEmailDatabaseChecks suite) {
        suite.identity(10L);
        CrmCampaign campaign = suite.campaign("导出审计边界");
        CrmLead lead = suite.lead("导出审计联系人", "export-audit@example.com", 10, 0);
        CrmTargetList list = suite.list(campaign, false, lead);
        String field = "CRM_TARGET_LIST:" + list.getListId();
        byte[] exported = suite.targetLists.export(list.getListId());
        String text = new String(exported, StandardCharsets.UTF_8);
        suite.check(text.contains(lead.getLeadName()) && !text.contains(lead.getEmail()), "actual exported list retains identity and masks contact");
        suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name=? AND audit_field=? AND create_by=? AND high_risk=1 AND risk_level='HIGH' AND create_time IS NOT NULL AND after_val=?",
                CrmEmailDatabaseChecks.TENANT, "导出CRM营销名单", field, "e5-10", "导出条数=1;联系方式已脱敏"), "actual export records tenant actor source count timestamp and risk once");
        suite.jdbc.execute("CREATE TRIGGER e5_owned_export_audit_failure BEFORE INSERT ON sys_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_E5_EXPORT_AUDIT_FAILURE'");
        try {
            suite.rejects(() -> suite.targetLists.export(list.getListId()), "actual database audit failure prevents returned export bytes");
            suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_field=?", CrmEmailDatabaseChecks.TENANT, field), "failed export does not fabricate a successful audit");
        } finally {
            suite.jdbc.execute("DROP TRIGGER e5_owned_export_audit_failure");
        }
        suite.targetLists.export(list.getListId());
        suite.equal(2L, suite.scalar("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_field=?", CrmEmailDatabaseChecks.TENANT, field), "each successful repeat export records a separate actual access");
        System.out.println("E5_EXPORT_AUDIT_DATABASE: actual_audit=true; audit_failure_blocks_export=true; repeat_access_recorded=true; contacts_masked=true");
    }
}
