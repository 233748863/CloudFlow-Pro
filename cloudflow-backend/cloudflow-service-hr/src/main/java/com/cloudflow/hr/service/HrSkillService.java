package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.HrSkillRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeSkill;
import com.cloudflow.hr.domain.entity.HrExamAttempt;
import com.cloudflow.hr.domain.entity.HrExamPaper;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.entity.HrPositionSkill;
import com.cloudflow.hr.domain.entity.HrSkill;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.domain.vo.skill.HrSkillViews;
import com.cloudflow.hr.event.HrSkillEvidenceChangedEvent;
import com.cloudflow.hr.mapper.HrEmployeeSkillMapper;
import com.cloudflow.hr.mapper.HrExamAttemptMapper;
import com.cloudflow.hr.mapper.HrExamPaperMapper;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.cloudflow.hr.mapper.HrPositionSkillMapper;
import com.cloudflow.hr.mapper.HrSkillMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.mapper.HrTrainingCourseMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrHSupport.today;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrSkillService {
    private final HrSkillMapper skills;
    private final HrPositionSkillMapper requirements;
    private final HrEmployeeSkillMapper assessments;
    private final HrPositionMapper positions;
    private final HrTrainingCourseMapper courses;
    private final HrTrainingEnrollmentMapper enrollments;
    private final HrTrainingSessionMapper sessions;
    private final HrExamAttemptMapper attempts;
    private final HrExamPaperMapper papers;
    private final HrTrainingCertificateMapper certificates;
    private final HrHSupport access;
    private final HrRuleSupport support;

    public PageResult<HrSkillViews.Definition> definitions(HrSkillRequests.Query query) {
        access.permission("hr:skill:list");
        access.validate(query);
        Page<HrSkill> page = skills.selectPage(page(query), new LambdaQueryWrapper<HrSkill>()
                .eq(HrSkill::getTenantId, tenantId()).eq(HrSkill::getDeleted, 0)
                .eq(query.getSkillId() != null, HrSkill::getSkillId, query.getSkillId())
                .eq(hasText(query.getStatus()), HrSkill::getStatus, query.getStatus())
                .like(hasText(query.getKeyword()), HrSkill::getSkillName, query.getKeyword())
                .orderByAsc(HrSkill::getSkillId));
        return result(page, page.getRecords().stream().map(this::definitionView).toList());
    }

    @Audit(name = "维护技能主数据", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long saveDefinition(HrSkillRequests.Definition input) {
        access.permission("hr:skill:manage");
        access.validate(input);
        HrSkillRules.definition(input);
        HrSkill skill = input.skillId() == null ? new HrSkill() : skill(input.skillId(), false);
        if (input.skillId() != null) HrHSupport.version(input.version(), skill.getVersion());
        skill.setTenantId(tenantId());
        skill.setSkillCode(input.skillCode().trim());
        skill.setSkillName(input.skillName().trim());
        skill.setSkillCategory(input.skillCategory() == null ? "" : input.skillCategory().trim());
        skill.setDescription(input.description() == null ? "" : input.description().trim());
        skill.setLevelDefinition(new LinkedHashMap<>(input.levelDefinition()));
        skill.setStatus(input.status());
        skill.setUpdateBy(HrRuleSupport.userName());
        try {
            if (input.skillId() == null) {
                skill.setDeleted(0);
                skill.setVersion(0);
                skill.setCreateBy(HrRuleSupport.userName());
                skills.insert(skill);
            } else if (skills.updateById(skill) != 1) {
                throw conflict("VERSION_CONFLICT", "技能已变化，请重新读取");
            }
        } catch (DuplicateKeyException duplicate) {
            throw conflict("SKILL_CODE_EXISTS", "技能编码已存在");
        }
        support.audit("HR_SKILL", skill.getSkillId(), "SAVE", definitionView(skill));
        return skill.getSkillId();
    }

    public PageResult<HrSkillViews.Position> positions(HrSkillRequests.Query query) {
        either("hr:skill:manage", "hr:skill:gap");
        access.validate(query);
        Page<HrPosition> page = positions.selectPage(page(query), new LambdaQueryWrapper<HrPosition>()
                .eq(HrPosition::getTenantId, tenantId()).eq(HrPosition::getStatus, 1)
                .like(hasText(query.getKeyword()), HrPosition::getPositionName, query.getKeyword())
                .orderByAsc(HrPosition::getId));
        return result(page, page.getRecords().stream().map(this::positionView).toList());
    }

    @Audit(name = "维护岗位技能要求")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public HrSkillViews.Position savePosition(Long positionId, HrSkillRequests.PositionRequirements input) {
        access.permission("hr:skill:manage");
        access.validate(input);
        HrSkillRules.requirements(input.requirements());
        HrPosition position = skills.lockPosition(tenantId(), positionId);
        if (position == null || !Integer.valueOf(1).equals(position.getStatus())) throw invalid("岗位不存在或未启用");
        HrHSupport.version(input.version(), position.getVersion());
        for (HrSkillRequests.Requirement requirement : input.requirements()) skill(requirement.skillId(), true);
        HrSkillViews.Position before = positionView(position);
        requirements.delete(new LambdaQueryWrapper<HrPositionSkill>().eq(HrPositionSkill::getTenantId, tenantId())
                .eq(HrPositionSkill::getPositionId, positionId));
        for (HrSkillRequests.Requirement inputRow : input.requirements()) {
            HrPositionSkill requirement = new HrPositionSkill();
            requirement.setTenantId(tenantId());
            requirement.setPositionId(positionId);
            requirement.setSkillId(inputRow.skillId());
            requirement.setRequiredLevel(inputRow.requiredLevel());
            requirement.setWeight(inputRow.weight());
            requirement.setMandatoryFlag(inputRow.mandatory() ? 1 : 0);
            requirement.setVersion(0);
            requirement.setCreateBy(HrRuleSupport.userName());
            requirement.setUpdateBy(HrRuleSupport.userName());
            requirements.insert(requirement);
        }
        if (skills.advancePositionVersion(tenantId(), positionId, input.version()) != 1) throw conflict("VERSION_CONFLICT", "岗位已变化");
        position.setVersion(input.version() + 1);
        HrSkillViews.Position after = positionView(position);
        support.audit("HR_POSITION_SKILL", positionId, "SAVE", Map.of("before", before, "after", after));
        return after;
    }

    public PageResult<HrSkillViews.Course> courses(HrSkillRequests.Query query) {
        access.permission("hr:skill:manage");
        access.validate(query);
        Page<HrTrainingCourse> page = courses.selectPage(page(query), new LambdaQueryWrapper<HrTrainingCourse>()
                .eq(HrTrainingCourse::getTenantId, tenantId()).eq(HrTrainingCourse::getDeleted, 0)
                .like(hasText(query.getKeyword()), HrTrainingCourse::getCourseName, query.getKeyword())
                .orderByAsc(HrTrainingCourse::getId));
        return result(page, page.getRecords().stream().map(this::courseView).toList());
    }

    @Audit(name = "配置课程技能目标")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public HrSkillViews.Course saveCourse(Long courseId, HrSkillRequests.CourseTarget input) {
        access.permission("hr:skill:manage");
        access.validate(input);
        if ((input.skillId() == null) != (input.targetLevel() == null)) throw invalid("技能与目标等级须同时设置或同时清空");
        if (input.skillId() != null) {
            skill(input.skillId(), true);
            HrSkillRules.level(input.targetLevel());
        }
        HrTrainingCourse course = skills.lockCourse(tenantId(), courseId);
        if (course == null) throw invalid("课程不存在");
        HrHSupport.version(input.version(), course.getVersion());
        HrSkillViews.Course before = courseView(course);
        if (skills.updateCourseTarget(tenantId(), courseId, input, HrRuleSupport.userName()) != 1) throw conflict("VERSION_CONFLICT", "课程已变化");
        course.setSkillId(input.skillId());
        course.setTargetLevel(input.targetLevel());
        course.setVersion(input.version() + 1);
        HrSkillViews.Course after = courseView(course);
        support.audit("HR_TRAINING_SKILL", courseId, "SAVE", Map.of("before", before, "after", after));
        return after;
    }

    public PageResult<HrSkillViews.Employee> employees(HrSkillRequests.Query query) {
        either("hr:skill:assess", "hr:skill:gap");
        access.validate(query);
        Page<HrEmployee> page = skills.employees(page(query), tenantId(), query, employeeScope(false), today());
        return result(page, page.getRecords().stream().map(employee -> new HrSkillViews.Employee(employee.getId(),
                employee.getName(), employee.getEmployeeNo(), employee.getPositionId())).toList());
    }

    public PageResult<HrSkillViews.Assessment> assessments(HrSkillRequests.Query query, boolean mine) {
        access.permission(mine ? "hr:skill:own" : "hr:skill:assess");
        access.validate(query);
        if (hasText(query.getStatus()) && !Set.of("PENDING", "APPROVED", "REJECTED", "REVOKED", "RECORDED").contains(query.getStatus())) {
            throw invalid("评估状态无效");
        }
        if (mine) query.setEmployeeId(access.mine().getId());
        else if (query.getEmployeeId() != null) access.scope(query.getEmployeeId());
        String key = hasText(query.getRequestKey()) ? manualKey(mine ? "SELF" : "MANAGER_REVIEW", query.getRequestKey()) : null;
        Page<HrEmployeeSkill> page = skills.assessments(page(query), tenantId(), query, employeeScope(mine), key);
        return result(page, page.getRecords().stream().map(this::assessmentView).toList());
    }

    public HrSkillViews.Profile mine(HrSkillRequests.Query query) {
        access.permission("hr:skill:own");
        HrEmployee employee = access.mine();
        return new HrSkillViews.Profile(employee.getId(), employee.getName(), employee.getPositionId(), assessments(query, true));
    }

    @Audit(name = "提交本人技能自报")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long selfAssessment(HrSkillRequests.SelfAssessment input) {
        access.permission("hr:skill:self-submit");
        access.validate(input);
        HrEmployee employee = lockedEmployee(access.mine().getId());
        HrSkillRules.level(input.getLevel());
        HrSkillRules.expiry(input.getExpireDate(), today());
        skill(input.getSkillId(), true);
        String key = manualKey("SELF", input.getRequestKey());
        HrEmployeeSkill existing = byKey(employee.getId(), key);
        if (existing != null) return sameRequest(existing, input);
        HrEmployeeSkill assessment = manualAssessment(employee.getId(), input, "SELF", key);
        assessment.setAssessmentStatus("PENDING");
        assessments.insert(assessment);
        support.audit("HR_EMPLOYEE_SKILL", assessment.getEmployeeSkillId(), "SELF_SUBMIT", assessment);
        return assessment.getEmployeeSkillId();
    }

    @Audit(name = "核实员工技能证据")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long assess(HrSkillRequests.Assessment input) {
        access.permission("hr:skill:assess");
        access.validate(input);
        HrEmployee employee = lockedEmployee(input.getEmployeeId());
        access.operator(employee.getId(), "hr:skill:assess");
        if ("MANAGER_REVIEW".equals(input.getEvidenceType())) {
            HrSkillRules.level(input.getLevel());
            HrSkillRules.expiry(input.getExpireDate(), today());
            skill(input.getSkillId(), true);
            if (input.getEvidenceBizId() != null) throw invalid("主管评估不接受外部证据编号");
            String key = manualKey("MANAGER_REVIEW", input.getRequestKey());
            HrEmployeeSkill existing = byKey(employee.getId(), key);
            if (existing != null) return sameRequest(existing, input);
            HrEmployeeSkill assessment = manualAssessment(employee.getId(), input, "MANAGER_REVIEW", key);
            assessment.setAssessedBy(access.user());
            return approve(assessment, false);
        }
        if (!HrSkillRules.AUTOMATIC_EVIDENCE.contains(input.getEvidenceType()) || input.getEvidenceBizId() == null) {
            throw invalid("人工核实仅支持培训、考试、证书或主管评估，本人自报须走独立入口");
        }
        Evidence evidence = evidence(input.getEvidenceType(), input.getEvidenceBizId());
        if (evidence == null || !evidence.valid() || !employee.getId().equals(evidence.employeeId())
                || !input.getSkillId().equals(evidence.skillId())) throw invalid("证据不属于该员工、技能或尚未有效");
        return applySource(input.getEvidenceType(), input.getEvidenceBizId(), evidence);
    }

    @Audit(name = "审核本人技能自报")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Long review(Long assessmentId, HrSkillRequests.Review input) {
        access.permission("hr:skill:assess");
        access.validate(input);
        HrEmployeeSkill initial = assessment(assessmentId);
        lockedEmployee(initial.getEmployeeId());
        access.operator(initial.getEmployeeId(), "hr:skill:assess");
        HrEmployeeSkill assessment = assessment(assessmentId);
        HrHSupport.version(input.version(), assessment.getVersion());
        if (!"PENDING".equals(assessment.getAssessmentStatus()) || !"SELF".equals(assessment.getEvidenceType())) {
            throw conflict("ASSESSMENT_NOT_PENDING", "只有待审核的本人自报可以审核");
        }
        skill(assessment.getSkillId(), true);
        assessment.setAssessedBy(access.user());
        assessment.setAssessTime(HrHSupport.now());
        assessment.setRemark(HrHSupport.text(input.remark(), 500));
        if (input.approved()) {
            HrSkillRules.level(input.level());
            HrSkillRules.expiry(input.expireDate(), today());
            assessment.setCurrentLevel(input.level());
            assessment.setExpireDate(input.expireDate());
            return approve(assessment, false);
        }
        assessment.setAssessmentStatus("REJECTED");
        updateAssessment(assessment);
        support.audit("HR_EMPLOYEE_SKILL", assessmentId, "REJECT", assessment);
        return assessmentId;
    }

    @EventListener
    @Audit(name = "同步技能来源及撤销", highRisk = true)
    @Transactional(rollbackFor = Exception.class, propagation = Propagation.MANDATORY)
    public void applyEvidence(HrSkillEvidenceChangedEvent event) {
        if (event == null || !Objects.equals(tenantId(), event.tenantId()) || event.businessId() == null
                || !HrSkillRules.AUTOMATIC_EVIDENCE.contains(event.evidenceType())) throw invalid("技能事件上下文无效");
        Evidence initial = evidence(event.evidenceType(), event.businessId());
        if (initial == null) return;
        lockedEmployee(initial.employeeId());
        Evidence current = evidence(event.evidenceType(), event.businessId());
        if (current == null || !current.sourceValid()) {
            for (HrEmployeeSkill assessment : sourceAssessments(event.evidenceType(), event.businessId())) {
                if ("REVOKED".equals(assessment.getAssessmentStatus())) continue;
                assessment.setCurrentFlag(0);
                assessment.setAssessmentStatus("REVOKED");
                updateAssessment(assessment);
                support.audit("HR_EMPLOYEE_SKILL", assessment.getEmployeeSkillId(), "SOURCE_REVOKED", assessment);
            }
            return;
        }
        if (!current.valid()) return;
        applySource(event.evidenceType(), event.businessId(), current);
    }

    public PageResult<HrSkillViews.EmployeeGap> gaps(HrSkillRequests.Query query) {
        access.permission("hr:skill:gap");
        access.validate(query);
        if (query.getEmployeeId() != null) access.scope(query.getEmployeeId());
        Page<HrEmployee> page = skills.employees(page(query), tenantId(), query, employeeScope(false), today());
        return result(page, page.getRecords().stream().map(employee -> employeeGap(employee, true)).toList());
    }

    public HrSkillViews.EmployeeGap recommendations() {
        access.permission("hr:skill:own");
        return employeeGap(access.mine(), access.permitted("hr:training:enroll:add"));
    }

    private Long applySource(String evidenceType, Long businessId, Evidence evidence) {
        List<HrEmployeeSkill> existing = sourceAssessments(evidenceType, businessId);
        if (!existing.isEmpty()) {
            HrEmployeeSkill original = existing.get(0);
            if (!Objects.equals(original.getEmployeeId(), evidence.employeeId())
                    || !Objects.equals(original.getSkillId(), evidence.skillId())) {
                throw conflict("EVIDENCE_ALREADY_USED", "该证据已有固定技能归属，请核对历史记录");
            }
            return original.getEmployeeSkillId();
        }
        skill(evidence.skillId(), true);
        HrSkillRules.level(evidence.level());
        HrEmployeeSkill assessment = newAssessment(evidence.employeeId(), evidence.skillId(), evidence.level(),
                evidenceType, evidenceType + ":" + businessId, evidence.expiry());
        assessment.setEvidenceBizId(String.valueOf(businessId));
        assessment.setEvidenceSnapshot(access.json(evidence.snapshot()));
        assessment.setRemark("已核验" + evidenceType + "来源");
        return approve(assessment, true);
    }

    private Long approve(HrEmployeeSkill assessment, boolean onlyRaise) {
        HrEmployeeSkill current = current(assessment.getEmployeeId(), assessment.getSkillId());
        boolean promote = !onlyRaise || assessment.getCurrentLevel() > effective(current);
        if (promote && current != null) {
            current.setCurrentFlag(0);
            updateAssessment(current);
        }
        assessment.setCurrentFlag(promote ? 1 : 0);
        assessment.setAssessmentStatus(promote ? "APPROVED" : "RECORDED");
        assessment.setAssessTime(HrHSupport.now());
        if (assessment.getEmployeeSkillId() == null) assessments.insert(assessment);
        else updateAssessment(assessment);
        support.audit("HR_EMPLOYEE_SKILL", assessment.getEmployeeSkillId(), promote ? "APPROVE" : "RECORD", assessment);
        return assessment.getEmployeeSkillId();
    }

    private void updateAssessment(HrEmployeeSkill assessment) {
        int updated = assessments.update(null, new LambdaUpdateWrapper<HrEmployeeSkill>()
                .eq(HrEmployeeSkill::getTenantId, tenantId()).eq(HrEmployeeSkill::getEmployeeSkillId, assessment.getEmployeeSkillId())
                .eq(HrEmployeeSkill::getVersion, assessment.getVersion())
                .set(HrEmployeeSkill::getCurrentFlag, assessment.getCurrentFlag())
                .set(HrEmployeeSkill::getAssessmentStatus, assessment.getAssessmentStatus())
                .set(HrEmployeeSkill::getCurrentLevel, assessment.getCurrentLevel())
                .set(HrEmployeeSkill::getAssessedBy, assessment.getAssessedBy())
                .set(HrEmployeeSkill::getAssessTime, assessment.getAssessTime())
                .set(HrEmployeeSkill::getExpireDate, assessment.getExpireDate())
                .set(HrEmployeeSkill::getRemark, assessment.getRemark())
                .set(HrEmployeeSkill::getVersion, assessment.getVersion() + 1)
                .set(HrEmployeeSkill::getUpdateBy, HrRuleSupport.userName()).set(HrEmployeeSkill::getUpdateTime, HrHSupport.now()));
        if (updated != 1) throw conflict("VERSION_CONFLICT", "技能证据已变化，请重新读取");
        assessment.setVersion(assessment.getVersion() + 1);
    }

    private HrEmployeeSkill manualAssessment(Long employeeId, HrSkillRequests.SelfAssessment input, String type, String key) {
        HrEmployeeSkill assessment = newAssessment(employeeId, input.getSkillId(), input.getLevel(), type, key, input.getExpireDate());
        assessment.setRemark(HrHSupport.text(input.getRemark(), 500));
        assessment.setEvidenceSnapshot(access.json(Map.of("request", input, "definition", definitionView(skill(input.getSkillId(), true)))));
        return assessment;
    }

    private HrEmployeeSkill newAssessment(Long employeeId, Long skillId, Integer level, String type, String key, LocalDate expiry) {
        HrEmployeeSkill assessment = new HrEmployeeSkill();
        assessment.setTenantId(tenantId());
        assessment.setEmployeeId(employeeId);
        assessment.setSkillId(skillId);
        assessment.setCurrentLevel(level);
        assessment.setEvidenceType(type);
        assessment.setEvidenceKey(key);
        assessment.setExpireDate(expiry);
        assessment.setCurrentFlag(0);
        assessment.setVersion(0);
        assessment.setCreateBy(HrRuleSupport.userName());
        assessment.setUpdateBy(HrRuleSupport.userName());
        return assessment;
    }

    private Long sameRequest(HrEmployeeSkill existing, HrSkillRequests.SelfAssessment input) {
        if (!access.tree(existing.getEvidenceSnapshot()).path("request").equals(access.tree(access.json(input)))) {
            throw conflict("REQUEST_KEY_CONFLICT", "此提交标识已用于不同内容，请先核对原结果");
        }
        return existing.getEmployeeSkillId();
    }

    private Evidence evidence(String type, Long businessId) {
        Long employeeId;
        Long courseId;
        LocalDate expiry = null;
        boolean valid;
        if ("TRAINING".equals(type)) {
            HrTrainingEnrollment enrollment = enrollments.selectById(businessId);
            if (enrollment == null || !Objects.equals(enrollment.getTenantId(), tenantId())) return null;
            employeeId = enrollment.getEmployeeId();
            HrTrainingSession session = enrollment.getSessionId() == null ? null : sessions.selectById(enrollment.getSessionId());
            courseId = session != null && Objects.equals(session.getTenantId(), tenantId())
                    && Integer.valueOf(0).equals(session.getDeleted()) ? session.getCourseId() : null;
            valid = validEnrollment(enrollment, employeeId);
        } else if ("EXAM".equals(type)) {
            HrExamAttempt attempt = attempts.selectById(businessId);
            if (attempt == null || !Objects.equals(attempt.getTenantId(), tenantId())) return null;
            employeeId = attempt.getEmployeeId();
            HrExamPaper paper = attempt.getPaperId() == null ? null : papers.selectById(attempt.getPaperId());
            courseId = paper != null && Objects.equals(paper.getTenantId(), tenantId())
                    && Integer.valueOf(0).equals(paper.getDeleted()) ? paper.getCourseId() : null;
            valid = validAttempt(attempt, employeeId);
            if (attempt.getSessionId() != null) {
                HrTrainingSession session = sessions.selectById(attempt.getSessionId());
                valid = valid && session != null && Objects.equals(session.getTenantId(), tenantId())
                        && Integer.valueOf(0).equals(session.getDeleted()) && Objects.equals(session.getCourseId(), courseId);
            }
        } else if ("CERTIFICATE".equals(type)) {
            HrTrainingCertificate certificate = certificates.selectById(businessId);
            if (certificate == null || !Objects.equals(certificate.getTenantId(), tenantId())) return null;
            employeeId = certificate.getEmployeeId();
            courseId = certificate.getCourseId();
            expiry = certificate.getExpireDate();
            valid = validCertificate(certificate, employeeId);
        } else throw invalid("技能证据类型无效");
        HrTrainingCourse course = courseId == null ? null : courses.selectById(courseId);
        boolean configured = course != null && Objects.equals(course.getTenantId(), tenantId())
                && Integer.valueOf(0).equals(course.getDeleted()) && "PUBLISHED".equals(course.getStatus())
                && course.getSkillId() != null && course.getTargetLevel() != null;
        Long skillId = configured ? course.getSkillId() : null;
        Integer level = configured ? course.getTargetLevel() : null;
        HrSkill definition = skillId == null ? null : skills.selectById(skillId);
        boolean enabled = definition != null && Objects.equals(definition.getTenantId(), tenantId())
                && Integer.valueOf(0).equals(definition.getDeleted()) && "ACTIVE".equals(definition.getStatus());
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("type", type);
        snapshot.put("businessId", businessId);
        snapshot.put("courseId", courseId);
        snapshot.put("courseVersion", configured ? course.getVersion() : null);
        snapshot.put("definition", enabled ? definitionView(definition) : null);
        snapshot.put("targetLevel", level);
        snapshot.put("expireDate", expiry);
        return new Evidence(employeeId, skillId, level, expiry, valid, valid && configured && enabled, snapshot);
    }

    private boolean validEnrollment(HrTrainingEnrollment enrollment, Long employeeId) {
        return enrollment != null && Objects.equals(enrollment.getTenantId(), tenantId())
                && Objects.equals(enrollment.getEmployeeId(), employeeId) && Integer.valueOf(0).equals(enrollment.getDeleted())
                && "APPROVED".equals(enrollment.getStatus()) && "PASSED".equals(enrollment.getCompletionStatus());
    }

    private boolean validAttempt(HrExamAttempt attempt, Long employeeId) {
        return attempt != null && Objects.equals(attempt.getTenantId(), tenantId())
                && Objects.equals(attempt.getEmployeeId(), employeeId)
                && "GRADED".equals(attempt.getStatus()) && Boolean.TRUE.equals(attempt.getPassFlag());
    }

    private boolean validCertificate(HrTrainingCertificate certificate, Long employeeId) {
        return certificate != null && Objects.equals(certificate.getTenantId(), tenantId())
                && Objects.equals(certificate.getEmployeeId(), employeeId) && Integer.valueOf(0).equals(certificate.getDeleted())
                && "VALID".equals(certificate.getStatus()) && certificate.getIssueDate() != null
                && !certificate.getIssueDate().isAfter(today())
                && (certificate.getExpireDate() == null || !certificate.getExpireDate().isBefore(today()));
    }

    private int effective(HrEmployeeSkill assessment) {
        boolean valid = true;
        if (assessment != null && HrSkillRules.AUTOMATIC_EVIDENCE.contains(assessment.getEvidenceType())) {
            Long businessId;
            try { businessId = Long.valueOf(assessment.getEvidenceBizId()); }
            catch (NumberFormatException malformed) { return 0; }
            valid = switch (assessment.getEvidenceType()) {
                case "TRAINING" -> validEnrollment(enrollments.selectById(businessId), assessment.getEmployeeId());
                case "EXAM" -> validAttempt(attempts.selectById(businessId), assessment.getEmployeeId());
                case "CERTIFICATE" -> validCertificate(certificates.selectById(businessId), assessment.getEmployeeId());
                default -> false;
            };
        }
        return HrSkillRules.effectiveLevel(assessment, today(), valid);
    }

    private HrSkillViews.EmployeeGap employeeGap(HrEmployee employee, boolean recommend) {
        HrPosition position = employee.getPositionId() == null ? null : positions.selectById(employee.getPositionId());
        if (position == null || !Objects.equals(position.getTenantId(), tenantId())) {
            return new HrSkillViews.EmployeeGap(employee.getId(), employee.getName(), null, null, List.of());
        }
        List<HrSkillViews.Gap> gaps = new ArrayList<>();
        for (HrPositionSkill requirement : positionRequirements(position.getId())) {
            HrSkill definition = skill(requirement.getSkillId(), false);
            int level = effective(current(employee.getId(), requirement.getSkillId()));
            int gap = HrSkillRules.gap(requirement.getRequiredLevel(), level);
            List<HrSkillViews.Recommendation> recommendations = recommend && gap > 0 && "ACTIVE".equals(definition.getStatus())
                    ? skills.recommendations(tenantId(), employee.getId(), requirement.getSkillId(), requirement.getRequiredLevel(), HrHSupport.now())
                    : List.of();
            gaps.add(new HrSkillViews.Gap(requirement.getSkillId(), definition.getSkillName(), requirement.getRequiredLevel(),
                    level, gap, Integer.valueOf(1).equals(requirement.getMandatoryFlag()), requirement.getWeight().toPlainString(), recommendations));
        }
        return new HrSkillViews.EmployeeGap(employee.getId(), employee.getName(), position.getId(), position.getPositionName(), gaps);
    }

    private HrSkillViews.Assessment assessmentView(HrEmployeeSkill assessment) {
        HrEmployee employee = access.employee(assessment.getEmployeeId());
        HrSkill definition = skill(assessment.getSkillId(), false);
        return new HrSkillViews.Assessment(assessment.getEmployeeSkillId(), employee.getId(), employee.getName(),
                definition.getSkillId(), definition.getSkillName(), assessment.getCurrentLevel(), assessment.getEvidenceType(),
                assessment.getEvidenceBizId(), assessment.getAssessmentStatus(), Integer.valueOf(1).equals(assessment.getCurrentFlag()),
                effective(assessment), assessment.getExpireDate(), assessment.getRemark(), assessment.getCreateTime(),
                assessment.getAssessTime(), assessment.getVersion(), assessment.getEvidenceKey());
    }

    private HrSkillViews.Definition definitionView(HrSkill skill) {
        return new HrSkillViews.Definition(skill.getSkillId(), skill.getSkillCode(), skill.getSkillName(), skill.getSkillCategory(),
                skill.getDescription(), skill.getLevelDefinition(), skill.getStatus(), skill.getVersion());
    }

    private HrSkillViews.Position positionView(HrPosition position) {
        List<HrSkillViews.Requirement> rows = positionRequirements(position.getId()).stream().map(requirement ->
                new HrSkillViews.Requirement(requirement.getSkillId(), skill(requirement.getSkillId(), false).getSkillName(),
                        requirement.getRequiredLevel(), requirement.getWeight().toPlainString(), Integer.valueOf(1).equals(requirement.getMandatoryFlag()))).toList();
        return new HrSkillViews.Position(position.getId(), position.getPositionName(), position.getVersion(), rows);
    }

    private HrSkillViews.Course courseView(HrTrainingCourse course) {
        String skillName = course.getSkillId() == null ? null : skill(course.getSkillId(), false).getSkillName();
        return new HrSkillViews.Course(course.getId(), course.getCourseName(), course.getStatus(), course.getVersion(), course.getSkillId(), skillName, course.getTargetLevel());
    }

    private List<HrPositionSkill> positionRequirements(Long positionId) {
        return requirements.selectList(new LambdaQueryWrapper<HrPositionSkill>().eq(HrPositionSkill::getTenantId, tenantId())
                .eq(HrPositionSkill::getPositionId, positionId).orderByDesc(HrPositionSkill::getMandatoryFlag).orderByAsc(HrPositionSkill::getSkillId));
    }

    private HrSkill skill(Long id, boolean active) {
        HrSkill skill = id == null ? null : skills.selectById(id);
        if (skill == null || !Objects.equals(skill.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(skill.getDeleted())) {
            throw new HrHException("SKILL_NOT_FOUND", "技能不存在", 404);
        }
        if (active && !"ACTIVE".equals(skill.getStatus())) throw conflict("SKILL_NOT_ACTIVE", "技能尚未核定启用");
        return skill;
    }

    private HrEmployee lockedEmployee(Long employeeId) {
        HrEmployee employee = employeeId == null ? null : skills.lockEmployee(tenantId(), employeeId);
        if (employee == null) throw new HrHException("EMPLOYEE_NOT_FOUND", "员工不存在", 404);
        return employee;
    }

    private HrEmployeeSkill assessment(Long id) {
        HrEmployeeSkill assessment = id == null ? null : assessments.selectById(id);
        if (assessment == null || !Objects.equals(assessment.getTenantId(), tenantId())) throw new HrHException("ASSESSMENT_NOT_FOUND", "评估记录不存在", 404);
        return assessment;
    }

    private HrEmployeeSkill byKey(Long employeeId, String key) {
        return assessments.selectOne(new LambdaQueryWrapper<HrEmployeeSkill>().eq(HrEmployeeSkill::getTenantId, tenantId())
                .eq(HrEmployeeSkill::getEmployeeId, employeeId).eq(HrEmployeeSkill::getEvidenceKey, key));
    }

    private HrEmployeeSkill current(Long employeeId, Long skillId) {
        return assessments.selectOne(new LambdaQueryWrapper<HrEmployeeSkill>().eq(HrEmployeeSkill::getTenantId, tenantId())
                .eq(HrEmployeeSkill::getEmployeeId, employeeId).eq(HrEmployeeSkill::getSkillId, skillId).eq(HrEmployeeSkill::getCurrentFlag, 1));
    }

    private List<HrEmployeeSkill> sourceAssessments(String type, Long businessId) {
        return assessments.selectList(new LambdaQueryWrapper<HrEmployeeSkill>().eq(HrEmployeeSkill::getTenantId, tenantId())
                .eq(HrEmployeeSkill::getEvidenceType, type).eq(HrEmployeeSkill::getEvidenceBizId, String.valueOf(businessId))
                .orderByAsc(HrEmployeeSkill::getEmployeeSkillId));
    }

    private HrSkillMapper.EmployeeScope employeeScope(boolean mine) {
        Long user = access.user();
        if (!mine && UserContext.getDsType() == null) throw forbidden();
        return new HrSkillMapper.EmployeeScope(mine ? 4 : UserContext.getDsType(), user, UserContext.getDeptId(), List.copyOf(UserContext.getDsDeptIds()));
    }

    private String manualKey(String type, String requestKey) { return type + ":" + access.user() + ":" + HrHSupport.key(requestKey); }
    private void either(String first, String second) {
        access.user();
        if (!access.permitted(first) && !access.permitted(second)) throw forbidden();
    }
    private static boolean hasText(String text) { return text != null && !text.isBlank(); }
    private static <T> Page<T> page(HrSkillRequests.Query query) { return new Page<>(query.getPageNum(), query.getPageSize()); }
    private static <T, R> PageResult<R> result(Page<T> page, List<R> records) {
        return new PageResult<>(records, page.getTotal(), page.getCurrent(), page.getSize());
    }
    private record Evidence(Long employeeId, Long skillId, Integer level, LocalDate expiry,
            boolean sourceValid, boolean valid, Map<String, Object> snapshot) { }
}
