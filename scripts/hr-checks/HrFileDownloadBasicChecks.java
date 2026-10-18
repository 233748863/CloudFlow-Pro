package com.cloudflow.hr.service;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.controller.HrFileDownloadController;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrTaxDeduction;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import com.cloudflow.hr.mapper.HrTaxDeductionMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.service.impl.HrCertificateServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;

/** Production guards/controller with controlled mapper/storage; scoped to the new HR download paths. */
public final class HrFileDownloadBasicChecks {
    private static int checks;
    private static String deniedPermission;
    private static String lastPermission;
    public static void main(String[] args) throws Exception {
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("hr-file-download-basic") {
            @Override public Object getLoginIdByToken(String token) { return "session".equals(token) ? 7L : null; }
            @Override public void checkPermission(String permission) {
                lastPermission = permission;
                if (permission.equals(deniedPermission)) throw new ServiceException("denied", 403);
            }
        });
        try {
            UserContext.setUserId(7L); UserContext.setTenantId(71L); UserContext.setUserName("owner");
            UserContext.setAuthToken("session"); TenantContext.setTenantId(71L);
            run();
            System.out.println("HR_FILE_DOWNLOAD_BASIC: checks=" + checks + "; failed=0; production_controller_services=true; mapper_storage=controlled; database=false; http=false");
        } finally { TenantContext.clear(); UserContext.clear(); StpUtil.setStpLogic(previous); }
    }
    private static void run() throws Exception {
        Storage storage = new Storage();
        HrEssSupport owner = new HrEssSupport(null) { @Override public Long currentEmployeeId() { return 91L; } };
        HrRuleSupport scope = new HrRuleSupport(null, null, null, null, new ObjectMapper(), null) {
            @Override public void assertEmployeeScope(Long employeeId) {
                if (!Long.valueOf(91L).equals(employeeId)) throw new HrBusinessException("FORBIDDEN", "scope denied");
            }
        };
        HrTaxDeduction tax = new HrTaxDeduction(); tax.setTenantId(71L); tax.setDeleted(0);
        tax.setEmployeeId(91L); tax.setProofFileUrl("hr-file:HR_TAX_PROOF:41");
        HrTrainingCertificate training = new HrTrainingCertificate(); training.setTenantId(71L); training.setDeleted(0);
        training.setEmployeeId(91L); training.setPdfFileId(41L); training.setCertNo("T001");
        HrCertificateRequest certificate = new HrCertificateRequest(); certificate.setTenantId(71L); certificate.setDeleted(0);
        certificate.setEmployeeId(91L); certificate.setPdfFileId(41L); certificate.setStatus("ISSUED"); certificate.setRequestNo("C001");
        HrPayrollConfigurationService payroll = create(HrPayrollConfigurationService.class, Map.of(
                HrTaxDeductionMapper.class, proxy(HrTaxDeductionMapper.class, (p, m, a) -> tax), HrRuleSupport.class, scope));
        HrRuleProofService proofs = new HrRuleProofService(storage, null, new HrRuleSupport(null, null, null, null, null, null) {
            @Override public void audit(String domain, Long id, String operation, Object detail) { }
        });
        HrDocumentDownloadService documents = new HrDocumentDownloadService(payroll, proofs,
                proxy(HrTrainingCertificateMapper.class, (p, m, a) -> training), owner, storage);
        HrCertificateServiceImpl certificates = create(HrCertificateServiceImpl.class, Map.of(
                HrCertificateRequestMapper.class, proxy(HrCertificateRequestMapper.class, (p, m, a) -> certificate),
                HrEssSupport.class, owner, HrFileStorage.class, storage));
        HrAttendancePhotoService photos = new HrAttendancePhotoService(storage, proxy(HrFileStorageMapper.class, (p, m, a) ->
                Long.valueOf(71L).equals(a[0]) && "owner".equals(a[1]) && Long.valueOf(41L).equals(a[2]) ? 1 : 0), null);
        Map<Class<?>, Object> dependencies = new HashMap<>();
        dependencies.put(HrAttendancePhotoService.class, photos); dependencies.put(HrEssSupport.class, owner);
        dependencies.put(HrFileStorage.class, storage); dependencies.put(HrDocumentDownloadService.class, documents);
        dependencies.put(IHrCertificateService.class, certificates);
        HrFileDownloadController controller = create(HrFileDownloadController.class, dependencies);
        FilePreviewRequest photo = request("HR_ATTENDANCE_PHOTO", "41", 41L);
        check(controller.authorize(photo).isSuccess() && storage.reads == 0, "photo issue reads metadata only");
        check("hr:attendance:mine".equals(lastPermission), "photo permission");
        check(controller.content(photo).getBody().length == 3 && storage.reads == 1, "content dispatched to HR storage");
        rejects(() -> controller.authorize(request("HR_ATTENDANCE_PHOTO", "42", 41L)), "photo business binding");
        TenantContext.setTenantId(72L); rejects(() -> controller.authorize(photo), "photo other tenant"); TenantContext.setTenantId(71L);
        UserContext.setUserName("other"); rejects(() -> controller.authorize(photo), "photo other owner"); UserContext.setUserName("owner");
        deniedPermission = "hr:attendance:mine"; rejects(() -> controller.authorize(photo), "permission revoked"); deniedPermission = null;
        UserContext.setAuthToken("invalid"); rejects(() -> controller.authorize(photo), "invalid internal session"); UserContext.setAuthToken("session");
        rejects(() -> controller.authorize(request("PUBLIC", null, 41L)), "other business denied");
        rejects(() -> controller.authorize(request("HR_ATTENDANCE_PHOTO", "41", null)), "missing file id");
        FilePreviewRequest mine = request("HR_TAX_PROOF_MINE", "1", 41L);
        int before = storage.reads; controller.authorize(mine);
        check(storage.reads == before && "hr:payroll:mine".equals(lastPermission), "tax own metadata/permission");
        controller.authorize(request("HR_TAX_PROOF_MANAGE", "1", 41L));
        check("hr:payroll:verify".equals(lastPermission), "tax manage permission");
        rejects(() -> controller.authorize(request("HR_TAX_PROOF_MINE", "1", 42L)), "tax exact attachment");
        tax.setTenantId(72L); rejects(() -> controller.authorize(mine), "tax other tenant"); tax.setTenantId(71L);
        tax.setDeleted(1); rejects(() -> controller.authorize(mine), "tax deleted"); tax.setDeleted(0);
        tax.setEmployeeId(92L); rejects(() -> controller.authorize(mine), "tax employee scope"); tax.setEmployeeId(91L);
        check(controller.content(mine).getBody().length == 3, "tax business content");
        FilePreviewRequest cert = request("HR_TRAINING_CERTIFICATE", "1", 41L);
        before = storage.reads; controller.authorize(cert);
        check(storage.reads == before && "hr:training:cert:list".equals(lastPermission), "training metadata/permission");
        rejects(() -> controller.authorize(request("HR_TRAINING_CERTIFICATE", "1", 42L)), "training changed file");
        training.setTenantId(72L); rejects(() -> controller.authorize(cert), "training tenant"); training.setTenantId(71L);
        training.setEmployeeId(92L); rejects(() -> controller.authorize(cert), "training owner"); training.setEmployeeId(91L);
        check(controller.content(cert).getHeaders().getContentType().toString().equals("application/pdf"), "training PDF response");
        FilePreviewRequest employee = request("HR_EMPLOYEE_CERTIFICATE", "1", 41L);
        before = storage.reads; controller.authorize(employee);
        check(storage.reads == before && "hr:ess:cert:view".equals(lastPermission), "employee metadata/permission");
        rejects(() -> controller.authorize(request("HR_EMPLOYEE_CERTIFICATE", "1", 42L)), "employee changed file");
        certificate.setTenantId(72L); rejects(() -> controller.authorize(employee), "employee tenant"); certificate.setTenantId(71L);
        certificate.setDeleted(1); rejects(() -> certificates.cancel(1L), "shared load guard cancel deleted"); certificate.setDeleted(0);
        certificate.setEmployeeId(92L); rejects(() -> controller.authorize(employee), "employee owner"); certificate.setEmployeeId(91L);
        certificate.setStatus("PENDING"); rejects(() -> controller.authorize(employee), "employee not issued"); certificate.setStatus("ISSUED");
        check(controller.content(employee).getBody().length == 3, "employee content");
    }
    private static FilePreviewRequest request(String type, String bizId, Long fileId) {
        return new FilePreviewRequest(type, bizId, fileId, null, null, null, null, null, null, null, null);
    }
    private static <T> T create(Class<T> type, Map<Class<?>, Object> dependencies) throws Exception {
        Constructor<?> constructor = type.getConstructors()[0]; Class<?>[] types = constructor.getParameterTypes();
        Object[] args = new Object[types.length]; for (int i = 0; i < types.length; i++) args[i] = dependencies.get(types[i]);
        return type.cast(constructor.newInstance(args));
    }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
    private static void check(boolean valid, String name) { if (!valid) throw new AssertionError(name); checks++; }
    private static void rejects(Runnable run, String name) {
        try { run.run(); } catch (ServiceException | HrBusinessException denied) { checks++; return; }
        throw new AssertionError(name + " accepted");
    }
    private static final class Storage extends HrFileStorage {
        int reads; Storage() { super(null, null); }
        @Override public String fileName(Long id, String purpose) { return purpose.equals("HR_ATTENDANCE_PHOTO") ? "photo.png" : "document.pdf"; }
        @Override public byte[] loadPrivate(Long id, String purpose) { reads++; return new byte[]{1, 2, 3}; }
    }
}
