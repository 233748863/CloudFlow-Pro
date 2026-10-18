package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrAttendanceCheckinPayload;
import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAttendanceCheckinMapper;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import com.cloudflow.hr.mapper.HrShiftMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import javax.imageio.ImageIO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

/** Real service methods with in-memory mapper/storage/transaction substitutes; no database, HTTP or browser claim. */
public final class HrMobileAttendanceBasicChecks {
    private static int checks;
    public static void main(String[] args) throws Exception {
        try {
            TenantContext.setTenantId(71L); UserContext.setTenantId(71L); UserContext.setUserName("owner");
            Support support = new Support();
            Storage storage = new Storage();
            HrFileStorageMapper files = proxy(HrFileStorageMapper.class, (target, method, values) -> {
                if (method.getName().equals("countOwnedProof")) return Long.valueOf(71).equals(values[0])
                        && "owner".equals(values[1]) && Long.valueOf(12).equals(values[2])
                        && HrAttendancePhotoService.PURPOSE.equals(values[3]) ? 1 : 0;
                throw new AssertionError(method.getName());
            });
            HrAttendancePhotoService photos = new HrAttendancePhotoService(storage, files, support);
            photos.assertOwned(12L); check(true, "owner/current tenant/purpose accepted");
            UserContext.setUserName("other"); reject("ATTENDANCE_PHOTO_FORBIDDEN", () -> photos.assertOwned(12L));
            UserContext.setUserName("owner"); TenantContext.setTenantId(72L);
            reject("ATTENDANCE_PHOTO_FORBIDDEN", () -> photos.assertOwned(12L));
            TenantContext.setTenantId(71L); reject("ATTENDANCE_PHOTO_FORBIDDEN", () -> photos.assertOwned(13L));
            ResponseEntity<byte[]> response = photos.download(12L);
            check("no-store".equals(response.getHeaders().getFirst("Cache-Control")), "private download not cached");
            check("nosniff".equals(response.getHeaders().getFirst("X-Content-Type-Options")), "download nosniff");
            check(response.getHeaders().getContentType().toString().equals("image/png") && response.getBody().length == 3, "private storage read");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", output);
            byte[] png = output.toByteArray();
            HrAttendancePhotoService.Uploaded uploaded = photos.upload(file("photo.png", png, png.length), 91L);
            check(uploaded.fileId().equals(12L) && support.audits == 1 && storage.saved == 1, "valid image saved and audited");
            reject("INVALID_ATTENDANCE_PHOTO", () -> photos.upload(file("photo.jpg", png, png.length), 91L));
            reject("INVALID_ATTENDANCE_PHOTO", () -> photos.upload(file("photo.png", png, HrAttendancePhotoService.MAX_SIZE + 1), 91L));
            reject("INVALID_ATTENDANCE_PHOTO", () -> photos.upload(file("photo.png", new byte[0], 0), 91L));
            check(storage.saved == 1, "invalid images never saved");
            attendance(support);
            System.out.println("G1_MOBILE_ATTENDANCE_BASIC: checks=" + checks + "; real_service=true; mapper_storage_transaction=substitutes; database=false; http=false; browser=false");
        } finally { TenantContext.clear(); UserContext.clear(); }
    }
    private static void attendance(Support support) throws Exception {
        LocalDate day = LocalDate.now();
        HrShift shift = new HrShift(); shift.setId(8L); shift.setTenantId(71L); shift.setShiftName("night");
        shift.setStartTime(LocalTime.of(22, 0)); shift.setEndTime(LocalTime.of(6, 0));
        shift.setCheckinWindowBeforeMinutes(120); shift.setCheckoutWindowAfterMinutes(120);
        Map<LocalDate, Long> assignments = new HashMap<>();
        for (int delta = -2; delta <= 2; delta++) assignments.put(day.plusDays(delta), 8L);
        HrAttendanceCheckin previous = row(day.minusDays(1), day.minusDays(1).atTime(22, 0));
        HrAttendanceCheckin overnight = row(day.minusDays(1), day.atTime(6, 0));
        HrAttendanceCheckin current = row(day, day.atTime(22, 0));
        Map<Class<?>, Object> dependencies = new HashMap<>();
        dependencies.put(HrRuleSupport.class, support); dependencies.put(ObjectMapper.class, new ObjectMapper());
        dependencies.put(HolidayResolverMapper.class, proxy(HolidayResolverMapper.class, (target, method, values) -> {
            check(Long.valueOf(91).equals(values[0]) && Long.valueOf(71).equals(values[2]), "assignment uses employee and tenant");
            return assignments.get(values[1]);
        }));
        dependencies.put(HrShiftMapper.class, proxy(HrShiftMapper.class, (target, method, values) -> shift));
        dependencies.put(HrAttendanceCheckinMapper.class, proxy(HrAttendanceCheckinMapper.class, (target, method, values) -> List.of(previous, overnight, current)));
        Constructor<?> constructor = HrAttendanceBusinessService.class.getConstructors()[0];
        Class<?>[] types = constructor.getParameterTypes(); Object[] values = new Object[types.length];
        for (int i = 0; i < types.length; i++) values[i] = dependencies.get(types[i]);
        HrAttendanceBusinessService service = (HrAttendanceBusinessService) constructor.newInstance(values);
        HrAttendanceBusinessService.TodayAttendance today = service.today(91L);
        check(today.shift().shiftId().equals(8L) && today.shift().startTime().equals(day.atTime(22, 0)), "today uses assigned shift");
        check(today.shift().endTime().equals(day.plusDays(1).atTime(6, 0)), "night shift ends next day");
        check(today.checkins().equals(List.of(overnight, current)), "today includes overnight checkout only from previous date");
        HrAttendanceCheckinPayload payload = new HrAttendanceCheckinPayload(); payload.setEmployeeId(91L);
        payload.setLogType("OUT"); payload.setCheckTime(day.atTime(6, 0));
        Method match = HrAttendanceBusinessService.class.getDeclaredMethod("matchShift", HrAttendanceCheckinPayload.class); match.setAccessible(true);
        Object result = match.invoke(service, payload); Method date = result.getClass().getDeclaredMethod("date"); date.setAccessible(true);
        check(date.invoke(result).equals(day.minusDays(1)), "overnight checkout belongs to previous shift");
        assignments.clear(); check(service.today(91L).shift() == null, "no assignment does not invent shift");
        assignments.put(day, 8L); shift.setTenantId(72L); reject("SHIFT_NOT_FOUND", () -> service.today(91L));
        reject("FORBIDDEN", () -> service.today(92L));
    }
    private static HrAttendanceCheckin row(LocalDate date, LocalDateTime time) {
        HrAttendanceCheckin row = new HrAttendanceCheckin(); row.setAttendanceDate(date); row.setCheckTime(time); return row;
    }
    private static MultipartFile file(String name, byte[] bytes, long size) {
        return proxy(MultipartFile.class, (target, method, args) -> switch (method.getName()) {
            case "getOriginalFilename" -> name; case "getName" -> "file"; case "getSize" -> size;
            case "isEmpty" -> size == 0; case "getBytes" -> bytes;
            case "getInputStream" -> new java.io.ByteArrayInputStream(bytes); case "getContentType" -> "image/png";
            default -> throw new AssertionError(method.getName());
        });
    }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
    private static void reject(String code, Runnable action) {
        try { action.run(); throw new AssertionError("Expected " + code); }
        catch (HrBusinessException failure) { check(code.equals(failure.getCode()), "expected " + code + ", got " + failure.getCode()); }
    }
    private static final class Support extends HrRuleSupport {
        int audits; Support() { super(null, null, null, null, new ObjectMapper(), null); }
        @Override public void assertEmployeeScope(Long employeeId) { if (!Long.valueOf(91).equals(employeeId)) throw new HrBusinessException("FORBIDDEN", "scope denied"); }
        @Override public <T> T transaction(Supplier<T> action) { return action.get(); }
        @Override public void audit(String domain, Long id, String operation, Object detail) { audits++; }
    }
    private static final class Storage extends HrFileStorage {
        int saved; Storage() { super(null, null); }
        @Override public Long save(byte[] bytes, String name, String purpose) { check(HrAttendancePhotoService.PURPOSE.equals(purpose), "photo purpose retained"); saved++; return 12L; }
        @Override public byte[] loadPrivate(Long id, String purpose) { check(HrAttendancePhotoService.PURPOSE.equals(purpose), "private download purpose"); return new byte[]{1, 2, 3}; }
        @Override public String fileName(Long id, String purpose) { return "photo.png"; }
    }
}
