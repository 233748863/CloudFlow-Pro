package com.cloudflow.common.excel.importing;

import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.excel.importing.mapper.ImportTaskMapper;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.service.JobExecutionService;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.security.core.TokenService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.client.RestClient;

@AutoConfiguration
@ConditionalOnProperty(name = "cloudflow.import.enabled", havingValue = "true")
@MapperScan("com.cloudflow.common.excel.importing.mapper")
@Import(ImportController.class)
public class ImportAutoConfiguration {
    @Bean
    public ImportRegistry importRegistry(List<ImportDefinition<?>> definitions, List<ImportHandler<?>> handlers) {
        return new ImportRegistry(definitions, handlers);
    }

    @Bean
    public ImportIdentity importIdentity(TokenService tokens) { return new ImportIdentity(tokens); }

    @Bean
    public ImportSpreadsheets importSpreadsheets() { return new ImportSpreadsheets(); }

    @Bean
    public ImportValidatorChain importValidatorChain(ObjectMapper json) { return new ImportValidatorChain(json); }

    @Bean
    @ConditionalOnMissingBean(ImportFileStore.class)
    public ImportFileStore importFileStore(RestClient.Builder builder,
            @Value("${cloudflow.job.auth-url:http://localhost:9001}") String authUrl,
            @Value("${spring.application.name}") String serviceName) {
        return new RemoteImportFileStore(builder, authUrl, serviceName);
    }

    @Bean
    public ImportEngine importEngine(ImportTaskMapper tasks, ImportRegistry registry, ImportIdentity identity,
            ImportFileStore files, ImportSpreadsheets sheets, ImportValidatorChain validators,
            PlatformTransactionManager transactions, JobReportClient reports, JobExecutionService execution,
            SysAuditLogMapper audits, MessageSender messages, ObjectMapper json) {
        return new ImportEngine(tasks, registry, identity, files, sheets, validators, transactions, reports, execution, audits, messages, json);
    }
}
