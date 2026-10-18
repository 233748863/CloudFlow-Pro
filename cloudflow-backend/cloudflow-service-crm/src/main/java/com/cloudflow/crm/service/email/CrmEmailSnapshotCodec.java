package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CrmEmailSnapshotCodec {
    private final MessageSecretCipher cipher;
    private final ObjectMapper json;

    public String encode(CrmMassEmailRecipient recipient, String purpose, JsonNode value) {
        validateIdentity(recipient, purpose);
        if (value == null || value.isNull()) throw invalid();
        ObjectNode document = json.createObjectNode();
        document.put("format", "CRM_EMAIL_SNAPSHOT_V1");
        document.put("tenantId", recipient.getTenantId());
        document.put("recipientId", recipient.getRecipientId());
        document.put("massEmailId", recipient.getMassEmailId());
        document.put("campaignId", recipient.getCampaignId());
        document.put("crmEmailId", recipient.getCrmEmailId());
        document.put("targetType", recipient.getTargetType());
        document.put("targetId", recipient.getTargetId());
        document.put("testFlag", recipient.getTestFlag());
        document.put("emailHash", recipient.getEmailHash());
        document.put("purpose", purpose);
        document.set("value", value);
        try {
            String plain = json.writeValueAsString(document);
            if (plain.length() > 262144) throw invalid();
            return cipher.encrypt(plain);
        } catch (Exception failure) { throw invalid(); }
    }

    public JsonNode decode(CrmMassEmailRecipient recipient, String purpose, String encrypted) {
        validateIdentity(recipient, purpose);
        if (encrypted == null || encrypted.isBlank() || encrypted.length() > 2097152) throw invalid();
        try {
            JsonNode document = json.readTree(cipher.decrypt(encrypted));
            if (!document.isObject() || !"CRM_EMAIL_SNAPSHOT_V1".equals(document.path("format").asText())
                    || !purpose.equals(document.path("purpose").asText())
                    || !sameIdentifier(document.get("tenantId"), recipient.getTenantId())
                    || !sameIdentifier(document.get("recipientId"), recipient.getRecipientId())
                    || !sameIdentifier(document.get("massEmailId"), recipient.getMassEmailId())
                    || !sameIdentifier(document.get("campaignId"), recipient.getCampaignId())
                    || !sameIdentifier(document.get("crmEmailId"), recipient.getCrmEmailId())
                    || !json.valueToTree(recipient.getTargetType()).equals(document.get("targetType"))
                    || !sameIdentifier(document.get("targetId"), recipient.getTargetId())
                    || !sameIdentifier(document.get("testFlag"), recipient.getTestFlag().longValue())
                    || !json.valueToTree(recipient.getEmailHash()).equals(document.get("emailHash"))
                    || !document.hasNonNull("value")) throw invalid();
            return document.get("value");
        } catch (Exception failure) { throw invalid(); }
    }

    public String readAddress(CrmMassEmailRecipient recipient) {
        JsonNode value = decode(recipient, "ADDRESS", recipient.getEmailEncrypted());
        if (!value.isTextual()) throw invalid();
        String address = CrmEmailSecurity.address(value.textValue());
        if (!MessagePayloadCodec.hash(address).equals(recipient.getEmailHash())
                || !CrmEmailSecurity.maskAddress(address).equals(recipient.getEmailMask())) throw invalid();
        return address;
    }

    private void validateIdentity(CrmMassEmailRecipient recipient, String purpose) {
        if (recipient == null || recipient.getTenantId() == null || recipient.getTenantId() <= 0
                || recipient.getRecipientId() == null || recipient.getRecipientId() <= 0
                || !("ADDRESS".equals(purpose) || "VARIABLES".equals(purpose))
                || recipient.getEmailHash() == null || !recipient.getEmailHash().matches("[a-f0-9]{64}")
                || recipient.getTestFlag() == null || recipient.getTestFlag() < 0 || recipient.getTestFlag() > 1
                || recipient.getTargetType() == null) throw invalid();
        boolean mass = recipient.getMassEmailId() != null && recipient.getMassEmailId() > 0
                && recipient.getCampaignId() != null && recipient.getCampaignId() > 0 && recipient.getCrmEmailId() == null;
        boolean single = recipient.getMassEmailId() == null && recipient.getCampaignId() == null
                && recipient.getCrmEmailId() != null && recipient.getCrmEmailId() > 0;
        if (!mass && !single) throw invalid();
        boolean test = "TEST".equals(recipient.getTargetType()) && recipient.getTargetId() == null && recipient.getTestFlag() == 1;
        boolean business = java.util.Set.of("CUSTOMER", "CONTACT", "LEAD").contains(recipient.getTargetType())
                && recipient.getTargetId() != null && recipient.getTargetId() > 0 && recipient.getTestFlag() == 0;
        if (!test && !business) throw invalid();
    }

    private boolean sameIdentifier(JsonNode value, Long expected) {
        return value != null && (expected == null ? value.isNull()
                : value.isIntegralNumber() && value.canConvertToLong() && value.longValue() == expected);
    }

    private CrmBusinessException invalid() { return new CrmBusinessException("MAIL_SNAPSHOT_INVALID: 邮件快照无效或无法解密"); }
}
