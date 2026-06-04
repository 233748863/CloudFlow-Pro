package com.cloudflow.crm.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.crm.config.HrEventStreamConstants;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;

import java.util.Map;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class HrEmployeeLeftStreamConsumerTest {

    @Mock
    private ICrmHandoverTaskService handoverTaskService;

    @Mock
    private RedisStreamUtil redisStreamUtil;

    private HrEmployeeLeftStreamConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new HrEmployeeLeftStreamConsumer(handoverTaskService, redisStreamUtil);
    }

    @Test
    void onMessage_generatesHandoverAndAcksWhenUserIdPresent() {
        MapRecord<String, String, String> message = MapRecord.create(
                HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                Map.of(
                        "userId", "2001",
                        "employeeName", "\"张三\"",
                        "deptId", "3001",
                        "tenantId", "100000",
                        "successorUserId", "2002"
                )).withId(RecordId.of("1748925000000-0"));

        consumer.onMessage(message);

        verify(handoverTaskService).generateForEmployeeLeft(100000L, 2001L, "张三", 3001L,
                "1748925000000-0", 2002L);
        verify(redisStreamUtil).ackGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                HrEventStreamConstants.EMPLOYEE_LEFT_GROUP, "1748925000000-0");
        verify(redisStreamUtil).deleteGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, "1748925000000-0");
    }

    @Test
    void onMessage_onlyAcksWhenUserIdMissing() {
        MapRecord<String, String, String> message = MapRecord.create(
                HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                Map.of("employeeName", "\"张三\"")).withId(RecordId.of("1748925000001-0"));

        consumer.onMessage(message);

        verify(handoverTaskService, never()).generateForEmployeeLeft(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
        verify(redisStreamUtil).ackGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY,
                HrEventStreamConstants.EMPLOYEE_LEFT_GROUP, "1748925000001-0");
        verify(redisStreamUtil).deleteGlobal(HrEventStreamConstants.EMPLOYEE_LEFT_STREAM_KEY, "1748925000001-0");
    }
}
