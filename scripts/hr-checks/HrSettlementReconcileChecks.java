package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import com.cloudflow.workflow.mapper.WfReconcileAlertMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;

/** Real mapper SQL and isolated MySQL; process and settlement rows are explicit reconciliation fixtures. */
public final class HrSettlementReconcileChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) throw new IllegalArgumentException("Owned scratch database required");
        try (HikariDataSource data = new HikariDataSource()) {
            data.setJdbcUrl(arguments[0]); data.setUsername("root"); data.setPassword(""); data.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(data);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath(), "owned database");
            MybatisConfiguration config = new MybatisConfiguration(); config.setMapUnderscoreToCamelCase(true);
            config.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class); config.addMapper(WfReconcileAlertMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(data); factory.setConfiguration(config);
            factory.setMapperLocations(new FileSystemResource("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfReconcileAlertMapper.xml"));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            WfReconcileAlertMapper mapper = sessions.getMapper(WfReconcileAlertMapper.class);
            List<BusinessTypeDef> types = List.of(BusinessTypeDef.builder().code("HR_SETTLEMENT").module("hr").businessTable("hr_final_settlement")
                    .idField("settlement_id").statusField("approval_status").processInstanceIdField("instance_id").displayName("离职结算财务复核").build());
            jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,status,start_time) VALUES ('settlement-reconcile',100000,'settlement-reconcile','settlement-reconcile',995011,'RUNNING',NOW())");
            jdbc.update("INSERT INTO hr_final_settlement(settlement_id,tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,status,approval_status,instance_id) VALUES (995090,100000,'settlement-reconcile',995001,995002,'2026-01-01','2026-09-30','DRAFT','SUBMITTED','settlement-reconcile')");
            for (String pending : List.of("SUBMITTED", "PENDING_APPROVAL", "PENDING", "APPROVING", "IN_APPROVAL")) {
                jdbc.update("UPDATE hr_final_settlement SET approval_status=? WHERE settlement_id=995090", pending);
                for (String terminal : List.of("PASSED", "AUTO_PASSED", "REJECTED", "CANCELLED", "INVALIDATED", "TERMINATED")) {
                    jdbc.update("UPDATE wf_process_instance SET status=? WHERE instance_id='settlement-reconcile'", terminal);
                    List<WfReconcileAlert> result = mapper.selectInconsistentRecords(7, types);
                    equal(1, result.size(), pending + " behind " + terminal); equal(100000L, result.get(0).getTenantId(), "actual business tenant");
                }
            }
            jdbc.update("UPDATE hr_final_settlement SET approval_status='SUBMITTED' WHERE settlement_id=995090");
            for (String active : List.of("RUNNING", "PAUSED", "PENDING", "RESTARTED", "TASK_BACK")) {
                jdbc.update("UPDATE wf_process_instance SET status=? WHERE instance_id='settlement-reconcile'", active);
                equal(0, mapper.selectInconsistentRecords(7, types).size(), "submitted follows active " + active);
            }
            for (String[] pair : List.of(new String[]{"APPROVED", "PASSED"}, new String[]{"REJECTED", "REJECTED"}, new String[]{"CANCELLED", "TERMINATED"})) {
                jdbc.update("UPDATE hr_final_settlement SET approval_status=? WHERE settlement_id=995090", pair[0]);
                jdbc.update("UPDATE wf_process_instance SET status=? WHERE instance_id='settlement-reconcile'", pair[1]);
                equal(0, mapper.selectInconsistentRecords(7, types).size(), "aligned final decision");
            }
            jdbc.update("UPDATE wf_process_instance SET status='RUNNING' WHERE instance_id='settlement-reconcile'");
            equal(1, mapper.selectInconsistentRecords(7, types).size(), "reverse drift remains visible");
            jdbc.update("UPDATE hr_final_settlement SET approval_status='SUBMITTED' WHERE settlement_id=995090");
            jdbc.update("UPDATE wf_process_instance SET status='PASSED',tenant_id=100001 WHERE instance_id='settlement-reconcile'");
            equal(0, mapper.selectInconsistentRecords(7, types).size(), "other tenant process does not join");
            jdbc.update("UPDATE wf_process_instance SET tenant_id=100000,start_time=DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE instance_id='settlement-reconcile'");
            equal(0, mapper.selectInconsistentRecords(7, types).size(), "old instance outside window");
            jdbc.update("UPDATE wf_process_instance SET end_time=NOW() WHERE instance_id='settlement-reconcile'");
            equal(1, mapper.selectInconsistentRecords(7, types).size(), "recent closure of old instance detected");
            System.out.println("H2_SETTLEMENT_RECONCILIATION_DATABASE: passed=" + checks + "; failed=0; mapper_sql=real; process_rows=fixtures; runtime_writes=0");
        }
    }

    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
}
