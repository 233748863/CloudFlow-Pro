import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.*;
import com.cloudflow.oa.service.impl.*;
import com.cloudflow.hr.controller.HrFilePreviewController;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceAppealVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrAttendanceAppealService;
import com.cloudflow.hr.service.HrGrievanceAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;

/** Executes production business download guards with controlled persistence, without services or full regression. */
public final class BusinessDownloadBasicChecks {
    private static int checks;
    private static String deniedPermission;
    private static boolean meetingPermission = true;
    private static boolean disputeAllowed = true;
    private static final String FILE = "/api/auth/system/file/41/content";
    public static void main(String[] args) throws Exception {
        StpLogic original = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("business-download-basic") {
            @Override public Object getLoginIdByToken(String token) { return "session".equals(token) ? 7L : null; }
            @Override public void checkPermission(String permission) { if (permission.equals(deniedPermission)) throw new ServiceException("denied", 403); }
            @Override public boolean hasPermission(String permission) { return meetingPermission && permission.startsWith("oa:meeting"); }
        });
        try {
            UserContext.setUserId(7L); UserContext.setTenantId(71L); UserContext.setUserName("owner");
            UserContext.setAuthToken("session"); TenantContext.setTenantId(71L);
            if (args.length == 1 && "remaining".equals(args[0])) { oaRemaining(); hrRemaining(); }
            else { oa(); hr(); }
            System.out.println("BUSINESS_DOWNLOAD_BASIC: checks=" + checks + "; failed=0; production_guards=true; persistence=controlled; database=false; http=false");
        } finally { TenantContext.clear(); UserContext.clear(); StpUtil.setStpLogic(original); }
    }
    private static void oa() throws Exception {
        Map<Class<?>, Object> dependencies = new HashMap<>();
        OaLicenseBorrow borrow = active(new OaLicenseBorrow());
        OaSealApplication application = active(new OaSealApplication());
        OaLicenseHandoverLog licenseLog = new OaLicenseHandoverLog();
        licenseLog.setId(9L); licenseLog.setBorrowId(1L); licenseLog.setTenantId(71L); licenseLog.setAttachmentUrl(FILE);
        OaSealHandoverLog sealLog = new OaSealHandoverLog();
        sealLog.setId(9L); sealLog.setApplicationId(1L); sealLog.setTenantId(71L); sealLog.setAttachmentUrl(FILE);
        dependencies.put(IOaLicenseBorrowService.class, proxy(IOaLicenseBorrowService.class, (p,m,a) -> m.getName().equals("listHandoverLogs") ? List.of(licenseLog) : borrow));
        dependencies.put(IOaSealApplicationService.class, proxy(IOaSealApplicationService.class, (p,m,a) -> m.getName().equals("listHandoverLogs") ? List.of(sealLog) : application));
        OaSeal seal = active(new OaSeal());
        BusinessTrip trip = active(new BusinessTrip());
        OaLicenseRenewal licenseRenewal = active(new OaLicenseRenewal());
        OaSealRenewal sealRenewal = active(new OaSealRenewal());
        BizPaymentRequest payment = active(new BizPaymentRequest());
        dependencies.put(IOaSealService.class, proxy(IOaSealService.class, (p,m,a)->seal));
        dependencies.put(IBusinessTripService.class, proxy(IBusinessTripService.class, (p,m,a)->trip));
        dependencies.put(IOaLicenseRenewalService.class, proxy(IOaLicenseRenewalService.class, (p,m,a)->licenseRenewal));
        dependencies.put(IOaSealRenewalService.class, proxy(IOaSealRenewalService.class, (p,m,a)->sealRenewal));
        dependencies.put(IPaymentRequestService.class, proxy(IPaymentRequestService.class, (p,m,a)->payment));
        OaPurchaseRfq rfq = active(new OaPurchaseRfq()); rfq.setRfqId(1L); rfq.setOwnerId(7L); rfq.setQuoteDeadline(LocalDate.now().plusDays(1));
        OaSupplierQuotation quotation = active(new OaSupplierQuotation()); quotation.setRfqId(1L); quotation.setEntryBy(7L);
        OaRfqAccessService access = new OaRfqAccessService(null, null, null);
        OaPurchaseRfqMapper rfqs = proxy(OaPurchaseRfqMapper.class, (p,m,a)->rfq);
        dependencies.put(OaRfqService.class, create(OaRfqService.class, Map.of(OaPurchaseRfqMapper.class, rfqs, OaRfqAccessService.class, access)));
        dependencies.put(OaQuotationService.class, create(OaQuotationService.class, Map.of(OaPurchaseRfqMapper.class, rfqs,
                OaSupplierQuotationMapper.class, proxy(OaSupplierQuotationMapper.class, (p,m,a)->quotation),
                OaSupplierQuotationItemMapper.class, proxy(OaSupplierQuotationItemMapper.class, (p,m,a)->List.of()), OaRfqAccessService.class, access)));
        MeetingRoom room = active(new MeetingRoom()); room.setPhotoFileId(41L);
        dependencies.put(OaMeetingRoomPhotoService.class, new OaMeetingRoomPhotoService(proxy(MeetingRoomMapper.class, (p,m,a)->room),
                proxy(OaMeetingMapper.class, (p,m,a)->Long.valueOf(71L).equals(a[0]) ? 1 : 0), null));
        OaFilePreviewService service = create(OaFilePreviewService.class, dependencies);
        List<Case> cases = List.of(new Case("OA_SEAL", "oa:seal:list", seal), new Case("OA_BUSINESS_TRIP", "oa:trip:list", trip),
                new Case("OA_LICENSE_RENEWAL", "oa:license:list", licenseRenewal), new Case("OA_SEAL_RENEWAL", "oa:seal:list", sealRenewal),
                new Case("OA_LICENSE_BORROW", "oa:license:list", borrow), new Case("OA_SEAL_APPLICATION", "oa:seal:list", application),
                new Case("OA_PAYMENT_REQUEST", "oa:payment:list", payment));
        for (Case item : cases) {
            FilePreviewRequest request = request(item.type(), null, 41L);
            check(FILE.equals(service.authorizeDownload(request).reference()), item.type() + " normal");
            deniedPermission = item.permission(); rejects(()->service.authorizeDownload(request), "permission revoked"); deniedPermission = null;
            BeanWrapper bean = new BeanWrapperImpl(item.entity());
            bean.setPropertyValue("tenantId", 72L); rejects(()->service.authorizeDownload(request), "tenant"); bean.setPropertyValue("tenantId", 71L);
            bean.setPropertyValue("deleted", 1); rejects(()->service.authorizeDownload(request), "deleted"); bean.setPropertyValue("deleted", 0);
            rejects(()->service.authorizeDownload(request(item.type(), null, 42L)), "attachment replaced");
        }
        for (String type : List.of("OA_LICENSE_HANDOVER", "OA_SEAL_HANDOVER")) {
            Object log = type.equals("OA_LICENSE_HANDOVER") ? licenseLog : sealLog;
            String parent = type.equals("OA_LICENSE_HANDOVER") ? "borrowId" : "applicationId";
            FilePreviewRequest request = request(type, 9L, 41L);
            check(FILE.equals(service.authorizeDownload(request).reference()), "handover normal");
            rejects(()->service.authorizeDownload(request(type, 8L, 41L)), "other child");
            BeanWrapper bean = new BeanWrapperImpl(log); bean.setPropertyValue(parent, 2L); rejects(()->service.authorizeDownload(request), "other parent"); bean.setPropertyValue(parent, 1L);
            bean.setPropertyValue("tenantId", 72L); rejects(()->service.authorizeDownload(request), "child tenant"); bean.setPropertyValue("tenantId", 71L);
            rejects(()->service.authorizeDownload(request(type, 9L, 42L)), "child attachment");
        }
        check(FILE.equals(service.authorizeDownload(request("OA_RFQ_INVITATION", null, 41L)).reference()), "rfq normal");
        rfq.setOwnerId(8L); rejects(()->service.authorizeDownload(request("OA_RFQ_INVITATION", null, 41L)), "rfq owner"); rfq.setOwnerId(7L);
        check(FILE.equals(service.authorizeDownload(request("OA_RFQ_QUOTATION", null, 41L)).reference()), "quote normal");
        quotation.setEntryBy(8L); rejects(()->service.authorizeDownload(request("OA_RFQ_QUOTATION", null, 41L)), "sealed quote"); quotation.setEntryBy(7L);
        rfq.setTenantId(72L); rejects(()->service.authorizeDownload(request("OA_RFQ_QUOTATION", null, 41L)), "quote parent tenant"); rfq.setTenantId(71L);
        check(FILE.equals(service.authorizeDownload(request("OA_MEETING_ROOM", null, 41L)).reference()), "meeting normal");
        meetingPermission = false; rejects(()->service.authorizeDownload(request("OA_MEETING_ROOM", null, 41L)), "meeting permission"); meetingPermission = true;
        room.setTenantId(72L); rejects(()->service.authorizeDownload(request("OA_MEETING_ROOM", null, 41L)), "meeting tenant"); room.setTenantId(71L);
        rejects(()->service.authorizeDownload(request("OA_MEETING_ROOM", null, 42L)), "meeting attachment");
        UserContext.setAuthToken("invalid"); rejects(()->service.authorizeDownload(request("OA_SEAL", null, 41L)), "invalid session"); UserContext.setAuthToken("session");
        PaymentRequestServiceImpl paymentService = new PaymentRequestServiceImpl();
        Field mapper = field(paymentService.getClass(), "baseMapper"); mapper.setAccessible(true);
        mapper.set(paymentService, proxy(BizPaymentRequestMapper.class, (p,m,a)->{
            check(m.getName().equals("selectByIdWithDataScope") && Long.valueOf(71L).equals(a[1]) && a[2] instanceof DataScope scope && !scope.isSkip(), "payment scoped lookup");
            return Long.valueOf(1L).equals(a[0]) ? payment : null;
        }));
        check(paymentService.getAccessiblePayment(1L) == payment, "payment service normal");
        rejects(()->paymentService.getAccessiblePayment(2L), "payment scope inaccessible");
        payment.setTenantId(72L); rejects(()->paymentService.getAccessiblePayment(1L), "payment service tenant"); payment.setTenantId(71L);
        payment.setDeleted(1); rejects(()->paymentService.getAccessiblePayment(1L), "payment service deleted"); payment.setDeleted(0);
    }
    private static void hr() {
        Map<String,Object> child = new HashMap<>(Map.of("employeeId", 91L, "tenantId", 71L, "attachmentUrls", List.of(FILE), "version", 1));
        Map<String,Object> employee = new HashMap<>(Map.of("id", 91L));
        HrTypedCrudService records = new HrTypedCrudService(null,null,null,null,null,null,null,null,null,null,null) {
            @Override public <T> Map<String,Object> get(Class<T> type, Long id) { return type == HrEmployee.class ? employee : child; }
        };
        HrAttendanceAppealVO appeal = new HrAttendanceAppealVO(); appeal.setEvidenceUrls(new ObjectMapper().createArrayNode().add(FILE));
        HrFilePreviewController controller = new HrFilePreviewController(records, proxy(IHrAttendanceAppealService.class, (p,m,a)->{
            if (!Long.valueOf(1L).equals(a[0])) throw new HrBusinessException("FORBIDDEN", "scope"); return appeal;
        }), null);
        for (String type : List.of("HR_EMPLOYEE_CONTRACT", "HR_EMPLOYEE_DOCUMENT")) {
            check(FILE.equals(controller.authorizeDownload(request(type,null,41L)).getData().reference()), "employee attachment normal");
            deniedPermission="hr:employees:view"; rejects(()->controller.authorizeDownload(request(type,null,41L)), "employee permission"); deniedPermission=null;
            child.put("tenantId",72L); rejects(()->controller.authorizeDownload(request(type,null,41L)), "employee tenant"); child.put("tenantId",71L);
            employee.clear(); rejects(()->controller.authorizeDownload(request(type,null,41L)), "employee scope"); employee.put("id",91L);
            rejects(()->controller.authorizeDownload(request(type,null,42L)), "employee attachment replaced");
        }
        check(FILE.equals(controller.authorizeDownload(request("HR_ATTENDANCE_APPEAL",null,41L)).getData().reference()), "appeal normal");
        deniedPermission="hr:attendance:list"; rejects(()->controller.authorizeDownload(request("HR_ATTENDANCE_APPEAL",null,41L)), "appeal permission"); deniedPermission=null;
        rejects(()->controller.authorizeDownload(new FilePreviewRequest("HR_ATTENDANCE_APPEAL","2",41L,null,null,null,null,null,null,null,null)), "appeal delegates scope");
        rejects(()->controller.authorizeDownload(request("HR_ATTENDANCE_APPEAL",null,42L)), "appeal attachment");
    }
    private static void oaRemaining() throws Exception {
        BizPurchaseRequest purchase = active(new BizPurchaseRequest());
        OaContract contract = active(new OaContract());
        OaContractMilestone milestone = active(new OaContractMilestone());
        milestone.setId(9L); milestone.setContractId(1L);
        PurchaseRequestServiceImpl purchases = create(PurchaseRequestServiceImpl.class, Map.of());
        Field mapper = field(purchases.getClass(), "baseMapper"); mapper.setAccessible(true);
        mapper.set(purchases, proxy(BizPurchaseRequestMapper.class, (p,m,a)->{
            check(m.getName().equals("selectPrintableWithItems") && Long.valueOf(71L).equals(a[1])
                    && a[2] instanceof DataScope scope && !scope.isSkip(), "purchase scoped lookup");
            return Long.valueOf(1L).equals(a[0]) ? purchase : null;
        }));
        OaFilePreviewService service = create(OaFilePreviewService.class, Map.of(
                IPurchaseRequestService.class, purchases,
                IOaContractService.class, proxy(IOaContractService.class, (p,m,a)->contract),
                IOaContractMilestoneService.class, proxy(IOaContractMilestoneService.class, (p,m,a)->List.of(milestone))));
        FilePreviewRequest purchaseRequest = request("OA_PURCHASE_REQUEST", null, 41L);
        check(FILE.equals(service.authorizeDownload(purchaseRequest).reference()), "purchase normal");
        deniedPermission = "oa:purchase:list"; rejects(()->service.authorizeDownload(purchaseRequest), "purchase permission"); deniedPermission=null;
        rejects(()->purchases.getAccessibleRequestWithItems(2L), "purchase inaccessible");
        purchase.setTenantId(72L); rejects(()->service.authorizeDownload(purchaseRequest), "purchase tenant"); purchase.setTenantId(71L);
        purchase.setDeleted(1); rejects(()->service.authorizeDownload(purchaseRequest), "purchase deleted"); purchase.setDeleted(0);
        rejects(()->service.authorizeDownload(request("OA_PURCHASE_REQUEST", null, 42L)), "purchase attachment");
        FilePreviewRequest childRequest = request("OA_CONTRACT_MILESTONE", 9L, 41L);
        check(FILE.equals(service.authorizeDownload(childRequest).reference()), "milestone normal");
        deniedPermission="oa:contract:list"; rejects(()->service.authorizeDownload(childRequest), "milestone permission"); deniedPermission=null;
        contract.setTenantId(72L); rejects(()->service.authorizeDownload(childRequest), "contract tenant"); contract.setTenantId(71L);
        contract.setDeleted(1); rejects(()->service.authorizeDownload(childRequest), "contract deleted"); contract.setDeleted(0);
        milestone.setContractId(2L); rejects(()->service.authorizeDownload(childRequest), "milestone parent"); milestone.setContractId(1L);
        milestone.setTenantId(72L); rejects(()->service.authorizeDownload(childRequest), "milestone tenant"); milestone.setTenantId(71L);
        milestone.setDeleted(1); rejects(()->service.authorizeDownload(childRequest), "milestone deleted"); milestone.setDeleted(0);
        rejects(()->service.authorizeDownload(request("OA_CONTRACT_MILESTONE", 8L, 41L)), "milestone child");
        rejects(()->service.authorizeDownload(request("OA_CONTRACT_MILESTONE", 9L, 42L)), "milestone attachment");
        rejects(()->request("OA_CONTRACT_MILESTONE", null, 41L).validated(), "milestone child required");
    }
    private static void hrRemaining() {
        Map<String,Object> child = new HashMap<>(Map.of("id",9L,"tenantId",71L,"disputeId",1L,"deleted",0,"agreementUrl",FILE,"awardDocUrl",FILE));
        Map<String,Object> parent = new HashMap<>(Map.of("id",1L,"tenantId",71L,"deleted",0));
        HrTypedCrudService records = new HrTypedCrudService(null,null,null,null,null,null,null,null,null,null,null) {
            @Override public <T> Map<String,Object> get(Class<T> type,Long id) {
                if(type == HrLaborDispute.class) return parent;
                return Long.valueOf(9L).equals(id) ? child : Map.of();
            }
        };
        HrGrievanceAccessService access = new HrGrievanceAccessService(null,null,null,null) {
            @Override public void assertDisputeAccess(Long disputeId) {
                if(!disputeAllowed) throw new HrBusinessException("FORBIDDEN","scope");
            }
        };
        HrFilePreviewController controller = new HrFilePreviewController(records,null,access);
        for(String type : List.of("HR_DISPUTE_MEDIATION","HR_DISPUTE_ARBITRATION")) {
            FilePreviewRequest request = request(type,9L,41L);
            check(FILE.equals(controller.authorizeDownload(request).getData().reference()), type + " normal");
            deniedPermission=type.endsWith("MEDIATION") ? "hr:dispute:mediation" : "hr:dispute:arbitration";
            rejects(()->controller.authorizeDownload(request), "dispute permission"); deniedPermission=null;
            disputeAllowed=false; rejects(()->controller.authorizeDownload(request), "dispute scope"); disputeAllowed=true;
            child.put("disputeId",2L); rejects(()->controller.authorizeDownload(request), "dispute parent"); child.put("disputeId",1L);
            child.put("tenantId",72L); rejects(()->controller.authorizeDownload(request), "dispute child tenant"); child.put("tenantId",71L);
            child.put("deleted",1); rejects(()->controller.authorizeDownload(request), "dispute child deleted"); child.put("deleted",0);
            parent.put("tenantId",72L); rejects(()->controller.authorizeDownload(request), "dispute tenant"); parent.put("tenantId",71L);
            parent.put("deleted",1); rejects(()->controller.authorizeDownload(request), "dispute deleted"); parent.put("deleted",0);
            rejects(()->controller.authorizeDownload(request(type,8L,41L)), "dispute other child");
            rejects(()->controller.authorizeDownload(request(type,9L,42L)), "dispute attachment replaced");
            rejects(()->request(type,null,41L).validated(), "dispute child required");
        }
    }
    private static <T> T active(T value) {
        BeanWrapper bean = new BeanWrapperImpl(value); bean.setPropertyValue("tenantId",71L); bean.setPropertyValue("deleted",0);
        if(bean.isWritableProperty("version")) bean.setPropertyValue("version",1);
        if(bean.isWritableProperty("attachmentUrl")) bean.setPropertyValue("attachmentUrl",FILE); return value;
    }
    private static FilePreviewRequest request(String type, Long child, Long file) { return new FilePreviewRequest(type,"1",file,null,null,child,null,null,null,null,null); }
    private static <T> T create(Class<T> type, Map<Class<?>,Object> dependencies) throws Exception {
        Constructor<?> constructor=type.getConstructors()[0]; Class<?>[] parameters=constructor.getParameterTypes(); Object[] args=new Object[parameters.length];
        for(int i=0;i<parameters.length;i++) args[i]=dependencies.get(parameters[i]); return type.cast(constructor.newInstance(args));
    }
    private static Field field(Class<?> type,String name) throws NoSuchFieldException {
        for(Class<?> current=type;current!=null;current=current.getSuperclass()) { try{return current.getDeclaredField(name);}catch(NoSuchFieldException absent){} } throw new NoSuchFieldException(name);
    }
    private static <T> T proxy(Class<T> type,InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler)); }
    private static void check(boolean valid,String name) { if(!valid)throw new AssertionError(name);checks++; }
    private static void rejects(Runnable action,String name) { try{action.run();}catch(ServiceException|HrBusinessException|IllegalArgumentException denied){checks++;return;} throw new AssertionError(name+" accepted"); }
    private record Case(String type,String permission,Object entity) {}
}
