package com.cloudflow.oa.service.impl;

import cn.hutool.core.date.DateUtil;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
public class AttendanceServiceImpl extends ServiceImpl<SysAttendanceRecordMapper, SysAttendanceRecord> implements IAttendanceService {

    /** 地球平均半径，单位米。 */
    private static final double EARTH_RADIUS = 6371000.0;

    @Autowired
    private SysAttendanceRuleMapper ruleMapper;

    @Override
    public boolean checkIn(SysAttendanceRecord record) {
        // 统一使用服务端时间入库。例：前端页面停留了 5 分钟再点打卡，也以服务端收到请求的时间为准。
        LocalDateTime checkTime = LocalDateTime.now();
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = getCurrentTenantId();
        record.setUserId(currentUserId);
        record.setTenantId(currentTenantId);
        record.setCheckTime(checkTime);
        record.setCreateTime(checkTime);

        SysAttendanceRule rule = getCurrentRule();
        if (rule == null) {
            throw new ServiceException("未配置考勤规则，请联系管理员");
        }
        if (rule.getEnabled() != null && rule.getEnabled() == 0) {
            throw new ServiceException("考勤规则已禁用，无法打卡");
        }

        if (StrUtil.isNotBlank(rule.getWorkDays())) {
            try {
                JSONArray workDays = JSONUtil.parseArray(rule.getWorkDays());
                // 例如：周一返回 1、周日返回 7，这样能直接和规则中的 [1,2,3,4,5] 对齐。
                int isoDay = checkTime.getDayOfWeek().getValue();
                boolean isWorkDay = false;
                for (int i = 0; i < workDays.size(); i++) {
                    if (workDays.getInt(i) == isoDay) {
                        isWorkDay = true;
                        break;
                    }
                }
                if (!isWorkDay) {
                    record.setRemark("非工作日打卡");
                    log.info("用户{}在非工作日打卡，备注已标记为非工作日打卡", record.getUserId());
                }
            } catch (Exception e) {
                log.warn("工作日配置解析失败，跳过工作日校验: {}", e.getMessage());
            }
        }

        boolean locationValid = true;
        if (StrUtil.isNotBlank(record.getLocation()) && StrUtil.isNotBlank(rule.getLocationPoints())) {
            locationValid = false;
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

                    log.debug(
                            "打卡距离计算: 用户({},{}) -> 打卡点({},{})，距离={}米，允许半径={}米",
                            userLat,
                            userLng,
                            pointLat,
                            pointLng,
                            String.format("%.1f", distance),
                            radius
                    );

                    if (distance <= radius) {
                        locationValid = true;
                        break;
                    }
                }

                if (!locationValid) {
                    record.setStatus("4");
                    log.info("用户{}打卡位置不在允许范围内，标记为外勤", record.getUserId());
                }
            } catch (Exception e) {
                log.warn("位置校验失败，跳过地理围栏检查: {}", e.getMessage());
                locationValid = true;
            }
        }

        boolean wifiValid = true;
        if (StrUtil.isNotBlank(rule.getWifiConfigs()) && StrUtil.isNotBlank(record.getWifiInfo())) {
            wifiValid = false;
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
                    log.info("用户{}的 Wi-Fi 信息未匹配规则: {}", record.getUserId(), recordWifi);
                }
            } catch (Exception e) {
                log.warn("Wi-Fi 校验失败，跳过校验: {}", e.getMessage());
                wifiValid = true;
            }
        }

        if ("1".equals(record.getType())) {
            // 例如：09:00 上班、弹性 30 分钟，则 09:31 开始判定迟到。
            String checkInTimeStr = DateUtil.format(checkTime, "yyyy-MM-dd") + " " + rule.getCheckInTime();
            LocalDateTime shouldCheckIn = DateUtil.parseLocalDateTime(checkInTimeStr);
            if (rule.getElasticMinutes() != null && rule.getElasticMinutes() > 0) {
                shouldCheckIn = shouldCheckIn.plusMinutes(rule.getElasticMinutes());
            }

            if (checkTime.isAfter(shouldCheckIn)) {
                long lateMinutes = Duration.between(shouldCheckIn, checkTime).toMinutes();
                if (rule.getAbsentMinutes() != null && lateMinutes >= rule.getAbsentMinutes()) {
                    record.setStatus("5");
                    log.info("用户{}迟到{}分钟，超过旷工阈值{}分钟，标记为旷工", record.getUserId(), lateMinutes, rule.getAbsentMinutes());
                } else if (rule.getSevereLateMinutes() != null && lateMinutes >= rule.getSevereLateMinutes()) {
                    record.setStatus("6");
                    log.info("用户{}迟到{}分钟，超过严重迟到阈值{}分钟", record.getUserId(), lateMinutes, rule.getSevereLateMinutes());
                } else {
                    record.setStatus("2");
                }
            } else {
                record.setStatus("1");
            }
        } else if ("2".equals(record.getType())) {
            String checkOutTimeStr = DateUtil.format(checkTime, "yyyy-MM-dd") + " " + rule.getCheckOutTime();
            LocalDateTime shouldCheckOut = DateUtil.parseLocalDateTime(checkOutTimeStr);

            if (checkTime.isBefore(shouldCheckOut)) {
                record.setStatus("3");
                log.info("用户{}在下班时间前签退，标记为早退", record.getUserId());
            } else {
                record.setStatus("1");
                if (rule.getOvertimeEnabled() != null && rule.getOvertimeEnabled() == 1) {
                    long overtimeMinutes = Duration.between(shouldCheckOut, checkTime).toMinutes();
                    int minOt = rule.getOvertimeMinMinutes() != null ? rule.getOvertimeMinMinutes() : 30;
                    if (overtimeMinutes >= minOt) {
                        record.setRemark("加班 " + overtimeMinutes + " 分钟");
                        log.info("用户{}加班{}分钟", record.getUserId(), overtimeMinutes);
                    }
                }
            }
        }

        if (!locationValid && !wifiValid && !"4".equals(record.getStatus())) {
            record.setStatus("4");
        }

        log.info(
                "用户{}打卡: 类型={}, 状态={}, 位置校验={}, Wi-Fi校验={}, 打卡时间={}",
                record.getUserId(),
                record.getType(),
                record.getStatus(),
                locationValid,
                wifiValid,
                record.getCheckTime()
        );
        return save(record);
    }

    /**
     * 使用 Haversine 公式计算两个经纬度坐标之间的距离，单位米。
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
                        .eq(SysAttendanceRule::getTenantId, getCurrentTenantId())
        );
        return rules.isEmpty() ? null : rules.get(0);
    }

    @Override
    public boolean saveOrUpdateRule(SysAttendanceRule rule) {
        Long tenantId = getCurrentTenantId();
        rule.setTenantId(tenantId);

        if (rule.getRuleId() != null) {
            rule.setUpdateBy(UserContext.getUserName());
            rule.setUpdateTime(LocalDateTime.now());
            return ruleMapper.updateById(rule) > 0;
        }

        SysAttendanceRule existing = getCurrentRule();
        if (existing != null) {
            rule.setRuleId(existing.getRuleId());
            rule.setUpdateBy(UserContext.getUserName());
            rule.setUpdateTime(LocalDateTime.now());
            return ruleMapper.updateById(rule) > 0;
        }

        rule.setCreateBy(UserContext.getUserName());
        rule.setCreateTime(LocalDateTime.now());
        if (rule.getEnabled() == null) {
            rule.setEnabled(1);
        }
        return ruleMapper.insert(rule) > 0;
    }

    @Override
    public Map<String, Object> getRecordList(Long userId, String startDate, String endDate, Integer pageNum, Integer pageSize) {
        Page<SysAttendanceRecord> page = new Page<>(pageNum != null ? pageNum : 1, pageSize != null ? pageSize : 20);
        LambdaQueryWrapper<SysAttendanceRecord> wrapper = new LambdaQueryWrapper<>();

        wrapper.eq(SysAttendanceRecord::getTenantId, getCurrentTenantId());
        if (userId != null) {
            wrapper.eq(SysAttendanceRecord::getUserId, userId);
        }
        if (StrUtil.isNotBlank(startDate)) {
            wrapper.ge(SysAttendanceRecord::getCheckTime, DateUtil.parseLocalDateTime(startDate + " 00:00:00"));
        }
        if (StrUtil.isNotBlank(endDate)) {
            wrapper.le(SysAttendanceRecord::getCheckTime, DateUtil.parseLocalDateTime(endDate + " 23:59:59"));
        }
        wrapper.orderByDesc(SysAttendanceRecord::getCheckTime);

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
        String startDate = month + "-01";
        String endDate = month + "-31";
        Long targetUserId = userId != null ? userId : UserContext.getUserId();

        LambdaQueryWrapper<SysAttendanceRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAttendanceRecord::getTenantId, getCurrentTenantId())
                .eq(SysAttendanceRecord::getUserId, targetUserId)
                .ge(SysAttendanceRecord::getCheckTime, DateUtil.parseLocalDateTime(startDate + " 00:00:00"))
                .le(SysAttendanceRecord::getCheckTime, DateUtil.parseLocalDateTime(endDate + " 23:59:59"));

        List<SysAttendanceRecord> records = this.list(wrapper);

        int normalCount = 0;
        int lateCount = 0;
        int earlyCount = 0;
        int outsideCount = 0;
        int absentCount = 0;
        int severeLateCount = 0;
        Set<String> checkedDays = new HashSet<>();

        for (SysAttendanceRecord record : records) {
            LocalDateTime recordTime = record.getCheckTime() != null ? record.getCheckTime() : record.getCreateTime();
            if (recordTime != null) {
                checkedDays.add(DateUtil.format(recordTime, "yyyy-MM-dd"));
            }

            String status = record.getStatus();
            if ("1".equals(status)) {
                normalCount++;
            } else if ("2".equals(status)) {
                lateCount++;
            } else if ("3".equals(status)) {
                earlyCount++;
            } else if ("4".equals(status)) {
                outsideCount++;
            } else if ("5".equals(status)) {
                absentCount++;
            } else if ("6".equals(status)) {
                severeLateCount++;
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("month", month);
        stats.put("userId", targetUserId);
        stats.put("totalDays", checkedDays.size());
        stats.put("normalCount", normalCount);
        stats.put("lateCount", lateCount);
        stats.put("earlyCount", earlyCount);
        stats.put("outsideCount", outsideCount);
        stats.put("absentCount", absentCount);
        stats.put("severeLateCount", severeLateCount);
        stats.put("totalRecords", records.size());
        return stats;
    }

    private Long getCurrentTenantId() {
        return UserContext.getTenantId() != null ? UserContext.getTenantId() : 100000L;
    }
}
