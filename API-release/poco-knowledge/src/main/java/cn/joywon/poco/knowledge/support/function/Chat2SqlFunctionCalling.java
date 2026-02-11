package cn.joywon.poco.knowledge.support.function;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.spring.SpringUtil;
import com.fasterxml.jackson.annotation.JsonInclude;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiDataEntity;
import cn.joywon.poco.knowledge.service.AiChartGenerateService;
import cn.joywon.poco.knowledge.service.AiDataService;
import cn.joywon.poco.knowledge.support.annotation.FieldPrompt;
import cn.joywon.poco.knowledge.support.feign.RemoteTableInfoService;
import cn.joywon.poco.knowledge.support.provider.ChatMemoryAdvisorProvider;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.internal.Utils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.Select;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * chat2 SQL函数调用
 *
 * @author poco
 * @date 2024/07/30
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Chat2SqlFunctionCalling implements FunctionCalling<SqlRequest> {

    private final ChatMemoryAdvisorProvider chatMemoryAdvisorProvider;

    private final AiChartGenerateService chartGenerateService;

    private final AiDataService aiDataService;

    /**
     * 展示
     *
     * @return boolean
     */
    @Override
    public boolean showFunction() {
        return false;
    }

    /**
     * 检查参数是否正确
     *
     * @param sqlRequest  请求信息
     * @param userDetails 用户信息
     * @param extDetails
     * @return
     */
    @Override
    public R<String> checkParams(SqlRequest sqlRequest, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {

        log.info("Chat2SQL 结果：{}", sqlRequest);

        Statement statement = null;
        try {
            statement = CCJSqlParserUtil.parse(sqlRequest.getSql());
        } catch (JSQLParserException e) {
            return R.failed(StrUtil.format("SQL: {} 解析失败", sqlRequest.getSql()));
        }
        if (statement instanceof Select) {
            sqlRequest.setSql(statement.toString());
            return R.ok();
        }

        return R.failed(StrUtil.format("SQL: {} 解析失败，安全问题不支持非查询语句", sqlRequest.getSql()));
    }


    /**
     * 处理
     *
     * @param sqlRequest  SQL 请求
     * @param userDetails 用户详细信息
     * @param extDetails  扩展详细信息
     * @return {@link R }
     */
    @Override
    public R<String> handle(SqlRequest sqlRequest, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {
        RemoteTableInfoService remoteTableInfoService = SpringUtil.getBean(RemoteTableInfoService.class);
        AiDataEntity dataEntity = aiDataService.getById(extDetails.getDataId());
        R execSQLResult = remoteTableInfoService.execSQL(dataEntity.getDsName(), sqlRequest.getSql());

        // 处理异常情况
        if (!execSQLResult.isOk()) {
            // 异常情况下，清空多轮会话,避免后续丢失精度
            ChatMessageDTO chatMessageDTO = ChatMessageContextHolder.get();
            chatMemoryAdvisorProvider.get(chatMessageDTO.getConversationId()).clear();

            return R.failed(StrUtil.format("""
                    执行后结果为空，不进行表格和图表渲染。
                    ```sql
                    {}
                    ```
                    请进行条件调整后重试，或联系管理员进行字段评估
                    ```bash
                    {}
                    ```
                    """, sqlRequest.getSql(), execSQLResult.getMsg()));
        }

        List<Map<String, Object>> resultData = (List<Map<String, Object>>) execSQLResult.getData();

        if (CollUtil.isEmpty(resultData)) {
            // 为空判定为：异常情况，清空多轮会话,避免后续丢失精度
            ChatMessageDTO chatMessageDTO = ChatMessageContextHolder.get();
            chatMemoryAdvisorProvider.get(chatMessageDTO.getConversationId()).clear();

            return R.failed(StrUtil.format("""
                    执行后结果为空，不进行表格和图表渲染。
                    ```sql
                    {}
                    ```
                    请进行条件调整后重试，或联系管理员进行字段评估
                    """, sqlRequest.getSql()));
        }

        // 如果建议图表输出,则执行异步的图表计算逻辑
        if (sqlRequest.isChartOutput() && sqlRequest.getChartType() > 0 && sqlRequest.getChartType() <= 3) {
            ChatMessageDTO chatMessageDTO = ChatMessageContextHolder.get();
            chatMessageDTO.getExtDetails().setChartType(String.valueOf(sqlRequest.getChartType()));
            chatMessageDTO.getExtDetails().setChartId(Utils.randomUUID());
            ChatMessageContextHolder.set(chatMessageDTO);
            chartGenerateService.generateChart(chatMessageDTO, execSQLResult.getData());
        }

        String markdownTable = PromptBuilder.toMarkdownTable(resultData);
        log.info("SQL 执行结果：{}", markdownTable);
        return R.ok(markdownTable);

    }
}

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
class SqlRequest extends BaseAiRequest {

    @FieldPrompt("可以执行的SQL语句")
    private String sql;

    @FieldPrompt(value = "是否推荐用图表的形式输出结果", required = false)
    private boolean chartOutput;

    @FieldPrompt(value = "如果推荐图表输出的话，更适合哪种图表? 1. Line chart 2. Pie chart 3. Bar chart")
    private int chartType;

}
