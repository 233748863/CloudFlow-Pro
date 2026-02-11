package cn.joywon.poco.knowledge.dto;

import lombok.Data;

import java.util.List;

/**
 * @author poco
 * @date 2025/3/27
 */
@Data
public class AiDataTableDTO {

    private String tableName;

    private String tableComment;

    private List<AiTableField> fields;


    @Data
    public static class AiTableField {

        private String fieldName;

        private String fieldComment;

        private String dbType;

        private String fieldType;

    }
}
