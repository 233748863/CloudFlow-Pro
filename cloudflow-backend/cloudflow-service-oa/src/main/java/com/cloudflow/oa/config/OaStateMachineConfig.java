package com.cloudflow.oa.config;

import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.oa.enums.BusinessTripEvent;
import com.cloudflow.oa.enums.BusinessTripStatus;
import com.cloudflow.oa.enums.ExpenseClaimEvent;
import com.cloudflow.oa.enums.ExpenseClaimStatus;
import com.cloudflow.oa.enums.PurchaseRequestEvent;
import com.cloudflow.oa.enums.PurchaseRequestStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * OA 模块状态机注册配置
 * M1-6: 状态机迁移
 */
@Component
@RequiredArgsConstructor
public class OaStateMachineConfig implements CommandLineRunner {

    private final StateMachineRegistry registry;

    @Override
    public void run(String... args) {
        // M1-6: 注册报销申请状态机
        StateMachine<ExpenseClaimStatus, ExpenseClaimEvent> expenseClaimSM =
            StateMachine.builder("ExpenseClaim", ExpenseClaimStatus.class, ExpenseClaimEvent.class)
                .transition(ExpenseClaimStatus.DRAFT, ExpenseClaimEvent.SUBMIT, ExpenseClaimStatus.PENDING)
                .transition(ExpenseClaimStatus.PENDING, ExpenseClaimEvent.APPROVE, ExpenseClaimStatus.APPROVED)
                .transition(ExpenseClaimStatus.PENDING, ExpenseClaimEvent.REJECT, ExpenseClaimStatus.REJECTED)
                .transition(ExpenseClaimStatus.PENDING, ExpenseClaimEvent.CANCEL, ExpenseClaimStatus.CANCELLED)
                .transition(ExpenseClaimStatus.APPROVED, ExpenseClaimEvent.PAY, ExpenseClaimStatus.PAID)
                .build();
        registry.register(expenseClaimSM);

        // M1-6: 注册出差申请状态机
        StateMachine<BusinessTripStatus, BusinessTripEvent> businessTripSM =
            StateMachine.builder("BusinessTrip", BusinessTripStatus.class, BusinessTripEvent.class)
                .transition(BusinessTripStatus.DRAFT, BusinessTripEvent.SUBMIT, BusinessTripStatus.PENDING)
                .transition(BusinessTripStatus.PENDING, BusinessTripEvent.APPROVE, BusinessTripStatus.APPROVED)
                .transition(BusinessTripStatus.PENDING, BusinessTripEvent.REJECT, BusinessTripStatus.REJECTED)
                .transition(BusinessTripStatus.DRAFT, BusinessTripEvent.CANCEL, BusinessTripStatus.CANCELLED)
                .transition(BusinessTripStatus.PENDING, BusinessTripEvent.CANCEL, BusinessTripStatus.CANCELLED)
                .build();
        registry.register(businessTripSM);

        // M1-6: 注册采购申请状态机
        StateMachine<PurchaseRequestStatus, PurchaseRequestEvent> purchaseRequestSM =
            StateMachine.builder("PurchaseRequest", PurchaseRequestStatus.class, PurchaseRequestEvent.class)
                .transition(PurchaseRequestStatus.DRAFT, PurchaseRequestEvent.SUBMIT, PurchaseRequestStatus.PENDING)
                .transition(PurchaseRequestStatus.PENDING, PurchaseRequestEvent.APPROVE, PurchaseRequestStatus.APPROVED)
                .transition(PurchaseRequestStatus.PENDING, PurchaseRequestEvent.REJECT, PurchaseRequestStatus.REJECTED)
                .transition(PurchaseRequestStatus.APPROVED, PurchaseRequestEvent.PARTIAL_RECEIVE, PurchaseRequestStatus.PARTIAL_RECEIVED)
                .transition(PurchaseRequestStatus.PARTIAL_RECEIVED, PurchaseRequestEvent.PARTIAL_RECEIVE, PurchaseRequestStatus.PARTIAL_RECEIVED)
                .transition(PurchaseRequestStatus.APPROVED, PurchaseRequestEvent.FULL_RECEIVE, PurchaseRequestStatus.RECEIVED)
                .transition(PurchaseRequestStatus.PARTIAL_RECEIVED, PurchaseRequestEvent.FULL_RECEIVE, PurchaseRequestStatus.RECEIVED)
                .build();
        registry.register(purchaseRequestSM);
    }
}
