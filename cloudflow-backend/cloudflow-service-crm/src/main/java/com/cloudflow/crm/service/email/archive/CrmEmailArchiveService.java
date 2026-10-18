package com.cloudflow.crm.service.email.archive;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageEmailTemplateChoice;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.domain.dto.CrmEmailQuery;
import com.cloudflow.crm.domain.dto.CrmEmailRequest;
import com.cloudflow.crm.domain.vo.CrmEmailRecordVO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmContactMapper;
import com.cloudflow.crm.mapper.CrmEmailRecordMapper;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.remote.CrmMessageDeliveryClient;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class CrmEmailArchiveService {
    public static final String BUSINESS_TYPE = "CRM_EMAIL_ARCHIVE";
    private final CrmEmailRecordMapper records;
    private final CrmContactMapper contacts;
    private final CrmEmailArchiveAccess access;
    private final CrmEmailArchiveContent content;
    private final CrmEmailArchiveFiles files;
    private final CrmEmailArchiveTracking tracking;
    private final CrmMessageDeliveryClient messages;
    private final MessageSender sender;
    private final TransactionTemplate transactions;

    public record Outcome(Long emailId, String sendStatus, String code, String message) { }
    public record ContactChoice(Long contactId, String contactName, String emailMask) { }
    public record Context(String bizType, Long bizId, Long customerId, String businessName, List<ContactChoice> contacts) { }
    public record TemplatePreview(String content, boolean ready, String reason) {
        @Override public String toString() { return "TemplatePreview[ready=" + ready + "]"; }
    }

    public PageResult<CrmEmailRecordVO> list(CrmEmailQuery query, PageQuery page) {
        CrmEmailArchiveAccess.Actor actor = access.current("crm:email:list");
        Page<CrmEmailRecord> rows = records.pageAccessible(page.build(), CrmRecordSupport.tenantId(), query == null ? new CrmEmailQuery() : query,
                actor.businessTypes(), actor.identity().scope("scope_dept_id", "scope_owner_id"));
        return new PageResult<>(rows.getRecords().stream().map(record -> view(record, false)).toList(), rows.getTotal(), rows.getCurrent(), rows.getSize());
    }

    public CrmEmailRecordVO detail(Long emailId) { return view(access.record(access.current("crm:email:list"), emailId), true); }

    public Context context(String bizType, Long bizId) {
        CrmEmailArchiveAccess.Actor actor = access.current("crm:email:list");
        CrmEmailArchiveAccess.Business business = access.business(actor, bizType, bizId);
        List<ContactChoice> choices = new ArrayList<>();
        for (CrmContact contact : contacts.selectList(new LambdaQueryWrapper<CrmContact>().eq(CrmContact::getTenantId, CrmRecordSupport.tenantId())
                .eq(CrmContact::getCustomerId, business.customer().getCustomerId()).eq(CrmContact::getStatus, "ACTIVE")
                .eq(CrmContact::getDeleted, 0).orderByDesc(CrmContact::getPrimaryFlag).orderByAsc(CrmContact::getContactId))) {
            try { choices.add(new ContactChoice(contact.getContactId(), contact.getContactName(), CrmEmailSecurity.maskAddress(contact.getEmail()))); }
            catch (CrmBusinessException invalidAddress) { }
        }
        return new Context(bizType, bizId, business.customer().getCustomerId(), business.name(), List.copyOf(choices));
    }

    public List<MessageEmailTemplateChoice> templates() {
        access.current("crm:email:send");
        try {
            R<List<MessageEmailTemplateChoice>> response = messages.templates();
            if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException();
            List<MessageEmailTemplateChoice> supported = new ArrayList<>();
            for (MessageEmailTemplateChoice choice : response.getData()) {
                R<MessageEmailTemplate> templateResponse = messages.template(choice.templateCode());
                if (templateResponse == null || !templateResponse.isSuccess() || templateResponse.getData() == null) throw new IllegalStateException();
                try { content.template(templateResponse.getData()); supported.add(choice); }
                catch (CrmBusinessException incompatible) { }
            }
            return List.copyOf(supported);
        } catch (RuntimeException unavailable) { throw new CrmBusinessException("CHANNEL_NOT_CONFIGURED: 邮件模板服务暂不可用，未发送邮件，可保存草稿或手工归档"); }
    }

    public TemplatePreview template(String code, String bizType, Long bizId, Long contactId) {
        CrmEmailArchiveAccess.Business business = access.business(access.current("crm:email:send"), bizType, bizId);
        CrmContact contact = access.contact(business, contactId, false);
        MessageEmailTemplate template = template(code);
        CrmEmailArchiveContent.Body preview = content.preview(template, business, contact);
        return new TemplatePreview(preview.html(), template.ready(), template.ready() ? "实际发送结果以消息中心接纳为准" : "CHANNEL_NOT_CONFIGURED: 邮件渠道未配置或停用，未发送邮件；可保存草稿");
    }

    @Audit(name = "保存客户邮件草稿", spel = "#request.bizId()")
    public Outcome draft(CrmEmailRequest request) {
        CrmEmailRecord record = persist(request, false);
        return outcome(record, "DRAFT".equals(record.getSendStatus()) ? "DRAFT_SAVED" : "ALREADY_ACCEPTED", "草稿已保存；未提交发送的记录保持草稿状态");
    }

    @Audit(name = "手工归档客户来信", spel = "#request.bizId()")
    public Outcome archiveInbound(CrmEmailRequest request) {
        return outcome(persist(request, true), "MANUAL_ARCHIVED", "来信已手工归档，来源由录入人提供，未自动读取邮箱");
    }

    @Audit(name = "发送并归档客户业务邮件", spel = "#request.bizId()")
    public Outcome send(CrmEmailRequest request) {
        CrmEmailRecord saved = persist(request, false);
        if (!"DRAFT".equals(saved.getSendStatus())) return outcome(saved, "ALREADY_ACCEPTED", "该操作已登记；请查看真实投递状态，勿重复发送");
        MessageEmailTemplate template;
        try {
            template = template(request.templateCode());
            content.template(template);
            if (!template.ready()) return outcome(saved, "CHANNEL_NOT_CONFIGURED", "邮件渠道未配置或停用，未发送邮件；草稿已保留");
            CrmEmailSecurity.address(template.fromAddress());
        } catch (CrmBusinessException invalid) { return outcome(saved, "CHANNEL_NOT_CONFIGURED", invalid.getMessage() + "；邮件未发送，草稿已保留"); }
        try {
            return transactions.execute(status -> {
                CrmEmailRecord record = records.lockById(CrmRecordSupport.tenantId(), saved.getEmailId());
                CrmEmailArchiveAccess.Actor actor = access.current("crm:email:send");
                access.record(actor, saved.getEmailId());
                if (!Objects.equals(actor.identity().userId(), record.getSenderUserId())) throw new CrmBusinessException("仅原发送人可提交该草稿");
                if (!sameContent(saved, record)) throw new CrmBusinessException("草稿已被修改，请重新打开后发送");
                if (!"DRAFT".equals(record.getSendStatus())) return outcome(record, "ALREADY_ACCEPTED", "该操作已登记；请查看真实投递状态");
                CrmEmailArchiveAccess.Business business = access.business(actor, record.getBizType(), record.getBizId());
                CrmContact contact = access.contact(business, record.getContactId(), true);
                if (!record.getToAddresses().equals(List.of(CrmEmailSecurity.address(contact.getEmail())))) throw new CrmBusinessException("联系人邮箱已变化，请重新核对草稿");
                files.attachments(record.getBizType(), record.getBizId(), record.getSenderUserId(), record.getAttachmentFileIds());
                record.setFromAddress(CrmEmailSecurity.address(template.fromAddress()));
                CrmEmailArchiveTracking.Pixel pixel = tracking.issue(record);
                sender.send(message(record, template.templateCode(), pixel));
                record.setSendStatus("QUEUED"); CrmRecordSupport.touch(record); CrmRecordSupport.saved(records.updateById(record));
                return outcome(record, "QUEUED", "邮件已排队，尚未确认发送；真实结果将自动回写归档");
            });
        } catch (CrmBusinessException rejected) { throw rejected; }
        catch (RuntimeException unavailable) {
            CrmEmailRecord record = access.record(access.current("crm:email:send"), saved.getEmailId());
            return outcome(record, "DRAFT".equals(record.getSendStatus()) ? "CHANNEL_UNAVAILABLE" : "ALREADY_ACCEPTED",
                    "DRAFT".equals(record.getSendStatus()) ? "发送服务暂不可用，未发送邮件；草稿已保留" : "该操作已登记，请查看投递状态");
        }
    }

    public CrmEmailArchiveFiles.FileInfo upload(String bizType, Long bizId, MultipartFile upload, boolean inbound) {
        CrmEmailArchiveAccess.Business business = access.business(access.current(inbound ? "crm:email:archive" : "crm:email:send"), bizType, bizId);
        return files.upload(business, upload);
    }

    public ResponseEntity<byte[]> download(Long emailId, Long fileId) {
        CrmEmailRecord record = access.record(access.current("crm:email:list"), emailId);
        if (record.getAttachmentFileIds() == null || !record.getAttachmentFileIds().contains(fileId)) throw new CrmBusinessException("邮件附件不存在或无权访问");
        return files.download(record.getBizType(), record.getBizId(), fileId);
    }

    private CrmEmailRecord persist(CrmEmailRequest request, boolean inbound) {
        CrmRecordSupport.require(request, "邮件请求不能为空");
        if (request.requestKey() == null || !request.requestKey().matches("[A-Za-z0-9_-]{16,128}")) throw new CrmBusinessException("邮件操作标识无效");
        try { return transactions.execute(status -> persistLocked(request, inbound)); }
        catch (DuplicateKeyException concurrent) {
            return transactions.execute(status -> {
                CrmEmailArchiveAccess.Actor actor = access.current(inbound ? "crm:email:archive" : "crm:email:send");
                CrmEmailRecord record = records.lockByOperation(CrmRecordSupport.tenantId(), request.requestKey());
                if (record == null || !Objects.equals(record.getSenderUserId(), actor.identity().userId())) throw new CrmBusinessException("邮件操作标识已使用，请重新打开录入窗口");
                return persistLocked(request, inbound);
            });
        }
    }

    private CrmEmailRecord persistLocked(CrmEmailRequest request, boolean inbound) {
        CrmEmailArchiveAccess.Actor actor = access.current(inbound ? "crm:email:archive" : "crm:email:send");
        CrmRecordSupport.require(records.lockOperator(CrmRecordSupport.tenantId(), actor.identity().userId()), "邮件操作人已失效");
        CrmEmailArchiveAccess.Business business = access.business(actor, request.bizType(), request.bizId());
        CrmContact contact = access.contact(business, request.contactId(), !inbound);
        CrmEmailArchiveContent.Body body = inbound ? CrmEmailArchiveContent.clean(request.content()) : content.render(request.content(), business, contact);
        if (body.summary().isBlank()) throw new CrmBusinessException("邮件正文净化后为空");
        CrmEmailRecord candidate = new CrmEmailRecord();
        candidate.setOperationKey(request.requestKey()); candidate.setDirection(inbound ? "INBOUND" : "OUTBOUND");
        candidate.setSubject(CrmEmailArchiveContent.subject(request.subject())); candidate.setSanitizedContent(body.html()); candidate.setContentSummary(body.summary());
        candidate.setBizType(request.bizType()); candidate.setBizId(request.bizId()); candidate.setCustomerId(business.customer().getCustomerId());
        candidate.setContactId(request.contactId()); candidate.setSenderUserId(actor.identity().userId());
        candidate.setRemark(request.remark() == null || request.remark().isBlank() ? null : CrmRecordSupport.text(request.remark(), 500, "来源说明或备注"));
        candidate.setAttachmentFileIds(request.fileIds() == null ? List.of() : List.copyOf(request.fileIds()));
        candidate.setAttachmentCount(candidate.getAttachmentFileIds().size()); candidate.setReadFlag(0);
        if (inbound) {
            if (candidate.getRemark() == null) throw new CrmBusinessException("手工归档必须填写来信来源说明");
            candidate.setFromAddress(CrmEmailSecurity.address(request.fromAddress()));
            if (contact != null && !candidate.getFromAddress().equals(CrmEmailSecurity.address(contact.getEmail()))) throw new CrmBusinessException("来信邮箱与所选客户联系人不一致");
            candidate.setToAddresses(addresses(request.toAddresses(), true)); candidate.setCcAddresses(addresses(request.ccAddresses(), false));
            if (candidate.getCcAddresses().stream().anyMatch(candidate.getToAddresses()::contains)) throw new CrmBusinessException("收件和抄送邮箱不能重复");
        } else {
            candidate.setToAddresses(List.of(CrmEmailSecurity.address(contact.getEmail()))); candidate.setCcAddresses(List.of());
            if (request.fromAddress() != null && !request.fromAddress().isBlank() || request.ccAddresses() != null && !request.ccAddresses().isEmpty()
                    || request.toAddresses() != null && !request.toAddresses().isEmpty() && !addresses(request.toAddresses(), true).equals(candidate.getToAddresses())) {
                throw new CrmBusinessException("发件地址由消息中心确定，业务邮件发送至所选客户联系人");
            }
        }
        CrmEmailRecord existing = records.lockByOperation(CrmRecordSupport.tenantId(), request.requestKey());
        if (existing != null) {
            if (!Objects.equals(existing.getSenderUserId(), actor.identity().userId()) || !Objects.equals(existing.getDirection(), candidate.getDirection())
                    || !Objects.equals(existing.getBizType(), candidate.getBizType()) || !Objects.equals(existing.getBizId(), candidate.getBizId())) {
                throw new CrmBusinessException("邮件操作标识已用于其他业务，请重新打开录入窗口");
            }
            access.record(actor, existing.getEmailId());
            if (!"DRAFT".equals(existing.getSendStatus())) {
                if (!sameContent(existing, candidate) || inbound && !Objects.equals(existing.getFromAddress(), candidate.getFromAddress())) throw new CrmBusinessException("该操作已归档，不能用同一操作标识更改邮件内容");
                return existing;
            }
        }
        files.attachments(candidate.getBizType(), candidate.getBizId(), actor.identity().userId(), candidate.getAttachmentFileIds());
        if (existing == null) {
            CrmRecordSupport.create(candidate, "emailId"); candidate.setSendStatus(inbound ? "MANUAL" : "DRAFT");
            CrmRecordSupport.saved(records.insert(candidate));
        } else {
            candidate.setEmailId(existing.getEmailId()); candidate.setTenantId(existing.getTenantId()); candidate.setCreateBy(existing.getCreateBy()); candidate.setCreateTime(existing.getCreateTime());
            candidate.setSendStatus("DRAFT"); CrmRecordSupport.touch(candidate); CrmRecordSupport.saved(records.updateById(candidate));
        }
        return records.selectById(candidate.getEmailId());
    }

    private MessageEmailTemplate template(String code) {
        if (code == null || !code.matches("[A-Za-z0-9_-]{1,100}")) throw new CrmBusinessException("CHANNEL_NOT_CONFIGURED: 请先选择可用的客户业务邮件模板");
        try {
            R<MessageEmailTemplate> response = messages.template(code);
            if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException();
            return response.getData();
        } catch (RuntimeException unavailable) { throw new CrmBusinessException("CHANNEL_NOT_CONFIGURED: 邮件模板服务暂不可用"); }
    }

    private CrmEmailRecordVO view(CrmEmailRecord record, boolean detail) {
        CrmEmailRecordVO view = new CrmEmailRecordVO(); BeanUtils.copyProperties(record, view);
        if (detail) {
            view.setSanitizedContent(CrmEmailArchiveContent.clean(record.getSanitizedContent()).html());
            view.setAttachments(files.info(record.getBizType(), record.getBizId(), record.getAttachmentFileIds()));
            if ("DRAFT".equals(record.getSendStatus()) && Objects.equals(record.getSenderUserId(), UserContext.getUserId())) view.setRequestKey(record.getOperationKey());
        }
        return view;
    }

    public static MessageSendRequest message(CrmEmailRecord record, String templateCode, CrmEmailArchiveTracking.Pixel pixel) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("mailFromAddress", record.getFromAddress());
        params.put("attachmentIds", record.getAttachmentFileIds());
        if (pixel != null) { params.put("archiveOpenToken", pixel.token()); params.put("archiveOpenOrigin", pixel.origin()); }
        return MessageSendRequest.builder().templateCode(templateCode).channelTypes(List.of(MessageChannelType.EMAIL))
                .receivers(List.of(MessageReceiver.ofAddress("EMAIL", record.getToAddresses().get(0)))).params(params)
                .category(MessageCategory.BIZ_REMINDER).bizType(BUSINESS_TYPE).bizId(String.valueOf(record.getEmailId()))
                .traceId(BUSINESS_TYPE + ":" + record.getTenantId() + ":" + record.getEmailId())
                .deduplicationKey(BUSINESS_TYPE + ":" + record.getTenantId() + ":" + MessagePayloadCodec.hash(record.getOperationKey()))
                .renderedContent(true).title(record.getSubject()).content(CrmEmailArchiveTracking.html(record.getSanitizedContent(), pixel)).build();
    }

    private static List<String> addresses(List<String> values, boolean required) {
        if (values == null || values.isEmpty()) {
            if (required) throw new CrmBusinessException("请填写至少一个收件邮箱");
            return List.of();
        }
        if (values.size() > 50) throw new CrmBusinessException("手工归档每组邮箱最多50个");
        List<String> addresses = values.stream().map(CrmEmailSecurity::address).toList();
        if (new LinkedHashSet<>(addresses).size() != addresses.size()) throw new CrmBusinessException("邮箱不能重复");
        return addresses;
    }

    private static boolean sameContent(CrmEmailRecord left, CrmEmailRecord right) {
        return Objects.equals(left.getDirection(), right.getDirection()) && Objects.equals(left.getSubject(), right.getSubject())
                && Objects.equals(left.getSanitizedContent(), right.getSanitizedContent()) && Objects.equals(left.getToAddresses(), right.getToAddresses())
                && Objects.equals(left.getCcAddresses(), right.getCcAddresses()) && Objects.equals(left.getBizType(), right.getBizType())
                && Objects.equals(left.getBizId(), right.getBizId()) && Objects.equals(left.getCustomerId(), right.getCustomerId())
                && Objects.equals(left.getContactId(), right.getContactId()) && Objects.equals(left.getAttachmentFileIds(), right.getAttachmentFileIds())
                && Objects.equals(left.getRemark(), right.getRemark());
    }

    private static Outcome outcome(CrmEmailRecord record, String code, String message) { return new Outcome(record.getEmailId(), record.getSendStatus(), code, message); }
}
