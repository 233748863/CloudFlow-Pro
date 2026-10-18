import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.hr.client.fallback.BusinessRuleClientFallback;
import com.cloudflow.hr.config.BusinessRuleProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

public final class HrLeaveRuleClientChecks {
    public static void main(String[] arguments) throws Exception {
        if (!BusinessRuleClient.class.getMethod("getEffectiveRule", String.class).getAnnotation(GetMapping.class).value()[0]
                .equals("/inner/auth/hr-leave-rules/effective/{ruleCode}")) throw new AssertionError("Leave read bridge missing");
        if (!BusinessRuleClient.class.getMethod("recordHit", BusinessRuleHitRecordDTO.class).getAnnotation(PostMapping.class).value()[0]
                .equals("/inner/auth/hr-leave-rules/hit-records")) throw new AssertionError("Leave write bridge missing");
        BusinessRuleClientFallback fallback = new BusinessRuleClientFallback(new BusinessRuleProperties());
        BusinessRuleHitRecordDTO hit = new BusinessRuleHitRecordDTO(); hit.setRuleCode("hr.leave.quota.limit");
        if (fallback.recordHit(hit).isSuccess() || fallback.recordHit(null).isSuccess()) throw new AssertionError("Unavailable record falsely acknowledged");
        System.out.println("PASS: D1 leave client checks=4");
    }
}
