package com.cloudflow.workflow.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.service.IWorkflowCacheService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowCacheWarmer implements ApplicationRunner {

    private final WfProcessDefinitionMapper definitionMapper;
    private final IWorkflowCacheService workflowCacheService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<WfProcessDefinition> definitions = definitionMapper.selectPage(new Page<>(1, 200, false), new LambdaQueryWrapper<WfProcessDefinition>()
                    .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                    .eq(WfProcessDefinition::getIsLatest, 1)).getRecords();
            for (WfProcessDefinition definition : definitions) {
                runAsTenant(definition.getTenantId(), () -> {
                    workflowCacheService.getDefinition(definition.getDefinitionId());
                    if (StringUtils.hasText(definition.getFormId())) {
                        workflowCacheService.getForm(definition.getFormId());
                    }
                });
            }
            log.info("workflow cache warm completed, definitionCount={}", definitions.size());
        } catch (Exception e) {
            log.warn("workflow cache warmup failed, startup continues", e);
        }
    }

    private void runAsTenant(Long tenantId, Runnable task) {
        Long previousTenantId = UserContext.getTenantId();
        try {
            UserContext.setTenantId(tenantId);
            task.run();
        } catch (Exception e) {
            log.warn("workflow cache warm item failed, tenantId={}", tenantId, e);
        } finally {
            UserContext.setTenantId(previousTenantId);
        }
    }
}
