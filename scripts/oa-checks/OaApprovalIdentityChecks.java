package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.event.consumer.OaApprovalSubmittedEventConsumer;
import com.cloudflow.oa.service.OaApprovalParticipant;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.check;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.equal;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.identity;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.proxy;

public final class OaApprovalIdentityChecks {
    private static final String RESERVATION = "F:36398259-106d-459b-950d-eecabf007b7b";
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();

    private OaApprovalIdentityChecks() { }

    static void run() throws Exception {
        try {
            OaApprovalRequest supplier = request("OA_SUPPLIER_GOVERNANCE", 9012L, 100000L, RESERVATION);
            equal(66, originalKey(supplier).length(), "supplier failure fixture reproduces the real 66-character identity");
            InternalWorkflowStartDTO initial = consume(supplier, RESERVATION);
            check(initial.getBusinessKey().length() <= 64, "supplier governance fits the actual workflow identity limit");
            equal(45, initial.getBusinessKey().length(), "shortened identity has the fixed encoded digest length");
            check(initial.getBusinessKey().matches("F:[A-Za-z0-9_-]{43}"), "shortened identity uses URL-safe digest characters");
            equal(initial.getBusinessKey(), consume(supplier, RESERVATION).getBusinessKey(), "retry before binding uses the same workflow identity");
            equal(null, consume(supplier, "already-bound-instance"), "a bound request is not started again");
            Set<String> identities = new HashSet<>();
            for (String businessType : List.of("OA_SUPPLIER_GOVERNANCE", "OA_ASSET_MOVEMENT", "OA_ASSET_REPAIR",
                    "OA_TIMESHEET", "OA_RFQ_AWARD", "OA_CONSUMABLE_REQUEST", "OA_MEETING_BOOKING")) {
                for (Long businessId : List.of(7L, 9012L, Long.MAX_VALUE)) {
                    OaApprovalRequest candidate = request(businessType, businessId, 100000L, RESERVATION);
                    InternalWorkflowStartDTO started = consume(candidate, RESERVATION);
                    check(started.getBusinessKey().length() <= 64, "business identities include the maximum persisted Long identifier safely");
                    check(identities.add(started.getBusinessKey()), "different business types and original identifiers remain distinct");
                    if (originalKey(candidate).length() <= 64) {
                        equal(originalKey(candidate), started.getBusinessKey(), "valid historical workflow identities remain byte-for-byte unchanged");
                    }
                }
            }
            OaApprovalRequest boundary = request("T".repeat(23), 7L, 100000L, RESERVATION);
            equal(64, originalKey(boundary).length(), "exact workflow identity boundary fixture");
            equal(originalKey(boundary), consume(boundary, RESERVATION).getBusinessKey(), "64-character historical identities retain their original key");
            OaApprovalRequest otherTenant = request(supplier.getBusinessType(), supplier.getBusinessId(), 100001L, RESERVATION);
            check(!initial.getBusinessKey().equals(consume(otherTenant, RESERVATION).getBusinessKey()), "long identities isolate different tenants");
            OaApprovalRequest nextAttempt = request(supplier.getBusinessType(), supplier.getBusinessId(), 100000L,
                    "F:36398259-106d-459b-950d-eecabf007b7c");
            check(!initial.getBusinessKey().equals(consume(nextAttempt, nextAttempt.getReservation()).getBusinessKey()),
                    "a later submission of the same business record has a different workflow identity");
            System.out.println("PASS: OA approval identity consumer checks");
        } finally {
            identity(100000L, 1L);
        }
    }

    private static OaApprovalRequest request(String businessType, Long businessId, Long tenantId, String reservation) {
        OaApprovalRequest request = new OaApprovalRequest();
        request.setTenantId(tenantId);
        request.setBusinessType(businessType);
        request.setBusinessId(businessId);
        request.setBusinessNo("原业务编号-" + businessId);
        request.setProcessKey("identity-verification");
        request.setReservation(reservation);
        request.setStartUserId(990000701L);
        request.setStartUserName("g_import_admin");
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("businessType", businessType);
        variables.put("businessId", businessId);
        variables.put("businessNo", request.getBusinessNo());
        variables.put("oaRequestToken", reservation);
        variables.put("callbackStreamKey", "workflow:stream:approval-callback:oa");
        variables.put("approverIds", List.of("990000702"));
        request.setVariables(variables);
        return request;
    }

    private static String originalKey(OaApprovalRequest request) {
        return request.getBusinessType() + ":" + request.getBusinessId() + ":" + request.getReservation();
    }

    private static InternalWorkflowStartDTO consume(OaApprovalRequest request, String currentInstance) throws Exception {
        identity(request.getTenantId(), request.getStartUserId());
        List<InternalWorkflowStartDTO> starts = new ArrayList<>();
        List<OaApprovalRequest> bindings = new ArrayList<>();
        OaApprovalParticipant participant = new OaApprovalParticipant() {
            @Override
            public String getSupportedBusinessType() { return request.getBusinessType(); }

            @Override
            public String currentInstance(Long businessId) {
                equal(request.getBusinessId(), businessId, "consumer reads the original business record before starting");
                return currentInstance;
            }

            @Override
            public void bindInstance(OaApprovalRequest submission, String instanceId) {
                equal("actual-returned-instance", instanceId, "consumer binds the returned workflow instance");
                bindings.add(submission);
            }

            @Override
            public void handleApproved(ApprovalResultDTO result) { throw new AssertionError("Starting approval cannot apply an approval result"); }

            @Override
            public void handleRejected(ApprovalResultDTO result) { throw new AssertionError("Starting approval cannot apply a rejection result"); }
        };
        RemoteWorkflowService workflow = proxy(RemoteWorkflowService.class, (method, arguments) -> {
            if (!"startProcessInternal".equals(method)) throw new IllegalStateException("Unexpected workflow call " + method);
            starts.add((InternalWorkflowStartDTO) arguments[0]);
            return R.ok(Map.of("processInstanceId", "actual-returned-instance"));
        });
        OaApprovalSubmittedEventConsumer consumer = new OaApprovalSubmittedEventConsumer(JSON, workflow, List.of(participant));
        String originalPayload = JSON.writeValueAsString(request);
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventType("OA_F_APPROVAL_SUBMITTED")
                .sourceModule("cloudflow-oa").sourceId(request.getBusinessId()).tenantId(request.getTenantId())
                .payload(originalPayload).build();
        consumer.consume(envelope);
        equal(originalPayload, envelope.getPayload(), "consumer preserves the durable original approval event");
        if (!request.getReservation().equals(currentInstance)) {
            equal(0, starts.size(), "stale events do not call the workflow service");
            equal(0, bindings.size(), "stale events do not replace the current binding");
            return null;
        }
        equal(1, starts.size(), "one consumed request attempts one actual workflow start");
        equal(1, bindings.size(), "one returned instance produces one binding");
        InternalWorkflowStartDTO started = starts.get(0);
        equal(request.getTenantId(), started.getTenantId(), "shortened identity preserves tenant");
        equal(request.getProcessKey(), started.getProcessDefKey(), "shortened identity preserves workflow definition");
        equal(request.getStartUserId(), started.getStartUserId(), "shortened identity preserves the real applicant");
        equal(request.getStartUserName(), started.getStartUserName(), "shortened identity preserves the applicant name");
        equal(JSON.writeValueAsString(request.getVariables()), JSON.writeValueAsString(started.getVariables()),
                "shortened identity preserves original business IDs, numbers, approval participants and callback token");
        equal(originalPayload, JSON.writeValueAsString(bindings.get(0)), "binding receives the original business submission snapshot");
        return started;
    }
}
