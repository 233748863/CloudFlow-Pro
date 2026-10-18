import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedStackTrace;
import jdk.jfr.consumer.RecordingFile;

/** Prints aggregated method/timing data only; recording payloads and JVM configuration stay private. */
public final class D2MonthProfileSummary {
    private static final class Metric {
        private long count;
        private double milliseconds;
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Owned performance evidence directory required");
        Path root = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        Path directory = Path.of(args[0]).toRealPath();
        if (!directory.getParent().equals(root) || !directory.getFileName().toString().matches("d2-month-performance-20261005-r[1-9][0-9]*")) {
            throw new IllegalArgumentException("Owned month performance evidence required");
        }
        for (String service : List.of("hr", "gateway")) {
            Path file = directory.resolve(service + ".jfr");
            if (!Files.isRegularFile(file) || !file.toRealPath().getParent().equals(directory)) throw new IllegalArgumentException("Owned recording required");
            Map<String, Metric> aggregates = new LinkedHashMap<>();
            long total = 0;
            try (RecordingFile recording = new RecordingFile(file)) {
                while (recording.hasMoreEvents()) {
                    RecordedEvent event = recording.readEvent();
                    String type = event.getEventType().getName();
                    if (!List.of("jdk.ExecutionSample", "jdk.NativeMethodSample", "jdk.ThreadPark", "jdk.SocketRead", "jdk.SocketWrite", "jdk.JavaMonitorEnter", "jdk.FileRead", "jdk.FileWrite").contains(type)) continue;
                    total++;
                    RecordedStackTrace stack = event.getStackTrace();
                    if (stack == null) continue;
                    List<String> application = new ArrayList<>();
                    String leaf = null;
                    for (RecordedFrame frame : stack.getFrames()) {
                        String name = frame.getMethod().getType().getName() + "." + frame.getMethod().getName();
                        if (leaf == null) leaf = name;
                        if (name.startsWith("com.cloudflow.")) application.add(name);
                    }
                    // Keep generic network/parser/serialization samples as well as application-owned waits.
                    String signature = type + " | " + leaf + " | " + String.join(" > ", application.stream().limit(5).toList());
                    Metric metric = aggregates.computeIfAbsent(signature, key -> new Metric());
                    metric.count++; metric.milliseconds += event.getDuration().toNanos() / 1_000_000.0;
                }
            }
            System.out.println("D2_PROFILE_SERVICE: " + service + "; selected_events=" + total);
            for (String category : List.of("samples", "waits")) {
                List<Map.Entry<String, Metric>> entries = aggregates.entrySet().stream()
                        .filter(entry -> category.equals("samples") == entry.getKey().contains("Sample"))
                        .sorted(category.equals("samples")
                                ? Comparator.<Map.Entry<String, Metric>>comparingLong(entry -> entry.getValue().count).reversed()
                                : Comparator.<Map.Entry<String, Metric>>comparingDouble(entry -> entry.getValue().milliseconds).reversed())
                        .limit(25).toList();
                for (Map.Entry<String, Metric> entry : entries) {
                    System.out.printf(java.util.Locale.ROOT, "%s count=%d milliseconds=%.3f | %s%n", category, entry.getValue().count, entry.getValue().milliseconds, entry.getKey());
                }
            }
        }
    }
}
