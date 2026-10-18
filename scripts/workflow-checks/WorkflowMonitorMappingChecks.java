import com.baomidou.mybatisplus.core.MybatisConfiguration;
import java.io.InputStream;
import java.util.List;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;

import java.util.Map;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ResultMapping;

public final class WorkflowMonitorMappingChecks {
    public static int run() throws Exception {
        String resource = "mapper/workflow/ProcessMonitorMapper.xml";
        MybatisConfiguration configuration = new MybatisConfiguration();
        try (InputStream input = WorkflowMonitorMappingChecks.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) throw new AssertionError("Missing production process monitor mapper XML");
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        MappedStatement statement = configuration.getMappedStatement("com.cloudflow.workflow.mapper.ProcessMonitorMapper.selectByInstanceId");
        String sql = statement.getBoundSql(Map.of("instanceId", "de-live-check", "tenantId", 100000L)).getSql();
        List<ResultMapping> mappings = statement.getResultMaps().get(0).getResultMappings();
        int checks = 0;
        for (Map.Entry<String, String> field : Map.of("businessKey", "business_key", "duration", "duration", "nodeCount", "node_count",
                "startUserId", "start_user_id", "startUserName", "start_user_name", "errorMessage", "error_message",
                "version", "version", "updateTime", "update_time").entrySet()) {
            if (!sql.contains("p." + field.getValue())) throw new AssertionError("Monitor update query omits " + field.getValue());
            if (mappings.stream().noneMatch(mapping -> field.getKey().equals(mapping.getProperty()) && field.getValue().equals(mapping.getColumn()))) {
                throw new AssertionError("Monitor result mapping omits " + field.getKey());
            }
            checks += 2;
        }
        return checks;
    }
}
