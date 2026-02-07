package com.cloudflow.workflow.service.impl;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.workflow.domain.SysAttendanceRecord;
import com.cloudflow.workflow.domain.SysAttendanceRule;
import com.cloudflow.workflow.mapper.SysAttendanceRecordMapper;
import com.cloudflow.workflow.mapper.SysAttendanceRuleMapper;
import com.cloudflow.workflow.service.IAttendanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

@Service
public class AttendanceServiceImpl extends ServiceImpl<SysAttendanceRecordMapper, SysAttendanceRecord> implements IAttendanceService {

    @Autowired
    private SysAttendanceRuleMapper ruleMapper;

    @Override
    public boolean checkIn(SysAttendanceRecord record) {
        // 1. 获取考勤规则
        SysAttendanceRule rule = getCurrentRule();
        if (rule == null) {
            throw new ServiceException("未配置考勤规则，请联系管理员");
        }

        // 2. 校验位置 (Geo-fencing) - 简化版：假设 location 是 "lat,lng"
        // TODO: 引入 Geocalc 或使用 SQL ST_Distance
        if (StrUtil.isNotBlank(record.getLocation()) && StrUtil.isNotBlank(rule.getLocationPoints())) {
            // 解析规则中的坐标点，计算距离
            // 这里暂且跳过复杂计算，假设只要传了位置就算外勤或正常
            // 实际项目需实现 Haversine 公式
        }

        // 3. 校验 Wi-Fi
        if (StrUtil.isNotBlank(rule.getWifiConfigs()) && StrUtil.isNotBlank(record.getWifiInfo())) {
             // 检查 SSID/MAC 是否匹配
        }

        // 4. 判断迟到/早退
        // 假设 type=1 是签到
        if ("1".equals(record.getType())) {
            String checkInTimeStr = DateUtil.format(new Date(), "yyyy-MM-dd") + " " + rule.getCheckInTime();
            Date shouldCheckIn = DateUtil.parse(checkInTimeStr);
            // 弹性时间
            if (rule.getElasticMinutes() != null && rule.getElasticMinutes() > 0) {
                 shouldCheckIn = DateUtil.offsetMinute(shouldCheckIn, rule.getElasticMinutes());
            }
            
            if (new Date().after(shouldCheckIn)) {
                record.setStatus("2"); // 迟到
            } else {
                record.setStatus("1"); // 正常
            }
        } 
        // type=2 是签退
        else if ("2".equals(record.getType())) {
             // 类似逻辑判断早退
             record.setStatus("1");
        }

        record.setUserId(UserContext.getUserId());
        record.setCreateTime(new Date());
        record.setTenantId(UserContext.getTenantId());
        
        return save(record);
    }

    @Override
    public SysAttendanceRule getCurrentRule() {
        // 简单实现：查询当前租户的第一个规则
        // 实际应根据 UserContext.getDeptId() 查找部门关联的规则
        List<SysAttendanceRule> rules = ruleMapper.selectList(
            new LambdaQueryWrapper<SysAttendanceRule>()
                .eq(SysAttendanceRule::getTenantId, UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L)
        );
        return rules.isEmpty() ? null : rules.get(0);
    }
}
