package com.cloudflow.hr.config;

import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.hr.enums.BenefitRequestEvent;
import com.cloudflow.hr.enums.BenefitRequestStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * HR 模块状态机注册配置
 * M1-6: 状态机迁移
 */
@Component
@RequiredArgsConstructor
public class HrStateMachineConfig implements CommandLineRunner {

    private final StateMachineRegistry registry;

    @Override
    public void run(String... args) {
        // M1-6: 注册福利申请状态机
        StateMachine<BenefitRequestStatus, BenefitRequestEvent> benefitRequestSM =
            StateMachine.builder("BenefitRequest", BenefitRequestStatus.class, BenefitRequestEvent.class)
                .transition(BenefitRequestStatus.DRAFT, BenefitRequestEvent.SUBMIT, BenefitRequestStatus.APPROVING)
                .transition(BenefitRequestStatus.REJECTED, BenefitRequestEvent.SUBMIT, BenefitRequestStatus.APPROVING)
                .transition(BenefitRequestStatus.APPROVING, BenefitRequestEvent.APPROVE, BenefitRequestStatus.APPROVED)
                .transition(BenefitRequestStatus.APPROVING, BenefitRequestEvent.REJECT, BenefitRequestStatus.REJECTED)
                .transition(BenefitRequestStatus.APPROVED, BenefitRequestEvent.PAY, BenefitRequestStatus.PAID)
                .transition(BenefitRequestStatus.DRAFT, BenefitRequestEvent.CANCEL, BenefitRequestStatus.CANCELLED)
                .transition(BenefitRequestStatus.APPROVING, BenefitRequestEvent.CANCEL, BenefitRequestStatus.CANCELLED)
                .build();
        registry.register(benefitRequestSM);
    }
}
