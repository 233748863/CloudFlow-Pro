package com.cloudflow.common.redis.core;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 字典数据读取工具
 * <p>
 * 与 {@link SysConfigHelper} 同层级，专门处理 sys_dict_type / sys_dict_data 字典。
 * 字典数据由 cloudflow-auth 的 SysDictCacheLoader 在启动时预热写入 Redis：
 * Redis Key 格式：{@code sys:dict:data:{dictType}} -> {@code List<DictItem>}（JSON）。
 * 缓存在 RedisCache 的 GLOBAL_PREFIXES 中，不受租户隔离。
 * <p>
 * 主要用途：
 * <ul>
 *   <li>"按数值找档位"：CRM 应收逾期 30/60/90、合同到期 30/90、HR 个税累进、工作流效能改进等</li>
 *   <li>替代各业务 Service 内重复实现的"if-else 升序档位匹配"</li>
 * </ul>
 * <p>
 * <b>字典约定（每类字典 dict_value 的含义不同，调用方务必区分）：</b>
 * <ul>
 *   <li>{@code crm_receivable_overdue_tier} / {@code crm_contract_expire_tier}：
 *       dict_value = 本档天数 <b>上限</b>（含），<b>升序</b>匹配；末档建议设为 99999 表示不限</li>
 *   <li>{@code hr_personal_income_tax}：
 *       dict_value = 本档应税所得上限；list_class = 税率(0~1)；css_class = 速算扣除数；
 *       末档 dict_value &gt;= 99999999 视为不封顶</li>
 *   <li>{@code workflow_efficiency_tier}：
 *       dict_value = 本档百分比 <b>下限</b>，<b>降序</b>匹配（与 CRM 档位语义相反）</li>
 * </ul>
 * {@link #findTierByValue(String, java.math.BigDecimal)} 仅适用于"上限+升序"类字典；
 * "下限+降序"类字典需调用方自行排序遍历（参见 WorkflowP4ServiceImpl#calculateEffectiveness）。
 *
 * @author CloudFlow
 */
@Component
public class SysDictHelper {

    private static final Logger log = LoggerFactory.getLogger(SysDictHelper.class);

    /** 字典数据 Redis Key 前缀（全局，在 RedisCache 的 GLOBAL_PREFIXES 中） */
    public static final String DICT_DATA_PREFIX = "sys:dict:data:";

    @Autowired
    private RedisCache redisCache;

    /**
     * 已记录过空命中日志的 dictType 集合，防止每次读字典都打日志（日志洪泛防护）。
     * A7 治理：跨服务启动顺序问题首读时拿到空字典会走 fallback，加日志便于诊断。
     */
    private final Set<String> emptyHitLogged = ConcurrentHashMap.newKeySet();

    /**
     * 读取指定字典类型的全部数据，按 sort 升序
     */
    @SuppressWarnings("unchecked")
    public List<DictItem> getDictData(String dictType) {
        if (dictType == null || dictType.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            Object cached = redisCache.getCacheObject(DICT_DATA_PREFIX + dictType);
            if (cached instanceof List) {
                List<DictItem> list = (List<DictItem>) cached;
                if (list.isEmpty() && emptyHitLogged.add(dictType)) {
                    log.info("字典 {} 缓存命中但为空，调用方将走 fallback（可能字典确实未配置数据）", dictType);
                }
                return list;
            }
            // 未命中缓存（可能是字典预热未完成或字典不存在）
            if (emptyHitLogged.add(dictType)) {
                log.info("字典 {} 未命中 Redis 缓存，调用方将走 fallback（可能跨服务启动顺序问题或字典确实不存在）", dictType);
            }
        } catch (Exception e) {
            log.warn("读取字典 {} 失败，降级为空列表", dictType, e);
        }
        return Collections.emptyList();
    }

    /**
     * 按数值匹配字典档位：在按 dict_value(数值升序) 排序后，找第一个 value >= 输入值的项
     * <p>
     * 典型场景：应收逾期天数 35 在 [30, 60, 90, 99999] 中命中 60 那一档
     *
     * @param dictType 字典类型
     * @param value    待匹配数值
     * @return 命中的字典项；未命中返回 null
     */
    public DictItem findTierByValue(String dictType, BigDecimal value) {
        if (value == null) {
            return null;
        }
        List<DictItem> items = getDictData(dictType);
        DictItem matched = null;
        BigDecimal matchedValue = null;
        for (DictItem item : items) {
            BigDecimal tierValue = item.getValueAsDecimal();
            if (tierValue == null) {
                continue;
            }
            if (value.compareTo(tierValue) <= 0) {
                if (matchedValue == null || tierValue.compareTo(matchedValue) < 0) {
                    matched = item;
                    matchedValue = tierValue;
                }
            }
        }
        return matched;
    }

    /**
     * 写入字典缓存（由 SysDictCacheLoader 调用）
     */
    public void setDictDataCache(String dictType, List<DictItem> items) {
        redisCache.setCacheObject(DICT_DATA_PREFIX + dictType, items);
        // 字典刚刷新过后，允许下次空命中重新打日志（如管理员清空了字典）
        emptyHitLogged.remove(dictType);
    }

    /**
     * 删除字典缓存
     */
    public void removeDictDataCache(String dictType) {
        redisCache.deleteObject(DICT_DATA_PREFIX + dictType);
        emptyHitLogged.remove(dictType);
    }

    public Set<String> keys(String pattern) {
        Collection<String> keys = redisCache.keys(pattern);
        if (keys == null || keys.isEmpty()) {
            return Collections.emptySet();
        }
        return Set.copyOf(keys);
    }

    public void deleteRawCacheKey(String key) {
        if (key == null || key.isEmpty()) {
            return;
        }
        redisCache.redisTemplate.delete(key);
    }

    /**
     * 字典项 POJO，避免耦合 cloudflow-auth 的 SysDictData 实体
     */
    public static class DictItem {
        private Integer sort;
        private String label;
        private String value;
        /** sys_dict_data.list_class，用于扩展存税率/告警级别等 */
        private String listClass;
        /** sys_dict_data.css_class，用于扩展存速算扣除数等 */
        private String cssClass;

        public DictItem() {}

        public DictItem(Integer sort, String label, String value, String listClass, String cssClass) {
            this.sort = sort;
            this.label = label;
            this.value = value;
            this.listClass = listClass;
            this.cssClass = cssClass;
        }

        public Integer getSort() { return sort; }
        public void setSort(Integer sort) { this.sort = sort; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
        public String getListClass() { return listClass; }
        public void setListClass(String listClass) { this.listClass = listClass; }
        public String getCssClass() { return cssClass; }
        public void setCssClass(String cssClass) { this.cssClass = cssClass; }

        /** 把 dict_value 解析为 BigDecimal，失败返回 null */
        public BigDecimal getValueAsDecimal() {
            if (value == null || value.isEmpty()) {
                return null;
            }
            try {
                return new BigDecimal(value.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }

        /** 把 list_class 解析为 BigDecimal（用于税率等） */
        public BigDecimal getListClassAsDecimal() {
            if (listClass == null || listClass.isEmpty()) {
                return null;
            }
            try {
                return new BigDecimal(listClass.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }

        /** 把 css_class 解析为 BigDecimal（用于速算扣除数等） */
        public BigDecimal getCssClassAsDecimal() {
            if (cssClass == null || cssClass.isEmpty()) {
                return null;
            }
            try {
                return new BigDecimal(cssClass.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof DictItem)) return false;
            DictItem other = (DictItem) o;
            return Objects.equals(value, other.value) && Objects.equals(label, other.label);
        }

        @Override
        public int hashCode() {
            return Objects.hash(label, value);
        }
    }
}
