package com.cloudflow.auth.portal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysPortalUserMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import com.cloudflow.common.security.portal.PortalTokens;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class PortalUserService {
    private static final int INVITATION_ATTEMPTS = 3;
    private final SysPortalUserMapper users;
    private final PortalContacts contacts;
    private final PortalCredentials credentials;
    private final PortalInvitationMail invitations;
    private final PortalTenantAccess tenants;
    private final PortalTokens tokens;
    private final MessageSecretCipher cipher;
    private final PlatformTransactionManager transactions;

    public PageResult<PortalUserView> list(String keyword, String status, int pageNum, int pageSize) {
        requireOperator(false);
        List<Long> visible = contacts.visibleIds();
        if (visible.isEmpty()) return new PageResult<>(List.of(), 0, pageNum, pageSize);
        Page<SysPortalUser> page = users.selectPage(new Page<>(pageNum, pageSize), new LambdaQueryWrapper<SysPortalUser>()
                .eq(SysPortalUser::getTenantId, tenantId()).eq(SysPortalUser::getDeleted, 0)
                .eq(SysPortalUser::getUserType, "CUSTOMER_CONTACT").eq(SysPortalUser::getRefBizType, "CRM_CONTACT")
                .in(SysPortalUser::getRefBizId, visible).like(keyword != null && !keyword.isBlank(), SysPortalUser::getLoginAccount, keyword)
                .eq(status != null && !status.isBlank(), SysPortalUser::getStatus, status)
                .orderByDesc(SysPortalUser::getPortalUserId));
        return new PageResult<>(page.getRecords().stream().map(this::view).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public PageResult<ContactChoice> candidates(String keyword, int pageNum, int pageSize) {
        requireOperator(true);
        PageResult<PortalContactSnapshot> page = contacts.candidates(keyword, pageNum, pageSize);
        return new PageResult<>(page.getRows().stream().map(contact -> new ContactChoice(contact.getContactId(),
                contact.getCustomerId(), contact.getContactName(), contact.getCustomerName(), cipher.maskAddress(contact.getEmail()))).toList(),
                page.getTotal(), page.getPageNum(), page.getPageSize());
    }

    public Readiness readiness() {
        requireOperator(false);
        String reason = invitations.unavailableReason(tenantId());
        return new Readiness(reason == null, reason);
    }

    @Audit(name = "邀请客户门户账号")
    public PortalUserView invite(PortalRequests.Invite request) {
        requireOperator(true);
        String account = credentials.account(request.getLoginAccount());
        PortalContactSnapshot contact = contacts.invitation(request.getContactId(), true);
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        TransientDataAccessException lastConflict = null;
        for (int attempt = 0; attempt < INVITATION_ATTEMPTS; attempt++) {
            try {
                PortalUserView invited = inviteOnce(transaction, account, contact);
                if (invited != null) return invited;
            } catch (TransientDataAccessException competing) {
                lastConflict = competing;
            }
        }
        throw new ServiceException("邀请暂时无法完成，请稍后核对账号列表后重试", 503, lastConflict);
    }

    private PortalUserView inviteOnce(TransactionTemplate transaction, String account, PortalContactSnapshot contact) {
        try {
            return transaction.execute(status -> {
                SysPortalUser existing = users.lockContact(tenantId(), contact.getContactId());
                if (existing != null) return existingInvitation(existing, account, contact);
                SysPortalUser user = new SysPortalUser();
                user.setTenantId(tenantId());
                user.setUserType("CUSTOMER_CONTACT");
                user.setRefBizType("CRM_CONTACT");
                user.setRefBizId(contact.getContactId());
                user.setLoginAccount(account);
                user.setCustomerId(contact.getCustomerId());
                user.setEmail(PortalContacts.email(contact.getEmail()));
                user.setPhone(contact.getPhone());
                user.setStatus("PENDING");
                user.setDeleted(0);
                user.setVersion(0);
                user.setSessionVersion(0);
                user.setFailCount(0);
                user.setCreateBy(operator());
                user.setCreateTime(LocalDateTime.now());
                user.setUpdateBy(operator());
                user.setUpdateTime(user.getCreateTime());
                users.insert(user);
                issueInvitation(user);
                return view(user);
            });
        } catch (DuplicateKeyException competing) {
            return transaction.execute(status -> {
                SysPortalUser existing = users.lockContact(tenantId(), contact.getContactId());
                if (existing != null) return existingInvitation(existing, account, contact);
                if (users.lockAccount(tenantId(), account) != null) throw new ServiceException("登录账号已被占用，请更换", 409);
                return null;
            });
        }
    }

    @Audit(name = "重发客户门户邀请")
    public PortalUserView resend(Long id, int version) {
        requireOperator(true);
        return inTransaction(() -> {
            SysPortalUser user = owned(id, version, true);
            if (!"PENDING".equals(user.getStatus())) throw new ServiceException("仅待激活账号可重发邀请", 409);
            PortalContactSnapshot contact = contacts.invitation(user.getRefBizId(), true);
            if (!Objects.equals(contact.getCustomerId(), user.getCustomerId())
                    || !PortalContacts.email(contact.getEmail()).equals(user.getEmail())) {
                throw new ServiceException("联系人资料已变更，请使用重设密码重新核验邀请", 409);
            }
            issueInvitation(user);
            return view(user);
        });
    }

    @Audit(name = "停用客户门户账号", highRisk = true)
    public PortalUserView disable(Long id, int version) {
        requireOperator(true);
        PortalUserView result = inTransaction(() -> {
            SysPortalUser user = owned(id, version, false);
            user.setStatus("DISABLED");
            user.setActivateTokenHash(null);
            user.setActivateExpireTime(null);
            user.setSessionVersion(Math.addExact(user.getSessionVersion(), 1));
            write(user);
            return view(user);
        });
        tokens.endAccount(id);
        return result;
    }

    @Audit(name = "重设客户门户密码并重新邀请", highRisk = true)
    public PortalUserView resetPassword(Long id, int version) {
        requireOperator(true);
        PortalUserView result = inTransaction(() -> {
            SysPortalUser user = owned(id, version, true);
            PortalContactSnapshot contact = contacts.invitation(user.getRefBizId(), true);
            user.setCustomerId(contact.getCustomerId());
            user.setEmail(PortalContacts.email(contact.getEmail()));
            user.setPhone(contact.getPhone());
            user.setPasswordHash(null);
            user.setStatus("PENDING");
            user.setFailCount(0);
            user.setLockedUntil(null);
            user.setSessionVersion(Math.addExact(user.getSessionVersion(), 1));
            issueInvitation(user);
            return view(user);
        });
        tokens.endAccount(id);
        return result;
    }

    private SysPortalUser owned(Long id, int version, boolean activeContact) {
        SysPortalUser user = users.lockId(tenantId(), id);
        if (!PortalAccountRules.customerAccount(user)) throw new ServiceException("门户账号不存在或无权访问", 403);
        contacts.invitation(user.getRefBizId(), activeContact);
        if (!Objects.equals(user.getVersion(), version)) throw new ServiceException("账号状态已变更，请核对最新结果后重试", 409);
        return user;
    }

    private PortalUserView existingInvitation(SysPortalUser user, String account, PortalContactSnapshot contact) {
        if (!PortalAccountRules.customerAccount(user) || !account.equals(user.getLoginAccount())
                || !Objects.equals(user.getCustomerId(), contact.getCustomerId())) {
            throw new ServiceException("该联系人已有门户账号，请核对现有记录", 409);
        }
        return view(user);
    }

    private void issueInvitation(SysPortalUser user) {
        SysTenant tenant = tenants.byId(tenantId());
        if (tenant == null) throw new ServiceException("当前租户不可用", 403);
        String activationToken = invitations.prepare(user);
        write(user);
        invitations.reserve(user, tenant.getTenantCode(), activationToken);
    }

    private void write(SysPortalUser user) {
        user.setUpdateBy(operator());
        user.setUpdateTime(LocalDateTime.now());
        if (users.writeState(user) != 1) throw new ServiceException("账号状态已变更，请核对最新结果后重试", 409);
        user.setVersion(Math.addExact(user.getVersion(), 1));
    }

    private PortalUserView view(SysPortalUser user) {
        PortalDeliveryView latest = users.latestDelivery(user.getTenantId(), user.getPortalUserId());
        boolean pending = "PENDING".equals(user.getStatus());
        String deliveryStatus = latest == null || pending && user.getActivateExpireTime() == null
                ? "NOT_SENT" : Objects.requireNonNullElse(latest.getSendStatus(), "UNRECOGNIZED");
        String reason = null;
        if (pending) {
            if (user.getActivateExpireTime() == null) {
                reason = Objects.requireNonNullElse(invitations.unavailableReason(user.getTenantId()), "邀请尚未发送，请明确重发邀请");
            } else if (!user.getActivateExpireTime().isAfter(LocalDateTime.now())) reason = "邀请已过期，请明确重发邀请";
            else reason = switch (deliveryStatus) {
                case "SUCCESS" -> "邮件服务已接纳，等待收件人设置密码激活";
                case "PENDING", "CLAIMED" -> "邀请邮件排队中，账号尚未激活";
                case "SENDING" -> "邀请邮件发送中，账号尚未激活";
                case "RETRYABLE" -> "邀请邮件暂未发送成功，等待安全重试";
                case "FAILED", "SKIPPED" -> "邀请邮件未发送成功，请核对邮件渠道";
                case "UNKNOWN" -> "邀请邮件结果未明，请先核对投递记录";
                default -> "邀请邮件状态待核对，账号尚未激活";
            };
        }
        return new PortalUserView(user.getPortalUserId(), user.getRefBizId(), user.getCustomerId(), user.getLoginAccount(),
                cipher.maskAddress(user.getEmail()), user.getStatus(), user.getVersion(), deliveryStatus,
                reason, user.getActivateExpireTime(), user.getLockedUntil(), user.getLastLoginTime());
    }

    private <Result> Result inTransaction(Supplier<Result> action) {
        return new TransactionTemplate(transactions).execute(status -> action.get());
    }

    private static void requireOperator(boolean manage) {
        Set<String> permissions = UserContext.getPermissions();
        if (UserContext.getUserId() == null || UserContext.getAuthToken() == null
                || !(permissions.contains("*:*:*") || permissions.contains("system:portal:user:manage")
                || !manage && permissions.contains("system:portal:user:list"))) throw new ServiceException("无权管理客户门户账号", 403);
    }

    private static Long tenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new ServiceException("缺少可信租户", 403);
        return tenantId;
    }

    private static String operator() { return "user:" + UserContext.getUserId(); }

    public record ContactChoice(Long contactId, Long customerId, String contactName, String customerName, String emailMask) { }
    public record Readiness(boolean available, String reason) { }
}
