package com.cloudflow.hr.checks;

import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.commission.CommissionEvents.Progress;
import com.cloudflow.common.event.commission.CommissionEvents.Request;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.hr.config.HrJacksonConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

/** Exercises the production CRM defaults and HR date configuration across durable event boundaries. */
public final class HrCommissionWireChecks {
    private static int checks;
    private static final List<String> FAILURES = new ArrayList<>();

    public static void main(String[] arguments) throws Exception {
        ObjectMapper crm = Jackson2ObjectMapperBuilder.json()
                .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();
        HrJacksonConfig hrConfiguration = new HrJacksonConfig();
        Jackson2ObjectMapperBuilder hrBuilder = Jackson2ObjectMapperBuilder.json();
        hrConfiguration.hrJacksonCustomizer().customize(hrBuilder);
        ObjectMapper hr = hrConfiguration.objectMapper(hrBuilder);
        Map<String, ObjectMapper> configurations = Map.of("CRM", crm, "HR", hr);
        LocalDateTime occurred = LocalDateTime.of(2026, 9, 30, 10, 0, 0);
        Request recovery = new Request(1, 100000L, 992002L, "RECOVERY", null, null, null,
                CommissionEvents.digest("owned frozen recovery"), occurred);
        Request posting = new Request(1, 100000L, 992002L, "POST", 992010L, 992011L, 992001L,
                CommissionEvents.digest("owned frozen posting"), occurred);
        check(crm.valueToTree(recovery).path("occurredTime").isTextual(), "Spring_Boot_CRM_date_is_text");
        check(hr.valueToTree(recovery).path("occurredTime").isTextual(), "configured_HR_date_is_text");
        Progress pending = new Progress(1, 100000L, 992002L, 992020L, 1L, "PENDING", recovery.eventId(),
                null, null, null, null, null, null, occurred);
        Progress posted = new Progress(1, 100000L, 992002L, 992020L, 2L, "POSTED", posting.eventId(),
                992010L, 992011L, null, null, null, pending.eventId(), occurred);
        Progress paid = new Progress(1, 100000L, 992002L, 992020L, 3L, "PAID", posting.eventId(),
                992010L, 992011L, 992030L, 992040L, null, posted.eventId(), occurred);
        Progress returned = new Progress(1, 100000L, 992002L, 992020L, 4L, "POSTED", posting.eventId(),
                992010L, 992011L, 992030L, 992040L, 992041L, paid.eventId(), occurred);
        for (Map.Entry<String, ObjectMapper> writer : configurations.entrySet()) {
            for (Map.Entry<String, ObjectMapper> reader : configurations.entrySet()) {
                for (Request request : List.of(recovery, posting)) {
                    String label = writer.getKey() + "_to_" + reader.getKey() + "_" + request.operation();
                    attempt(label, () -> {
                        OutboxEvent stored = stored(CommissionEvents.encode(request, writer.getValue()), writer.getValue());
                        check(request.equals(CommissionEvents.request(stored, 100000L, reader.getValue())), label + "_payload");
                        checkEnvelope(stored, reader.getValue(), label);
                    });
                }
                for (Progress progress : List.of(pending, posted, paid, returned)) {
                    String label = writer.getKey() + "_to_" + reader.getKey() + "_" + progress.state() + "_" + progress.revision();
                    attempt(label, () -> {
                        OutboxEvent stored = stored(CommissionEvents.encode(progress, writer.getValue()), writer.getValue());
                        check(progress.equals(CommissionEvents.progress(stored, 100000L, reader.getValue())), label + "_payload");
                        checkEnvelope(stored, reader.getValue(), label);
                    });
                }
            }
        }
        System.out.println("H3_COMMISSION_WIRE: checks=" + checks + "; failed=" + FAILURES.size()
                + "; production_hr_date_configuration=true; crm_default_configuration=true; database=false; http=false");
        if (!FAILURES.isEmpty()) throw new AssertionError(String.join("; ", FAILURES));
    }

    private static OutboxEvent stored(BusinessEventEnvelope envelope, ObjectMapper writer) throws Exception {
        OutboxEvent stored = new OutboxEvent();
        stored.setTenantId(envelope.getTenantId()); stored.setEventId(envelope.getEventId());
        stored.setAggregateType(envelope.getSourceModule()); stored.setAggregateId(envelope.getSourceId());
        stored.setEventType(envelope.getEventType()); stored.setPayloadJson(writer.writeValueAsString(envelope));
        return stored;
    }

    private static void checkEnvelope(OutboxEvent stored, ObjectMapper reader, String label) throws Exception {
        BusinessEventEnvelope received = BusinessEventEnvelopeCodec.read(stored.getPayloadJson(), reader);
        CommissionEvents.matchingEnvelope(stored, received, reader);
        check(Objects.equals(received.getEventId(), stored.getEventId()), label + "_durable_identity");
    }

    private static void attempt(String label, CheckedAction action) {
        try { action.run(); }
        catch (Exception failure) {
            Throwable cause = failure;
            while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
            String diagnostic = label + ":" + failure.getClass().getSimpleName() + ":" + cause.getClass().getSimpleName();
            FAILURES.add(diagnostic);
            System.out.println("H3_COMMISSION_WIRE_FAILURE: " + diagnostic);
        }
    }

    private static void check(boolean valid, String label) { checks++; if (!valid) throw new AssertionError(label); }
    @FunctionalInterface private interface CheckedAction { void run() throws Exception; }
}
