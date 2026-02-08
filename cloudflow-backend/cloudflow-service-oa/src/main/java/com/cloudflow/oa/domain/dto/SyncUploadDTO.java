package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

/**
 * 离线数据上传 DTO
 */
@Data
public class SyncUploadDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 设备ID */
    private String deviceId;

    /** 上传时间戳 */
    private String timestamp;

    /** 待同步的操作列表 */
    private List<SyncAction> data;

    @Data
    public static class SyncAction implements Serializable {
        private static final long serialVersionUID = 1L;

        /** 操作类型 */
        private String type;

        /** 操作ID */
        private String id;

        /** 操作动作 */
        private String action;

        /** 操作数据 */
        private Object payload;

        /** 本地时间戳 */
        private String localTimestamp;
    }
}
