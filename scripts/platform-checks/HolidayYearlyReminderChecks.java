package com.cloudflow.auth.service;

import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.LongStream;

public final class HolidayYearlyReminderChecks {
    private static int checks;
    private record Sent(Long tenantId, MessageSendRequest request) { }

    public static void main(String[] args) {
        UserContext.setTenantId(9001L);
        TenantContext.setTenantId(9002L);
        try {
            paginationAndMessages();
            failureIsolation();
            emptyTenants();
            check(Objects.equals(UserContext.getTenantId(), 9001L)
                    && Objects.equals(TenantContext.getTenantId(), 9002L), "original contexts restored");
            System.out.println("HOLIDAY_YEARLY_CHECKS: checks=" + checks
                    + "; failed=0; real_service=true; controlled_recipients_and_sender=true; actual_delivery_verified=false");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static TenantIterator tenants(List<Long> ids) {
        return new TenantIterator(null) {
            @Override public List<Long> listActiveTenantIds() { return ids; }
        };
    }

    private static void paginationAndMessages() {
        List<Long> cursors = new ArrayList<>();
        List<Sent> sent = new ArrayList<>();
        SysUserMapper mapper = (SysUserMapper) Proxy.newProxyInstance(SysUserMapper.class.getClassLoader(),
                new Class<?>[]{SysUserMapper.class}, (proxy, method, arguments) -> {
                    if (!method.getName().equals("selectHolidayReminderUserIds")) throw new AssertionError("Unexpected query");
                    Long tenantId = (Long) arguments[0];
                    long cursor = (Long) arguments[1];
                    int limit = (Integer) arguments[2];
                    if (!Objects.equals(tenantId, UserContext.getTenantId())
                            || !Objects.equals(tenantId, TenantContext.getTenantId()) || limit != 500) {
                        throw new AssertionError("Wrong tenant or bounded page size");
                    }
                    cursors.add(cursor);
                    return LongStream.rangeClosed(1, 501).filter(id -> id > cursor).limit(limit).boxed().toList();
                });
        HolidayYearlyReminderService service = new HolidayYearlyReminderService(tenants(List.of(10L)), mapper,
                request -> sent.add(new Sent(UserContext.getTenantId(), request)));
        JobResult first = service.remind();
        check(first.getAffectedRows() == 501 && "SUCCESS".equals(first.getExecuteStatus()), "all 501 recipients submitted");
        check(cursors.equals(List.of(0L, 500L, 501L)), "keyset pagination finishes beyond first page");
        check(sent.stream().map(item -> item.request().safeReceivers().get(0).getReceiverId()).distinct().count() == 501,
                "no recipient omitted or repeated across pages");
        int year = LocalDate.now().getYear() + 1;
        check(sent.stream().allMatch(item -> item.tenantId() == 10L && item.request().safeReceivers().size() == 1
                && "USER".equals(item.request().safeReceivers().get(0).getReceiverType())), "tenant scoped individual recipients");
        check(sent.stream().allMatch(item -> item.request().safeChannelTypes().equals(List.of(MessageChannelType.INTERNAL))
                && item.request().getCategory() == MessageCategory.SYSTEM && !Boolean.TRUE.equals(item.request().getForceSend())),
                "normal internal delivery preserves subscription rules");
        check(sent.stream().allMatch(item -> "SYS_HOLIDAY_YEARLY_REMIND".equals(item.request().getBizType())
                && String.valueOf(year).equals(item.request().getBizId()) && "/holiday".equals(item.request().getLinkUrl())
                && item.request().getTitle().contains(String.valueOf(year)) && item.request().getContent().contains(String.valueOf(year))),
                "next year and calendar action appear in real request");
        List<String> identities = sent.stream().map(item -> item.request().getDeduplicationKey()).toList();
        check(identities.stream().distinct().count() == 501, "individual stable message identities");
        service.remind();
        check(sent.subList(501, 1002).stream().map(item -> item.request().getDeduplicationKey()).toList().equals(identities),
                "repeat scan reuses same annual identities");
    }

    private static void failureIsolation() {
        List<Long> completedTenants = new ArrayList<>();
        AtomicBoolean reject = new AtomicBoolean(true);
        SysUserMapper mapper = (SysUserMapper) Proxy.newProxyInstance(SysUserMapper.class.getClassLoader(),
                new Class<?>[]{SysUserMapper.class}, (proxy, method, arguments) -> {
                    if (!method.getName().equals("selectHolidayReminderUserIds")) throw new AssertionError("Unexpected query");
                    return (Long) arguments[1] == 0 ? List.of(5L) : List.of();
                });
        MessageSender sender = request -> {
            if (Objects.equals(UserContext.getTenantId(), 10L) && reject.get()) throw new IllegalStateException("submission failed");
            completedTenants.add(UserContext.getTenantId());
        };
        HolidayYearlyReminderService service = new HolidayYearlyReminderService(tenants(List.of(10L, 20L)), mapper, sender);
        IllegalStateException observed = null;
        try { service.remind(); } catch (IllegalStateException exception) { observed = exception; }
        check(observed != null && observed.getSuppressed().length == 1, "partial failure is reported with its cause");
        check(completedTenants.equals(List.of(20L)), "later tenant still receives submission after earlier failure");
        check(Objects.equals(UserContext.getTenantId(), 9001L) && Objects.equals(TenantContext.getTenantId(), 9002L),
                "failed tenant restores both contexts");
        reject.set(false);
        JobResult recovered = service.remind();
        check(recovered.getAffectedRows() == 2 && "SUCCESS".equals(recovered.getExecuteStatus()), "new scan recovers after submission failure");
    }

    private static void emptyTenants() {
        HolidayYearlyReminderService service = new HolidayYearlyReminderService(tenants(List.of()), null,
                request -> { throw new AssertionError("No tenant must produce no submission"); });
        JobResult result = service.remind();
        check(result.getAffectedRows() == 0 && "SUCCESS".equals(result.getExecuteStatus()), "empty tenant set has accurate zero result");
    }

    private static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }
}
