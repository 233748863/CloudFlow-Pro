package com.cloudflow.common.staticrules;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 主代码静态规则扫描。
 */
public class StaticRuleScanner {

    private static final Pattern METHOD_SIGNATURE = Pattern.compile(
            "^(public|protected|private)\\s+.*\\(.*\\)\\s*(\\{|throws\\s+.*)?$");
    private static final String CLASSPATH_WHITELIST = "static-rules/static-rules-whitelist.txt";
    private static final String[] WRITE_KEYWORDS = {
            "add", "create", "submit", "approve", "reject", "publish", "cancel", "convert",
            "receive", "handover", "save", "update", "delete", "remove", "terminate", "pause",
            "resume", "archive", "restore", "rollback", "replay", "ignore", "deploy", "draft",
            "record", "bind", "unbind", "void", "writeoff", "invalidate"
    };

    private final Path root;

    public StaticRuleScanner(Path root) {
        this.root = root;
    }

    public void scan() throws IOException {
        List<String> findings = new ArrayList<>();
        Set<String> whitelist = loadWhitelist();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (isIgnored(file)) {
                    return FileVisitResult.CONTINUE;
                }
                if (file.toString().endsWith(".java")) {
                    findings.addAll(scanFile(file, whitelist));
                }
                return FileVisitResult.CONTINUE;
            }
        });
        if (findings.isEmpty()) {
            System.out.println("[static-rules] no findings");
            return;
        }
        System.out.println("[static-rules] findings:");
        for (String finding : findings) {
            System.out.println(finding);
        }
        throw new IllegalStateException("Static rule violations: " + findings.size());
    }

    private List<String> scanFile(Path file, Set<String> whitelist) throws IOException {
        List<String> findings = new ArrayList<>();
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        String lowerPath = file.toString().toLowerCase(Locale.ROOT);
        boolean isAuthModule = lowerPath.contains("\\auth\\") || lowerPath.contains("/auth/");
        boolean authSensitiveController = lowerPath.endsWith("authcontroller.java")
                || lowerPath.endsWith("captchacontroller.java");
        boolean controllerSource = lowerPath.contains("\\controller\\")
                || lowerPath.contains("/controller/")
                || lowerPath.endsWith("controller.java")
                || lowerPath.endsWith("controllers.java");
        boolean feignLike = lowerPath.contains("\\remote\\")
                || lowerPath.contains("/remote/")
                || lowerPath.endsWith("\\remoteauthcontroller.java")
                || lowerPath.endsWith("/remoteauthcontroller.java")
                || lines.stream().anyMatch(line -> line.contains("@FeignClient"));
        boolean classTransactional = false;
        List<String> classAnnotations = new ArrayList<>();
        boolean inTransactionalMethod = false;
        int transactionalMethodDepth = 0;
        List<String> pendingAnnotations = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String trimmed = line.trim();
            if (trimmed.startsWith("@")) {
                pendingAnnotations.add(trimmed);
                continue;
            }
            if (isClassDeclaration(trimmed)) {
                classAnnotations = new ArrayList<>(pendingAnnotations);
                if (hasAnnotation(pendingAnnotations, "@Transactional")) {
                    classTransactional = true;
                }
            }
            boolean methodSignature = isMethodSignature(trimmed);
            if (methodSignature) {
                List<String> effectiveAnnotations = new ArrayList<>(classAnnotations);
                effectiveAnnotations.addAll(pendingAnnotations);
                boolean hasMapping = pendingAnnotations.stream().anyMatch(this::isMappingAnnotation);
                boolean hasPermissionGuard = hasPermissionGuard(effectiveAnnotations);
                boolean hasPost = pendingAnnotations.stream().anyMatch(s -> s.contains("@PostMapping"));
                boolean hasRepeat = pendingAnnotations.stream().anyMatch(s -> s.contains("@RepeatSubmit"));
                boolean hasRepeatDisabled = pendingAnnotations.stream().anyMatch(s -> s.contains("@RepeatSubmit.Disabled"));
                boolean hasRate = pendingAnnotations.stream().anyMatch(s -> s.contains("@RateLimiter"));
                boolean writeSemantic = isWriteSemantic(trimmed, pendingAnnotations);
                if (controllerSource && !feignLike && hasMapping && !hasPermissionGuard
                        && !isWhitelisted(whitelist, file, i + 1)) {
                    findings.add(format(file, i + 1, "PERMISSION_GUARD", trimmed));
                }
                if (controllerSource && !feignLike && hasPost && !isAuthModule && writeSemantic && !hasRepeat && !hasRepeatDisabled
                        && !isWhitelisted(whitelist, file, i + 1)) {
                    findings.add(format(file, i + 1, "POST_NO_REPEAT", trimmed));
                }
                if (controllerSource && !feignLike && authSensitiveController && hasPost && !hasRate && !isWhitelisted(whitelist, file, i + 1)) {
                    findings.add(format(file, i + 1, "AUTH_NO_RATE", trimmed));
                }
                inTransactionalMethod = classTransactional || hasAnnotation(pendingAnnotations, "@Transactional");
                transactionalMethodDepth = inTransactionalMethod ? braceDelta(line) : 0;
            }
            if (!trimmed.isBlank() && !trimmed.startsWith("@") && !trimmed.startsWith("//") && !trimmed.startsWith("/*")
                    && !trimmed.startsWith("*") && !trimmed.startsWith("*/")) {
                pendingAnnotations.clear();
            }
            if (inTransactionalMethod && isWorkflowInvocationLine(line) && !lowerPath.contains("cloudflow-service-workflow")
                    && !isWhitelisted(whitelist, file, i + 1)) {
                findings.add(format(file, i + 1, "TXN_WORKFLOW", line.trim()));
            }
            if ((line.contains("SELECT ") || line.contains("UPDATE ") || line.contains("DELETE ") || line.contains("INSERT "))
                    && line.contains("+")) {
                findings.add(format(file, i + 1, "SQL_CONCAT", line.trim()));
            }
            if (inTransactionalMethod && !methodSignature) {
                transactionalMethodDepth += braceDelta(line);
                if (transactionalMethodDepth <= 0) {
                    inTransactionalMethod = false;
                }
            }
        }
        return findings;
    }

    private boolean isIgnored(Path file) {
        String path = file.toString().toLowerCase(Locale.ROOT);
        return path.contains("\\target\\")
                || path.contains("/target/")
                || path.contains("\\cloudflow-common-static-rules\\")
                || path.contains("/cloudflow-common-static-rules/")
                || path.contains("\\.git\\")
                || path.contains("/.git/")
                || path.contains("\\.claude\\")
                || path.contains("/.claude/")
                || path.contains("\\.idea\\")
                || path.contains("/.idea/");
    }

    private Set<String> loadWhitelist() throws IOException {
        Set<String> whitelist = new HashSet<>();
        try (InputStream inputStream = StaticRuleScanner.class.getClassLoader().getResourceAsStream(CLASSPATH_WHITELIST)) {
            if (inputStream != null) {
                for (String line : new String(inputStream.readAllBytes(), StandardCharsets.UTF_8).split("\\R")) {
                    String trimmed = line.trim();
                    if (!trimmed.isEmpty() && !trimmed.startsWith("#")) {
                        whitelist.add(trimmed);
                    }
                }
            }
        }
        if (!whitelist.isEmpty()) {
            return whitelist;
        }
        Path legacyFile = root.resolve(".cloudflow-static-rules-whitelist");
        if (!Files.exists(legacyFile)) {
            return whitelist;
        }
        for (String line : Files.readAllLines(legacyFile, StandardCharsets.UTF_8)) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty() && !trimmed.startsWith("#")) {
                whitelist.add(trimmed);
            }
        }
        return whitelist;
    }

    private boolean isMethodSignature(String line) {
        return METHOD_SIGNATURE.matcher(line).matches();
    }

    private boolean isClassDeclaration(String line) {
        return line.contains(" class ") || line.startsWith("class ")
                || line.contains(" interface ") || line.startsWith("interface ");
    }

    private boolean hasAnnotation(List<String> annotations, String annotationName) {
        return annotations.stream().anyMatch(annotation -> annotation.contains(annotationName));
    }

    private boolean hasPermissionGuard(List<String> annotations) {
        for (String annotation : annotations) {
            if (annotation.contains("@SaCheckPermission")
                    || annotation.contains("@Inner")
                    || annotation.contains("@SaIgnore")) {
                return true;
            }
            if (annotation.contains("@SaCheckRole") && annotation.contains("\"admin\"")) {
                return true;
            }
        }
        return false;
    }

    private boolean isMappingAnnotation(String annotation) {
        return annotation.contains("@RequestMapping")
                || annotation.contains("@GetMapping")
                || annotation.contains("@PostMapping")
                || annotation.contains("@PutMapping")
                || annotation.contains("@DeleteMapping")
                || annotation.contains("@PatchMapping");
    }

    private boolean isWorkflowInvocationLine(String line) {
        return line.contains(".startProcess(")
                || line.contains(".completeTask(")
                || line.contains(".cancelProcess(")
                || line.contains(".recallProcess(")
                || line.contains("startWorkflow(");
    }

    private int braceDelta(String line) {
        int delta = 0;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '{') {
                delta++;
            } else if (ch == '}') {
                delta--;
            }
        }
        return delta;
    }

    private boolean isWriteSemantic(String methodSignature, List<String> annotations) {
        String methodName = extractMethodName(methodSignature).toLowerCase(Locale.ROOT);
        String annotationText = String.join(" ", annotations).toLowerCase(Locale.ROOT);
        for (String keyword : WRITE_KEYWORDS) {
            if (methodName.contains(keyword) || annotationText.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private String extractMethodName(String methodSignature) {
        int leftParen = methodSignature.indexOf('(');
        if (leftParen < 0) {
            return methodSignature;
        }
        String before = methodSignature.substring(0, leftParen).trim();
        int lastSpace = before.lastIndexOf(' ');
        if (lastSpace < 0) {
            return before;
        }
        return before.substring(lastSpace + 1);
    }

    private boolean isWhitelisted(Set<String> whitelist, Path file, int line) {
        if (whitelist.isEmpty()) {
            return false;
        }
        String candidate = file.toString().replace('\\', '/') + ":" + line;
        for (String rule : whitelist) {
            if (candidate.contains(rule)) {
                return true;
            }
        }
        return false;
    }

    private String format(Path file, int line, String rule, String snippet) {
        return file + ":" + line + " [" + rule + "] " + snippet;
    }
}
