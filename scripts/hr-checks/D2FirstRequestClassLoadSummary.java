import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import jdk.jfr.consumer.RecordedClass;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedThread;
import jdk.jfr.consumer.RecordingFile;

/** Reads only class names and timings from retained recordings; no SQL or request payloads. */
public final class D2FirstRequestClassLoadSummary {
    private record Load(String thread, String name, Instant start, Instant end, String application) {
        double milliseconds() { return Duration.between(start, end).toNanos() / 1_000_000.0; }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Expected owned recording and request start/end");
        Path file = Path.of(args[0]).toRealPath();
        Path root = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        if (!file.startsWith(root) || !file.getFileName().toString().equals("hr.jfr")) throw new IllegalArgumentException("Owned HR recording required");
        Instant from = Instant.ofEpochMilli(Long.parseLong(args[1]));
        Instant to = Instant.ofEpochMilli(Long.parseLong(args[2]));
        if (!to.isAfter(from)) throw new IllegalArgumentException("Positive request interval required");
        List<Load> loads = new ArrayList<>();
        try (RecordingFile recording = new RecordingFile(file)) {
            while (recording.hasMoreEvents()) {
                RecordedEvent event = recording.readEvent();
                if (!event.getEventType().getName().equals("jdk.ClassLoad") || event.getEndTime().isBefore(from) || event.getStartTime().isAfter(to)) continue;
                RecordedThread thread = event.getThread();
                if (thread == null || !thread.getJavaName().startsWith("http-nio-") || !thread.getJavaName().contains("-exec-")) continue;
                RecordedClass loaded = event.getClass("loadedClass");
                String application = "";
                if (event.getStackTrace() != null) {
                    for (RecordedFrame frame : event.getStackTrace().getFrames()) {
                        if (frame.getMethod().getType().getName().startsWith("com.cloudflow.")) {
                            application = frame.getMethod().getType().getName() + "." + frame.getMethod().getName();
                            break;
                        }
                    }
                }
                loads.add(new Load(thread.getJavaName(), loaded == null ? "unknown" : loaded.getName(),
                        event.getStartTime().isBefore(from) ? from : event.getStartTime(),
                        event.getEndTime().isAfter(to) ? to : event.getEndTime(), application));
            }
        }
        for (String thread : loads.stream().map(Load::thread).distinct().sorted().toList()) {
            List<Load> ordered = loads.stream().filter(load -> load.thread().equals(thread)).sorted(Comparator.comparing(Load::start)).toList();
            System.out.printf(Locale.ROOT, "CLASS_LOAD_UNION thread=%s count=%d nonoverlapping_ms=%.3f%n", thread, ordered.size(), unionMilliseconds(ordered));
            for (String application : ordered.stream().map(Load::application).distinct().sorted().toList()) {
                List<Load> group = ordered.stream().filter(load -> load.application().equals(application)).toList();
                System.out.printf(Locale.ROOT, "CLASS_LOAD_GROUP thread=%s count=%d nonoverlapping_ms=%.3f application=%s%n",
                        thread, group.size(), unionMilliseconds(group), application.isEmpty() ? "framework" : application);
            }
        }
        loads.stream().sorted(Comparator.comparingDouble(Load::milliseconds).reversed()).limit(35).forEach(load ->
                System.out.printf(Locale.ROOT, "CLASS_LOAD offset_ms=%.3f duration_ms=%.3f name=%s application=%s%n",
                        Duration.between(from, load.start()).toNanos() / 1_000_000.0, load.milliseconds(), load.name(), load.application()));
        System.out.println("CLASS_LOAD_LIMITS thresholded_recorded_events_only=true diagnostic_not_ordinary_latency=true groups_may_overlap=true payloads_printed=false");
    }

    private static double unionMilliseconds(List<Load> loads) {
        List<Load> ordered = loads.stream().sorted(Comparator.comparing(Load::start)).toList();
        Instant start = null, end = null;
        long unionNanos = 0;
        for (Load load : ordered) {
            if (start == null) { start = load.start(); end = load.end(); }
            else if (!load.start().isAfter(end)) { if (load.end().isAfter(end)) end = load.end(); }
            else { unionNanos += Duration.between(start, end).toNanos(); start = load.start(); end = load.end(); }
        }
        if (start != null) unionNanos += Duration.between(start, end).toNanos();
        return unionNanos / 1_000_000.0;
    }
}
