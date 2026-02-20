package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.IWfFormService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 表单管理服务实现
 * 从 WorkflowServiceImpl 拆分而来，负责表单定义的 CRUD
 *
 * @author CloudFlow
 */
@Service
public class WfFormServiceImpl implements IWfFormService {

    private static final Logger log = LoggerFactory.getLogger(WfFormServiceImpl.class);

    @Autowired
    private WfFormDefinitionMapper formDefinitionMapper;
    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;
    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;
    @Autowired
    private WfTaskMapper taskMapper;
    @Autowired
    private WorkflowPermissionService permissionService;
    @Autowired
    private JsonSchemaValidator jsonSchemaValidator;
    @Autowired
    private WorkflowSecurityUtils securityUtils;

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "formDefinition", allEntries = true)
    public R<?> saveFormDefinition(WfFormDefinition definition) {
        log.info("[saveFormDefinition] 开始保存表单定义, formId={}", definition.getFormId());

        // 权限校验
        permissionService.checkDefinitionPermission("保存表单");

        // 参数校验
        if (!StringUtils.hasText(definition.getFormName())) {
            throw WorkflowException.validationError("表单名称不能为空");
        }

        // XSS 防护
        definition.setFormName(securityUtils.sanitizeXss(definition.getFormName()));

        // 表单 Schema 验证
        if (StringUtils.hasText(definition.getFormSchema())) {
            jsonSchemaValidator.validateFormSchema(definition.getFormSchema());
        }

        if (!StringUtils.hasText(definition.getFormId())) {
            definition.setFormId(UUID.randomUUID().toString());
        }

        WfFormDefinition exist = formDefinitionMapper.selectById(definition.getFormId());
        if (exist != null) {
            // 乐观锁冲突检测
            if (definition.getVersionLock() != null && !definition.getVersionLock().equals(exist.getVersionLock())) {
                throw WorkflowException.invalidState("表单定义已被其他用户修改，请刷新后重试");
            }
            definition.setVersion(exist.getVersion() + 1);
            definition.setVersionLock(exist.getVersionLock() != null ? exist.getVersionLock() + 1 : 1);
            definition.setIsLatest(1);
            formDefinitionMapper.updateById(definition);
            log.info("[saveFormDefinition] 表单定义更新成功, formId={}, version={}", definition.getFormId(), definition.getVersion());
        } else {
            definition.setVersion(1);
            definition.setVersionLock(0);
            definition.setIsLatest(1);
            definition.setCreateTime(new Date());
            formDefinitionMapper.insert(definition);
            log.info("[saveFormDefinition] 表单定义创建成功, formId={}", definition.getFormId());
        }
        return R.ok(definition.getFormId());
    }

    @Override
    @Cacheable(value = "formDefinition", key = "#formId", unless = "#result == null")
    public WfFormDefinition getFormDefinition(String formId) {
        log.info("[getFormDefinition] 查询表单定义(缓存未命中), formId={}", formId);

        // 表单权限控制
        Long currentUserId = UserContext.getUserId();
        if (currentUserId != null && !permissionService.isAdmin(currentUserId)) {
            // 检查用户是否有关联的流程实例使用了此表单
            List<WfProcessDefinition> relatedDefs = processDefinitionMapper.selectList(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .eq(WfProcessDefinition::getFormId, formId)
            );

            if (relatedDefs != null && !relatedDefs.isEmpty()) {
                List<String> processKeys = relatedDefs.stream()
                    .map(WfProcessDefinition::getProcessKey)
                    .distinct()
                    .collect(Collectors.toList());

                Long instanceCount = processInstanceMapper.selectCount(
                    new LambdaQueryWrapper<WfProcessInstance>()
                        .in(WfProcessInstance::getProcessDefKey, processKeys)
                        .eq(WfProcessInstance::getStartUserId, currentUserId)
                );

                Long taskCount = taskMapper.selectCount(
                    new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getAssignee, currentUserId)
                );

                if ((instanceCount == null || instanceCount == 0) && (taskCount == null || taskCount == 0)) {
                    throw new com.cloudflow.workflow.exception.PermissionDeniedException("您没有权限访问此表单定义");
                }
            }
        }

        WfFormDefinition form = formDefinitionMapper.selectById(formId);
        if (form == null) {
            throw WorkflowException.validationError("表单定义不存在: " + formId);
        }
        return form;
    }

    @Override
    public PageResult<WfFormDefinition> listFormDefinitions(PageQuery pageQuery) {
        log.info("[listFormDefinitions] 查询表单定义列表, pageNum={}, pageSize={}", pageQuery.getPageNum(), pageQuery.getPageSize());

        Page<WfFormDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfFormDefinition> queryWrapper = new LambdaQueryWrapper<>();

        String status = (String) pageQuery.getParams().get("status");
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfFormDefinition::getStatus, status);
        }

        String keyword = (String) pageQuery.getParams().get("keyword");
        if (StringUtils.hasText(keyword)) {
            queryWrapper.like(WfFormDefinition::getFormName, keyword);
        }

        queryWrapper.orderByDesc(WfFormDefinition::getCreateTime);

        Page<WfFormDefinition> resultPage = formDefinitionMapper.selectPage(page, queryWrapper);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }
}
