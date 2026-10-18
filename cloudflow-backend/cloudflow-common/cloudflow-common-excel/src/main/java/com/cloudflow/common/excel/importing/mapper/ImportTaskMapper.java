package com.cloudflow.common.excel.importing.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.model.ImportErrorRecord;
import com.cloudflow.common.excel.importing.model.ImportTask;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Param;

public interface ImportTaskMapper extends BaseMapper<ImportTask> {
    ImportTask owned(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    ImportTask ownedForUpdate(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    IPage<ImportTask> pageOwned(IPage<ImportTask> page, @Param("tenantId") long tenantId, @Param("operatorId") long operatorId,
                              @Param("bizType") String bizType, @Param("status") String status, @Param("types") List<String> types);
    int transition(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId,
                   @Param("previous") String previous, @Param("status") String status, @Param("message") String message);
    int beginValidation(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    int beginImport(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    int setFile(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId,
                @Param("reference") String reference, @Param("errorFile") boolean errorFile);
    int setJob(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId, @Param("jobLogId") long jobLogId);
    int addValidation(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId,
                      @Param("expected") int expected, @Param("valid") int valid, @Param("invalid") int invalid);
    int addProgress(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId,
                    @Param("expected") int expected, @Param("success") int success, @Param("failure") int failure);
    int addErrors(@Param("tenantId") long tenantId, @Param("taskId") long taskId, @Param("errors") List<ImportError> errors);
    int clearErrors(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    IPage<ImportErrorRecord> pageErrors(IPage<ImportErrorRecord> page, @Param("tenantId") long tenantId,
                                      @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    List<Integer> invalidRows(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    List<ImportErrorRecord> errorsInRange(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId,
                                         @Param("taskId") long taskId, @Param("firstRow") int firstRow, @Param("lastRow") int lastRow);
    List<Map<String, Object>> errorCounts(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    List<ImportTask> expired(@Param("tenantId") long tenantId, @Param("cutoff") LocalDateTime cutoff);
    List<ImportTask> completedOriginals(@Param("tenantId") long tenantId, @Param("types") List<String> types,
                                       @Param("afterId") long afterId);
    int discardTask(@Param("tenantId") long tenantId, @Param("operatorId") long operatorId, @Param("taskId") long taskId);
    String jobStatus(@Param("tenantId") long tenantId, @Param("jobLogId") long jobLogId);
}
