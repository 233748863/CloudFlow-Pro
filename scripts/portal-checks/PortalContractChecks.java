package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalPaths;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.dto.ContractPortalSelectionRequest;
import com.fasterxml.jackson.core.JacksonException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class PortalContractChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        selection(); inputs(); paths(); serialization(); ordinaryWrites();
        System.out.println("PORTAL_CONTRACT_RULE_CHECKS: assertions=" + checks
                + "; failed=0; actual_production_classes=true; mysql=false; redis=false; http=false; production_modified=false");
    }

    private static void selection() {
        check(ContractPortalSelectionRules.fromRequest(List.of("9223372036854775807", "2", "1"))
                .equals(List.of(1L, 2L, Long.MAX_VALUE)), "BIGINT precision retained and selection sorted");
        check(ContractPortalSelectionRules.fromRequest(List.of()).isEmpty(), "empty selection explicitly withdraws all items");
        for (List<String> values : Arrays.asList(null, Arrays.asList("1", null), List.of("1", "1"), List.of("0"), List.of("-1"),
                List.of("01"), List.of("1.0"), List.of("1e0"), List.of(" 1"), List.of("1 "), List.of("true"), List.of("9223372036854775808"))) {
            expect400(() -> ContractPortalSelectionRules.fromRequest(values));
        }
        List<String> boundary = new ArrayList<>();
        for (int index = 1; index <= 1000; index++) boundary.add(Integer.toString(index));
        check(ContractPortalSelectionRules.fromRequest(boundary).size() == 1000, "1000 items accepted");
        boundary.add("1001"); expect400(() -> ContractPortalSelectionRules.fromRequest(boundary));
        check(ContractPortalSelectionRules.fromStored(null).isEmpty(), "NULL defaults to internal only");
        check(ContractPortalSelectionRules.fromStored("[]").isEmpty(), "stored empty array supported");
        check(ContractPortalSelectionRules.fromStored("[2, 1, 9223372036854775807]").equals(List.of(1L, 2L, Long.MAX_VALUE)), "stored integer precision retained");
        check(ContractPortalSelectionRules.encode(List.of(2L, 1L)).equals("[1, 2]"), "numeric JSON contains no string IDs");
        for (String value : List.of("", "null", "{}", "true", "1", "[\"1\"]", "[1.0]", "[1e0]", "[0]", "[-1]", "[1,1]", "[null]", "[9223372036854775808]", " ".repeat(22001))) {
            expect400(() -> ContractPortalSelectionRules.fromStored(value));
        }
        expect400(() -> ContractPortalSelectionRules.encode(null));
        expect400(() -> ContractPortalSelectionRules.encode(List.of(1L, 1L)));
    }

    private static void inputs() throws Exception {
        ObjectMapper json = new ObjectMapper();
        String suffix = ",\"termIds\":[\"9223372036854775807\",\"1\"],\"milestoneIds\":[],\"paymentScheduleIds\":[]}";
        ContractPortalSelectionRequest valid = json.readValue("{\"version\":0" + suffix, ContractPortalSelectionRequest.class);
        check(valid.getVersion() == 0 && ContractPortalSelectionRules.fromRequest(valid.getTermIds()).equals(List.of(1L, Long.MAX_VALUE)), "valid body preserves exact identifiers");
        ContractPortalSelectionRequest numeric = json.readValue("{\"version\":1,\"termIds\":[9223372036854775807],\"milestoneIds\":[],\"paymentScheduleIds\":[]}", ContractPortalSelectionRequest.class);
        check(numeric.getTermIds().equals(List.of(Long.toString(Long.MAX_VALUE))), "integer input is not converted through floating point");
        for (String invalid : List.of("1.5", "1.0", "1e0", "\"1\"", "true", "[]", "{}", "-1", "2147483648", "9223372036854775808")) {
            rejected(json, "{\"version\":" + invalid + suffix);
        }
        for (String field : List.of("tenantId", "customerId", "contractId", "ownerId", "deleted", "status", "signedFlag", "portalTermIds", "unknown")) {
            rejected(json, "{\"" + field + "\":1,\"version\":0" + suffix);
        }
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            check(factory.getValidator().validate(valid).isEmpty(), "valid request satisfies endpoint validation");
            ContractPortalSelectionRequest missing = json.readValue("{}", ContractPortalSelectionRequest.class);
            check(factory.getValidator().validate(missing).size() == 4, "all four fields are required; missing arrays never clear selections");
            valid.setVersion(null); check(!factory.getValidator().validate(valid).isEmpty(), "null version rejected");
            valid.setVersion(-1); check(!factory.getValidator().validate(valid).isEmpty(), "negative direct version rejected");
        }
    }

    private static void paths() {
        for (String route : List.of("/portal/crm/contract/list", "/portal/crm/contract/1", "/portal/crm/contract/9223372036854775807")) {
            check(PortalPaths.supported("GET", route) && !PortalPaths.publicEndpoint("GET", route), "contract route always requires portal authentication");
            for (String method : List.of("POST", "PUT", "PATCH", "DELETE", "HEAD")) check(!PortalPaths.supported(method, route), "read route has no method alias");
        }
        for (String route : List.of("/portal/crm/contract", "/portal/crm/contract/0", "/portal/crm/contract/-1", "/portal/crm/contract/01",
                "/portal/crm/contract/1.0", "/portal/crm/contract/1/portal-publication", "/portal/crm/contract/1/files", "/portal/crm/contract/1;ignored", "/portal/crm/contract/12345678901234567890")) {
            check(!PortalPaths.supported("GET", route), "unapproved contract route rejected");
        }
        for (Method method : com.cloudflow.auth.controller.PortalContractController.class.getDeclaredMethods()) {
            SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
            if (permission != null) check(permission.type().equals("portal") && Arrays.equals(permission.value(), new String[]{"crm:portal:contract:list"}), "external contract controller uses dedicated domain permission");
        }
    }

    private static void serialization() {
        SimpleModule module = new SimpleModule(); module.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = new ObjectMapper().findAndRegisterModules().registerModule(module);
        PortalContractVO contract = new PortalContractVO(); contract.setContractId(Long.toString(Long.MAX_VALUE));
        contract.setAmount("9999999999999999.99"); contract.setStartDate(LocalDate.of(2026, 9, 25));
        PortalContractVO.Term term = new PortalContractVO.Term(); term.setTermId(Long.toString(Long.MAX_VALUE));
        term.setTermContent("<script>literal text</script>"); term.setRequirement("public requirement");
        PortalContractVO.Milestone milestone = new PortalContractVO.Milestone(); milestone.setId("2"); milestone.setAmount("9007199254740993.01");
        PortalContractVO.PaymentSchedule payment = new PortalContractVO.PaymentSchedule(); payment.setId("3"); payment.setAmount("1234567890123456.78"); payment.setActualAmount("0.01");
        contract.setTerms(List.of(term)); contract.setMilestones(List.of(milestone)); contract.setPaymentSchedules(List.of(payment));
        JsonNode result = json.valueToTree(contract);
        fields(result, Set.of("contractId", "contractNo", "contractName", "counterpartyName", "amount", "currency", "startDate", "endDate", "status", "terms", "milestones", "paymentSchedules"));
        fields(result.get("terms").get(0), Set.of("termId", "termNo", "termCategory", "termContent", "requirement", "responsibleParty", "deadlineDate", "fulfilledDate", "status"));
        fields(result.get("milestones").get(0), Set.of("id", "milestoneNo", "milestoneName", "milestoneType", "plannedDate", "actualDate", "amount", "currency", "status"));
        fields(result.get("paymentSchedules").get(0), Set.of("id", "paymentNo", "paymentName", "planDate", "actualDate", "amount", "actualAmount", "currency", "status"));
        check(result.get("contractId").isTextual() && result.get("contractId").textValue().equals(Long.toString(Long.MAX_VALUE)), "contract ID stays a string");
        check(result.get("amount").isTextual() && result.get("amount").textValue().equals("9999999999999999.99"), "DECIMAL(18,2) stays exact");
        check(result.get("startDate").textValue().equals("2026-09-25"), "public dates contain no time or timezone");
        check(result.get("terms").get(0).get("termContent").textValue().equals("<script>literal text</script>"), "text content is not interpreted server-side");
    }

    private static void ordinaryWrites() throws Exception {
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        OaContract input = json.readValue("{\"portalTermIds\":\"[1]\",\"portalMilestoneIds\":\"[2]\",\"portalPaymentScheduleIds\":\"[3]\"}", OaContract.class);
        check(input.getPortalTermIds() == null && input.getPortalMilestoneIds() == null && input.getPortalPaymentScheduleIds() == null, "ordinary JSON cannot bind publication columns");
        for (String field : List.of("portalTermIds", "portalMilestoneIds", "portalPaymentScheduleIds")) {
            TableField policy = OaContract.class.getDeclaredField(field).getAnnotation(TableField.class);
            check(policy.insertStrategy() == FieldStrategy.NEVER && policy.updateStrategy() == FieldStrategy.NEVER, "ordinary MyBatis entity writes cannot alter " + field);
        }
        input.setPortalTermIds("[1]"); input.setPortalMilestoneIds("[2]"); input.setPortalPaymentScheduleIds("[3]");
        OaContractWritePolicy.initialize(input);
        check(input.getPortalTermIds() == null && input.getPortalMilestoneIds() == null && input.getPortalPaymentScheduleIds() == null, "create policy clears import or programmatic publication injection");
        OaContract previous = new OaContract(); previous.setPortalTermIds("[7]"); previous.setPortalMilestoneIds("[8]"); previous.setPortalPaymentScheduleIds("[9]");
        OaContractWritePolicy.preserve(input, previous);
        check(input.getPortalTermIds().equals("[7]") && input.getPortalMilestoneIds().equals("[8]") && input.getPortalPaymentScheduleIds().equals("[9]"), "ordinary edits preserve stored publication lists");
    }

    private static void rejected(ObjectMapper json, String body) throws Exception {
        try { json.readValue(body, ContractPortalSelectionRequest.class); }
        catch (JacksonException rejected) { checks++; return; }
        throw new AssertionError("Unexpected accepted body: " + body);
    }

    private static void fields(JsonNode value, Set<String> allowed) {
        Set<String> actual = new HashSet<>(); value.fieldNames().forEachRemaining(actual::add);
        check(actual.equals(allowed), "public projection matches exact field allowlist: " + actual);
    }

    private static void expect400(Runnable action) {
        try { action.run(); }
        catch (ServiceException rejected) { check(Integer.valueOf(400).equals(rejected.getCode()), "invalid selection returns 400"); return; }
        throw new AssertionError("Invalid selection accepted");
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
