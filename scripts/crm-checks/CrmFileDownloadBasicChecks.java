package com.cloudflow.crm.controller.inner;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalFileVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.crm.domain.CrmEmailPrivateFile;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmEmailPrivateFileMapper;
import com.cloudflow.crm.mapper.CrmEmailRecordMapper;
import com.cloudflow.crm.mapper.CrmPortalTicketMapper;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import com.cloudflow.crm.service.email.CrmEmailAccessService;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveAccess;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveFiles;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveService;
import com.cloudflow.crm.service.impl.CrmPortalTicketManagement;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Objects;
import org.springframework.http.ResponseEntity;

/** Production controller, record and file guards with controlled mapper/storage boundaries. */
public final class CrmFileDownloadBasicChecks {
    private static int checks;
    private static boolean permission = true;
    private static boolean recordAvailable = true;
    private static int reads;
    private static final CrmEmailRecord record = new CrmEmailRecord();
    private static final CrmEmailPrivateFile file = new CrmEmailPrivateFile();

    public static void main(String[] arguments) {
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("crm-file-download-basic") {
            @Override public Object getLoginIdByToken(String token) { return "session".equals(token) ? 7L : null; }
            @Override public void checkPermission(String value) { if (!permission) throw new ServiceException("denied", 403); }
        });
        UserContext.setUserId(7L); UserContext.setTenantId(3L); UserContext.setUserName("basic"); UserContext.setAuthToken("session");
        try {
            run();
            System.out.println("CRM_FILE_DOWNLOAD_BASIC: checks=" + checks + "; failed=0; controller_and_guards=true; mapper_controlled=true; content_controlled=true; http=false; database=false");
        } finally { UserContext.clear(); StpUtil.setStpLogic(previous); }
    }

    private static void run() {
        CrmEmailAccessService identities = new CrmEmailAccessService(null) {
            @Override public Actor resolve(Long userId) { return new Actor(userId, "basic", true, true, 0, List.of()); }
        };
        CrmEmailRecordMapper records = proxy(CrmEmailRecordMapper.class, (method, args) -> {
            if (method.equals("permissions")) return permission ? List.of("crm:email:list", "crm:customer:list") : List.of();
            if (method.equals("accessible")) return recordAvailable && Objects.equals(args[0], record.getTenantId())
                    && Objects.equals(args[1], record.getEmailId()) ? record : null;
            throw new AssertionError(method);
        });
        CrmEmailArchiveAccess access = new CrmEmailArchiveAccess(identities, records, null, null, null, null, null);
        CrmEmailPrivateFileMapper files = proxy(CrmEmailPrivateFileMapper.class, (method, args) -> file);
        CrmEmailArchiveFiles storage = new CrmEmailArchiveFiles(files, null) {
            @Override public ResponseEntity<byte[]> download(String type, Long id, Long fileId) {
                info(type, id, List.of(fileId)); reads++; return ResponseEntity.ok(new byte[]{1, 2, 3});
            }
        };
        CrmEmailArchiveService emails = new CrmEmailArchiveService(records, null, access, null, storage, null, null, null, null);
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setTicketId(19L); ticket.setTenantId(3L);
        PortalFileVO attachment = new PortalFileVO(); attachment.setFileId(41L);
        ICrmServiceTicketService ticketService = proxy(ICrmServiceTicketService.class, (method, args) -> {
            if (!recordAvailable) throw new ServiceException("denied", 403);
            return ticket;
        });
        CrmPortalTicketMapper portal = proxy(CrmPortalTicketMapper.class, (method, args) -> List.of(attachment));
        CrmPortalTicketManagement tickets = new CrmPortalTicketManagement(portal, null, ticketService, null, null, null);
        CrmFileDownloadController controller = new CrmFileDownloadController(access, storage, emails, tickets);
        record.setEmailId(19L); record.setTenantId(3L); record.setBizType("CUSTOMER"); record.setBizId(23L); record.setAttachmentFileIds(List.of(41L));
        file.setFileId(41L); file.setTenantId(3L); file.setDeleted(0); file.setFileType("CRM_EMAIL_ATTACHMENT");
        file.setBizType("CRM_EMAIL_ATTACHMENT"); file.setBizId("CUSTOMER:23"); file.setAccessType("PRIVATE");
        file.setStorageType("LOCAL"); file.setFileName("proof.pdf"); file.setFileSize(3L); file.setFilePath("never-read-during-authorization");
        FilePreviewRequest email = request("CRM_EMAIL_ATTACHMENT", 41L);
        equal("/api/auth/system/file/41/content", controller.authorize(email).getData().reference(), "email binding");
        equal(0, reads, "authorize metadata only");
        equal(3, controller.content(email).getBody().length, "email content from original service"); equal(1, reads, "one original storage read");
        permission = false; rejects(() -> controller.authorize(email), "email permission"); permission = true;
        recordAvailable = false; rejects(() -> controller.content(email), "consumption reauthorizes record"); recordAvailable = true;
        equal(1, reads, "denied consumption does not read bytes");
        record.setAttachmentFileIds(List.of(42L)); rejects(() -> controller.authorize(email), "file must belong to email"); record.setAttachmentFileIds(List.of(41L));
        file.setBizId("CUSTOMER:24"); rejects(() -> controller.authorize(email), "file must belong to email business"); file.setBizId("CUSTOMER:23");
        file.setTenantId(4L); rejects(() -> controller.authorize(email), "file tenant"); file.setTenantId(3L);
        file.setDeleted(1); rejects(() -> controller.authorize(email), "deleted file"); file.setDeleted(0);
        record.setTenantId(4L); rejects(() -> controller.authorize(email), "email tenant"); record.setTenantId(3L);
        FilePreviewRequest portalRequest = request("CRM_PORTAL_TICKET", 41L);
        equal("/api/auth/system/file/41/content", controller.authorize(portalRequest).getData().reference(), "portal exact binding");
        rejects(() -> controller.authorize(request("CRM_PORTAL_TICKET", 42L)), "portal unrelated file");
        permission = false; rejects(() -> controller.authorize(portalRequest), "portal permission"); permission = true;
        recordAvailable = false; rejects(() -> controller.authorize(portalRequest), "portal record scope"); recordAvailable = true;
        rejects(() -> controller.content(portalRequest), "portal content stays in auth original storage");
    }

    private static FilePreviewRequest request(String type, Long fileId) { return new FilePreviewRequest(type, "19", fileId, null, null, null, null, null, null, null, null); }
    private interface Answer { Object invoke(String method, Object[] arguments); }
    private static <T> T proxy(Class<T> type, Answer answer) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (proxy, method, args) -> answer.invoke(method.getName(), args)));
    }
    private static void equal(Object expected, Object actual, String label) { checks++; if (!Objects.equals(expected, actual)) throw new AssertionError(label); }
    private static void rejects(Runnable operation, String label) {
        try { operation.run(); } catch (IllegalArgumentException | ServiceException failure) { checks++; return; }
        throw new AssertionError(label + " accepted");
    }
}
