import com.baomidou.mybatisplus.extension.toolkit.SqlParserUtils;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;

public final class E3RuleQueryParserInspection {
    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) throw new IllegalArgumentException("Mapper and output paths required");
        String source = Files.readString(Path.of(arguments[0]), StandardCharsets.UTF_8);
        Matcher select = Pattern.compile("(?s)<select\\b[^>]*>(.*?)</select>").matcher(source);
        if (!select.find()) throw new IllegalStateException("Actual mapper select required");
        String original = select.group(1).replaceAll("(?s)<if\\b[^>]*>|</if>", "")
                .replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&")
                .replaceAll("#\\{(?:ruleCode|businessType|hitResult)\\}", "'sample'");
        if (!original.contains("newer.created_time <=> hit.created_time")) throw new IllegalStateException("Actual nullable-time comparison required");
        String compatible = original.replace("newer.created_time <=> hit.created_time",
                "(newer.created_time = hit.created_time OR (newer.created_time IS NULL AND hit.created_time IS NULL))");
        boolean originalParsed = parses(original);
        boolean compatibleParsed = parses(compatible);
        boolean originalCountParsed = parses(SqlParserUtils.getOriginalCountSql(original));
        boolean compatibleCountParsed = parses(SqlParserUtils.getOriginalCountSql(compatible));
        String report = "{\"originalParsed\":" + originalParsed + ",\"compatibleParsed\":" + compatibleParsed
                + ",\"originalCountParsed\":" + originalCountParsed + ",\"compatibleCountParsed\":" + compatibleCountParsed
                + ",\"actualMapperSource\":true,\"productionParser\":true,\"databaseWrites\":0}";
        Files.writeString(Path.of(arguments[1]), report, StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.CREATE_NEW);
        System.out.println("E3_RULE_PARSER_INSPECTION: original=" + originalParsed + "; compatible=" + compatibleParsed
                + "; original_count=" + originalCountParsed + "; compatible_count=" + compatibleCountParsed + "; database_writes=0");
        if (originalParsed || originalCountParsed || !compatibleParsed || !compatibleCountParsed) throw new IllegalStateException("Parser hypothesis not confirmed");
    }

    private static boolean parses(String statement) {
        try {
            CCJSqlParserUtil.parse(statement);
            return true;
        } catch (Exception invalid) {
            return false;
        }
    }
}
