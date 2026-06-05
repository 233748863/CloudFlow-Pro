package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrResumeParsedFields;
import com.cloudflow.hr.domain.vo.recruitment.HrResumeParsedFieldVO;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrResumeParsedFieldsMapper;
import com.cloudflow.hr.service.IHrResumeParserService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HR-P1-1 简历解析实现（正则抽取版）。
 *
 * <p>抽取字段：姓名 / 手机 / 邮箱 / 学历 / 院校 / 技能标签 / 工作经历段落。
 * Tika 暂未引入，rawText 假定上层已用 InputStream + 编码检测落地（PDF/DOCX 上层先转纯文本）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrResumeParserServiceImpl implements IHrResumeParserService {

    private static final long TENANT_ID = 100000L;

    // 11 位中国手机号
    private static final Pattern PHONE_PATTERN = Pattern.compile("(?<![\\d])(1[3-9]\\d{9})(?![\\d])");
    // 邮箱
    private static final Pattern EMAIL_PATTERN = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    // 学历
    private static final Set<String> EDUCATION_KEYWORDS = Set.of(
            "博士", "硕士", "研究生", "本科", "学士", "大专", "专科", "高中", "中专", "MBA", "EMBA");
    // 院校匹配（提取"XX大学/学院"）
    private static final Pattern SCHOOL_PATTERN = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z0-9（）\\(\\)]{2,30}(?:大学|学院|学校))");
    // 工作经历段落（粗略：YYYY.MM-YYYY.MM / YYYY-YYYY 后跟公司名 + 职位）
    private static final Pattern EXPERIENCE_PATTERN = Pattern.compile(
            "((?:19|20)\\d{2}[\\.\\-/年](?:0?[1-9]|1[0-2])?)[\\.\\-至到~—\\s]+((?:19|20)\\d{2}[\\.\\-/年](?:0?[1-9]|1[0-2])?|至今|今|现在|present)\\s*[\\s\\S]{0,80}?(?=\\n)");
    // 常见技能词典（不强约束，命中即收）
    private static final List<String> SKILL_DICT = List.of(
            "Java", "Python", "Go", "Golang", "C++", "C#", "JavaScript", "TypeScript",
            "Spring", "Spring Boot", "Spring Cloud", "MyBatis", "Redis", "Kafka", "RabbitMQ",
            "MySQL", "PostgreSQL", "Oracle", "MongoDB", "Elasticsearch",
            "React", "Vue", "Angular", "Node.js",
            "Docker", "Kubernetes", "K8s", "AWS", "Azure", "阿里云", "腾讯云",
            "Git", "Jenkins", "Maven", "Gradle",
            "数据分析", "机器学习", "深度学习", "AI", "NLP",
            "项目管理", "PMP", "Scrum", "Agile",
            "招聘", "薪酬", "绩效", "培训", "员工关系", "组织发展");

    private final HrResumeParsedFieldsMapper parsedFieldsMapper;
    private final HrCandidateMapper candidateMapper;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public Long parseResume(Long candidateId, String resumeUrl, String rawText) {
        if (candidateId == null) {
            throw new IllegalArgumentException("candidateId 不能为空");
        }
        String text = rawText == null ? "" : rawText;

        String phone = firstMatch(PHONE_PATTERN, text);
        String email = firstMatch(EMAIL_PATTERN, text);
        String education = pickEducation(text);
        String school = firstGroup(SCHOOL_PATTERN, text);
        String name = inferName(text);
        ArrayNode skills = extractSkills(text);
        ArrayNode experiences = extractExperiences(text);

        int hits = 0;
        int probes = 5;
        if (StringUtils.hasText(name)) hits++;
        if (StringUtils.hasText(phone)) hits++;
        if (StringUtils.hasText(email)) hits++;
        if (StringUtils.hasText(education)) hits++;
        if (StringUtils.hasText(school)) hits++;
        BigDecimal confidence = BigDecimal.valueOf(hits)
                .divide(BigDecimal.valueOf(probes), 3, RoundingMode.HALF_UP);

        String operator = defaultOperator();
        HrResumeParsedFields existing = parsedFieldsMapper.selectPage(new Page<>(1, 1, false),
                new LambdaQueryWrapper<HrResumeParsedFields>()
                        .eq(HrResumeParsedFields::getTenantId, TENANT_ID)
                        .eq(HrResumeParsedFields::getCandidateId, candidateId)
                        .eq(HrResumeParsedFields::getDeleted, 0)
                        .orderByDesc(HrResumeParsedFields::getId))
                .getRecords().stream().findFirst().orElse(null);
        if (existing != null) {
            existing.setResumeUrl(resumeUrl);
            existing.setParsedName(name);
            existing.setParsedPhone(phone);
            existing.setParsedEmail(email);
            existing.setParsedEducation(education);
            existing.setParsedSchool(school);
            existing.setParsedSkills(skills);
            existing.setParsedExperiences(experiences);
            existing.setRawText(text);
            existing.setConfidence(confidence);
            existing.setReviewStatus("PENDING");
            existing.setParseError(null);
            existing.setUpdateBy(operator);
            parsedFieldsMapper.updateById(existing);
            return existing.getId();
        }
        HrResumeParsedFields row = new HrResumeParsedFields();
        row.setTenantId(TENANT_ID);
        row.setCandidateId(candidateId);
        row.setResumeUrl(resumeUrl);
        row.setParsedName(name);
        row.setParsedPhone(phone);
        row.setParsedEmail(email);
        row.setParsedEducation(education);
        row.setParsedSchool(school);
        row.setParsedSkills(skills);
        row.setParsedExperiences(experiences);
        row.setRawText(text);
        row.setConfidence(confidence);
        row.setReviewStatus("PENDING");
        row.setCreateBy(operator);
        row.setUpdateBy(operator);
        row.setDeleted(0);
        parsedFieldsMapper.insert(row);
        return row.getId();
    }

    @Override
    public List<HrResumeParsedFieldVO> listParsed(Long candidateId) {
        List<HrResumeParsedFields> rows = parsedFieldsMapper.selectList(
                new LambdaQueryWrapper<HrResumeParsedFields>()
                        .eq(HrResumeParsedFields::getTenantId, TENANT_ID)
                        .eq(HrResumeParsedFields::getCandidateId, candidateId)
                        .eq(HrResumeParsedFields::getDeleted, 0)
                        .orderByDesc(HrResumeParsedFields::getId));
        List<HrResumeParsedFieldVO> result = new ArrayList<>(rows.size());
        for (HrResumeParsedFields row : rows) {
            result.add(objectMapper.convertValue(row, HrResumeParsedFieldVO.class));
        }
        return result;
    }

    @Override
    @Transactional
    public void confirmParsed(Long parsedId) {
        HrResumeParsedFields row = parsedFieldsMapper.selectOne(
                new LambdaQueryWrapper<HrResumeParsedFields>()
                        .eq(HrResumeParsedFields::getId, parsedId)
                        .eq(HrResumeParsedFields::getTenantId, TENANT_ID)
                        .eq(HrResumeParsedFields::getDeleted, 0));
        if (row == null) {
            return;
        }

        // 仅回填空字段，避免覆盖 HR 手动填的更准确值。
        HrCandidate candidate = candidateMapper.selectOne(
                new LambdaQueryWrapper<HrCandidate>()
                        .eq(HrCandidate::getId, row.getCandidateId())
                        .eq(HrCandidate::getTenantId, TENANT_ID)
                        .eq(HrCandidate::getDeleted, 0));
        if (candidate != null) {
            boolean dirty = false;
            if (!StringUtils.hasText(candidate.getName()) && StringUtils.hasText(row.getParsedName())) {
                candidate.setName(row.getParsedName());
                dirty = true;
            }
            if (!StringUtils.hasText(candidate.getPhone()) && StringUtils.hasText(row.getParsedPhone())) {
                candidate.setPhone(row.getParsedPhone());
                dirty = true;
            }
            if (!StringUtils.hasText(candidate.getEmail()) && StringUtils.hasText(row.getParsedEmail())) {
                candidate.setEmail(row.getParsedEmail());
                dirty = true;
            }
            if (dirty) {
                candidate.setUpdateBy(defaultOperator());
                candidateMapper.updateById(candidate);
            }
        }

        row.setReviewStatus("CONFIRMED");
        row.setReviewerId(UserContext.getUserId());
        row.setReviewerName(defaultOperator());
        row.setReviewTime(LocalDateTime.now());
        row.setUpdateBy(defaultOperator());
        parsedFieldsMapper.updateById(row);
    }

    @Override
    public void rejectParsed(Long parsedId, String reason) {
        HrResumeParsedFields row = parsedFieldsMapper.selectOne(
                new LambdaQueryWrapper<HrResumeParsedFields>()
                        .eq(HrResumeParsedFields::getId, parsedId)
                        .eq(HrResumeParsedFields::getTenantId, TENANT_ID));
        if (row == null) {
            return;
        }
        row.setReviewStatus("REJECTED");
        row.setReviewerId(UserContext.getUserId());
        row.setReviewerName(defaultOperator());
        row.setReviewTime(LocalDateTime.now());
        row.setParseError(reason);
        row.setUpdateBy(defaultOperator());
        parsedFieldsMapper.updateById(row);
    }

    @Override
    @Audit(name = "更新简历解析")
    public void updateParsed(Long parsedId, HrResumeParsedFieldsPayload payload) {
        if (payload == null) {
            return;
        }
        HrResumeParsedFields row = parsedFieldsMapper.selectOne(
                new LambdaQueryWrapper<HrResumeParsedFields>()
                        .eq(HrResumeParsedFields::getId, parsedId)
                        .eq(HrResumeParsedFields::getTenantId, TENANT_ID));
        if (row == null) {
            return;
        }
        row.setParsedName(payload.getParsedName());
        row.setParsedPhone(payload.getParsedPhone());
        row.setParsedEmail(payload.getParsedEmail());
        row.setParsedEducation(payload.getParsedEducation());
        row.setParsedSchool(payload.getParsedSchool());
        row.setParsedSkills(payload.getParsedSkills());
        row.setParsedExperiences(payload.getParsedExperiences());
        row.setUpdateBy(defaultOperator());
        parsedFieldsMapper.updateById(row);
    }

    // ============== helpers ==============

    private String firstMatch(Pattern p, String text) {
        Matcher m = p.matcher(text);
        return m.find() ? m.group() : null;
    }

    private String firstGroup(Pattern p, String text) {
        Matcher m = p.matcher(text);
        return m.find() ? m.group(1) : null;
    }

    private String pickEducation(String text) {
        String upper = text == null ? "" : text;
        for (String kw : EDUCATION_KEYWORDS) {
            if (upper.contains(kw)) {
                return kw;
            }
        }
        return null;
    }

    /** 启发式：取文本前 400 字内的 2-4 个中文字符作为姓名（避开常见关键词）。 */
    private String inferName(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        String head = text.substring(0, Math.min(400, text.length()));
        Matcher m = Pattern.compile("(?<![\\u4e00-\\u9fa5])([\\u4e00-\\u9fa5]{2,4})(?![\\u4e00-\\u9fa5])").matcher(head);
        Set<String> stopWords = Set.of(
                "简历", "个人简历", "基本信息", "联系方式", "教育背景", "工作经历",
                "项目经验", "技能特长", "自我评价", "求职意向", "实习经历");
        while (m.find()) {
            String candidate = m.group(1);
            if (stopWords.contains(candidate)) {
                continue;
            }
            return candidate;
        }
        return null;
    }

    private ArrayNode extractSkills(String text) {
        ArrayNode arr = objectMapper.createArrayNode();
        if (!StringUtils.hasText(text)) {
            return arr;
        }
        String upper = text.toUpperCase(Locale.ROOT);
        Set<String> hits = new LinkedHashSet<>();
        for (String skill : SKILL_DICT) {
            if (upper.contains(skill.toUpperCase(Locale.ROOT))) {
                hits.add(skill);
            }
        }
        hits.forEach(arr::add);
        return arr;
    }

    private ArrayNode extractExperiences(String text) {
        ArrayNode arr = objectMapper.createArrayNode();
        if (!StringUtils.hasText(text)) {
            return arr;
        }
        Matcher m = EXPERIENCE_PATTERN.matcher(text);
        int cap = 0;
        while (m.find() && cap < 10) {
            Map<String, Object> exp = new LinkedHashMap<>();
            exp.put("start", m.group(1));
            exp.put("end", m.group(2));
            String segment = text.substring(m.start(), Math.min(text.length(), m.end() + 100)).trim();
            exp.put("segment", segment);
            arr.add(objectMapper.valueToTree(exp));
            cap++;
        }
        return arr;
    }

    private String defaultOperator() {
        String name = UserContext.getUserName();
        return StringUtils.hasText(name) ? name : "system";
    }
}
