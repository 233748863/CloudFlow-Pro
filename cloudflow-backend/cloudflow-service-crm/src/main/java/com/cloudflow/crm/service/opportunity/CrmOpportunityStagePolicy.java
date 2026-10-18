package com.cloudflow.crm.service.opportunity;

import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.exception.CrmBusinessException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

public final class CrmOpportunityStagePolicy {
    public static final Set<String> REQUIRED_FIELDS = Set.of("contactId", "expectedAmount", "expectedSignDate", "ownerId", "remark");
    public enum Action { CREATE, EDIT, ADVANCE, WON, APPROVED_DOWNGRADE, REOPEN }
    public record Transition(CrmSalesStage source, CrmSalesStage target, LocalDateTime enteredTime,
            LocalDateTime changedTime, long durationSeconds, String direction, boolean changed) { }

    private CrmOpportunityStagePolicy() { }

    public static String code(String value) {
        if (value == null || !value.matches("[A-Za-z][A-Za-z0-9_]{0,29}")) throw invalid("阶段编码须为1至30位字母、数字或下划线，首位为字母");
        return value.toUpperCase(Locale.ROOT);
    }

    public static void catalog(List<CrmSalesStage> stages) {
        if (stages == null || stages.isEmpty() || stages.size() > 100) throw invalid("销售阶段配置须为1至100项");
        Set<String> codes = new HashSet<>(); Set<Integer> activeOrders = new HashSet<>();
        int won = 0; int lost = 0; int active = 0;
        for (CrmSalesStage stage : stages) {
            if (stage == null || !codes.add(code(stage.getStageCode()))) throw invalid("销售阶段编码重复");
            if (stage.getSortNo() == null || stage.getSortNo() < 1) throw invalid("阶段顺序必须为正整数");
            if (stage.getStatus() == null || !Set.of("ACTIVE", "DISABLED").contains(stage.getStatus())) throw invalid("阶段状态无效");
            if (stage.getStageName() == null || stage.getStageName().isBlank() || stage.getStageName().length() > 100) throw invalid("阶段名称不能为空且最多100字符");
            BigDecimal rate = CrmSalesAmounts.stageRate(stage.getDefaultWinRate());
            for (Integer flag : java.util.Arrays.asList(stage.getAllowSkipFlag(), stage.getRequiredActivityFlag(), stage.getIsWonFlag(), stage.getIsLostFlag())) {
                if (flag == null || flag != 0 && flag != 1) throw invalid("阶段开关只能为0或1");
            }
            if (stage.getOverdueDays() != null && stage.getOverdueDays() < 1) throw invalid("阶段超期天数必须大于0");
            if (stage.getRequiredFields() != null && (stage.getRequiredFields().stream().anyMatch(field -> field == null || !REQUIRED_FIELDS.contains(field))
                    || new HashSet<>(stage.getRequiredFields()).size() != stage.getRequiredFields().size())) throw invalid("阶段必填项不在允许清单内或重复");
            boolean terminalWon = "WON".equals(stage.getStageCode()); boolean terminalLost = "LOST".equals(stage.getStageCode());
            if (terminalWon != (stage.getIsWonFlag() == 1) || terminalLost != (stage.getIsLostFlag() == 1)
                    || terminalWon && rate.compareTo(BigDecimal.ONE) != 0 || terminalLost && rate.signum() != 0) throw invalid("WON与LOST编码、终态标志和默认赢率必须对应");
            if ((terminalWon || terminalLost) && !"ACTIVE".equals(stage.getStatus())) throw invalid("赢单与丢单终态必须保持启用");
            if ("ACTIVE".equals(stage.getStatus())) {
                if (!activeOrders.add(stage.getSortNo())) throw invalid("启用阶段的推进顺序不能重复");
                if (terminalWon) won++; else if (terminalLost) lost++; else active++;
            }
        }
        if (won != 1 || lost != 1 || active == 0) throw invalid("须保留各一个赢单、丢单终态及至少一个进行中阶段");
    }

    public static Transition apply(CrmOpportunity original, CrmOpportunity proposed, List<CrmSalesStage> catalog,
            Action action, String reason, boolean activityPresent, LocalDateTime timestamp) {
        catalog(catalog);
        if (proposed == null || action == null || timestamp == null) throw invalid("商机阶段操作缺少必要信息");
        List<CrmSalesStage> active = catalog.stream().filter(stage -> "ACTIVE".equals(stage.getStatus())).sorted(Comparator.comparing(CrmSalesStage::getSortNo)).toList();
        CrmSalesStage first = active.stream().filter(stage -> !terminal(stage)).findFirst().orElseThrow();
        String targetCode = code(proposed.getStage() == null ? original == null ? first.getStageCode() : original.getStage() : proposed.getStage());
        CrmSalesStage target = find(catalog, targetCode);
        if (!"ACTIVE".equals(target.getStatus())) throw invalid("目标销售阶段已停用");
        CrmSalesStage source = original == null ? null : find(catalog, original.getStage());
        boolean changed = source == null || !source.getStageCode().equals(targetCode);
        String direction = "UNCHANGED";
        if (original == null) {
            if (action != Action.CREATE || !first.getStageCode().equals(targetCode)) throw invalid("新商机必须从首个启用阶段开始");
            direction = "CREATE";
        } else if (changed) {
            if (terminal(source)) {
                if (action != Action.REOPEN || terminal(target)) throw invalid("已结案商机只能通过专用终态恢复操作进入进行中阶段");
                requireReason(reason); direction = "REOPEN";
            } else if (target.getIsWonFlag() == 1) {
                if (action != Action.WON) throw invalid("商机赢单必须使用赢单操作");
                direction = "WON";
            } else if (target.getIsLostFlag() == 1 || target.getSortNo() < source.getSortNo()) {
                if (action != Action.APPROVED_DOWNGRADE) throw invalid("商机降级或输单必须通过审批");
                requireReason(reason); direction = target.getIsLostFlag() == 1 ? "LOST" : "BACKWARD";
            } else {
                if (action != Action.EDIT && action != Action.ADVANCE) throw invalid("阶段操作类型与目标不一致");
                CrmSalesStage next = active.stream().filter(stage -> !terminal(stage) && stage.getSortNo() > source.getSortNo()).findFirst().orElse(null);
                if (target.getAllowSkipFlag() != 1 && (next == null || !next.getStageCode().equals(targetCode))) throw invalid("当前规则只允许进入下一个进行中阶段");
                direction = "FORWARD";
            }
        } else if (action == Action.REOPEN || action == Action.APPROVED_DOWNGRADE || action == Action.CREATE) throw invalid("阶段未发生变化");
        if (changed) {
            for (String field : target.getRequiredFields() == null ? List.<String>of() : target.getRequiredFields()) {
                if (!present(proposed, field)) throw invalid("进入阶段前必须填写：" + label(field));
            }
            if (target.getRequiredActivityFlag() == 1 && !activityPresent) throw invalid("进入该阶段前须有本商机的有效跟进或已完成活动");
            proposed.setWinRate(target.getDefaultWinRate().movePointRight(2));
        } else if (terminal(target)) proposed.setWinRate(target.getDefaultWinRate().movePointRight(2));
        proposed.setStage(targetCode);
        proposed.setExpectedAmount(CrmSalesAmounts.expected(proposed.getExpectedAmount()));
        proposed.setWinRate(CrmSalesAmounts.winRate(proposed.getWinRate()));
        proposed.setWeightedAmount(CrmSalesAmounts.weighted(proposed.getExpectedAmount(), proposed.getWinRate()));
        proposed.setStatus(terminal(target) ? "CLOSED" : "OPEN");
        LocalDateTime now = timestamp.withNano(0);
        LocalDateTime entered = original == null || original.getStageChangedTime() == null ? now : original.getStageChangedTime().withNano(0);
        if (entered.isAfter(now)) throw invalid("商机阶段进入时间晚于当前时间，请核查原记录");
        long duration = ChronoUnit.SECONDS.between(entered, now);
        proposed.setStageChangedTime(changed ? now : original.getStageChangedTime());
        proposed.setLastStage(changed ? source == null ? null : source.getStageCode() : original.getLastStage());
        proposed.setStageDurationDays(changed ? 0 : Math.toIntExact(duration / 86400));
        proposed.setTeamVersion(original == null ? 0 : original.getTeamVersion());
        return new Transition(source, target, entered, now, duration, direction, changed);
    }

    public static void version(Integer expected, CrmOpportunity opportunity) {
        if (expected == null || expected < 0 || !Objects.equals(expected, opportunity.getVersion())) throw invalid("商机已被修改，请重新读取后提交当前版本");
    }

    public static boolean terminal(CrmSalesStage stage) { return stage.getIsWonFlag() == 1 || stage.getIsLostFlag() == 1; }

    public static CrmSalesStage find(List<CrmSalesStage> stages, String code) {
        return stages.stream().filter(stage -> Objects.equals(stage.getStageCode(), code)).findFirst().orElseThrow(() -> invalid("销售阶段不存在"));
    }

    private static boolean present(CrmOpportunity opportunity, String field) {
        return switch (field) {
            case "contactId" -> opportunity.getContactId() != null && opportunity.getContactId() > 0;
            case "ownerId" -> opportunity.getOwnerId() != null && opportunity.getOwnerId() > 0;
            case "expectedAmount" -> opportunity.getExpectedAmount() != null && opportunity.getExpectedAmount().signum() > 0;
            case "expectedSignDate" -> opportunity.getExpectedSignDate() != null;
            case "remark" -> opportunity.getRemark() != null && !opportunity.getRemark().isBlank();
            default -> false;
        };
    }

    private static String label(String field) {
        return switch (field) { case "contactId" -> "联系人"; case "ownerId" -> "负责人"; case "expectedAmount" -> "预计金额";
            case "expectedSignDate" -> "预计签约日期"; case "remark" -> "备注"; default -> "未允许字段"; };
    }

    private static void requireReason(String reason) { if (reason == null || reason.isBlank() || reason.length() > 1000) throw invalid("阶段回退或恢复须填写原因，最多1000字符"); }
    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
