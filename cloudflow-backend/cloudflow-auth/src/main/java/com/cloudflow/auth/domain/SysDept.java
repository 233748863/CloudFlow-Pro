package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Data
@TableName("sys_dept")
public class SysDept {
    @TableId(type = IdType.AUTO)
    private Long deptId;
    private Long tenantId;
    private Long parentId;
    private String ancestors;
    private String deptName;
    private Integer orderNum;
    private String leader;
    private String phone;
    private String email;
    /** 节假日日历归属，空值时回退租户默认日历。 */
    private Long holidayCalendarId;

    @JsonIgnore
    @TableField(exist = false)
    @Setter(AccessLevel.NONE)
    private boolean holidayCalendarIdSpecified;
    private String status;
    private Integer deleted;
    
    @TableField(exist = false)
    private List<SysDept> children = new ArrayList<>();


    @Version
    private Integer version;

    @JsonSetter("holidayCalendarId")
    public void setHolidayCalendarId(Long holidayCalendarId) {
        this.holidayCalendarId = holidayCalendarId;
        this.holidayCalendarIdSpecified = true;
    }
}
