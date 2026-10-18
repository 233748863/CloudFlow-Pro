import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.hr.config.HrJacksonConfig;
import com.cloudflow.hr.config.HrMoneyHttpConfig;
import com.cloudflow.hr.config.HrSalaryJsonTypeHandler;
import com.cloudflow.hr.domain.dto.HrEmployeeCompPayload;
import com.cloudflow.hr.domain.dto.HrSalarySlipPayload;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.service.impl.HrEssServiceImpl;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;

public class HrMoneyPrecisionChecks {
    private static int checks;
    private static void require(boolean condition) {
        if (!condition) throw new AssertionError("Money precision check " + checks);
        checks++;
    }

    public static void main(String[] arguments) throws Exception {
        HrJacksonConfig config = new HrJacksonConfig();
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        config.hrJacksonCustomizer().customize(builder);
        ObjectMapper internal = config.objectMapper(builder);
        MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter(internal);
        List<HttpMessageConverter<?>> converters = new ArrayList<>();
        converters.add(converter);
        new HrMoneyHttpConfig().extendMessageConverters(converters);
        ObjectMapper http = converter.getObjectMapper();
        HrSalaryJsonTypeHandler handler = new HrSalaryJsonTypeHandler(List.class,
                HrSalarySlipPayload.class.getDeclaredField("components"));
        Constructor<?> constructor = HrEssServiceImpl.class.getDeclaredConstructors()[0];
        Object[] dependencies = new Object[constructor.getParameterCount()];
        for (int index = 0; index < dependencies.length; index++) {
            if (constructor.getParameterTypes()[index] == ObjectMapper.class) dependencies[index] = internal;
        }
        HrEssServiceImpl salaryService = (HrEssServiceImpl) constructor.newInstance(dependencies);
        Method digest = HrEssServiceImpl.class.getDeclaredMethod("computeDigest", HrSalarySlip.class);
        digest.setAccessible(true);
        for (String amount : List.of("0.03", "90071992547409.93", "9999999999999999.99", "-90071992547409.93")) {
            String payload = "{\"totalSalary\":" + amount + ",\"componentValues\":{\"100\":" + amount + "}}";
            HrEmployeeCompPayload input = http.readValue(payload, HrEmployeeCompPayload.class);
            require(input.getTotalSalary().compareTo(new BigDecimal(amount)) == 0);
            require(input.getComponentValues().get("100") instanceof BigDecimal);
            HrEmployeeCompPayload stored = internal.convertValue(MessagePayloadCodec.internalTree(input, internal), HrEmployeeCompPayload.class);
            require(stored.getTotalSalaryText().equals(amount));
            HrEmployeeCompPayload reloaded = new HrEmployeeCompPayload();
            reloaded.setTotalSalaryText(stored.getTotalSalaryText());
            reloaded.setComponentValuesText(stored.getComponentValuesText());
            require(new BigDecimal(reloaded.getComponentValues().get("100").toString()).compareTo(new BigDecimal(amount)) == 0);
            Map<String, Object> mapped = internal.convertValue(reloaded, new TypeReference<Map<String, Object>>() {});
            require(mapped.get("totalSalary") instanceof BigDecimal);
            require(new BigDecimal(mapped.get("totalSalary").toString()).compareTo(new BigDecimal(amount)) == 0);
            Object components = handler.parse("[{\"amount\":" + amount + ",\"snapshot\":{\"gross\":" + amount + "}}]");
            require(internal.writeValueAsString(components).contains("\"amount\":" + amount));
            String transport = http.writeValueAsString(Map.of("code", 200, "amount", new BigDecimal(amount), "components", components));
            require(transport.contains("\"code\":200"));
            require(transport.contains("\"amount\":\"" + amount + "\""));
            require(transport.contains("\"gross\":\"" + amount + "\""));
            require(internal.writeValueAsString(Map.of("amount", new BigDecimal(amount))).equals("{\"amount\":" + amount + "}"));
            String persisted = handler.toJson(components);
            Object roundTrip = handler.parse(persisted);
            require(http.writeValueAsString(roundTrip).contains("\"amount\":\"" + amount + "\""));
            for (boolean structured : List.of(false, true)) {
                HrSalarySlip salary = new HrSalarySlip();
                salary.setGrossTotal(new BigDecimal(amount));
                salary.setComponents(List.of(Map.of("type", structured ? "TAX_SNAPSHOT" : "EARNING", "amount", new BigDecimal(amount))));
                Object before = digest.invoke(salaryService, salary);
                salary.setComponents(internal.convertValue(handler.parse(handler.toJson(salary.getComponents())),
                        new TypeReference<List<Map<String, Object>>>() {}));
                require(before.equals(digest.invoke(salaryService, salary)));
            }
        }
        require(handler.toJson(Map.of("amount", new BigDecimal("1500.00"))).equals("{\"amount\":1500.00}"));
        System.out.println("HR_MONEY_PRECISION: checks=" + checks + "; passed=true");
    }
}
