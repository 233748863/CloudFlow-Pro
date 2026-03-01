package com.cloudflow.workflow.util;

import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * 导出格式工具类
 * 提供导出格式的序列化、反序列化和校验和计算功能
 * 
 * @author CloudFlow
 */
@Slf4j
public class ExportFormatUtil {

    private static final ObjectMapper OBJECT_MAPPER = createObjectMapper();

    /**
     * 创建配置好的 ObjectMapper
     */
    private static ObjectMapper createObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        // 注册 Java 8 时间模块
        mapper.registerModule(new JavaTimeModule());
        // 禁用将日期写为时间戳
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        // 启用美化输出
        mapper.enable(SerializationFeature.INDENT_OUTPUT);
        return mapper;
    }

    /**
     * 序列化导出格式为 JSON 字符串
     * 
     * @param exportFormat 导出格式对象
     * @return JSON 字符串
     * @throws WorkflowException 序列化失败时抛出
     */
    public static String serialize(WorkflowExportFormat exportFormat) {
        try {
            log.debug("开始序列化导出格式, workflowName={}", 
                exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown");
            
            String json = OBJECT_MAPPER.writeValueAsString(exportFormat);
            
            log.debug("序列化完成, JSON长度={}", json.length());
            return json;
            
        } catch (Exception e) {
            log.error("序列化导出格式失败", e);
            throw new WorkflowException("序列化导出格式失败: " + e.getMessage());
        }
    }

    /**
     * 反序列化 JSON 字符串为导出格式对象
     * 
     * @param json JSON 字符串
     * @return 导出格式对象
     * @throws WorkflowException 反序列化失败时抛出
     */
    public static WorkflowExportFormat deserialize(String json) {
        try {
            log.debug("开始反序列化导出格式, JSON长度={}", json.length());
            
            WorkflowExportFormat exportFormat = OBJECT_MAPPER.readValue(json, WorkflowExportFormat.class);
            
            log.debug("反序列化完成, workflowName={}", 
                exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown");
            
            return exportFormat;
            
        } catch (Exception e) {
            log.error("反序列化导出格式失败", e);
            throw new WorkflowException("反序列化导出格式失败: " + e.getMessage());
        }
    }

    /**
     * 反序列化字节数组为导出格式对象
     * 
     * @param bytes 字节数组
     * @return 导出格式对象
     * @throws WorkflowException 反序列化失败时抛出
     */
    public static WorkflowExportFormat deserialize(byte[] bytes) {
        try {
            log.debug("开始反序列化导出格式, 字节数组长度={}", bytes.length);
            
            WorkflowExportFormat exportFormat = OBJECT_MAPPER.readValue(bytes, WorkflowExportFormat.class);
            
            log.debug("反序列化完成, workflowName={}", 
                exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown");
            
            return exportFormat;
            
        } catch (Exception e) {
            log.error("反序列化导出格式失败", e);
            throw new WorkflowException("反序列化导出格式失败: " + e.getMessage());
        }
    }

    /**
     * 计算导出格式的校验和（SHA-256）
     * 用于验证文件完整性
     * 
     * @param exportFormat 导出格式对象（不包含 checksum 字段）
     * @return SHA-256 校验和（十六进制字符串）
     * @throws WorkflowException 计算失败时抛出
     */
    public static String calculateChecksum(WorkflowExportFormat exportFormat) {
        try {
            // 临时保存原始校验和
            String originalChecksum = exportFormat.getChecksum();
            
            // 清空校验和字段（计算时不包含校验和本身）
            exportFormat.setChecksum(null);
            
            // 序列化为 JSON
            String json = OBJECT_MAPPER.writeValueAsString(exportFormat);
            
            // 计算 SHA-256
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(json.getBytes(StandardCharsets.UTF_8));
            
            // 转换为十六进制字符串
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            
            String checksum = hexString.toString();
            
            // 恢复原始校验和
            exportFormat.setChecksum(originalChecksum);
            
            log.debug("计算校验和完成, checksum={}", checksum);
            return checksum;
            
        } catch (NoSuchAlgorithmException e) {
            log.error("SHA-256 算法不可用", e);
            throw new WorkflowException("计算校验和失败: SHA-256 算法不可用");
        } catch (Exception e) {
            log.error("计算校验和失败", e);
            throw new WorkflowException("计算校验和失败: " + e.getMessage());
        }
    }

    /**
     * 验证导出格式的校验和
     * 
     * @param exportFormat 导出格式对象
     * @return true 如果校验和正确，false 如果校验和不正确
     */
    public static boolean verifyChecksum(WorkflowExportFormat exportFormat) {
        if (exportFormat.getChecksum() == null || exportFormat.getChecksum().isEmpty()) {
            log.warn("导出格式没有校验和，跳过验证");
            return true; // 没有校验和时认为验证通过
        }
        
        String expectedChecksum = exportFormat.getChecksum();
        String actualChecksum = calculateChecksum(exportFormat);
        
        boolean isValid = expectedChecksum.equals(actualChecksum);
        
        if (!isValid) {
            log.warn("校验和验证失败, expected={}, actual={}", expectedChecksum, actualChecksum);
        } else {
            log.debug("校验和验证通过");
        }
        
        return isValid;
    }

    /**
     * 序列化导出格式并计算校验和
     * 这是一个便捷方法，会自动计算并设置校验和
     * 
     * @param exportFormat 导出格式对象
     * @return JSON 字符串（包含校验和）
     * @throws WorkflowException 序列化失败时抛出
     */
    public static String serializeWithChecksum(WorkflowExportFormat exportFormat) {
        // 计算并设置校验和
        String checksum = calculateChecksum(exportFormat);
        exportFormat.setChecksum(checksum);
        
        // 序列化
        return serialize(exportFormat);
    }

    /**
     * 反序列化并验证校验和
     * 这是一个便捷方法，会自动验证校验和
     * 
     * @param json JSON 字符串
     * @return 导出格式对象
     * @throws WorkflowException 反序列化失败或校验和验证失败时抛出
     */
    public static WorkflowExportFormat deserializeAndVerify(String json) {
        WorkflowExportFormat exportFormat = deserialize(json);
        
        if (!verifyChecksum(exportFormat)) {
            throw new WorkflowException("文件校验和验证失败，文件可能已被篡改或损坏");
        }
        
        return exportFormat;
    }

    /**
     * 反序列化字节数组并验证校验和
     * 
     * @param bytes 字节数组
     * @return 导出格式对象
     * @throws WorkflowException 反序列化失败或校验和验证失败时抛出
     */
    public static WorkflowExportFormat deserializeAndVerify(byte[] bytes) {
        WorkflowExportFormat exportFormat = deserialize(bytes);
        
        if (!verifyChecksum(exportFormat)) {
            throw new WorkflowException("文件校验和验证失败，文件可能已被篡改或损坏");
        }
        
        return exportFormat;
    }
}
