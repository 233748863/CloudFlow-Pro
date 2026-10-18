package com.cloudflow.hr.service;

import com.cloudflow.common.core.utils.RestrictedExpression;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class HrAppraisalRules {
    public static final String CUSTOMER_DISABLED = "客户评分已停用；接入真实客户身份后启用";
    public static final Set<String> VARIABLES = Set.of("kraScore", "goalScore", "selfScore", "managerScore", "peerScore", "subordinateScore", "customerScore");
    public static final Set<String> METHODS = Set.of("KRA_WEIGHTED", "GOAL_BASED", "MIXED");
    public static final List<String> STATUSES = List.of("DRAFT", "ONGOING", "SCORING", "CALIBRATING", "COMPLETED");
    private static final BigDecimal MAXIMUM = new BigDecimal("999999.9999");

    private HrAppraisalRules() { }

    public static final class ValidationException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;
        public ValidationException(String message) { super(message); }
    }

    public record Configuration(BigDecimal minScore, BigDecimal maxScore, BigDecimal kraWeight, BigDecimal goalWeight) { }
    public record Kra(Long kraId, BigDecimal weight) { }
    public record Goal(Long assignmentId, Long parentId, Long employeeId, Long kraId, BigDecimal weight, BigDecimal score) { }
    public record Scores(BigDecimal calculatedScore, BigDecimal kraScore, BigDecimal goalScore, Map<String, BigDecimal> inputs) { }
    public record GradeQuota(String grade, BigDecimal percent, Integer minCount, Integer maxCount) { }
    public record GradeCount(String grade, int quota, int minimum, int maximum, int actual) { }
    public record Distribution(boolean valid, String enforceMode, int population, List<GradeCount> grades, List<String> violations) { }

    public static void configuration(String method, String mode, String formula, Configuration configuration) {
        if (!METHODS.contains(String.valueOf(method)) || !Set.of("WEIGHTED_AVG", "FORMULA").contains(String.valueOf(mode))) throw invalid("评价方式或得分模式无效");
        if (configuration == null) throw invalid("须核定评分上下界");
        amount(configuration.minScore(), 4, MAXIMUM, "评分下界");
        amount(configuration.maxScore(), 4, MAXIMUM, "评分上界");
        if (configuration.minScore().compareTo(configuration.maxScore()) >= 0) throw invalid("评分上界须大于下界");
        if ("MIXED".equals(method)) {
            weight(configuration.kraWeight());
            weight(configuration.goalWeight());
            if (configuration.kraWeight().add(configuration.goalWeight()).compareTo(BigDecimal.ONE) != 0) throw invalid("混合模式两类权重合计须为1");
        }
        if ("FORMULA".equals(mode)) {
            if (references(formula).contains("customerScore")) throw invalid(CUSTOMER_DISABLED);
        }
        else if (formula != null && !formula.isBlank()) throw invalid("加权平均模式不保存或执行公式");
    }

    public static void transition(String current, String target) {
        int position = STATUSES.indexOf(current);
        if (position < 0 || position + 1 >= STATUSES.size() || !STATUSES.get(position + 1).equals(target)) throw invalid("绩效周期须按草稿、进行中、评分中、校准中、完成的顺序推进");
    }

    public static void kras(List<Kra> kras, boolean required) {
        if (kras == null || required && kras.isEmpty()) throw invalid("须配置关键成果领域及权重");
        Set<Long> identifiers = new HashSet<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Kra kra : kras) {
            if (kra == null || kra.kraId() == null || kra.kraId() <= 0 || !identifiers.add(kra.kraId())) throw invalid("关键成果领域重复或无效");
            weight(kra.weight());
            total = total.add(kra.weight());
        }
        if (!kras.isEmpty() && total.compareTo(BigDecimal.ONE) != 0) throw invalid("关键成果领域权重合计须为1");
    }

    public static List<Goal> leaves(List<Goal> goals) {
        if (goals == null || goals.isEmpty()) throw invalid("尚未下达参评目标");
        Map<Long, Goal> indexed = new LinkedHashMap<>();
        Set<Long> parents = new HashSet<>();
        for (Goal goal : goals) {
            if (goal == null || goal.assignmentId() == null || goal.assignmentId() <= 0 || indexed.put(goal.assignmentId(), goal) != null) throw invalid("分派节点重复或无效");
            if (goal.parentId() != null) parents.add(goal.parentId());
        }
        for (Goal goal : goals) {
            Set<Long> visited = new HashSet<>();
            Goal current = goal;
            while (current != null) {
                if (!visited.add(current.assignmentId())) throw invalid("目标分派树存在循环");
                Long parentId = current.parentId();
                if (parentId != null && !indexed.containsKey(parentId)) throw invalid("目标分派父节点不存在或跨目标");
                current = parentId == null ? null : indexed.get(parentId);
            }
            if (parents.contains(goal.assignmentId()) && goal.score() != null) throw invalid("父节点不能与叶子节点重复计分");
        }
        List<Goal> leaves = goals.stream().filter(goal -> !parents.contains(goal.assignmentId())).toList();
        for (Goal leaf : leaves) {
            if (leaf.employeeId() == null || leaf.employeeId() <= 0) throw invalid("叶子目标须分派到参评员工");
            weight(leaf.weight());
        }
        return leaves;
    }

    public static void goals(String method, List<Kra> kras, List<Goal> goals, Set<Long> participants) {
        kras(kras, !"GOAL_BASED".equals(method));
        List<Goal> leaves = leaves(goals);
        if (participants == null || participants.isEmpty()) throw invalid("参评名单为空");
        Map<Long, Kra> kraIndex = new HashMap<>();
        kras.forEach(kra -> kraIndex.put(kra.kraId(), kra));
        for (Goal leaf : leaves) {
            if (!participants.contains(leaf.employeeId())) throw invalid("目标包含未冻结到本周期的员工");
            if (leaf.kraId() != null && !kraIndex.containsKey(leaf.kraId())) throw invalid("目标的关键成果领域不属于本周期");
            if (!"GOAL_BASED".equals(method) && leaf.kraId() == null) throw invalid("此评价方式的目标须归属关键成果领域");
        }
        for (Long employeeId : participants) {
            List<Goal> employeeGoals = leaves.stream().filter(goal -> employeeId.equals(goal.employeeId())).toList();
            if (employeeGoals.isEmpty()) throw invalid("存在尚未下达目标的参评员工");
            if ("GOAL_BASED".equals(method)) sumWeights(employeeGoals);
            else for (Kra kra : kras) {
                List<Goal> kraGoals = employeeGoals.stream().filter(goal -> kra.kraId().equals(goal.kraId())).toList();
                if (kraGoals.isEmpty() && kra.weight().signum() == 0) continue;
                sumWeights(kraGoals);
            }
        }
    }

    public static Scores calculate(String method, String mode, String formula, Configuration configuration, List<Kra> kras,
                                   List<Goal> employeeGoals, Map<String, BigDecimal> sourceScores) {
        configuration(method, mode, formula, configuration);
        if (employeeGoals == null || employeeGoals.isEmpty()) throw invalid("该员工缺少叶子目标");
        for (Goal goal : employeeGoals) score(goal.score(), configuration);
        BigDecimal goalScore = weighted(employeeGoals);
        BigDecimal kraScore = null;
        if (!kras.isEmpty()) {
            BigDecimal total = BigDecimal.ZERO;
            for (Kra kra : kras) {
                if (kra.weight().signum() == 0) continue;
                List<Goal> matches = employeeGoals.stream().filter(goal -> Objects.equals(kra.kraId(), goal.kraId())).toList();
                if (matches.isEmpty()) {
                    if (!"GOAL_BASED".equals(method)) throw invalid("缺少关键成果领域评分");
                    total = null;
                    break;
                }
                total = total.add(weighted(matches).multiply(kra.weight()));
            }
            kraScore = total;
        }
        Map<String, BigDecimal> inputs = new LinkedHashMap<>();
        inputs.put("goalScore", goalScore);
        if (kraScore != null) inputs.put("kraScore", kraScore);
        if (sourceScores != null) for (Map.Entry<String, BigDecimal> entry : sourceScores.entrySet()) {
            if ("customerScore".equals(entry.getKey())) throw invalid(CUSTOMER_DISABLED);
            if (!VARIABLES.contains(entry.getKey()) || Set.of("kraScore", "goalScore").contains(entry.getKey())) throw invalid("360来源变量无效");
            score(entry.getValue(), configuration);
            inputs.put(entry.getKey(), entry.getValue());
        }
        BigDecimal result;
        if ("FORMULA".equals(mode)) {
            for (String reference : references(formula)) {
                if (!inputs.containsKey(reference)) throw invalid("缺少公式输入：" + reference);
            }
            try {
                result = RestrictedExpression.evaluateNumeric(formula, inputs, VARIABLES);
            } catch (IllegalArgumentException | ArithmeticException exception) {
                throw invalid(exception.getMessage());
            }
        } else result = switch (method) {
            case "KRA_WEIGHTED" -> Objects.requireNonNull(kraScore, "缺少关键成果领域评分");
            case "GOAL_BASED" -> goalScore;
            case "MIXED" -> Objects.requireNonNull(kraScore, "缺少关键成果领域评分").multiply(configuration.kraWeight())
                    .add(goalScore.multiply(configuration.goalWeight()));
            default -> throw invalid("评价方式无效");
        };
        score(result, configuration);
        return new Scores(result.setScale(4, RoundingMode.HALF_UP), rounded(kraScore), rounded(goalScore), Map.copyOf(inputs));
    }

    public static Distribution distribution(int population, List<GradeQuota> configuration, List<String> grades, String enforceMode) {
        if (population <= 0 || grades == null || grades.size() != population) throw invalid("分布人数须等于冻结参评人数");
        if (!Set.of("WARN", "BLOCK").contains(String.valueOf(enforceMode))) throw invalid("分布处理方式无效");
        quotas(configuration);
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (GradeQuota quota : configuration) counts.put(quota.grade(), 0);
        for (String grade : grades) {
            if (!counts.containsKey(grade)) throw invalid("存在未核定或不在分布规则中的等级");
            counts.compute(grade, (key, count) -> count + 1);
        }
        List<BigDecimal> exact = configuration.stream().map(quota -> quota.percent().multiply(BigDecimal.valueOf(population)).movePointLeft(2)).toList();
        List<Integer> allocated = new ArrayList<>(exact.stream().map(value -> value.setScale(0, RoundingMode.DOWN).intValueExact()).toList());
        int remainder = population - allocated.stream().mapToInt(Integer::intValue).sum();
        List<Integer> order = new ArrayList<>();
        for (int index = 0; index < configuration.size(); index++) order.add(index);
        order.sort(Comparator.<Integer, BigDecimal>comparing(index -> exact.get(index).remainder(BigDecimal.ONE)).reversed().thenComparingInt(Integer::intValue));
        for (int index = 0; index < remainder; index++) allocated.set(order.get(index), allocated.get(order.get(index)) + 1);
        List<GradeCount> results = new ArrayList<>();
        List<String> violations = new ArrayList<>();
        for (int index = 0; index < configuration.size(); index++) {
            GradeQuota quota = configuration.get(index);
            int minimum = quota.minCount() == null ? 0 : quota.minCount();
            int maximum = quota.maxCount() == null ? allocated.get(index) : quota.maxCount();
            int actual = counts.get(quota.grade());
            results.add(new GradeCount(quota.grade(), allocated.get(index), minimum, maximum, actual));
            if (actual < minimum || actual > maximum) violations.add(quota.grade() + "实际" + actual + "人，允许" + minimum + "至" + maximum + "人");
        }
        return new Distribution(violations.isEmpty() || "WARN".equals(enforceMode), enforceMode, population, List.copyOf(results), List.copyOf(violations));
    }

    public static void quotas(List<GradeQuota> configuration) {
        if (configuration == null || configuration.isEmpty()) throw invalid("分布规则不能为空");
        Set<String> grades = new HashSet<>();
        BigDecimal total = BigDecimal.ZERO;
        for (GradeQuota quota : configuration) {
            if (quota == null || quota.grade() == null || quota.grade().isBlank() || quota.grade().length() > 30 || !grades.add(quota.grade())) throw invalid("分布等级重复或无效");
            amount(quota.percent(), 4, new BigDecimal("100"), "等级比例");
            if (quota.minCount() != null && quota.minCount() < 0 || quota.maxCount() != null && quota.maxCount() < 0
                    || quota.minCount() != null && quota.maxCount() != null && quota.minCount() > quota.maxCount()) throw invalid("等级人数上下界无效");
            total = total.add(quota.percent());
        }
        if (total.compareTo(new BigDecimal("100")) != 0) throw invalid("等级分布比例合计须为100%");
    }

    public static void score(BigDecimal value, Configuration configuration) {
        if (value == null) throw invalid("评分缺失，不能用0替代");
        if (value.compareTo(configuration.minScore()) < 0 || value.compareTo(configuration.maxScore()) > 0) throw invalid("评分超出本周期核定上下界");
    }

    public static void weight(BigDecimal value) { amount(value, 4, BigDecimal.ONE, "权重"); }

    private static void amount(BigDecimal value, int scale, BigDecimal maximum, String label) {
        if (value == null || value.signum() < 0 || value.compareTo(maximum) > 0 || value.stripTrailingZeros().scale() > scale) throw invalid(label + "数值、范围或精度无效");
    }

    private static void sumWeights(List<Goal> goals) {
        if (goals.stream().map(Goal::weight).reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(BigDecimal.ONE) != 0) throw invalid("同一员工的目标组权重合计须为1");
    }

    private static BigDecimal weighted(List<Goal> goals) {
        BigDecimal denominator = goals.stream().map(Goal::weight).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (denominator.signum() <= 0) throw invalid("目标权重合计必须大于0");
        return goals.stream().map(goal -> goal.score().multiply(goal.weight())).reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(denominator, 16, RoundingMode.HALF_UP);
    }

    private static BigDecimal rounded(BigDecimal value) { return value == null ? null : value.setScale(4, RoundingMode.HALF_UP); }
    private static Set<String> references(String formula) {
        try {
            return RestrictedExpression.numericReferences(formula, VARIABLES);
        } catch (IllegalArgumentException exception) {
            throw invalid(exception.getMessage());
        }
    }
    private static ValidationException invalid(String message) { return new ValidationException(message); }
}
