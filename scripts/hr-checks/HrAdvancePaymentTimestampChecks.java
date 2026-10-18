import com.cloudflow.hr.service.HrAdvancePaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/** Exercise the actual payment DTO at the zero-second boundary that stranded a real event. */
public class HrAdvancePaymentTimestampChecks {
    public static void main(String[] arguments) throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        int checks = 0;
        for (LocalDateTime timestamp : List.of(LocalDateTime.of(2026, 10, 6, 8, 58, 0),
                LocalDateTime.of(2026, 10, 6, 8, 58, 59), LocalDateTime.of(2026, 10, 6, 0, 0, 0))) {
            String emitted = timestamp.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            require(emitted.length() == 19, "OA emission must include seconds"); checks++;
            for (String value : List.of(timestamp.toString(), emitted)) {
                String payload = mapper.writeValueAsString(Map.of("tenantId", "100000", "advanceId", "199",
                        "paymentId", "9043", "amount", "100.01", "paidTime", value, "eventId", "synthetic"));
                HrAdvancePaymentService.Paid parsed = mapper.readValue(payload, HrAdvancePaymentService.Paid.class);
                require(timestamp.equals(parsed.paidTime()), "Original and canonical timestamps retain the exact time"); checks++;
                require(new BigDecimal("100.01").equals(parsed.amount()), "Payment amount remains exact"); checks++;
                HrAdvancePaymentService.Paid restored = mapper.readValue(mapper.writeValueAsString(parsed), HrAdvancePaymentService.Paid.class);
                require(parsed.equals(restored), "Actual payment DTO round trip is exact"); checks++;
            }
        }
        for (String value : List.of("2026-10-06", "2026-10-06T08", "2026-10-06T08:58:60", "2026-10-06T08:58:00Z")) {
            boolean refused = false;
            try { mapper.readValue(mapper.writeValueAsString(Map.of("paidTime", value)), HrAdvancePaymentService.Paid.class); }
            catch (com.fasterxml.jackson.core.JsonProcessingException expected) { refused = true; }
            require(refused, "Invalid local payment time must be rejected"); checks++;
        }
        System.out.println("HR_ADVANCE_PAYMENT_TIMESTAMP_CHECKS: passed=true; checks=" + checks);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
