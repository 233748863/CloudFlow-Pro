package com.cloudflow.oa.service.impl;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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

import java.util.Date;
import java.util.List;

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

        // 2. 校验位置 (Geo-fencing) - 使用 Haversine 公式计算距离
        boolean locationValid = false;
        if (StrUtil.isNotBlank(record.getLocation()) && StrUtil.isNotBlank(rule.getLocationPoints())) {
            try {
                // 解析打卡位置 "lat,lng"
                String[] userCoords = record.getLocation().split(",");
                double userLat = Double.parseDouble(userCoords[0].trim());
                double userLng = Double.parseDouble(userCoords[1].trim());
                
                // 解析规则中的打卡点坐标集合 JSON: [{"lat":30.0,"lng":120.0,"name":"总部"}]
                int radius = rule.getRadius() != null ? rule.getRadius() : 200; // 默认200米
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
                    // 不在任何打卡点范围内，标记为外勤
                    record.setStatus("4"); // 外勤
                    log.info("用户{}打卡位置不在允许范围内，标记为外勤", record.getUserId());
                }
            } catch (Exception e) {
                log.warn("位置校验失败，跳过地理围栏检查: {}", e.getMessage());
                locationValid = true; // 解析失败时不阻止打卡
            }
        } else {
            locationValid = true; // 未配置位置规则时默认通过
        }

        // 3. 校验 Wi-Fi
        boolean wifiValid = false;
        if (StrUtil.isNotBlank(rule.getWifiConfigs()) && StrUtil.isNotBlank(record.getWifiInfo())) {
            try {
                // Wi-Fi配置 JSON: [{"ssid":"Office-WiFi","mac":"AA:BB:CC:DD:EE:FF"}]
                JSONArray wifiConfigs = JSONUtil.parseArray(rule.getWifiConfigs());
                String recordWifi = record.getWifiInfo().trim();
                
                for (int i = 0; i < wifiConfigs.size(); i++) {
                    JSONObject config = wifiConfigs.getJSONObject(i);
                    String ssid = config.getStr("ssid", "");
                    String mac = config.getStr("mac", "");
                    
                    // 匹配 SSID 或 MAC 地址（不区分大小写）
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
                wifiValid = true; // 解析失败时不阻止打卡
            }
        } else {
            wifiValid = true; // 未配置Wi-Fi规则时默认通过
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
        
        // 如果位置和Wi-Fi都不在范围内且未被标记为外勤，补充地址信息
        if (!locationValid && !wifiValid && !"4".equals(record.getStatus())) {
            record.setStatus("4"); // 外勤
        }
        
        log.info("用户{}打卡: 类型={}, 状态={}, 位置校验={}, Wi-Fi校验={}", 
                record.getUserId(), record.getType(), record.getStatus(), locationValid, wifiValid);
        
        return save(record);
    }
    
    /**
     * 使用 Haversine 公式计算两个经纬度坐标之间的距离（米）
     *
     * @param lat1 纬度1
     * @param lng1 经度1
     * @param lat2 纬度2
     * @param lng2 经度2
     * @return 距离（米）
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
        // 简单实现：查询当前租户的第一个规则
        // 实际应根据 UserContext.getDeptId() 查找部门关联的规则
        List<SysAttendanceRule> rules = ruleMapper.selectList(
            new LambdaQueryWrapper<SysAttendanceRule>()
                .eq(SysAttendanceRule::getTenantId, UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L)
        );
        return rules.isEmpty() ? null : rules.get(0);
    }
}
