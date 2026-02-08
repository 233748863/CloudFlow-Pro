package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

/**
 * 同步结果 DTO
 */
@Data
public class SyncResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 成功同步的数量 */
    private Integer synced;

    /** 失败的数量 */
    private Integer failed;

    /** 冲突的数量 */
    private Integer conflicts;

    /** 错误信息列表 */
    private List<String> errors;

    /** 冲突详情列表 */
    private List<ConflictDetail> conflictDetails;

    @Data
    public static class ConflictDetail implements Serializable {
        private static final long serialVersionUID = 1L;

        /** 操作ID */
        private String actionId;

        /** 操作类型 */
        private String actionType;

        /** 冲突原因 */
        private String reason;

        /** 本地数据 */
        private Object localData;

        /** 服务器数据 */
        private Object serverData;
    }
}
