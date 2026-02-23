package com.cloudflow.oa.service.impl;

import cn.hutool.core.date.DateUtil;
import java.time.LocalDateTime;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.SysAttendanceRecord;
import com.cloudflow.oa.domain.SysAttendanceRule;
import com.cloudflow.oa.mapper.SysAttendanceRecordMapper;
import com.cloudflow.oa.mapper.SysAttendanceRuleMapper;
import com.cloudflow.oa.service.IAttendanceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class AttendanceServiceImpl extends ServiceImpl<SysAttendanceRecordMapper, SysAttendanceRecord> implements IAttendanceService {

    /** 地球平均半径（米） */
    private static final double EARTH_RADIUS = 6371000.0;

    @Autowired
    private SysAttendanceRuleMapper ruleMapper;

    @Override
    public boolean checkIn(SysAttendanceRecord record) {
        // 1. 获取考勤规则
        SysAttendanceRule rule = getCurrentRule();
        if (rule == null) {
            throw new ServiceException("未配置考勤规则，请联系管理员");
        }

        // 1.1 检查规则是否启用
        if (rule.getEnabled() != null && rule.getEnabled() == 0) {
            throw new ServiceException("考勤规则已禁用，无法打卡");
        }

        // 1.2 检查是否为工作日
        if (StrUtil.isNotBlank(rule.getWorkDays())) {
            try {
                JSONArray workDays = JSONUtil.parseArray(rule.getWorkDays());
                // Java Calendar: 1=周日, 2=周一...7=周六 -> 转换为 1=周一...7=周日
                Calendar cal = Calendar.getInstance();
                int dayOfWeek = cal.get(Calendar.DAY_OF_WEEK);
                int isoDay = dayOfWeek == Calendar.SUNDAY ? 7 : dayOfWeek - 1;
                
                boolean isWorkDay = false;
                for (int i = 0; i < workDays.size(); i++) {
                    if (workDays.getInt(i) == isoDay) {
                        isWorkDay = true;
                        break;
                    }
                }
                if (!isWorkDay) {
                    log.info("用户{}在非工作日打卡，标记为加班", record.getUserId());
                    record.setRemark("非工作日打卡");
                }
            } catch (Exception e) {
                log.warn("工作日配置解析失败: {}", e.getMessage());
            }
        }

        // 2. 校验位置 (Geo-fencing) - 使用 Haversine 公式计算距离
        boolean locationValid = false;
        if (StrUtil.isNotBlank(record.getLocation()) && StrUtil.isNotBlank(rule.getLocationPoints())) {
            try {
                String[] userCoords = record.getLocation().split(",");
                double userLat = Double.parseDouble(userCoords[0].trim());
                double userLng = Double.parseDouble(userCoords[1].trim());
                
                int radius = rule.getRadius() != null ? rule.getRadius() : 200;
                JSONArray points = JSONUtil.parseArray(rule.getLocationPoints());
                
                for (int i = 0; i < points.size(); i++) {
                    JSONObject point = points.getJSONObject(i);
                    double pointLat = point.getDouble("lat");
                    double pointLng = point.getDouble("lng");
                    
                    double distance = haversineDistance(userLat, userLng, pointLat, pointLng);
                    log.debug("打卡距离计算: 用户({},{}) -> 打卡点({},{})，距离={}米，允许半径={}米",
                            userLat, userLng, pointLat, pointLng, String.format("%.1f", distance), radius);
                    
                    if (distance <= radius) {
                        locationValid = true;
                        break;
                    }
                }
                
                if (!locationValid) {
                    record.setStatus("4"); // 外勤
                    log.info("用户{}打卡位置不在允许范围内，标记为外勤", record.getUserId());
                }
            } catch (Exception e) {
                log.warn("位置校验失败，跳过地理围栏检查: {}", e.getMessage());
                locationValid = true;
            }
        } else {
            locationValid = true;
        }

        // 3. 校验 Wi-Fi
        boolean wifiValid = false;
        if (StrUtil.isNotBlank(rule.getWifiConfigs()) && StrUtil.isNotBlank(record.getWifiInfo())) {
            try {
                JSONArray wifiConfigs = JSONUtil.parseArray(rule.getWifiConfigs());
                String recordWifi = record.getWifiInfo().trim();
                
                for (int i = 0; i < wifiConfigs.size(); i++) {
                    JSONObject config = wifiConfigs.getJSONObject(i);
                    String ssid = config.getStr("ssid", "");
                    String mac = config.getStr("mac", "");
                    
                    if (StrUtil.isNotBlank(ssid) && recordWifi.equalsIgnoreCase(ssid)) {
                        wifiValid = true;
                        break;
                    }
                    if (StrUtil.isNotBlank(mac) && recordWifi.equalsIgnoreCase(mac)) {
                        wifiValid = true;
                        break;
                    }
                }
                
                if (!wifiValid) {
                    log.info("用户{}的Wi-Fi信息不匹配: {}", record.getUserId(), recordWifi);
                }
            } catch (Exception e) {
                log.warn("Wi-Fi校验失败，跳过检查: {}", e.getMessage());
                wifiValid = true;
            }
        } else {
            wifiValid = true;
        }

        // 4. 判断迟到/早退/严重迟到/旷工
        if ("1".equals(record.getType())) {
            // 签到逻辑
            LocalDateTime now = LocalDateTime.now();
            String checkInTimeStr = DateUtil.format(now, "yyyy-MM-dd") + " " + rule.getCheckInTime();
            LocalDateTime shouldCheckIn = DateUtil.parseLocalDateTime(checkInTimeStr);
            
            // 弹性时间
            if (rule.getElasticMinutes() != null && rule.getElasticMinutes() > 0) {
                shouldCheckIn = shouldCheckIn.plusMinutes(rule.getElasticMinutes());
            }
            
            if (now.isAfter(shouldCheckIn)) {
                // 计算迟到分钟数
                long lateMinutes = java.time.Duration.between(shouldCheckIn, now).toMinutes();
                
                // 判断旷工（迟到超过阈值）
                if (rule.getAbsentMinutes() != null && lateMinutes >= rule.getAbsentMinutes()) {
                    record.setStatus("5"); // 旷工
                    log.info("用户{}迟到{}分钟，超过旷工阈值{}分钟，标记为旷工", 
                            record.getUserId(), lateMinutes, rule.getAbsentMinutes());
                }
                // 判断严重迟到
                else if (rule.getSevereLateMinutes() != null && lateMinutes >= rule.getSevereLateMinutes()) {
                    record.setStatus("6"); // 严重迟到
                    log.info("用户{}迟到{}分钟，超过严重迟到阈值{}分钟", 
                            record.getUserId(), lateMinutes, rule.getSevereLateMinutes());
                }
                // 普通迟到
                else {
                    record.setStatus("2"); // 迟到
                }
            } else {
                record.setStatus("1"); // 正常
            }
        } else if ("2".equals(record.getType())) {
            // 签退逻辑
            LocalDateTime now = LocalDateTime.now();
            String checkOutTimeStr = DateUtil.format(now, "yyyy-MM-dd") + " " + rule.getCheckOutTime();
            LocalDateTime shouldCheckOut = DateUtil.parseLocalDateTime(checkOutTimeStr);
            
            if (now.isBefore(shouldCheckOut)) {
                record.setStatus("3"); // 早退
                log.info("用户{}在下班时间前签退，标记为早退", record.getUserId());
            } else {
                record.setStatus("1"); // 正常
                
                // 判断加班
                if (rule.getOvertimeEnabled() != null && rule.getOvertimeEnabled() == 1) {
                    long overtimeMinutes = java.time.Duration.between(shouldCheckOut, now).toMinutes();
                    int minOt = rule.getOvertimeMinMinutes() != null ? rule.getOvertimeMinMinutes() : 30;
                    if (overtimeMinutes >= minOt) {
                        record.setRemark("加班 " + overtimeMinutes + " 分钟");
                        log.info("用户{}加班{}分钟", record.getUserId(), overtimeMinutes);
                    }
                }
            }
        }

        record.setUserId(UserContext.getUserId());
        record.setCreateTime(LocalDateTime.now());
        record.setTenantId(UserContext.getTenantId());
        
        // 如果位置和Wi-Fi都不在范围内且未被标记为外勤，补充标记
        if (!locationValid && !wifiValid && !"4".equals(record.getStatus())) {
            record.setStatus("4"); // 外勤
        }
        
        log.info("用户{}打卡: 类型={}, 状态={}, 位置校验={}, Wi-Fi校验={}", 
                record.getUserId(), record.getType(), record.getStatus(), locationValid, wifiValid);
        
        return save(record);
    }
    
    /**
     * 使用 Haversine 公式计算两个经纬度坐标之间的距离（米）
     */
    private double haversineDistance(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return EARTH_RADIUS * c;
    }

    @Override
    public SysAttendanceRule getCurrentRule() {
        List<SysAttendanceRule> rules = ruleMapper.selectList(
            new LambdaQueryWrapper<SysAttendanceRule>()
                .eq(SysAttendanceRule::getTenantId, UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L)
        );
        return rules.isEmpty() ? null : rules.get(0);
    }

    @Override
    public boolean saveOrUpdateRule(SysAttendanceRule rule) {
        Long tenantId = UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L;
        rule.setTenantId(tenantId);
        
        if (rule.getRuleId() != null) {
            // 更新
            rule.setUpdateBy(UserContext.getUserName());
            rule.setUpdateTime(LocalDateTime.now());
            return ruleMapper.updateById(rule) > 0;
        } else {
            // 新增 - 检查是否已有规则
            SysAttendanceRule existing = getCurrentRule();
            if (existing != null) {
                // 已有规则，执行更新
                rule.setRuleId(existing.getRuleId());
                rule.setUpdateBy(UserContext.getUserName());
                rule.setUpdateTime(LocalDateTime.now());
                return ruleMapper.updateById(rule) > 0;
            } else {
                // 新增规则
                rule.setCreateBy(UserContext.getUserName());
                rule.setCreateTime(LocalDateTime.now());
                if (rule.getEnabled() == null) {
                    rule.setEnabled(1);
                }
                return ruleMapper.insert(rule) > 0;
            }
        }
    }

    @Override
    public Map<String, Object> getRecordList(Long userId, String startDate, String endDate, Integer pageNum, Integer pageSize) {
        Page<SysAttendanceRecord> page = new Page<>(pageNum != null ? pageNum : 1, pageSize != null ? pageSize : 20);
        
        LambdaQueryWrapper<SysAttendanceRecord> wrapper = new LambdaQueryWrapper<>();
        Long tenantId = UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L;
        wrapper.eq(SysAttendanceRecord::getTenantId, tenantId);
        
        if (userId != null) {
            wrapper.eq(SysAttendanceRecord::getUserId, userId);
        }
        if (StrUtil.isNotBlank(startDate)) {
            wrapper.ge(SysAttendanceRecord::getCreateTime, DateUtil.parse(startDate + " 00:00:00"));
        }
        if (StrUtil.isNotBlank(endDate)) {
            wrapper.le(SysAttendanceRecord::getCreateTime, DateUtil.parse(endDate + " 23:59:59"));
        }
        wrapper.orderByDesc(SysAttendanceRecord::getCreateTime);
        
        Page<SysAttendanceRecord> result = this.page(page, wrapper);
        
        Map<String, Object> map = new HashMap<>();
        map.put("records", result.getRecords());
        map.put("total", result.getTotal());
        map.put("pageNum", result.getCurrent());
        map.put("pageSize", result.getSize());
        return map;
    }

    @Override
    public Map<String, Object> getMonthlyStatistics(Long userId, String month) {
        // month 格式: yyyy-MM
        String startDate = month + "-01";
        String endDate = month + "-31"; // 简化处理，MyBatis-Plus 会自动处理
        
        Long targetUserId = userId != null ? userId : UserContext.getUserId();
        Long tenantId = UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L;
        
        LambdaQueryWrapper<SysAttendanceRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAttendanceRecord::getTenantId, tenantId)
               .eq(SysAttendanceRecord::getUserId, targetUserId)
               .ge(SysAttendanceRecord::getCreateTime, DateUtil.parse(startDate + " 00:00:00"))
               .le(SysAttendanceRecord::getCreateTime, DateUtil.parse(endDate + " 23:59:59"));
        
        List<SysAttendanceRecord> records = this.list(wrapper);
        
        // 统计各状态数量
        int normalCount = 0;   // 正常
        int lateCount = 0;     // 迟到
        int earlyCount = 0;    // 早退
        int outsideCount = 0;  // 外勤
        int absentCount = 0;   // 旷工
        int severeLateCount = 0; // 严重迟到
        int totalDays = 0;     // 打卡天数
        
        Set<String> checkedDays = new HashSet<>();
        
        for (SysAttendanceRecord record : records) {
            String day = DateUtil.format(record.getCreateTime(), "yyyy-MM-dd");
            checkedDays.add(day);
            
            String status = record.getStatus();
            if ("1".equals(status)) normalCount++;
            else if ("2".equals(status)) lateCount++;
            else if ("3".equals(status)) earlyCount++;
            else if ("4".equals(status)) outsideCount++;
            else if ("5".equals(status)) absentCount++;
            else if ("6".equals(status)) severeLateCount++;
        }
        totalDays = checkedDays.size();
        
        Map<String, Object> stats = new HashMap<>();
        stats.put("month", month);
        stats.put("userId", targetUserId);
        stats.put("totalDays", totalDays);
        stats.put("normalCount", normalCount);
        stats.put("lateCount", lateCount);
        stats.put("earlyCount", earlyCount);
        stats.put("outsideCount", outsideCount);
        stats.put("absentCount", absentCount);
        stats.put("severeLateCount", severeLateCount);
        stats.put("totalRecords", records.size());
        
        return stats;
    }
}
