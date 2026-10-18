package com.cloudflow.auth.mapper;

import com.cloudflow.auth.im.ImTodoRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ImTodoMapper {
    int enabledConfigurations();
    ImTodoRow existing(@Param("tenantId") long tenantId, @Param("configId") long configId,
            @Param("taskId") String taskId, @Param("assignmentVersion") int assignmentVersion, @Param("receiver") long receiver);
    ImTodoRow byDelivery(@Param("tenantId") long tenantId, @Param("deliveryId") long deliveryId);
    ImTodoRow byRecord(@Param("tenantId") long tenantId, @Param("recordId") long recordId);
    int insert(ImTodoRow row);
    int link(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId, @Param("deliveryId") long deliveryId);
    int state(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId, @Param("version") int version,
            @Param("status") String status, @Param("providerId") String providerId);
    List<ImTodoRow> pending(@Param("after") long after);
    ImTodoRow owned(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId);
    List<ImTodoRow> page(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("offset") int offset, @Param("limit") int limit);
    long count(@Param("tenantId") long tenantId, @Param("configId") long configId);
}
