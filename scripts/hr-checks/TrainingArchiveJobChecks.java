package com.cloudflow.hr.job;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.service.impl.HrTrainingArchiveServiceImpl;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.ibatis.builder.MapperBuilderAssistant;

/** 真实两层业务循环；仅员工查询和单人重建写入为受控输入。 */
public final class TrainingArchiveJobChecks {
    private static int checks;

    public static void main(String[] args) {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "training-archive-checks"), HrEmployee.class);
        UserContext.setTenantId(9001L);
        TenantContext.setTenantId(9002L);
        try {
            successfulCounts();
            nestedFailuresAndRecovery();
            emptyCases();
            check(Objects.equals(UserContext.getTenantId(), 9001L) && Objects.equals(TenantContext.getTenantId(), 9002L), "caller contexts retained");
            System.out.println("TRAINING_ARCHIVE_JOB_CHECKS: checks=" + checks + "; failed=0; real_job_and_rebuild_loop=true; controlled_employee_query_and_write=true; actual_database=false");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static void successfulCounts() {
        Fixture fixture = new Fixture(Map.of(10L, List.of(11L, 12L), 20L, List.of(21L)));
        JobResult result = fixture.job(List.of(10L, 20L)).run();
        check("SUCCESS".equals(result.getExecuteStatus()) && result.getAffectedRows() == 3, "successful result counts actual rebuilt employees");
        check("培训档案重建完成：已刷新3名员工".equals(result.getResultMsg()), "summary records rebuilt people");
        check(fixture.attempts.equals(List.of(11L, 12L, 21L)), "both tenants and every employee processed");
        check(fixture.written.equals(fixture.attempts), "successful writes agree with count");
        check(fixture.queriedTenants.equals(List.of(10L, 20L)), "employee queries use each current tenant");
    }

    private static void nestedFailuresAndRecovery() {
        Fixture fixture = new Fixture(Map.of(10L, List.of(11L, 12L, 13L), 20L, List.of(21L, 22L), 30L, List.of(31L)));
        fixture.reject.addAll(List.of(11L, 13L, 21L));
        TrainingArchiveRebuildJob job = fixture.job(List.of(10L, 20L, 30L));
        RuntimeException failure = null;
        try { job.run(); } catch (RuntimeException exception) { failure = exception; }
        check(failure != null, "partial rebuild must not return success");
        check(fixture.attempts.equals(List.of(11L, 12L, 13L, 21L, 22L, 31L)), "a failed employee does not prevent later employees or tenants");
        check(fixture.written.equals(List.of(12L, 22L, 31L)), "only successful writes counted");
        check(failure.getSuppressed().length == 2, "both failed tenants retained");
        Throwable firstTenant = failure.getSuppressed()[0].getCause();
        check(firstTenant.getSuppressed().length == 2 && firstTenant.getSuppressed()[0].getCause() == fixture.originalFailures.get(11L)
                && firstTenant.getSuppressed()[1].getCause() == fixture.originalFailures.get(13L), "original employee errors retained through both aggregation levels");
        check(failure.getSuppressed()[1].getCause().getSuppressed()[0].getCause() == fixture.originalFailures.get(21L), "second tenant error retained");
        check(Objects.equals(UserContext.getTenantId(), 9001L) && Objects.equals(TenantContext.getTenantId(), 9002L), "failure restores caller contexts");
        fixture.reject.clear(); fixture.attempts.clear(); fixture.written.clear();
        JobResult recovered = job.run();
        check("SUCCESS".equals(recovered.getExecuteStatus()) && recovered.getAffectedRows() == 6, "new scan recovers with the full correct count");
        check(fixture.written.equals(List.of(11L, 12L, 13L, 21L, 22L, 31L)), "recovery retries failed employees and refreshes every archive");
    }

    private static void emptyCases() {
        Fixture fixture = new Fixture(Map.of(10L, List.of()));
        JobResult noTenants = fixture.job(List.of()).run();
        check(noTenants.getAffectedRows() == 0 && fixture.queriedTenants.isEmpty(), "no tenant performs no query and returns zero");
        JobResult noEmployees = fixture.job(List.of(10L)).run();
        check(noEmployees.getAffectedRows() == 0 && fixture.attempts.isEmpty(), "empty tenant returns zero without an invented write");
    }

    private static final class Fixture {
        private final Map<Long, List<Long>> employees;
        private final Set<Long> reject = new HashSet<>();
        private final List<Long> queriedTenants = new ArrayList<>();
        private final List<Long> attempts = new ArrayList<>();
        private final List<Long> written = new ArrayList<>();
        private final Map<Long, RuntimeException> originalFailures = new LinkedHashMap<>();

        private Fixture(Map<Long, List<Long>> employees) { this.employees = employees; }

        private TrainingArchiveRebuildJob job(List<Long> tenantIds) {
            HrEmployeeMapper mapper = (HrEmployeeMapper) Proxy.newProxyInstance(HrEmployeeMapper.class.getClassLoader(),
                    new Class<?>[]{HrEmployeeMapper.class}, (proxy, method, arguments) -> {
                        if (!method.getName().equals("selectList")) throw new AssertionError("Unexpected employee query");
                        Long tenantId = TenantContext.getTenantId();
                        if (!Objects.equals(tenantId, UserContext.getTenantId())) throw new AssertionError("Tenant contexts disagree");
                        queriedTenants.add(tenantId);
                        return employees.get(tenantId).stream().map(id -> { HrEmployee employee = new HrEmployee(); employee.setId(id); return employee; }).toList();
                    });
            HrTrainingArchiveServiceImpl service = new HrTrainingArchiveServiceImpl(null, null, null, null, mapper, null, null) {
                @Override public void rebuildOne(Long employeeId) {
                    if (!employees.get(TenantContext.getTenantId()).contains(employeeId)) throw new AssertionError("Employee belongs to another tenant");
                    attempts.add(employeeId);
                    if (reject.contains(employeeId)) {
                        RuntimeException failure = new IllegalStateException("Controlled archive write failure " + employeeId);
                        originalFailures.put(employeeId, failure);
                        throw failure;
                    }
                    written.add(employeeId);
                }
            };
            TenantIterator tenants = new TenantIterator(null) {
                @Override public List<Long> listActiveTenantIds() { return tenantIds; }
            };
            return new TrainingArchiveRebuildJob(service, tenants);
        }
    }

    private static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }
}
