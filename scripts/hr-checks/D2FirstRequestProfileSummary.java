import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedStackTrace;
import jdk.jfr.consumer.RecordedThread;
import jdk.jfr.consumer.RecordingFile;

/** Reads owned JFR evidence without exposing event payloads, SQL, headers or credentials. */
public final class D2FirstRequestProfileSummary {
    private record Wait(String kind, String thread, double overlapMs, String stack) { }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Expected recording and request start/end milliseconds");
        Path file = Path.of(args[0]).toRealPath();
        Path evidence = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        if (!file.startsWith(evidence) || !file.getFileName().toString().matches("(hr|auth|gateway)\\.jfr")) {
            throw new IllegalArgumentException("Owned first-request recording required");
        }
        Instant from = Instant.ofEpochMilli(Long.parseLong(args[1]));
        Instant to = Instant.ofEpochMilli(Long.parseLong(args[2]));
        Map<String, Integer> counts = new HashMap<>();
        Map<String, Integer> samples = new HashMap<>();
        Map<String, Integer> business = new HashMap<>();
        Map<String, Integer> requestSamples = new HashMap<>();
        List<Wait> waits = new ArrayList<>();
        try (RecordingFile recording = new RecordingFile(file)) {
            while (recording.hasMoreEvents()) {
                RecordedEvent event = recording.readEvent();
                if (event.getEndTime().isBefore(from) || event.getStartTime().isAfter(to)) continue;
                String kind = event.getEventType().getName();
                counts.merge(kind, 1, Integer::sum);
                RecordedThread thread = event.hasField("sampledThread") ? event.getThread("sampledThread") : event.getThread();
                String threadName = thread == null ? "none" : thread.getJavaName();
                RecordedStackTrace trace = event.getStackTrace();
                List<String> frames = new ArrayList<>();
                if (trace != null) {
                    for (RecordedFrame frame : trace.getFrames()) {
                        frames.add(frame.getMethod().getType().getName() + "." + frame.getMethod().getName());
                    }
                }
                if (kind.endsWith("Sample")) {
                    if (!frames.isEmpty()) samples.merge(threadName + "|" + frames.get(0), 1, Integer::sum);
                    if (kind.equals("jdk.ExecutionSample") && !frames.isEmpty()) requestSamples.merge(threadName + "|" + frames.get(0), 1, Integer::sum);
                    for (String frame : frames) {
                        if (frame.startsWith("com.cloudflow.")) {
                            business.merge(threadName + "|" + frame, 1, Integer::sum);
                            break;
                        }
                    }
                } else if (!event.getDuration().isZero()) {
                    Instant start = event.getStartTime().isBefore(from) ? from : event.getStartTime();
                    Instant end = event.getEndTime().isAfter(to) ? to : event.getEndTime();
                    double overlap = java.time.Duration.between(start, end).toNanos() / 1_000_000.0;
                    String stack = String.join(" > ", frames.stream().limit(12).toList());
                    String application = frames.stream().filter(frame -> frame.startsWith("com.cloudflow.")).findFirst().orElse("");
                    waits.add(new Wait(kind, threadName, overlap, stack + " | " + application));
                }
            }
        }
        System.out.println("PROFILE_WINDOW file=" + file.getFileName() + " from=" + from + " to=" + to);
        counts.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> System.out.println("EVENT " + entry.getKey() + " count=" + entry.getValue()));
        print("SAMPLE", samples, 15);
        print("BUSINESS_SAMPLE", business, 15);
        print("JAVA_SAMPLE", requestSamples, 25);
        waits.stream().filter(wait -> !wait.stack().contains("org.apache.tomcat.util.threads.TaskQueue.take"))
                .filter(wait -> !wait.kind().equals("jdk.ThreadPark") || wait.thread().startsWith("http-nio-") || !wait.stack().endsWith(" | "))
                .sorted(Comparator.comparingDouble(Wait::overlapMs).reversed()).limit(25)
                .forEach(wait -> System.out.printf(java.util.Locale.ROOT, "DURATION %s thread=%s overlap_ms=%.3f stack=%s%n", wait.kind(), wait.thread(), wait.overlapMs(), wait.stack()));
        System.out.println("PROFILE_LIMITS samples_are_not_exact_durations=true overlapping_events_are_not_additive=true payloads_printed=false");
    }

    private static void print(String prefix, Map<String, Integer> counts, int limit) {
        counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(limit)
                .forEach(entry -> System.out.println(prefix + " count=" + entry.getValue() + " " + entry.getKey()));
    }
}
