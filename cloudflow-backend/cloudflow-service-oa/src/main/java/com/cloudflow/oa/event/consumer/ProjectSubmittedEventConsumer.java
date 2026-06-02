package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.event.ProjectSubmittedEvent;
import com.cloudflow.oa.service.impl.OaProjectServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaProjectServiceImpl projectService;

    @Override
    public String eventType() {
        return "PROJECT_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        ProjectSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), ProjectSubmittedEvent.class);
        OaProject project = projectService.getById(event.getProjectId());
        if (project == null) {
            log.warn("skip project workflow start, project not found, projectId={}, eventId={}", event.getProjectId(), envelope.getEventId());
            return;
        }
        if (project.getInstanceId() != null && !project.getInstanceId().isBlank()) {
            log.info("skip project workflow start, instance already exists, projectId={}, instanceId={}",
                    project.getProjectId(), project.getInstanceId());
            return;
        }
        projectService.startProjectWorkflow(project);
    }
}
