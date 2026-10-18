import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedThread;
import jdk.jfr.consumer.RecordingFile;

/** Reads method names and relative timings only; excludes SQL, request and credential payloads. */
public final class D2FirstRequestStackGroups {
    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Expected owned HR recording and request interval");
        Path root = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        Path file = Path.of(args[0]).toRealPath();
        if (!file.startsWith(root) || !file.getFileName().toString().equals("hr.jfr")) throw new IllegalArgumentException("Owned HR recording required");
        Instant from = Instant.ofEpochMilli(Long.parseLong(args[1]));
        Instant to = Instant.ofEpochMilli(Long.parseLong(args[2]));
        if (!to.isAfter(from)) throw new IllegalArgumentException("Positive request interval required");
        Map<String, Integer> groups = new HashMap<>();
        try (RecordingFile recording = new RecordingFile(file)) {
            while (recording.hasMoreEvents()) {
                RecordedEvent event = recording.readEvent();
                if (event.getStartTime().isBefore(from) || event.getStartTime().isAfter(to)
                        || !event.getEventType().getName().equals("jdk.ExecutionSample") || event.getStackTrace() == null) continue;
                RecordedThread thread = event.getThread("sampledThread");
                if (thread == null || !thread.getJavaName().startsWith("http-nio-") || !thread.getJavaName().contains("-exec-")) continue;
                List<String> frames = new ArrayList<>();
                for (RecordedFrame frame : event.getStackTrace().getFrames()) {
                    frames.add(frame.getMethod().getType().getName() + "." + frame.getMethod().getName());
                }
                String stack = String.join(" > ", frames);
                String group = frames.stream().filter(value -> value.startsWith("com.cloudflow.")).findFirst().orElse("framework");
                groups.merge(group, 1, Integer::sum);
                if (stack.contains("java.net.InetAddress.getHostName") || stack.contains("getDeclaredFields")
                        || stack.contains("URLClassPath.getResource") || stack.contains("java.util.zip.ZipFile")) {
                    System.out.printf(java.util.Locale.ROOT, "REQUEST_STACK offset_ms=%.3f stack=%s%n",
                            Duration.between(from, event.getStartTime()).toNanos() / 1_000_000.0, stack);
                }
            }
        }
        groups.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue(Comparator.reverseOrder()))
                .forEach(entry -> System.out.println("REQUEST_GROUP count=" + entry.getValue() + " method=" + entry.getKey()));
        System.out.println("STACK_LIMITS samples_are_not_durations=true payloads_printed=false");
    }
}
