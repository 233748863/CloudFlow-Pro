import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedThread;
import jdk.jfr.consumer.RecordingFile;

public final class D2FirstRequestTimeline {
    private record Observation(Instant start, String kind, String thread, double overlap, List<String> frames) { }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3) throw new IllegalArgumentException("Recording and request interval required");
        Path root = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        Path file = Path.of(arguments[0]).toRealPath();
        if (!file.startsWith(root) || !Set.of("hr.jfr", "auth.jfr", "gateway.jfr").contains(file.getFileName().toString())) {
            throw new IllegalArgumentException("Owned request recording required");
        }
        Instant from = Instant.ofEpochMilli(Long.parseLong(arguments[1]));
        Instant to = Instant.ofEpochMilli(Long.parseLong(arguments[2]));
        if (!to.isAfter(from)) throw new IllegalArgumentException("Positive request interval required");
        List<Observation> observations = new ArrayList<>();
        Set<String> eventTypes = Set.of("jdk.ExecutionSample", "jdk.NativeMethodSample", "jdk.ThreadPark", "jdk.JavaMonitorEnter", "jdk.SocketRead", "jdk.SocketWrite", "jdk.ClassLoad");
        try (RecordingFile recording = new RecordingFile(file)) {
            while (recording.hasMoreEvents()) {
                RecordedEvent event = recording.readEvent();
                String kind = event.getEventType().getName();
                if (!eventTypes.contains(kind) || event.getEndTime().isBefore(from) || event.getStartTime().isAfter(to)) continue;
                RecordedThread thread = event.hasField("sampledThread") ? event.getThread("sampledThread") : event.getThread();
                if (thread == null || !thread.getJavaName().startsWith("http-nio-") || !thread.getJavaName().contains("-exec-")) continue;
                List<String> frames = new ArrayList<>();
                if (event.getStackTrace() != null) {
                    for (RecordedFrame frame : event.getStackTrace().getFrames()) {
                        frames.add(frame.getMethod().getType().getName() + "." + frame.getMethod().getName() + ":" + frame.getLineNumber());
                    }
                }
                if (frames.stream().anyMatch(frame -> frame.contains("org.apache.tomcat.util.threads.TaskQueue.take"))) continue;
                Instant start = event.getStartTime().isBefore(from) ? from : event.getStartTime();
                Instant end = event.getEndTime().isAfter(to) ? to : event.getEndTime();
                double overlap = Duration.between(start, end).toNanos() / 1_000_000.0;
                observations.add(new Observation(start, kind, thread.getJavaName(), overlap, List.copyOf(frames)));
            }
        }
        observations.sort(Comparator.comparing(Observation::start));
        for (Observation observation : observations) {
            double offset = Duration.between(from, observation.start()).toNanos() / 1_000_000.0;
            String application = observation.frames().stream().filter(frame -> frame.startsWith("com.cloudflow.")).findFirst().orElse("framework");
            System.out.printf(Locale.ROOT, "TIMELINE offset_ms=%.3f overlap_ms=%.3f kind=%s thread=%s application=%s stack=%s%n",
                    offset, observation.overlap(), observation.kind(), observation.thread(), application, String.join(" > ", observation.frames()));
        }
        System.out.println("TIMELINE_LIMITS observations=" + observations.size() + "; samples_are_not_durations=true; overlapping_events_are_not_additive=true; payloads_printed=false");
    }
}
