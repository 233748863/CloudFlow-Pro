package com.cloudflow.crm.config;

import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.crm.enums.CrmLeadEvent;
import com.cloudflow.crm.enums.CrmLeadStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * CRM 模块状态机注册配置
 * M1-6: 状态机迁移
 */
@Component
@RequiredArgsConstructor
public class CrmStateMachineConfig implements CommandLineRunner {

    private final StateMachineRegistry registry;

    @Override
    public void run(String... args) {
        // M1-6: 注册 CRM 线索状态机
        StateMachine<CrmLeadStatus, CrmLeadEvent> crmLeadSM =
            StateMachine.builder("CrmLead", CrmLeadStatus.class, CrmLeadEvent.class)
                .transition(CrmLeadStatus.NEW, CrmLeadEvent.CONTACT, CrmLeadStatus.CONTACTED)
                .transition(CrmLeadStatus.CONTACTED, CrmLeadEvent.QUALIFY, CrmLeadStatus.QUALIFIED)
                .transition(CrmLeadStatus.QUALIFIED, CrmLeadEvent.CONVERT, CrmLeadStatus.CONVERTED)
                .transition(CrmLeadStatus.NEW, CrmLeadEvent.INVALIDATE, CrmLeadStatus.INVALID)
                .transition(CrmLeadStatus.CONTACTED, CrmLeadEvent.INVALIDATE, CrmLeadStatus.INVALID)
                .transition(CrmLeadStatus.QUALIFIED, CrmLeadEvent.INVALIDATE, CrmLeadStatus.INVALID)
                .build();
        registry.register(crmLeadSM);
    }
}
