package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
public class ImTodoRow {
    private Long mappingId;
    private Long tenantId;
    private Long configId;
    private String taskId;
    private Integer assignmentVersion;
    private Long receiverUserId;
    private String imType;
    @JsonIgnore
    private String imTodoId;
    @JsonIgnore
    private String imUserId;
    @JsonIgnore
    private String cardKeyHash;
    private String status;
    private Long deliveryId;
    private String lastEventKey;
    private Integer version;
    private String receiverName;
    @com.fasterxml.jackson.annotation.JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private java.time.LocalDateTime createTime;
}
