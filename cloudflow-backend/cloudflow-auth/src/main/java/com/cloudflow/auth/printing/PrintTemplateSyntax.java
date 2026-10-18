package com.cloudflow.auth.printing;

import com.cloudflow.common.core.exception.ServiceException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** 仅将 PRD 白名单语法编译为 FreeMarker，不向模板作者暴露原生指令。 */
final class PrintTemplateSyntax {
    private static final Pattern PATH = Pattern.compile("(?:@root\\.|this\\.)?[\\p{L}_][\\p{L}\\p{N}_]*(?:\\.[\\p{L}_][\\p{L}\\p{N}_]*)*");
    private static final Set<String> HELPERS = Set.of("formatDate", "formatAmount", "amountToChinese", "formatPercent");
    private static final Set<String> RESERVED = Set.of("class", "classLoader", "getClass");
    private final Deque<Block> blocks = new ArrayDeque<>();
    private int sequence;
    private Block row;
    private int rowIndex;
    private int rowCount;

    static String compileRow(String source, int index, int count) {
        if (index < 0) return compile(source);
        PrintTemplateSyntax parser = new PrintTemplateSyntax();
        parser.row = new Block("each", "__row");
        parser.rowIndex = index;
        parser.rowCount = count;
        // 共用模板大小及原生指令检查。
        compile("{{#each items}}" + source + "{{/each}}");
        return parser.parse(source);
    }

    static String compile(String source) {
        if (source == null || source.isBlank() || source.length() > 1048576) {
            throw invalid("HTML 模板不能为空且不能超过1048576个字符");
        }
        // 白名单编译是安全边界；不得把未经解析的 FTL 片段透传给引擎。
        for (String marker : List.of("${", "#{", "<#", "</#", "<@", "</@", "[#", "[/#", "[@", "[/@")) {
            if (source.contains(marker)) throw invalid("请使用 {{变量}}、each 和 if 语法，不支持原生引擎指令");
        }
        return new PrintTemplateSyntax().parse(source);
    }

    private String parse(String source) {
        StringBuilder result = new StringBuilder(source.length());
        int cursor = 0;
        int tokens = 0;
        while (cursor < source.length()) {
            int start = source.indexOf("{{", cursor);
            if (start < 0) { result.append(source, cursor, source.length()); break; }
            result.append(source, cursor, start);
            int end = source.indexOf("}}", start + 2);
            if (end < 0 || ++tokens > 20000) throw invalid("模板标记未闭合或超过20000个");
            String token = source.substring(start + 2, end).trim();
            if (token.startsWith("#each ")) {
                String expression = path(token.substring(6).trim());
                String variable = "__item" + sequence++;
                result.append("<#list __list((").append(expression).append(")!\"\") as ").append(variable)
                        .append("><#assign __ignored=__step()>");
                push(new Block("each", variable));
            } else if (token.startsWith("#if ")) {
                String expression = path(token.substring(4).trim());
                result.append("<#if __truth((").append(expression).append(")!\"\")>");
                push(new Block("if", null));
            } else if ("else".equals(token)) {
                if (blocks.isEmpty() || blocks.peek().alternate) throw invalid("else 位置不正确");
                blocks.peek().alternate = true;
                result.append("<#else>");
            } else if (token.startsWith("/")) {
                String kind = token.substring(1);
                if (blocks.isEmpty() || !blocks.peek().kind.equals(kind)) throw invalid("模板区块结束标记不匹配");
                blocks.pop();
                result.append("</#").append("each".equals(kind) ? "list" : "if").append('>');
            } else {
                result.append("${").append(value(token)).append('}');
            }
            cursor = end + 2;
        }
        if (!blocks.isEmpty()) throw invalid("模板区块未闭合");
        return result.toString();
    }

    private void push(Block block) {
        if (blocks.size() >= 32) throw invalid("模板区块嵌套不能超过32层");
        blocks.push(block);
    }

    private String value(String token) {
        List<String> arguments = arguments(token);
        if (arguments.size() == 1) return "(" + path(arguments.get(0)) + ")!\"\"";
        String helper = arguments.get(0);
        if (!HELPERS.contains(helper) || arguments.size() > 3
                || (!"formatDate".equals(helper) && arguments.size() != 2)) {
            throw invalid("仅支持变量及 formatDate/formatAmount/amountToChinese/formatPercent");
        }
        String result = helper + "((" + path(arguments.get(1)) + ")!\"\"";
        if (arguments.size() == 3) {
            String pattern = arguments.get(2);
            if (pattern.length() < 2 || pattern.charAt(0) != '\'' || pattern.charAt(pattern.length() - 1) != '\'') {
                throw invalid("日期格式须使用单引号，例如 'yyyy-MM-dd'");
            }
            pattern = pattern.substring(1, pattern.length() - 1);
            if (pattern.length() > 64 || !pattern.matches("[-A-Za-z0-9 /:.,_年月日时分秒]+")) {
                throw invalid("日期格式不受支持或超过64个字符");
            }
            result += ",\"" + pattern + "\"";
        }
        return result + ")";
    }

    private List<String> arguments(String token) {
        List<String> result = new ArrayList<>();
        int start = -1;
        boolean quoted = false;
        for (int index = 0; index < token.length(); index++) {
            char character = token.charAt(index);
            if (character == '\'') quoted = !quoted;
            if (!quoted && Character.isWhitespace(character)) {
                if (start >= 0) { result.add(token.substring(start, index)); start = -1; }
            } else if (start < 0) { start = index; }
        }
        if (quoted) throw invalid("模板参数引号未闭合");
        if (start >= 0) result.add(token.substring(start));
        if (result.isEmpty()) throw invalid("模板变量不能为空");
        return result;
    }

    private String path(String expression) {
        Block loop = null;
        for (Block block : blocks) { if ("each".equals(block.kind)) { loop = block; break; } }
        if (loop == null) loop = row;
        if (Set.of("@index", "@first", "@last").contains(expression)) {
            if (loop == null) throw invalid("循环序号只能在 each 区块内使用");
            if (loop == row) return switch (expression) {
                case "@index" -> Integer.toString(rowIndex);
                case "@first" -> Boolean.toString(rowIndex == 0);
                default -> Boolean.toString(rowIndex == rowCount - 1);
            };
            return loop.variable + switch (expression) {
                case "@index" -> "?index";
                case "@first" -> "?is_first";
                default -> "?is_last";
            };
        }
        if ("this".equals(expression)) return loop == null ? "__data" : loop.variable;
        if (!PATH.matcher(expression).matches()) throw invalid("变量仅支持字段路径，不能包含方法或表达式");
        boolean root = expression.startsWith("@root.");
        String plain = root ? expression.substring(6) : expression.startsWith("this.") ? expression.substring(5) : expression;
        StringBuilder result = new StringBuilder(root || loop == null ? "__data" : loop.variable);
        for (String field : plain.split("\\.")) {
            if (RESERVED.contains(field)) throw invalid("不支持对象类型与类加载字段");
            result.append("[\"").append(field).append("\"]");
        }
        return result.toString();
    }

    private static ServiceException invalid(String message) { return new ServiceException(message, 400); }

    private static final class Block {
        private final String kind;
        private final String variable;
        private boolean alternate;
        private Block(String kind, String variable) { this.kind = kind; this.variable = variable; }
    }
}
