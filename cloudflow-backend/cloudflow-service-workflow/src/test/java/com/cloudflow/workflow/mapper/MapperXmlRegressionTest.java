package com.cloudflow.workflow.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MapperXmlRegressionTest {

    @Test
    void alertMapperXmlShouldNotOverrideUpdateById() throws IOException {
        // 这里专门防回归：BaseMapper.updateById 依赖 MyBatis-Plus 注入，不能再被同名 XML 覆盖。
        assertFalse(readResource("mapper/workflow/TimeoutAlertMapper.xml").contains("<update id=\"updateById\">"),
                "TimeoutAlertMapper.xml 不应手写 updateById，避免覆盖 MyBatis-Plus 默认实现");
        assertFalse(readResource("mapper/workflow/AnomalyAlertMapper.xml").contains("<update id=\"updateById\">"),
                "AnomalyAlertMapper.xml 不应手写 updateById，避免覆盖 MyBatis-Plus 默认实现");
    }

    @Test
    void anomalyAlertMapperXmlShouldUseYnFlagsOnly() throws IOException {
        String xml = readResource("mapper/workflow/AnomalyAlertMapper.xml");

        assertFalse(xml.contains("BooleanCharTypeHandler"),
                "AnomalyAlertMapper.xml 不应再包含 BooleanCharTypeHandler");
        assertFalse(xml.contains("'0'"),
                "AnomalyAlertMapper.xml 不应再兼容 0 标记");
        assertFalse(xml.contains("'1'"),
                "AnomalyAlertMapper.xml 不应再兼容 1 标记");
        assertTrue(xml.contains("aa.resolved = 'Y'"),
                "AnomalyAlertMapper.xml 应使用 Y 表示已解决");
        assertTrue(xml.contains("aa.resolved = 'N'"),
                "AnomalyAlertMapper.xml 应使用 N 表示未解决");
    }

    private String readResource(String path) throws IOException {
        try (InputStream inputStream = Thread.currentThread().getContextClassLoader().getResourceAsStream(path)) {
            assertNotNull(inputStream, "测试资源不存在: " + path);
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
