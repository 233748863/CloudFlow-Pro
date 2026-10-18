package com.cloudflow.hr.checks;

import com.cloudflow.hr.service.HrAppraisalRules;
import com.cloudflow.hr.service.HrAppraisalRules.Configuration;
import com.cloudflow.hr.service.HrAppraisalRules.Goal;
import com.cloudflow.hr.service.HrAppraisalRules.GradeQuota;
import com.cloudflow.hr.service.HrAppraisalRules.Kra;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class HrAppraisalRuleChecks {
    private static int checks;
    private static final Configuration CONFIG = new Configuration(decimal("0"), decimal("100"), decimal("0.6"), decimal("0.4"));
    private static final List<Kra> KRAS = List.of(new Kra(1L, decimal("0.75")), new Kra(2L, decimal("0.25")));
    private static final List<Goal> GOALS = List.of(goal(11L, null, 100L, 1L, "1", "80"), goal(12L, null, 100L, 2L, "1", "40"));

    public static void main(String[] arguments) {
        HrAppraisalRules.goals("KRA_WEIGHTED", KRAS, GOALS, Set.of(100L)); checks++;
        equal("70", calculate("KRA_WEIGHTED", "WEIGHTED_AVG", null, Map.of()));
        equal("66", calculate("MIXED", "WEIGHTED_AVG", null, Map.of()));
        List<Goal> ordinary = List.of(goal(21L, null, 100L, null, "0.25", "80"), goal(22L, null, 100L, null, "0.75", "40"));
        HrAppraisalRules.goals("GOAL_BASED", List.of(), ordinary, Set.of(100L)); checks++;
        equal("50", HrAppraisalRules.calculate("GOAL_BASED", "WEIGHTED_AVG", null, CONFIG, List.of(), ordinary, Map.of()).calculatedScore());
        equal("80", calculate("KRA_WEIGHTED", "FORMULA", "${kraScore} * 0.5 + ${selfScore} * 0.5", Map.of("selfScore", decimal("90"))));
        equal("68.3333", calculate("MIXED", "FORMULA", "(${kraScore}+${goalScore}+${selfScore}+${managerScore}+${peerScore}+${subordinateScore})/6",
                Map.of("selfScore", decimal("80"), "managerScore", decimal("90"), "peerScore", decimal("60"), "subordinateScore", decimal("50"))));
        rejects(() -> calculate("MIXED", "FORMULA", "${customerScore}", Map.of("customerScore", decimal("40"))));
        rejects(() -> calculate("MIXED", "FORMULA", "${goalScore}+${customerScore}*0", Map.of()));
        rejects(() -> calculate("MIXED", "WEIGHTED_AVG", null, Map.of("customerScore", decimal("40"))));
        equal("60", calculate("MIXED", "FORMULA", "${goalScore}", Map.of()));
        equal("0", calculate("MIXED", "FORMULA", "${goalScore}-${goalScore}", Map.of()));
        rejects(() -> calculate("MIXED", "FORMULA", "${selfScore}", Map.of()));
        rejects(() -> calculate("MIXED", "FORMULA", "${goalScore}/0", Map.of()));
        rejects(() -> calculate("MIXED", "FORMULA", "${goalScore}*2", Map.of()));
        rejects(() -> calculate("MIXED", "FORMULA", "-${goalScore}", Map.of()));
        rejects(() -> calculate("MIXED", "WEIGHTED_AVG", "${goalScore}", Map.of()));
        rejects(() -> calculate("MIXED", "FORMULA", "${goalScore}", Map.of("unknown", decimal("10"))));
        rejects(() -> calculate("MIXED", "FORMULA", "${goalScore}", Map.of("selfScore", decimal("101"))));
        for (String formula : List.of("eval('1')", "Math.max(1,2)", "${goalScore}.class", "${unknown}", "new Date()", "'50'", "true", "1==1", "1<2", "!1", "((((((1))))))", "1".repeat(501))) {
            rejects(() -> HrAppraisalRules.configuration("MIXED", "FORMULA", formula, CONFIG));
        }
        HrAppraisalRules.configuration("MIXED", "FORMULA", "(((((1)))))", CONFIG); checks++;
        rejects(() -> HrAppraisalRules.configuration("MIXED", "WEIGHTED_AVG", null, new Configuration(decimal("0"), decimal("100"), decimal("0.6"), decimal("0.5"))));
        rejects(() -> HrAppraisalRules.configuration("GOAL_BASED", "WEIGHTED_AVG", null, new Configuration(decimal("100"), decimal("0"), null, null)));
        rejects(() -> HrAppraisalRules.configuration("GOAL_BASED", "WEIGHTED_AVG", null, new Configuration(decimal("0"), decimal("1000000"), null, null)));
        rejects(() -> HrAppraisalRules.kras(List.of(new Kra(1L, decimal("0.2"))), true));
        rejects(() -> HrAppraisalRules.kras(List.of(new Kra(1L, decimal("0.5")), new Kra(1L, decimal("0.5"))), true));
        rejects(() -> HrAppraisalRules.goals("KRA_WEIGHTED", KRAS, GOALS, Set.of(100L, 101L)));
        rejects(() -> HrAppraisalRules.goals("KRA_WEIGHTED", KRAS, GOALS, Set.of(101L)));
        rejects(() -> HrAppraisalRules.goals("GOAL_BASED", List.of(), List.of(goal(1L, null, 100L, null, "0.5", null)), Set.of(100L)));
        rejects(() -> HrAppraisalRules.goals("KRA_WEIGHTED", KRAS, List.of(goal(1L, null, 100L, 3L, "1", null)), Set.of(100L)));
        rejects(() -> HrAppraisalRules.calculate("GOAL_BASED", "WEIGHTED_AVG", null, CONFIG, List.of(), List.of(goal(1L, null, 100L, null, "1", null)), Map.of()));
        rejects(() -> HrAppraisalRules.leaves(List.of(goal(1L, 2L, 100L, null, "1", null), goal(2L, 1L, 100L, null, "1", null))));
        rejects(() -> HrAppraisalRules.leaves(List.of(goal(1L, 99L, 100L, null, "1", null))));
        rejects(() -> HrAppraisalRules.leaves(List.of(goal(1L, null, 100L, null, "1", "50"), goal(2L, 1L, 100L, null, "1", "90"))));
        check(HrAppraisalRules.leaves(List.of(goal(1L, null, null, null, "0", null), goal(2L, 1L, 100L, null, "1", "90"))).size() == 1);
        for (int index = 0; index + 1 < HrAppraisalRules.STATUSES.size(); index++) { HrAppraisalRules.transition(HrAppraisalRules.STATUSES.get(index), HrAppraisalRules.STATUSES.get(index + 1)); checks++; }
        rejects(() -> HrAppraisalRules.transition("DRAFT", "SCORING"));
        rejects(() -> HrAppraisalRules.transition("COMPLETED", "ONGOING"));
        rejects(() -> HrAppraisalRules.transition("SCORING", "SCORING"));
        List<GradeQuota> quotas = List.of(quota("A", "50"), quota("B", "30"), quota("C", "20"));
        HrAppraisalRules.Distribution distribution = HrAppraisalRules.distribution(7, quotas, List.of("A", "A", "A", "A", "B", "B", "C"), "BLOCK");
        check(distribution.valid());
        check(distribution.grades().stream().mapToInt(HrAppraisalRules.GradeCount::quota).sum() == 7);
        check(distribution.grades().get(0).quota() == 4);
        check(distribution.grades().get(1).quota() == 2);
        List<GradeQuota> tied = List.of(quota("A", "50"), quota("B", "50"));
        check(HrAppraisalRules.distribution(3, tied, List.of("A", "A", "B"), "BLOCK").valid());
        check(!HrAppraisalRules.distribution(3, tied, List.of("A", "B", "B"), "BLOCK").valid());
        check(HrAppraisalRules.distribution(3, tied, List.of("A", "B", "B"), "WARN").valid());
        check(!HrAppraisalRules.distribution(3, tied, List.of("A", "B", "B"), "WARN").violations().isEmpty());
        rejects(() -> HrAppraisalRules.distribution(3, tied, List.of("A", "B"), "BLOCK"));
        rejects(() -> HrAppraisalRules.distribution(3, tied, List.of("A", "B", "C"), "BLOCK"));
        rejects(() -> HrAppraisalRules.quotas(List.of(quota("A", "99"))));
        rejects(() -> HrAppraisalRules.quotas(List.of(quota("A", "50"), quota("A", "50"))));
        rejects(() -> HrAppraisalRules.quotas(List.of(new GradeQuota("A", decimal("100"), 2, 1))));
        System.out.println("H2_APPRAISAL_RULE_CHECKS: checks=" + checks + "; failed=0; arithmetic=true; largest_remainder=true; database=false; http=false");
    }

    private static BigDecimal calculate(String method, String mode, String formula, Map<String, BigDecimal> sources) {
        return HrAppraisalRules.calculate(method, mode, formula, CONFIG, KRAS, GOALS, sources).calculatedScore();
    }
    private static Goal goal(Long identifier, Long parent, Long employee, Long kra, String weight, String score) { return new Goal(identifier, parent, employee, kra, decimal(weight), score == null ? null : decimal(score)); }
    private static GradeQuota quota(String grade, String percent) { return new GradeQuota(grade, decimal(percent), null, null); }
    private static BigDecimal decimal(String value) { return new BigDecimal(value); }
    private static void equal(String expected, BigDecimal actual) { check(actual.compareTo(decimal(expected)) == 0); }
    private static void check(boolean condition) { checks++; if (!condition) throw new AssertionError("Appraisal check failed: " + checks); }
    private static void rejects(Runnable action) {
        checks++;
        try { action.run(); }
        catch (IllegalArgumentException | ArithmeticException expected) { return; }
        throw new AssertionError("Invalid appraisal input accepted: " + checks);
    }
}
