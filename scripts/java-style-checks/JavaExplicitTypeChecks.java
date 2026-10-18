import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

public final class JavaExplicitTypeChecks {
    private record Finding(String file, long line, String name) { }
    private record Example(String label, String source, int expected) { }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length == 1 && "--self-test".equals(arguments[0])) { selfTest(); return; }
        boolean sourceRoot = arguments.length == 2 && "--source-root".equals(arguments[0]);
        if (!sourceRoot && arguments.length > 1) throw new IllegalArgumentException("Use [repository-root] or --source-root directory");
        Path root = Path.of(arguments.length == 0 ? "." : arguments[sourceRoot ? 1 : 0]).toRealPath();
        List<Path> sources = new ArrayList<>();
        Set<String> excluded = Set.of("target", "artifacts", "node_modules", ".git", ".cloudflow-runtime");
        List<Path> directories = sourceRoot ? List.of(root) : List.of(root.resolve("cloudflow-backend"), root.resolve("scripts"));
        for (Path directory : directories) {
            try (Stream<Path> paths = Files.walk(directory)) {
                paths.filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".java"))
                        .filter(path -> Stream.of(root.relativize(path).toString().split("[/\\\\]")).noneMatch(excluded::contains))
                        .forEach(sources::add);
            }
        }
        sources.sort(Path::compareTo);
        if (sources.isEmpty()) throw new IllegalStateException("No Java sources were inspected");
        try (StandardJavaFileManager manager = ToolProvider.getSystemJavaCompiler().getStandardFileManager(null, null, StandardCharsets.UTF_8)) {
            List<Finding> findings = inspect(manager.getJavaFileObjectsFromPaths(sources));
            for (Finding finding : findings) System.out.println("JAVA_EXPLICIT_TYPE_FINDING: " + finding.file() + ":" + finding.line() + "; variable=" + finding.name());
            System.out.println("JAVA_EXPLICIT_TYPES: files=" + sources.size() + "; inferred_declarations=" + findings.size() + "; comments_and_literals_ignored=true");
            if (!findings.isEmpty()) throw new IllegalStateException("Java variables require explicit types");
        }
    }

    private static List<Finding> inspect(Iterable<? extends JavaFileObject> sources) throws IOException {
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        JavacTask task = (JavacTask) ToolProvider.getSystemJavaCompiler().getTask(null, null, diagnostics,
                List.of("-proc:none", "--release", "17", "-encoding", "UTF-8"), null, sources);
        Trees trees = Trees.instance(task);
        List<Finding> findings = new ArrayList<>();
        for (CompilationUnitTree unit : task.parse()) {
            String source = unit.getSourceFile().getCharContent(true).toString();
            new TreePathScanner<Void, Void>() {
                @Override public Void visitVariable(VariableTree variable, Void unused) {
                    Tree type = variable.getType();
                    if (type == null || "var".equals(type.toString())) {
                        long start = trees.getSourcePositions().getStartPosition(unit, variable);
                        long end = variable.getInitializer() == null ? trees.getSourcePositions().getEndPosition(unit, variable)
                                : trees.getSourcePositions().getStartPosition(unit, variable.getInitializer());
                        if (start >= 0 && end > start && end <= source.length()) {
                            String declaration = Pattern.compile("\\\\u+([0-9a-fA-F]{4})").matcher(source.substring((int) start, (int) end))
                                    .replaceAll(match -> String.valueOf((char) Integer.parseInt(match.group(1), 16)))
                                    .replaceAll("(?s)/\\*.*?\\*/|//[^\\r\\n]*", " ");
                            Matcher matcher = Pattern.compile("\\bvar\\s+" + Pattern.quote(variable.getName().toString()) + "\\b")
                                    .matcher(declaration);
                            if (type == null && getCurrentPath().getParentPath().getLeaf().getKind() != Tree.Kind.LAMBDA_EXPRESSION || matcher.find())
                                findings.add(new Finding(unit.getSourceFile().getName(), unit.getLineMap().getLineNumber(start), variable.getName().toString()));
                        }
                    }
                    return super.visitVariable(variable, unused);
                }
            }.scan(unit, null);
        }
        List<Diagnostic<? extends JavaFileObject>> errors = diagnostics.getDiagnostics().stream()
                .filter(diagnostic -> diagnostic.getKind() == Diagnostic.Kind.ERROR).toList();
        if (!errors.isEmpty()) throw new IllegalStateException("Java syntax scan failed: " + errors);
        return findings;
    }

    private static void selfTest() throws IOException {
        List<Example> examples = List.of(
                new Example("local", "class Example { void run() { var value = 1; } }", 1),
                new Example("loop", "class Example { void run(java.util.List<String> values) { for (var value : values) {} } }", 1),
                new Example("resource", "class Example { void run() throws Exception { try (var stream = new java.io.ByteArrayInputStream(new byte[0])) {} } }", 1),
                new Example("lambda", "class Example { java.util.function.Function<String,String> function = (var value) -> value; }", 1),
                new Example("commented-local", "class Example { void run() { var /* space */ value = 1; } }", 1),
                new Example("commented-lambda", "class Example { java.util.function.Function<String,String> function = (var /* space */ value) -> value; }", 1),
                new Example("escaped-local", "class Example { void run() { v" + '\\' + "u0061r value = 1; } }", 1),
                new Example("escaped-lambda", "class Example { java.util.function.Function<String,String> function = (v" + '\\' + "u0061r value) -> value; }", 1),
                new Example("implicit-lambda", "class Example { java.util.function.Function<String,String> function = value -> value; }", 0),
                new Example("explicit", "class Example { void run() { int value = 1; } }", 0),
                new Example("literal", "class Example { String script = \"var value = 1;\"; }", 0),
                new Example("comment", "class Example { /* var value = 1; */ String value; }", 0),
                new Example("text-block", "class Example { String script = \"\"\"\nvar value = 1;\n\"\"\"; }", 0),
                new Example("identifier", "class Example { int variable = 1; String var; }", 0));
        for (Example example : examples) {
            JavaFileObject source = new SimpleJavaFileObject(URI.create("string:///Example.java"), JavaFileObject.Kind.SOURCE) {
                @Override public CharSequence getCharContent(boolean ignoreEncodingErrors) { return example.source(); }
            };
            int actual = inspect(List.of(source)).size();
            if (actual != example.expected()) throw new AssertionError(example.label() + ": expected=" + example.expected() + ", actual=" + actual);
        }
        System.out.println("JAVA_EXPLICIT_TYPES_SELFTEST: passed=" + examples.size() + "; failed=0; dependency_jars=0");
    }
}
