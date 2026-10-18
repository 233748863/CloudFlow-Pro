package com.cloudflow.hr.client;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.fallback.CrmPerformanceClientFallback;
import com.cloudflow.hr.client.vo.CrmPerformanceSummaryVO;
import com.cloudflow.hr.controller.HrCrmPerformanceController;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

public final class HrCrmPerformanceAvailabilityChecks {
    private static int checks;
    private static final List<Long> TARGET_IDS = List.of(301L, 302L);
    private static final String START_DATE = "2026-09-01";
    private static final String END_DATE = "2026-09-30";
    private static final String BASIS = "TEAM_V2";
    private static final String CURRENCY = "USD";

    public static void main(String[] arguments) throws Exception {
        CrmPerformanceClientFallback fallback = new CrmPerformanceClientFallback();
        for (Query query : clientQueries(fallback)) unavailable(query.invoke().get(), query.name());
        for (Query query : controllerQueries(new HrCrmPerformanceController(fallback))) {
            unavailable(query.invoke().get(), "controller " + query.name());
        }
        CrmPerformanceSummaryVO summary = new CrmPerformanceSummaryVO();
        summary.setDimension("OWNER");
        summary.setTargetId(301L);
        summary.setReceivedAmount(BigDecimal.ZERO);
        for (R<List<CrmPerformanceSummaryVO>> response : List.of(R.ok(List.<CrmPerformanceSummaryVO>of()), R.ok(List.of(summary)))) {
            AvailableClient client = new AvailableClient(response);
            for (Query query : controllerQueries(new HrCrmPerformanceController(client))) {
                R<List<CrmPerformanceSummaryVO>> actual = query.invoke().get();
                check(actual == response, "successful response is unchanged: " + query.name());
                check(actual.isSuccess(), "legitimate empty or zero response is successful: " + query.name());
                equal(query.name(), client.method, "correct remote query is selected");
                equal(START_DATE, client.startDate, "start date is unchanged");
                equal(END_DATE, client.endDate, "end date is unchanged");
                equal(BASIS, client.basis, "calculation basis is unchanged");
                equal(CURRENCY, client.currency, "currency is unchanged");
                if (query.name().startsWith("summarize")) equal(TARGET_IDS, client.targetIds, "target identities are unchanged");
                else equal(10, client.limit, "ranking limit is unchanged");
            }
        }
        for (String methodName : List.of("summarizeByOwner", "summarizeByDept", "topOwners", "topDepartments")) {
            Class<?> firstParameter = methodName.startsWith("summarize") ? List.class : int.class;
            Method method = HrCrmPerformanceController.class.getMethod(methodName, firstParameter, String.class, String.class, String.class, String.class);
            SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
            check(permission != null, "controller remains permission protected: " + methodName);
            equal(List.of("hr:performance:view"), List.of(permission.value()), "existing HR read permission is retained");
        }
        invalidFiltersDoNotCallRemote();
        System.out.println("H3_CRM_PERFORMANCE_AVAILABILITY: checks=" + checks
                + "; failed=0; fallback_methods=4; controller_methods=4; http=false; database=false; client_doubles=true");
    }

    private static void unavailable(R<List<CrmPerformanceSummaryVO>> response, String label) {
        check(response != null, label + " returns a failure envelope");
        equal(503, response.getCode(), label + " cannot report a successful empty list");
        check(!response.isSuccess(), label + " is unsuccessful");
        equal(null, response.getData(), label + " contains no made-up performance");
        equal("销售业绩暂不可用，请稍后重试", response.getMsg(), label + " explains unavailability without upstream details");
    }

    private static void invalidFiltersDoNotCallRemote() {
        AvailableClient client = new AvailableClient(R.ok(List.of()));
        HrCrmPerformanceController controller = new HrCrmPerformanceController(client);
        for (List<Long> identifiers : List.of(List.of(0L), List.of(-1L), java.util.Arrays.asList(301L, null), java.util.Collections.nCopies(201, 301L))) {
            invalid(controller.summarizeByOwner(identifiers, START_DATE, END_DATE, BASIS, CURRENCY), client, "invalid owner identifiers");
            invalid(controller.summarizeByDept(identifiers, START_DATE, END_DATE, BASIS, CURRENCY), client, "invalid department identifiers");
        }
        for (int limit : List.of(0, -1, 201, Integer.MAX_VALUE)) {
            invalid(controller.topOwners(limit, START_DATE, END_DATE, BASIS, CURRENCY), client, "invalid owner ranking limit");
            invalid(controller.topDepartments(limit, START_DATE, END_DATE, BASIS, CURRENCY), client, "invalid department ranking limit");
        }
        for (String[] values : List.of(new String[]{"2026-02-29", END_DATE, BASIS, CURRENCY},
                new String[]{START_DATE, "2026-09-31", BASIS, CURRENCY}, new String[]{"0999-12-31", END_DATE, BASIS, CURRENCY},
                new String[]{START_DATE, "10000-01-01", BASIS, CURRENCY}, new String[]{"2026-9-01", END_DATE, BASIS, CURRENCY},
                new String[]{"2026-10-01", END_DATE, BASIS, CURRENCY}, new String[]{START_DATE, END_DATE, "UNKNOWN", CURRENCY},
                new String[]{START_DATE, END_DATE, BASIS, "cny"}, new String[]{START_DATE, END_DATE, BASIS, "CNY "})) {
            for (Query query : filteredQueries(controller, values[0], values[1], values[2], values[3])) {
                invalid(query.invoke().get(), client, query.name());
            }
        }
        for (String[] values : List.of(new String[]{"1000-01-01", "9999-12-31", "OWNER_V1", "CNY"},
                new String[]{"2024-02-29", "2024-02-29", BASIS, CURRENCY}, new String[]{null, null, null, null},
                new String[]{"", " ", BASIS, CURRENCY})) {
            for (Query query : filteredQueries(controller, values[0], values[1], values[2], values[3])) {
                client.method = null;
                check(query.invoke().get().isSuccess(), "valid date or default filter remains accepted");
                equal(query.name(), client.method, "valid filter reaches the selected remote query");
            }
        }
        check(controller.summarizeByOwner(java.util.Collections.nCopies(200, 301L), null, null, BASIS, CURRENCY).isSuccess(), "200 supplied targets remain accepted");
        check(controller.summarizeByDept(List.of(), null, null, BASIS, CURRENCY).isSuccess(), "empty target selection remains unrestricted by identifiers");
        for (int limit : List.of(1, 200)) {
            check(controller.topOwners(limit, null, null, BASIS, CURRENCY).isSuccess(), "valid owner ranking boundary remains accepted");
            check(controller.topDepartments(limit, null, null, BASIS, CURRENCY).isSuccess(), "valid department ranking boundary remains accepted");
        }
    }

    private static void invalid(R<List<CrmPerformanceSummaryVO>> response, AvailableClient client, String label) {
        equal(400, response.getCode(), label + " is an input error");
        equal(null, response.getData(), label + " contains no performance result");
        check(response.getMsg() != null && !response.getMsg().contains("暂不可用"), label + " explains the invalid filter");
        equal(null, client.method, label + " does not call the remote service");
    }

    private static List<Query> filteredQueries(HrCrmPerformanceController controller, String start, String end, String basis, String currency) {
        return List.of(new Query("summarizeByOwner", () -> controller.summarizeByOwner(TARGET_IDS, start, end, basis, currency)),
                new Query("summarizeByDept", () -> controller.summarizeByDept(TARGET_IDS, start, end, basis, currency)),
                new Query("topOwners", () -> controller.topOwners(10, start, end, basis, currency)),
                new Query("topDepartments", () -> controller.topDepartments(10, start, end, basis, currency)));
    }

    private static List<Query> clientQueries(CrmPerformanceClient client) {
        return List.of(
                new Query("summarizeByOwner", () -> client.summarizeByOwner(TARGET_IDS, START_DATE, END_DATE, BASIS, CURRENCY)),
                new Query("summarizeByDept", () -> client.summarizeByDept(TARGET_IDS, START_DATE, END_DATE, BASIS, CURRENCY)),
                new Query("topOwners", () -> client.topOwners(10, START_DATE, END_DATE, BASIS, CURRENCY)),
                new Query("topDepartments", () -> client.topDepartments(10, START_DATE, END_DATE, BASIS, CURRENCY)));
    }

    private static List<Query> controllerQueries(HrCrmPerformanceController controller) {
        return List.of(
                new Query("summarizeByOwner", () -> controller.summarizeByOwner(TARGET_IDS, START_DATE, END_DATE, BASIS, CURRENCY)),
                new Query("summarizeByDept", () -> controller.summarizeByDept(TARGET_IDS, START_DATE, END_DATE, BASIS, CURRENCY)),
                new Query("topOwners", () -> controller.topOwners(10, START_DATE, END_DATE, BASIS, CURRENCY)),
                new Query("topDepartments", () -> controller.topDepartments(10, START_DATE, END_DATE, BASIS, CURRENCY)));
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static void equal(Object expected, Object actual, String message) {
        check(Objects.equals(expected, actual), message + "; expected=" + expected + "; actual=" + actual);
    }

    private record Query(String name, Supplier<R<List<CrmPerformanceSummaryVO>>> invoke) { }

    private static final class AvailableClient implements CrmPerformanceClient {
        private final R<List<CrmPerformanceSummaryVO>> response;
        private String method;
        private List<Long> targetIds;
        private String startDate;
        private String endDate;
        private int limit;
        private String basis;
        private String currency;

        private AvailableClient(R<List<CrmPerformanceSummaryVO>> response) {
            this.response = response;
        }

        private R<List<CrmPerformanceSummaryVO>> respond(String methodName, List<Long> ids, int requestedLimit, String start, String end, String calculationBasis, String selectedCurrency) {
            method = methodName;
            targetIds = ids;
            limit = requestedLimit;
            startDate = start;
            endDate = end;
            basis = calculationBasis;
            currency = selectedCurrency;
            return response;
        }

        @Override
        public R<List<CrmPerformanceSummaryVO>> summarizeByOwner(List<Long> ownerIds, String start, String end, String calculationBasis, String selectedCurrency) {
            return respond("summarizeByOwner", ownerIds, 0, start, end, calculationBasis, selectedCurrency);
        }

        @Override
        public R<List<CrmPerformanceSummaryVO>> summarizeByDept(List<Long> deptIds, String start, String end, String calculationBasis, String selectedCurrency) {
            return respond("summarizeByDept", deptIds, 0, start, end, calculationBasis, selectedCurrency);
        }

        @Override
        public R<List<CrmPerformanceSummaryVO>> topOwners(int requestedLimit, String start, String end, String calculationBasis, String selectedCurrency) {
            return respond("topOwners", null, requestedLimit, start, end, calculationBasis, selectedCurrency);
        }

        @Override
        public R<List<CrmPerformanceSummaryVO>> topDepartments(int requestedLimit, String start, String end, String calculationBasis, String selectedCurrency) {
            return respond("topDepartments", null, requestedLimit, start, end, calculationBasis, selectedCurrency);
        }
    }
}
