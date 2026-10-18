package com.cloudflow.oa.service.impl;

import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaPurchaseRfqItem;
import com.cloudflow.oa.domain.OaPurchaseRfqSupplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.IDN;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
@RequiredArgsConstructor
public class OaRfqEmailContent {
    private final ObjectMapper json;

    public static String template(String businessType) {
        return switch (businessType) {
            case "RFQ_EMAIL_INVITE" -> "OA_RFQ_INVITE_EMAIL";
            case "RFQ_EMAIL_REMINDER" -> "OA_RFQ_REMINDER_EMAIL";
            case "RFQ_EMAIL_AWARD" -> "OA_RFQ_AWARD_EMAIL";
            default -> throw new IllegalArgumentException("询价消息用途无效");
        };
    }

    public MessageSendRequest request(OaPurchaseRfq rfq, OaPurchaseRfqSupplier invitation, List<OaPurchaseRfqItem> items,
            String businessType, Long operatorId, Integer revision) {
        String subject = "RFQ_EMAIL_AWARD".equals(businessType) ? "询价结果通知" : "RFQ_EMAIL_REMINDER".equals(businessType) ? "询价截止提醒" : "供应商询价邀请";
        String title = subject + "：" + rfq.getRfqNo() + " · " + rfq.getTitle();
        StringBuilder body = new StringBuilder("<p>").append(escape(invitation.getSupplierName())).append("：</p><p>")
                .append(escape(subject)).append("，询价单号：").append(escape(rfq.getRfqNo())).append("</p>");
        if ("RFQ_EMAIL_AWARD".equals(businessType)) {
            body.append("<p>").append(java.util.Objects.equals(rfq.getAwardedSupplierId(), invitation.getSupplierId())
                    ? "贵司已被选为本轮询价中标供应商，请联系采购负责人确认后续事项。" : "本轮询价已结束，感谢贵司参与，本次未中标。")
                    .append("</p>");
        } else {
            body.append("<p>报价截止日期：").append(escape(rfq.getQuoteDeadline())).append("</p><table><thead><tr><th>物料</th><th>规格</th><th>数量</th><th>单位</th><th>要求</th></tr></thead><tbody>");
            for (OaPurchaseRfqItem item : items) {
                body.append("<tr><td>").append(escape(item.getItemName())).append("</td><td>").append(escape(item.getSpec()))
                        .append("</td><td>").append(escape(item.getQuantity())).append("</td><td>").append(escape(item.getUnit()))
                        .append("</td><td>").append(escape(item.getBrandRequirement())).append(" ").append(escape(item.getTechnicalRequirement())).append("</td></tr>");
            }
            body.append("</tbody></table><p>期望交付日期：").append(escape(rfq.getExpectedDeliveryDate()))
                    .append("</p><p>交付地址：").append(escape(rfq.getDeliveryAddress())).append("</p><p>付款条件：")
                    .append(escape(rfq.getPaymentTerms())).append("</p><p>询价条款：").append(escape(rfq.getTermsContent())).append("</p>");
        }
        body.append("<p>采购联系人：").append(escape(rfq.getOwnerName())).append("</p>");
        LinkedHashMap<String, Object> params = new LinkedHashMap<String, Object>();
        params.put("operatorId", operatorId);
        params.put("inviteRevision", revision);
        params.put("rfqId", rfq.getRfqId());
        if (!"RFQ_EMAIL_AWARD".equals(businessType) && rfq.getAttachmentUrl() != null && !rfq.getAttachmentUrl().isBlank()) {
            params.put("attachmentIds", List.of(fileId(rfq.getAttachmentUrl())));
        }
        String address = address(invitation.getContactEmail());
        String digest = MessagePayloadCodec.digest(json.valueToTree(List.of(title, body.toString(), address,
                params.getOrDefault("attachmentIds", List.of()))), json);
        params.put("sourceDigest", digest);
        String checkpoint = "RFQ_EMAIL_INVITE".equals(businessType) ? String.valueOf(revision)
                : "RFQ_EMAIL_REMINDER".equals(businessType) ? String.valueOf(rfq.getQuoteDeadline()) : String.valueOf(rfq.getAwardedQuotationId());
        return MessageSendRequest.builder().templateCode(template(businessType)).renderedContent(true)
                .channelTypes(List.of(MessageChannelType.EMAIL)).category(MessageCategory.BIZ_REMINDER)
                .receivers(List.of(MessageReceiver.builder().receiverType("EMAIL").receiverAddress(address).receiverName(invitation.getContactName()).build()))
                .bizType(businessType).bizId(String.valueOf(invitation.getRfqSupplierId())).params(params)
                .deduplicationKey(businessType + ":" + invitation.getRfqSupplierId() + ":" + checkpoint + ":" + digest)
                .title(title).content(body.toString()).build();
    }

    public static Long fileId(String reference) {
        if (reference == null || !reference.matches("oa-file:RFQ_INVITATION:[1-9][0-9]{0,18}")) throw new IllegalArgumentException("请通过询价专用入口上传附件");
        try { return Long.valueOf(reference.substring(reference.lastIndexOf(':') + 1)); }
        catch (NumberFormatException failure) { throw new IllegalArgumentException("询价附件编号无效"); }
    }

    public static String address(String input) {
        if (input == null || input.length() > 100 || input.chars().anyMatch(value -> value <= 32 || value == 127)) throw new IllegalArgumentException("供应商联系邮箱无效");
        int separator = input.lastIndexOf('@');
        if (separator < 1 || input.indexOf('@') != separator) throw new IllegalArgumentException("供应商联系邮箱无效");
        String domain = IDN.toASCII(input.substring(separator + 1), IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
        String local = input.substring(0, separator);
        if (!local.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+") || local.startsWith(".") || local.endsWith(".") || local.contains("..")
                || domain.isBlank() || domain.startsWith(".") || domain.endsWith(".") || domain.contains("..")) throw new IllegalArgumentException("供应商联系邮箱无效");
        return local + "@" + domain;
    }

    private String escape(Object value) { return value == null ? "" : HtmlUtils.htmlEscape(String.valueOf(value)); }
}
