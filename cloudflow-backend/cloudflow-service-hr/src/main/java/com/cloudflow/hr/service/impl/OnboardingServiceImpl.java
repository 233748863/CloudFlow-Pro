package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.client.dto.UserUpdateDTO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.client.vo.UserVO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.OnboardingApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OnboardingConfirmDTO;
import com.cloudflow.hr.domain.dto.OnboardingTaskCompleteDTO;
import com.cloudflow.hr.domain.entity.Candidate;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.OnboardingApplication;
import com.cloudflow.hr.domain.entity.OnboardingTask;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.vo.OnboardingApplicationVO;
import com.cloudflow.hr.domain.vo.OnboardingTaskVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.OnboardingApplicationMapper;
import com.cloudflow.hr.mapper.OnboardingTaskMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.OnboardingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;

/**
 * 入职流程服务实现。
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OnboardingServiceImpl implements OnboardingService {

    private static final int SYS_USER_NICK_NAME_MAX_LENGTH = 30;

    private final OnboardingApplicationMapper onboardingApplicationMapper;
    private final OnboardingTaskMapper onboardingTaskMapper;
    private final EmployeeMapper employeeMapper;
    private final PositionMapper positionMapper;
    private final CandidateMapper candidateMapper;
    private final AuthServiceClient authServiceClient;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createOnboardingApplication(OnboardingApplicationCreateDTO dto) {
        log.info("创建入职申请，姓名：{}，部门ID：{}，岗位ID：{}", dto.getName(), dto.getDeptId(), dto.getPostId());

        Long tenantId = SecurityUtils.getTenantId();
        Candidate candidate = loadCandidateIfPresent(dto.getCandidateId());
        validateCandidateForOnboarding(candidate);
        validateDeptId(dto.getDeptId());
        validatePostId(dto.getPostId());

        if (dto.getPositionId() != null) {
            Position position = positionMapper.selectById(dto.getPositionId());
            if (position == null) {
                throw HrBusinessException.positionNotFound(dto.getPositionId());
            }
        }

        OnboardingApplication application = new OnboardingApplication();
        BeanUtils.copyProperties(dto, application);
        application.setTenantId(tenantId);
        application.setApplicationNo(generateApplicationNo());
        application.setGender(resolveApplicationGender(dto));
        application.setStatus("DRAFT");

        onboardingApplicationMapper.insert(application);
        log.info("入职申请创建成功，申请ID：{}，申请编号：{}", application.getId(), application.getApplicationNo());
        return application.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitOnboardingApplication(Long applicationId) {
        log.info("提交入职申请，申请ID：{}", applicationId);

        OnboardingApplication application = onboardingApplicationMapper.selectById(applicationId);
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }
        if (!"DRAFT".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有草稿状态的入职申请才能提交");
        }

        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(application.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getOnboarding());
        processStartDTO.setBusinessType("ONBOARDING");
        processStartDTO.setBusinessId(application.getId());
        processStartDTO.setBusinessNo(application.getApplicationNo());
        processStartDTO.setProcessTitle("入职申请-" + application.getName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("applicantName", application.getName());
        variables.put("deptId", application.getDeptId());
        variables.put("postId", application.getPostId());
        variables.put("expectedDate", application.getExpectedDate().toString());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动入职审批流程失败：" + result.getMsg());
            }

            application.setStatus("APPROVING");
            application.setProcessInstanceId(result.getData());
            onboardingApplicationMapper.updateById(application);

            log.info("入职申请提交成功，申请ID：{}，流程实例ID：{}", applicationId, result.getData());
        } catch (Exception e) {
            log.error("启动入职审批流程失败，申请ID：{}", applicationId, e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动入职审批流程失败：" + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveOnboarding(Long applicationId) {
        log.info("入职申请审批通过，申请ID：{}", applicationId);

        OnboardingApplication application = onboardingApplicationMapper.selectById(applicationId);
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的入职申请才能审批通过");
        }

        application.setStatus("APPROVED");
        onboardingApplicationMapper.updateById(application);
        generateOnboardingTasks(application);

        log.info("入职申请审批通过处理完成，申请ID：{}", applicationId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectOnboarding(Long applicationId) {
        log.info("入职申请审批拒绝，申请ID：{}", applicationId);

        OnboardingApplication application = onboardingApplicationMapper.selectById(applicationId);
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的入职申请才能拒绝");
        }

        application.setStatus("REJECTED");
        onboardingApplicationMapper.updateById(application);
        log.info("入职申请审批拒绝处理完成，申请ID：{}", applicationId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void completeOnboardingTask(OnboardingTaskCompleteDTO dto) {
        log.info("完成入职任务，任务ID：{}", dto.getTaskId());

        OnboardingTask task = onboardingTaskMapper.selectById(dto.getTaskId());
        if (task == null) {
            throw new HrBusinessException("ONBOARDING_TASK_NOT_FOUND", "入职任务不存在");
        }
        if ("COMPLETED".equals(task.getStatus())) {
            throw new HrBusinessException("TASK_ALREADY_COMPLETED", "入职任务已完成");
        }

        task.setStatus("COMPLETED");
        task.setCompletedTime(LocalDateTime.now());
        task.setRemark(dto.getRemark());
        onboardingTaskMapper.updateById(task);

        if ("ACCOUNT".equals(task.getTaskType())) {
            ensureUserAccount(task.getApplicationId());
        }

        log.info("入职任务完成，任务ID：{}", dto.getTaskId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirmOnboarding(OnboardingConfirmDTO dto) {
        log.info("确认入职，申请ID：{}，实际入职日期：{}", dto.getApplicationId(), dto.getActualDate());

        OnboardingApplication application = onboardingApplicationMapper.selectById(dto.getApplicationId());
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }
        if (!"APPROVED".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批通过的入职申请才能确认入职");
        }
        // 真实联调时需要先把入职任务办完，避免绕过任务闭环直接确认入职。
        LambdaQueryWrapper<OnboardingTask> pendingTaskWrapper = Wrappers.lambdaQuery(OnboardingTask.class);
        pendingTaskWrapper.eq(OnboardingTask::getApplicationId, dto.getApplicationId())
                .ne(OnboardingTask::getStatus, "COMPLETED");
        Long pendingTaskCount = onboardingTaskMapper.selectCount(pendingTaskWrapper);
        if (pendingTaskCount != null && pendingTaskCount > 0) {
            throw new HrBusinessException("ONBOARDING_TASKS_INCOMPLETE", "入职任务未全部完成，不能确认入职");
        }

        Employee employee = createEmployeeFromApplication(application, dto.getActualDate());
        // 确认入职后要同步回写候选人状态，否则招聘链路仍会把人显示成未入职。
        syncCandidateStatusAfterOnboarding(application.getCandidateId());
        application.setStatus("ONBOARDED");
        application.setEmployeeId(employee.getId());
        onboardingApplicationMapper.updateById(application);

        log.info("确认入职成功，申请ID：{}，员工ID：{}", dto.getApplicationId(), employee.getId());
    }

    @Override
    public List<OnboardingApplicationVO> listOnboardingApplications(String keyword, String status) {
        log.info("查询入职申请列表，keyword：{}，status：{}", keyword, status);

        LambdaQueryWrapper<OnboardingApplication> wrapper = Wrappers.lambdaQuery(OnboardingApplication.class);
        wrapper.orderByDesc(OnboardingApplication::getCreateTime);

        if (StringUtils.hasText(status)) {
            wrapper.eq(OnboardingApplication::getStatus, status.toUpperCase(Locale.ROOT));
        }

        if (StringUtils.hasText(keyword)) {
            wrapper.and(query -> query
                    .like(OnboardingApplication::getApplicationNo, keyword)
                    .or()
                    .like(OnboardingApplication::getName, keyword)
                    .or()
                    .like(OnboardingApplication::getPhone, keyword));
        }

        return onboardingApplicationMapper.selectList(wrapper).stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Override
    public OnboardingApplicationVO getOnboardingApplication(Long applicationId) {
        log.info("查询入职申请详情，申请ID：{}", applicationId);

        OnboardingApplication application = onboardingApplicationMapper.selectById(applicationId);
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }

        return convertToVO(application);
    }

    @Override
    public List<OnboardingTaskVO> getOnboardingTasks(Long applicationId) {
        log.info("查询入职任务列表，申请ID：{}", applicationId);

        LambdaQueryWrapper<OnboardingTask> wrapper = Wrappers.lambdaQuery(OnboardingTask.class);
        wrapper.eq(OnboardingTask::getApplicationId, applicationId)
                .orderByAsc(OnboardingTask::getCreateTime);

        return onboardingTaskMapper.selectList(wrapper).stream()
                .map(task -> {
                    OnboardingTaskVO vo = new OnboardingTaskVO();
                    BeanUtils.copyProperties(task, vo);
                    vo.setTaskTypeDesc(getTaskTypeDesc(task.getTaskType()));
                    vo.setStatusDesc(getTaskStatusDesc(task.getStatus()));
                    return vo;
                })
                .collect(Collectors.toList());
    }

    private String generateApplicationNo() {
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String random = String.format("%04d", new Random().nextInt(10000));
        return "OB" + date + random;
    }

    private void validateDeptId(Long deptId) {
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            if (!result.isSuccess() || result.getData() == null) {
                throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
            }
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("校验部门ID失败，deptId：{}", deptId, e);
            throw new HrSystemException("VALIDATE_DEPT_FAILED", "校验部门ID失败", e);
        }
    }

    private void validatePostId(Long postId) {
        try {
            R<PostVO> result = authServiceClient.getPostById(postId);
            if (!result.isSuccess() || result.getData() == null) {
                throw HrBusinessException.invalidDeptOrPost("POST", postId);
            }
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("校验岗位ID失败，postId：{}", postId, e);
            throw new HrSystemException("VALIDATE_POST_FAILED", "校验岗位ID失败", e);
        }
    }

    private void generateOnboardingTasks(OnboardingApplication application) {
        log.info("生成入职任务清单，申请ID：{}", application.getId());

        List<OnboardingTask> tasks = new ArrayList<>();

        OnboardingTask documentTask = new OnboardingTask();
        documentTask.setTenantId(application.getTenantId());
        documentTask.setApplicationId(application.getId());
        documentTask.setTaskName("收集入职资料");
        documentTask.setTaskType("DOCUMENT");
        documentTask.setTaskDescription("收集身份证、学历证明、离职证明等入职资料");
        documentTask.setStatus("PENDING");
        tasks.add(documentTask);

        OnboardingTask accountTask = new OnboardingTask();
        accountTask.setTenantId(application.getTenantId());
        accountTask.setApplicationId(application.getId());
        accountTask.setTaskName("开通系统账号");
        accountTask.setTaskType("ACCOUNT");
        accountTask.setTaskDescription("为新员工开通系统账号并分配初始权限");
        accountTask.setStatus("PENDING");
        tasks.add(accountTask);

        OnboardingTask equipmentTask = new OnboardingTask();
        equipmentTask.setTenantId(application.getTenantId());
        equipmentTask.setApplicationId(application.getId());
        equipmentTask.setTaskName("办理设备领用");
        equipmentTask.setTaskType("EQUIPMENT");
        equipmentTask.setTaskDescription("为新员工办理电脑、工牌等设备领用");
        equipmentTask.setStatus("PENDING");
        tasks.add(equipmentTask);

        OnboardingTask trainingTask = new OnboardingTask();
        trainingTask.setTenantId(application.getTenantId());
        trainingTask.setApplicationId(application.getId());
        trainingTask.setTaskName("安排入职培训");
        trainingTask.setTaskType("TRAINING");
        trainingTask.setTaskDescription("安排新员工参加入职培训和部门介绍");
        trainingTask.setStatus("PENDING");
        tasks.add(trainingTask);

        tasks.forEach(onboardingTaskMapper::insert);
        log.info("入职任务清单生成完成，共{}项任务", tasks.size());
    }

    private void createUserAccount(Long applicationId) {
        OnboardingApplication application = onboardingApplicationMapper.selectById(applicationId);
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }

        ensureUserAccount(application);
    }

    private Long ensureUserAccount(Long applicationId) {
        OnboardingApplication application = onboardingApplicationMapper.selectById(applicationId);
        if (application == null) {
            throw new HrBusinessException("ONBOARDING_APPLICATION_NOT_FOUND", "入职申请不存在");
        }
        return ensureUserAccount(application);
    }

    private Long ensureUserAccount(OnboardingApplication application) {
        log.info("确保入职账号存在，申请ID：{}", application.getId());

        UserVO existingUser = findUserByUserName(application.getPhone());
        if (existingUser != null && existingUser.getUserId() != null) {
            syncExistingUserAccount(existingUser.getUserId(), application);
            log.info("复用已有用户账号，申请ID：{}，用户ID：{}", application.getId(), existingUser.getUserId());
            return existingUser.getUserId();
        }

        UserCreateDTO userCreateDTO = new UserCreateDTO();
        userCreateDTO.setTenantId(application.getTenantId());
        userCreateDTO.setDeptId(application.getDeptId());
        userCreateDTO.setUserName(application.getPhone());
        userCreateDTO.setNickName(buildUserNickName(application));
        userCreateDTO.setEmail(application.getEmail());
        userCreateDTO.setPhonenumber(application.getPhone());
        userCreateDTO.setSex(resolveUserSex(application.getGender()));
        userCreateDTO.setPassword("123456");
        userCreateDTO.setStatus(0);
        userCreateDTO.setPostIds(Collections.singletonList(application.getPostId()));

        try {
            R<Long> result = authServiceClient.createUser(userCreateDTO);
            if (!result.isSuccess()) {
                UserVO retriedUser = findUserByUserName(application.getPhone());
                if (retriedUser != null && retriedUser.getUserId() != null) {
                    syncExistingUserAccount(retriedUser.getUserId(), application);
                    log.warn("创建用户账号返回失败，但检测到账号已存在，转为复用，申请ID：{}，用户ID：{}，原因：{}",
                            application.getId(), retriedUser.getUserId(), result.getMsg());
                    return retriedUser.getUserId();
                }
                throw new HrSystemException("CREATE_USER_FAILED", "创建用户账号失败：" + result.getMsg());
            }
            log.info("用户账号创建成功，申请ID：{}，用户ID：{}", application.getId(), result.getData());
            return result.getData();
        } catch (Exception e) {
            log.error("创建用户账号失败，申请ID：{}", application.getId(), e);
            throw new HrSystemException("CREATE_USER_FAILED", "创建用户账号失败：" + e.getMessage(), e);
        }
    }

    private Employee createEmployeeFromApplication(OnboardingApplication application, LocalDate actualDate) {
        log.info("根据入职申请创建员工档案，申请ID：{}", application.getId());
        Long userId = ensureUserAccount(application);

        Employee employee = new Employee();
        employee.setTenantId(application.getTenantId());
        employee.setEmployeeNo(generateEmployeeNo());
        employee.setName(application.getName());
        employee.setGender(resolveEmployeeGender(application));
        employee.setPhone(application.getPhone());
        employee.setEmail(application.getEmail());
        employee.setDeptId(application.getDeptId());
        employee.setPostId(application.getPostId());
        employee.setPositionId(application.getPositionId());
        employee.setEmployeeType("FULL_TIME");
        employee.setEmployeeStatus("PROBATION");
        employee.setHireDate(actualDate);
        employee.setUserId(userId);

        employeeMapper.insert(employee);
        log.info("员工档案创建成功，员工ID：{}，工号：{}", employee.getId(), employee.getEmployeeNo());
        return employee;
    }

    private UserVO findUserByUserName(String userName) {
        if (!StringUtils.hasText(userName)) {
            throw new HrBusinessException("PHONE_REQUIRED", "手机号为空，无法创建或匹配系统账号");
        }

        try {
            R<UserVO> result = authServiceClient.getUserByUserName(userName);
            if (!result.isSuccess()) {
                throw new HrSystemException("QUERY_USER_FAILED", "查询用户账号失败：" + result.getMsg());
            }
            return result.getData();
        } catch (HrBusinessException | HrSystemException e) {
            throw e;
        } catch (Exception e) {
            log.error("按用户名查询用户失败，userName：{}", userName, e);
            throw new HrSystemException("QUERY_USER_FAILED", "查询用户账号失败：" + e.getMessage(), e);
        }
    }

    private void syncExistingUserAccount(Long userId, OnboardingApplication application) {
        UserUpdateDTO userUpdateDTO = new UserUpdateDTO();
        userUpdateDTO.setDeptId(application.getDeptId());
        userUpdateDTO.setNickName(buildUserNickName(application));
        userUpdateDTO.setEmail(application.getEmail());
        userUpdateDTO.setPhonenumber(application.getPhone());
        userUpdateDTO.setSex(resolveUserSex(application.getGender()));
        userUpdateDTO.setStatus(0);

        try {
            R<Void> result = authServiceClient.updateUser(userId, userUpdateDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("UPDATE_USER_FAILED", "同步已有用户账号失败：" + result.getMsg());
            }
        } catch (HrSystemException e) {
            throw e;
        } catch (Exception e) {
            log.error("同步已有用户账号失败，用户ID：{}，申请ID：{}", userId, application.getId(), e);
            throw new HrSystemException("UPDATE_USER_FAILED", "同步已有用户账号失败：" + e.getMessage(), e);
        }
    }

    private String resolveUserSex(String gender) {
        if (!StringUtils.hasText(gender)) {
            return "2";
        }

        String normalized = normalizeGender(gender);
        if ("MALE".equals(normalized)) {
            return "0";
        }
        if ("FEMALE".equals(normalized)) {
            return "1";
        }
        return "2";
    }

    /**
     * Auth 的 sys_user.nick_name 长度只有 30，入职姓名过长时需要提前收敛，
     * 否则完成入职任务创建账号会直接写库失败。
     */
    private String buildUserNickName(OnboardingApplication application) {
        String nickName = StringUtils.hasText(application.getName()) ? application.getName().trim() : application.getPhone();
        if (!StringUtils.hasText(nickName)) {
            return "新员工";
        }
        if (nickName.length() <= SYS_USER_NICK_NAME_MAX_LENGTH) {
            return nickName;
        }
        String truncated = nickName.substring(0, SYS_USER_NICK_NAME_MAX_LENGTH);
        log.warn("入职账号昵称超长，已截断，申请ID：{}，原长度：{}，截断后昵称：{}",
                application.getId(), nickName.length(), truncated);
        return truncated;
    }

    private String generateEmployeeNo() {
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String random = String.format("%04d", new Random().nextInt(10000));
        return "EMP" + date + random;
    }

    private void fillDeptAndPostName(OnboardingApplicationVO vo) {
        if (vo.getDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(vo.getDeptId());
                if (deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.warn("获取部门名称失败，deptId：{}", vo.getDeptId(), e);
            }
        }

        if (vo.getPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(vo.getPostId());
                if (postResult.isSuccess() && postResult.getData() != null) {
                    vo.setPostName(postResult.getData().getPostName());
                }
            } catch (Exception e) {
                log.warn("获取岗位名称失败，postId：{}", vo.getPostId(), e);
            }
        }
    }

    private OnboardingApplicationVO convertToVO(OnboardingApplication application) {
        OnboardingApplicationVO vo = new OnboardingApplicationVO();
        BeanUtils.copyProperties(application, vo);
        fillDeptAndPostName(vo);

        if (application.getPositionId() != null) {
            Position position = positionMapper.selectById(application.getPositionId());
            if (position != null) {
                vo.setPositionName(position.getPositionName());
            }
        }

        vo.setStatusDesc(getStatusDesc(application.getStatus()));
        return vo;
    }

    private String resolveApplicationGender(OnboardingApplicationCreateDTO dto) {
        if (StringUtils.hasText(dto.getGender())) {
            return normalizeGender(dto.getGender());
        }

        Candidate candidate = loadCandidateIfPresent(dto.getCandidateId());
        if (candidate != null && StringUtils.hasText(candidate.getGender())) {
            return normalizeGender(candidate.getGender());
        }

        throw new HrBusinessException("GENDER_REQUIRED", "入职申请缺少性别，手工创建时请传入 gender，或先补齐候选人性别");
    }

    private String resolveEmployeeGender(OnboardingApplication application) {
        if (StringUtils.hasText(application.getGender())) {
            return normalizeGender(application.getGender());
        }

        Candidate candidate = loadCandidateIfPresent(application.getCandidateId());
        if (candidate != null && StringUtils.hasText(candidate.getGender())) {
            return normalizeGender(candidate.getGender());
        }

        throw new HrBusinessException("GENDER_REQUIRED", "入职申请缺少性别，无法创建员工档案");
    }

    private Candidate loadCandidateIfPresent(Long candidateId) {
        if (candidateId == null) {
            return null;
        }

        Candidate candidate = candidateMapper.selectById(candidateId);
        if (candidate == null) {
            throw new HrBusinessException("CANDIDATE_NOT_FOUND", "候选人不存在");
        }
        return candidate;
    }

    private void validateCandidateForOnboarding(Candidate candidate) {
        if (candidate == null) {
            return;
        }

        String candidateStatus = StringUtils.hasText(candidate.getStatus())
                ? candidate.getStatus().trim().toUpperCase(Locale.ROOT)
                : "";
        if (!List.of("INTERVIEW", "OFFER", "HIRED").contains(candidateStatus)) {
            throw new HrBusinessException("INVALID_CANDIDATE_STATUS", "只有面试中、已发Offer或已录用的候选人才能发起入职申请");
        }

        // 候选人链路下同一个人只保留一条未拒绝的入职单，避免重复建单污染真实联调数据。
        OnboardingApplication existingApplication = findExistingOnboardingApplication(candidate.getId());
        if (existingApplication == null) {
            return;
        }

        if ("ONBOARDED".equals(existingApplication.getStatus())) {
            throw new HrBusinessException("CANDIDATE_ALREADY_ONBOARDED", "该候选人已完成入职，不能重复创建入职申请");
        }

        throw new HrBusinessException("ONBOARDING_APPLICATION_EXISTS", "该候选人已有待处理的入职申请");
    }

    private OnboardingApplication findExistingOnboardingApplication(Long candidateId) {
        if (candidateId == null) {
            return null;
        }

        LambdaQueryWrapper<OnboardingApplication> wrapper = Wrappers.lambdaQuery(OnboardingApplication.class);
        wrapper.eq(OnboardingApplication::getCandidateId, candidateId)
                .ne(OnboardingApplication::getStatus, "REJECTED")
                .orderByDesc(OnboardingApplication::getId);

        return onboardingApplicationMapper.selectList(wrapper).stream().findFirst().orElse(null);
    }

    private void syncCandidateStatusAfterOnboarding(Long candidateId) {
        Candidate candidate = loadCandidateIfPresent(candidateId);
        if (candidate == null || "HIRED".equals(candidate.getStatus())) {
            return;
        }

        candidate.setStatus("HIRED");
        candidateMapper.updateById(candidate);
    }

    private String normalizeGender(String gender) {
        String normalized = gender == null ? null : gender.trim().toUpperCase(Locale.ROOT);
        if (!StringUtils.hasText(normalized)) {
            return null;
        }
        if (!"MALE".equals(normalized) && !"FEMALE".equals(normalized)) {
            throw new HrBusinessException("INVALID_GENDER", "性别只支持 MALE 或 FEMALE");
        }
        return normalized;
    }

    private String getStatusDesc(String status) {
        switch (status) {
            case "DRAFT":
                return "草稿";
            case "APPROVING":
                return "审批中";
            case "APPROVED":
                return "已通过";
            case "REJECTED":
                return "已拒绝";
            case "ONBOARDED":
                return "已入职";
            default:
                return status;
        }
    }

    private String getTaskTypeDesc(String taskType) {
        switch (taskType) {
            case "DOCUMENT":
                return "资料收集";
            case "ACCOUNT":
                return "账号开通";
            case "EQUIPMENT":
                return "设备领用";
            case "TRAINING":
                return "培训";
            default:
                return taskType;
        }
    }

    private String getTaskStatusDesc(String status) {
        switch (status) {
            case "PENDING":
                return "待处理";
            case "IN_PROGRESS":
                return "处理中";
            case "COMPLETED":
                return "已完成";
            default:
                return status;
        }
    }
}
