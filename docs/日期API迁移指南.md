# Date API 迁移到 LocalDateTime API 指南

## 概述

在将 `java.util.Date` 类型迁移到 `LocalDateTime` 后，还需要迁移相关的 API 调用。本文档提供详细的迁移指南。

## 自动迁移 vs 手动迁移

### 可自动迁移的 API
以下 API 可以通过 `migrate_date_api.py` 脚本自动迁移：

1. `new Date()` → `LocalDateTime.now()`
2. `.before(other)` → `.isBefore(other)`
3. `.after(other)` → `.isAfter(other)`
4. `new SimpleDateFormat("pattern")` → `DateTimeFormatter.ofPattern("pattern")`

### 需要手动迁移的 API
以下 API 需要根据具体上下文手动迁移：

1. `date.getTime()` - 获取时间戳
2. `date.setTime(long)` - 设置时间
3. `Calendar` 操作 - 日期计算
4. `SimpleDateFormat.format(date)` - 格式化
5. `SimpleDateFormat.parse(string)` - 解析

## 详细迁移指南

### 1. new Date() → LocalDateTime.now()

**迁移前：**
```java
Date now = new Date();
user.setCreateTime(new Date());
```

**迁移后：**
```java
LocalDateTime now = LocalDateTime.now();
user.setCreateTime(LocalDateTime.now());
```

**注意事项：**
- 简单直接的替换
- 无需额外处理

---

### 2. date.getTime() - 获取时间戳

#### 场景 A: 计算时间差（毫秒）

**迁移前：**
```java
long duration = endTime.getTime() - startTime.getTime();
long durationSeconds = duration / 1000;
```

**迁移后：**
```java
import java.time.Duration;

Duration duration = Duration.between(startTime, endTime);
long durationMillis = duration.toMillis();
long durationSeconds = duration.getSeconds();
```

**优势：**
- 更清晰的语义
- 避免手动计算
- 类型安全

#### 场景 B: 获取 Unix 时间戳

**迁移前：**
```java
long timestamp = date.getTime();
```

**迁移后：**
```java
import java.time.ZoneId;

long timestamp = date.atZone(ZoneId.systemDefault())
                     .toInstant()
                     .toEpochMilli();
```

**简化版（如果只需要秒级时间戳）：**
```java
long timestampSeconds = date.atZone(ZoneId.systemDefault())
                            .toEpochSecond();
```

#### 场景 C: 日期加减（使用时间戳）

**迁移前：**
```java
Date tomorrow = new Date(now.getTime() + 86400000L); // +1天
Date nextWeek = new Date(now.getTime() + 86400000L * 7); // +7天
```

**迁移后：**
```java
LocalDateTime tomorrow = now.plusDays(1);
LocalDateTime nextWeek = now.plusWeeks(1);
// 或
LocalDateTime nextWeek = now.plusDays(7);
```

**优势：**
- 不需要记住毫秒数
- 代码更易读
- 避免魔法数字

---

### 3. date.setTime() - 设置时间

**迁移前：**
```java
Date date = new Date();
date.setTime(timestamp);
```

**迁移后：**
```java
import java.time.Instant;
import java.time.ZoneId;

LocalDateTime date = LocalDateTime.ofInstant(
    Instant.ofEpochMilli(timestamp),
    ZoneId.systemDefault()
);
```

**注意：**
- `LocalDateTime` 是不可变对象，不能 set
- 需要创建新对象

---

### 4. Calendar 操作 - 日期计算

#### 场景 A: 日期加减

**迁移前：**
```java
Calendar cal = Calendar.getInstance();
cal.setTime(date);
cal.add(Calendar.DAY_OF_MONTH, 30);
Date result = cal.getTime();
```

**迁移后：**
```java
LocalDateTime result = date.plusDays(30);
```

#### 场景 B: 设置特定字段

**迁移前：**
```java
Calendar cal = Calendar.getInstance();
cal.setTime(date);
cal.set(Calendar.HOUR_OF_DAY, 23);
cal.set(Calendar.MINUTE, 59);
cal.set(Calendar.SECOND, 59);
cal.set(Calendar.MILLISECOND, 999);
Date endOfDay = cal.getTime();
```

**迁移后：**
```java
LocalDateTime endOfDay = date
    .withHour(23)
    .withMinute(59)
    .withSecond(59)
    .withNano(999_999_999);

// 或使用更简洁的方式
LocalDateTime endOfDay = date.toLocalDate()
    .atTime(23, 59, 59, 999_999_999);
```

#### 场景 C: 获取月初/月末

**迁移前：**
```java
Calendar cal = Calendar.getInstance();
cal.set(Calendar.DAY_OF_MONTH, 1);
cal.set(Calendar.HOUR_OF_DAY, 0);
cal.set(Calendar.MINUTE, 0);
cal.set(Calendar.SECOND, 0);
Date monthStart = cal.getTime();
```

**迁移后：**
```java
import java.time.temporal.TemporalAdjusters;

LocalDateTime monthStart = LocalDateTime.now()
    .with(TemporalAdjusters.firstDayOfMonth())
    .withHour(0)
    .withMinute(0)
    .withSecond(0)
    .withNano(0);

// 或更简洁
LocalDateTime monthStart = LocalDate.now()
    .withDayOfMonth(1)
    .atStartOfDay();
```

---

### 5. SimpleDateFormat - 格式化和解析

#### 场景 A: 格式化日期

**迁移前：**
```java
SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
String formatted = sdf.format(date);
```

**迁移后：**
```java
import java.time.format.DateTimeFormatter;

DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String formatted = date.format(formatter);
```

**常用格式化器（推荐使用预定义的）：**
```java
// ISO 格式
String iso = date.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
// 2026-02-23T11:08:00

// 自定义格式
DateTimeFormatter custom = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String formatted = date.format(custom);
// 2026-02-23 11:08:00
```

#### 场景 B: 解析日期字符串

**迁移前：**
```java
SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
Date date = sdf.parse(dateString);
```

**迁移后：**
```java
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
LocalDateTime date = LocalDateTime.parse(dateString, formatter);
```

**处理只有日期的字符串：**
```java
// 解析 "yyyy-MM-dd" 格式
LocalDate localDate = LocalDate.parse(dateString, 
    DateTimeFormatter.ofPattern("yyyy-MM-dd"));

// 转换为 LocalDateTime（时间设为 00:00:00）
LocalDateTime dateTime = localDate.atStartOfDay();
```

---

### 6. 日期比较

#### before() / after()

**迁移前：**
```java
if (date1.before(date2)) {
    // date1 在 date2 之前
}

if (date1.after(date2)) {
    // date1 在 date2 之后
}
```

**迁移后：**
```java
if (date1.isBefore(date2)) {
    // date1 在 date2 之前
}

if (date1.isAfter(date2)) {
    // date1 在 date2 之后
}

// 额外的比较方法
if (date1.isEqual(date2)) {
    // 相等
}
```

---

### 7. 特殊场景处理

#### 场景 A: 数据库查询条件

**迁移前：**
```java
Date start = parseDate(startDateStr);
Date end = new Date(end.getTime() + 86400000L); // 加一天
queryWrapper.ge(Entity::getCreateTime, start)
            .le(Entity::getCreateTime, end);
```

**迁移后：**
```java
LocalDateTime start = LocalDate.parse(startDateStr).atStartOfDay();
LocalDateTime end = LocalDate.parse(endDateStr).atTime(23, 59, 59);
queryWrapper.ge(Entity::getCreateTime, start)
            .le(Entity::getCreateTime, end);
```

#### 场景 B: 时间阈值判断

**迁移前：**
```java
Date threshold = new Date(System.currentTimeMillis() - (long) hours * 3600 * 1000);
if (task.getCreateTime().before(threshold)) {
    // 超时
}
```

**迁移后：**
```java
LocalDateTime threshold = LocalDateTime.now().minusHours(hours);
if (task.getCreateTime().isBefore(threshold)) {
    // 超时
}
```

#### 场景 C: 生成日期相关的 Key

**迁移前：**
```java
String dailyKey = "metrics:daily:" + 
    new SimpleDateFormat("yyyyMMdd").format(new Date());
```

**迁移后：**
```java
String dailyKey = "metrics:daily:" + 
    LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

// 或使用 BASIC_ISO_DATE
String dailyKey = "metrics:daily:" + 
    LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
```

---

## 常用 LocalDateTime API 速查

### 创建

```java
// 当前时间
LocalDateTime now = LocalDateTime.now();

// 指定日期时间
LocalDateTime specific = LocalDateTime.of(2026, 2, 23, 11, 8, 0);

// 从 LocalDate 创建
LocalDateTime fromDate = LocalDate.now().atStartOfDay();
LocalDateTime fromDate2 = LocalDate.now().atTime(14, 30);

// 从时间戳创建
LocalDateTime fromTimestamp = LocalDateTime.ofInstant(
    Instant.ofEpochMilli(timestamp),
    ZoneId.systemDefault()
);
```

### 获取字段

```java
int year = date.getYear();
int month = date.getMonthValue(); // 1-12
int day = date.getDayOfMonth();
int hour = date.getHour();
int minute = date.getMinute();
int second = date.getSecond();
```

### 修改（返回新对象）

```java
// 加减
LocalDateTime tomorrow = date.plusDays(1);
LocalDateTime nextWeek = date.plusWeeks(1);
LocalDateTime nextMonth = date.plusMonths(1);
LocalDateTime yesterday = date.minusDays(1);

// 设置
LocalDateTime modified = date
    .withYear(2027)
    .withMonth(3)
    .withDayOfMonth(15)
    .withHour(14)
    .withMinute(30);
```

### 比较

```java
boolean isBefore = date1.isBefore(date2);
boolean isAfter = date1.isAfter(date2);
boolean isEqual = date1.isEqual(date2);
```

### 格式化

```java
// 使用预定义格式
String iso = date.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

// 自定义格式
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String formatted = date.format(formatter);
```

### 解析

```java
LocalDateTime parsed = LocalDateTime.parse("2026-02-23T11:08:00");

DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
LocalDateTime parsed2 = LocalDateTime.parse("2026-02-23 11:08:00", formatter);
```

---

## 迁移检查清单

完成迁移后，请检查以下项目：

- [ ] 所有 `new Date()` 已替换为 `LocalDateTime.now()`
- [ ] 所有 `.before()` 已替换为 `.isBefore()`
- [ ] 所有 `.after()` 已替换为 `.isAfter()`
- [ ] 所有 `SimpleDateFormat` 已替换为 `DateTimeFormatter`
- [ ] 所有 `date.getTime()` 已根据场景正确迁移
- [ ] 所有 `Calendar` 操作已替换为 `LocalDateTime` API
- [ ] 所有日期计算使用 `plus/minus` 方法
- [ ] 所有日期格式化使用 `DateTimeFormatter`
- [ ] 所有日期解析使用 `LocalDateTime.parse()`
- [ ] 代码编译通过
- [ ] 单元测试通过
- [ ] 集成测试通过

---

## 常见问题

### Q1: LocalDateTime 没有时区信息，如何处理时区？

**A:** 如果需要时区支持，使用 `ZonedDateTime`：

```java
import java.time.ZonedDateTime;
import java.time.ZoneId;

ZonedDateTime zonedDateTime = ZonedDateTime.now(ZoneId.of("Asia/Shanghai"));
```

### Q2: 如何与数据库交互？

**A:** MyBatis-Plus 自动支持 `LocalDateTime`，无需额外配置。

### Q3: 如何与前端交互？

**A:** 使用 `@JsonFormat` 注解控制 JSON 序列化格式：

```java
@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
private LocalDateTime createTime;
```

### Q4: 性能如何？

**A:** `LocalDateTime` 性能优于 `Date`：
- 不可变对象，线程安全
- 无需同步
- 更少的对象创建

---

## 参考资料

- [Java 8 Date Time API 官方文档](https://docs.oracle.com/javase/8/docs/api/java/time/package-summary.html)
- [LocalDateTime JavaDoc](https://docs.oracle.com/javase/8/docs/api/java/time/LocalDateTime.html)
- [DateTimeFormatter JavaDoc](https://docs.oracle.com/javase/8/docs/api/java/time/format/DateTimeFormatter.html)

---

**文档版本**: 1.0  
**最后更新**: 2026-02-23  
**作者**: Kiro AI Assistant
