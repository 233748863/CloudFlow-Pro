package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.util.Date;

/**
 * 岗位信息表
 * 对应数据库表 sys_post
 *
 * @author CloudFlow
 */
@Data
@TableName("sys_post")
public class SysPost {

    /** 岗位ID */
    @TableId(type = IdType.AUTO)
    private Long postId;

    /** 岗位编码（唯一标识，如 CEO、CTO、DEV） */
    private String postCode;

    /** 岗位名称 */
    private String postName;

    /** 显示排序 */
    private Integer postSort;

    /** 状态（0正常 1停用） */
    private String status;

    private String createBy;

    private Date createTime;

    private String updateBy;

    private Date updateTime;

    /** 备注 */
    private String remark;

    /** 租户ID */
    private Long tenantId;
}
