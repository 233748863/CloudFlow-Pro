package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.service.HrResumeParserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
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
public class HrResumeParserServiceImpl implements HrResumeParserService {

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

    private final JdbcTemplate jdbcTemplate;
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

        String skillsJson = writeJson(skills);
        String experiencesJson = writeJson(experiences);

        Long existing = jdbcTemplate.query(
                "SELECT id FROM hr_resume_parsed_fields WHERE tenant_id=? AND candidate_id=? AND deleted=0 ORDER BY id DESC LIMIT 1",
                rs -> rs.next() ? rs.getLong(1) : null,
                TENANT_ID, candidateId);
        String operator = defaultOperator();
        if (existing != null) {
            jdbcTemplate.update(
                    "UPDATE hr_resume_parsed_fields SET resume_url=?, parsed_name=?, parsed_phone=?, parsed_email=?, parsed_education=?, parsed_school=?, parsed_skills=?, parsed_experiences=?, raw_text=?, confidence=?, review_status='PENDING', parse_error=NULL, update_by=? WHERE id=?",
                    resumeUrl, name, phone, email, education, school,
                    skillsJson, experiencesJson, text, confidence, operator, existing);
            return existing;
        }
        jdbcTemplate.update(
                "INSERT INTO hr_resume_parsed_fields (tenant_id, candidate_id, resume_url, parsed_name, parsed_phone, parsed_email, parsed_education, parsed_school, parsed_skills, parsed_experiences, raw_text, confidence, review_status, create_by, update_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)",
                TENANT_ID, candidateId, resumeUrl, name, phone, email, education, school,
                skillsJson, experiencesJson, text, confidence, operator, operator);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM hr_resume_parsed_fields WHERE tenant_id=? AND candidate_id=? ORDER BY id DESC LIMIT 1",
                Long.class, TENANT_ID, candidateId);
    }

    @Override
    public List<Map<String, Object>> listParsed(Long candidateId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT * FROM hr_resume_parsed_fields WHERE tenant_id=? AND candidate_id=? AND deleted=0 ORDER BY id DESC",
                TENANT_ID, candidateId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            result.add(toCamel(row));
        }
        return result;
    }

    @Override
    @Transactional
    public void confirmParsed(Long parsedId) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT candidate_id, parsed_name, parsed_phone, parsed_email FROM hr_resume_parsed_fields WHERE id=? AND tenant_id=? AND deleted=0",
                parsedId, TENANT_ID);
        Long candidateId = ((Number) row.get("candidate_id")).longValue();
        String name = (String) row.get("parsed_name");
        String phone = (String) row.get("parsed_phone");
        String email = (String) row.get("parsed_email");

        // 仅回填空字段，避免覆盖 HR 手动填的更准确值。
        jdbcTemplate.update(
                "UPDATE hr_candidate SET "
                        + "name=COALESCE(NULLIF(name,''), ?), "
                        + "phone=COALESCE(NULLIF(phone,''), ?), "
                        + "email=COALESCE(NULLIF(email,''), ?), "
                        + "update_by=? "
                        + "WHERE id=? AND tenant_id=? AND deleted=0",
                name, phone, email, defaultOperator(), candidateId, TENANT_ID);

        jdbcTemplate.update(
                "UPDATE hr_resume_parsed_fields SET review_status='CONFIRMED', reviewer_id=?, reviewer_name=?, review_time=?, update_by=? WHERE id=? AND tenant_id=?",
                UserContext.getUserId(), defaultOperator(), LocalDateTime.now(), defaultOperator(), parsedId, TENANT_ID);
    }

    @Override
    public void rejectParsed(Long parsedId, String reason) {
        jdbcTemplate.update(
                "UPDATE hr_resume_parsed_fields SET review_status='REJECTED', reviewer_id=?, reviewer_name=?, review_time=?, parse_error=?, update_by=? WHERE id=? AND tenant_id=?",
                UserContext.getUserId(), defaultOperator(), LocalDateTime.now(),
                reason, defaultOperator(), parsedId, TENANT_ID);
    }

    @Override
    public void updateParsed(Long parsedId, HrResumeParsedFieldsPayload payload) {
        if (payload == null) {
            return;
        }
        jdbcTemplate.update(
                "UPDATE hr_resume_parsed_fields SET parsed_name=?, parsed_phone=?, parsed_email=?, parsed_education=?, parsed_school=?, parsed_skills=?, parsed_experiences=?, update_by=? WHERE id=? AND tenant_id=?",
                payload.getParsedName(), payload.getParsedPhone(), payload.getParsedEmail(),
                payload.getParsedEducation(), payload.getParsedSchool(),
                writeJson(payload.getParsedSkills()), writeJson(payload.getParsedExperiences()),
                defaultOperator(), parsedId, TENANT_ID);
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

    private String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> toCamel(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            result.put(toCamelKey(entry.getKey()), entry.getValue());
        }
        return result;
    }

    private String toCamelKey(String key) {
        StringBuilder builder = new StringBuilder();
        boolean upperNext = false;
        for (char ch : key.toCharArray()) {
            if (ch == '_') {
                upperNext = true;
                continue;
            }
            builder.append(upperNext ? Character.toUpperCase(ch) : Character.toLowerCase(ch));
            upperNext = false;
        }
        return builder.toString();
    }

    private String defaultOperator() {
        String name = UserContext.getUserName();
        return StringUtils.hasText(name) ? name : "system";
    }
}
