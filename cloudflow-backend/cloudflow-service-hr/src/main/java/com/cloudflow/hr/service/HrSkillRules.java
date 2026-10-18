package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrSkillRequests;
import com.cloudflow.hr.domain.entity.HrEmployeeSkill;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.cloudflow.hr.service.HrHException.invalid;

public final class HrSkillRules {
    public static final Set<String> AUTOMATIC_EVIDENCE = Set.of("TRAINING", "EXAM", "CERTIFICATE");
    private static final Set<String> LEVEL_KEYS = Set.of("1", "2", "3", "4", "5");

    private HrSkillRules() { }

    public static void definition(HrSkillRequests.Definition input) {
        if (input == null || input.status() == null || !Set.of("DRAFT", "ACTIVE", "DISABLED").contains(input.status())) {
            throw invalid("技能状态仅允许草稿、启用或停用");
        }
        HrHSupport.text(input.skillCode(), 64);
        HrHSupport.text(input.skillName(), 100);
        Map<String, String> levels = input.levelDefinition();
        if (levels == null || !LEVEL_KEYS.containsAll(levels.keySet())) throw invalid("等级定义仅允许1至5级");
        for (String description : levels.values()) {
            if (description == null || description.length() > 1000) throw invalid("等级定义内容无效或超过1000字");
        }
        if ("ACTIVE".equals(input.status()) && (!levels.keySet().equals(LEVEL_KEYS)
                || levels.values().stream().anyMatch(String::isBlank))) {
            throw invalid("启用前须由HR完整定义五个技能等级");
        }
    }

    public static void requirements(List<HrSkillRequests.Requirement> requirements) {
        if (requirements == null || requirements.size() > 100) throw invalid("岗位要求最多100项");
        Set<Long> skills = new HashSet<>();
        BigDecimal mandatory = BigDecimal.ZERO;
        BigDecimal optional = BigDecimal.ZERO;
        boolean hasMandatory = false;
        boolean hasOptional = false;
        for (HrSkillRequests.Requirement requirement : requirements) {
            if (requirement == null || requirement.skillId() == null || requirement.skillId() <= 0
                    || !skills.add(requirement.skillId()) || requirement.mandatory() == null) {
                throw invalid("岗位技能不能为空或重复");
            }
            level(requirement.requiredLevel());
            BigDecimal weight = requirement.weight();
            if (weight == null || weight.signum() < 0 || weight.compareTo(BigDecimal.ONE) > 0
                    || weight.stripTrailingZeros().scale() > 4) throw invalid("权重须为0至1，最多四位小数");
            if (requirement.mandatory()) {
                hasMandatory = true;
                mandatory = mandatory.add(weight);
            } else {
                hasOptional = true;
                optional = optional.add(weight);
            }
        }
        if (hasMandatory && mandatory.compareTo(BigDecimal.ONE) != 0
                || hasOptional && optional.compareTo(BigDecimal.ONE) != 0) {
            throw invalid("必备和加分两组的权重须分别合计为1");
        }
    }

    public static void level(Integer level) {
        if (level == null || level < 1 || level > 5) throw invalid("技能等级须为1至5");
    }

    public static void expiry(LocalDate expiry, LocalDate today) {
        if (expiry != null && (expiry.isBefore(today) || expiry.getYear() > 9999)) {
            throw invalid("新评估的有效期不得早于今天或超出9999年");
        }
    }

    public static int effectiveLevel(HrEmployeeSkill assessment, LocalDate today, boolean sourceValid) {
        if (assessment == null || !Integer.valueOf(1).equals(assessment.getCurrentFlag())
                || !"APPROVED".equals(assessment.getAssessmentStatus()) || !sourceValid
                || assessment.getExpireDate() != null && assessment.getExpireDate().isBefore(today)) return 0;
        level(assessment.getCurrentLevel());
        return assessment.getCurrentLevel();
    }

    public static int gap(Integer requiredLevel, int currentLevel) {
        level(requiredLevel);
        if (currentLevel < 0 || currentLevel > 5) throw invalid("当前有效等级无效");
        return Math.max(requiredLevel - currentLevel, 0);
    }
}
