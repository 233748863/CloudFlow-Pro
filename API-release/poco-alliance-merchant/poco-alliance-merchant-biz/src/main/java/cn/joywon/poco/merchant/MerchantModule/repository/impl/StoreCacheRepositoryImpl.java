package cn.joywon.poco.merchant.MerchantModule.repository.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.merchant.Common.page.CursorQueryDTO;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreCacheBO;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.StoreCacheKey;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreCacheDTO;
import cn.joywon.poco.merchant.MerchantModule.repository.IStoreCacheRepository;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.geo.*;
import org.springframework.data.redis.connection.RedisGeoCommands.GeoLocation;
import org.springframework.data.redis.connection.RedisGeoCommands.GeoRadiusCommandArgs;
import org.springframework.data.redis.core.*;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Repository
@RequiredArgsConstructor
public class StoreCacheRepositoryImpl implements IStoreCacheRepository, StoreCacheKey {

    private final RedisTemplate<String, Object> redisTemplate;


    /**
     * 添加/更新门店缓存
     *
     * @param dto 门店缓存数据模型
     */
    @Override
    public void upsert(StoreCacheDTO dto) {
        deleteById(dto.getId(), dto.getIndustryId());

        Point point = new Point(dto.getLongitude(), dto.getLatitude());
        Long count = redisTemplate.opsForGeo().add(KEY_STORE_GEO, point, dto.getId());
        if (count == null || count == 0) {
            throw new RuntimeException("添加门店位置信息缓存失败");
        }
        String storeIndustryGeoKey = KEY_PREFIX_STORE_GEO_INDUSTRY + dto.getIndustryId();
        count = redisTemplate.opsForGeo().add(storeIndustryGeoKey, point, dto.getId());
        if (count == null || count == 0) {
            redisTemplate.opsForGeo().remove(KEY_STORE_GEO, dto.getId());
            throw new RuntimeException("添加门店位置信息缓存失败");
        }

        Map<String, Object> storeMap = BeanUtil.beanToMap(dto);
        try {
            redisTemplate.opsForHash().put(KEY_STORE_HASH, dto.getId(), storeMap);
            if (ObjUtil.isNull(redisTemplate.opsForHash().get(KEY_STORE_HASH, dto.getId()))) {
                throw new RuntimeException("添加门店缓存失败");
            }
        } catch (Exception e) {
            redisTemplate.opsForZSet().remove(KEY_STORE_GEO, dto.getId());
            log.error("添加门店位置信息缓存失败", e);
            throw new RuntimeException("添加门店缓存失败", e);
        }

    }


    /**
     * 批量添加/更新门店缓存
     *
     * @param stores 门店缓存数据模型列表
     */
    @Override
    public void upsertBatchStore(List<StoreCacheBO> stores) {
        if (CollUtil.isEmpty(stores)) {
            return;
        }

        Map<Object, Point> pointMap = new HashMap<>();
        Map<String, StoreCacheDTO> storeMap = new HashMap<>();
        Map<String, Map<Object, Point>> industriesPointMap = new HashMap<>();

        for (StoreCacheBO bo : stores) {
            // 初始化门店位置坐标
            Point point = new Point(bo.getLongitude(), bo.getLatitude());
            pointMap.put(bo.getId(), point);

            // 初始化行业门店列表
            String industryId = bo.getIndustryId();
            Map<Object, Point> industryPointMap = industriesPointMap.get(industryId);
            if (CollUtil.isEmpty(industryPointMap)) {
                industryPointMap = new HashMap<>();
                industriesPointMap.put(industryId, industryPointMap);
            }
            industryPointMap.put(bo.getId(), point);

            StoreCacheDTO storeCache = BeanUtil.copyProperties(bo, StoreCacheDTO.class);
            storeMap.put(bo.getId(), storeCache);
        }

        try {
            // 写入门店地理位置缓存(KEY, HK-门店ID, HV-门店位置)
            redisTemplate.opsForGeo().add(KEY_STORE_GEO, pointMap);
            // 写入行业门店位置缓存(KEY-行业ID, HK-门店ID, HV-门店位置)
            for (Map.Entry<String, Map<Object, Point>> entry : industriesPointMap.entrySet()) {
                String storeIndustryGeoKey = KEY_PREFIX_STORE_GEO_INDUSTRY + entry.getKey();
                redisTemplate.opsForGeo().add(storeIndustryGeoKey, entry.getValue());
            }
            // 写入门店缓存(KEY, HK-门店ID, HV-门店)
            redisTemplate.opsForHash().putAll(KEY_STORE_HASH, storeMap);

        } catch (Exception e) {
            log.error("添加门店缓存失败", e);
            throw new RuntimeException("添加门店缓存失败");
        }

//        redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
//            for (StoreCacheBO bo : stores) {
//                Point point = new Point(bo.getLongitude(), bo.getLatitude());
//                byte[] storeIdBytes = bo.getId().getBytes(StandardCharsets.UTF_8);
//                byte[] industryIdBytes = (KEY_PREFIX_STORE_GEO_INDUSTRY + bo.getIndustryId()).getBytes(StandardCharsets.UTF_8);
//                byte[] storeCacheBytes = JSONUtil.toJsonStr(BeanUtil.copyProperties(bo, StoreCacheDTO.class)).getBytes(StandardCharsets.UTF_8);
//
//                GeoLocation<byte[]> geo = new GeoLocation<>(storeIdBytes, point);
//                connection.geoCommands().geoAdd(industryIdBytes, geo);
//                connection.geoCommands().geoAdd(KEY_STORE_GEO.getBytes(StandardCharsets.UTF_8), geo);
//                connection.hashCommands().hSet(KEY_STORE_HASH.getBytes(StandardCharsets.UTF_8), storeIdBytes, storeCacheBytes);
//            }
//            return null;
//        });
    }


    /**
     * 删除门店缓存
     *
     * @param id 门店id
     */
    @Override
    public void deleteById(String id, String industryId) {
        redisTemplate.opsForGeo().remove(KEY_STORE_GEO, id);
        redisTemplate.opsForGeo().remove(KEY_PREFIX_STORE_GEO_INDUSTRY + industryId, id);
        redisTemplate.opsForHash().delete(KEY_STORE_HASH, id);
    }


    /**
     * 删除所有门店缓存
     */
    @Override
    public void dropAllStoreCache() {
        // 删除 [门店地址] 缓存
        String keyPattern = KEY_STORE_GEO + "*";
        while (true) {
            List<String> deleteKeys = scanKeys(keyPattern);
            if (CollUtil.isEmpty(deleteKeys)) {
                break;
            }
            redisTemplate.delete(deleteKeys);
        }
        // 删除 [门店] 缓存
        redisTemplate.delete(KEY_STORE_HASH);
    }


    /**
     * 根据地理位置获取范围内门店列表
     *
     * @param dto 查询参数
     * @return 门店缓存分页列表
     */
    @Override
    public MiniMerchantListVO getStoreListByRadius(MiniStoreQueryDTO dto) {
        /*
        List<StoreCacheDTO> stores = new ArrayList<>();
        // 下一页最后一个门店距离
        Double nextDistance = dto.getLastDistance();
        // 下一页第一个门店ID
        String nextStoreId = null;
        // 是否有更多数据
        boolean hasMore = false;

        while (stores.size() < dto.getPageSize()) {
            // step-1 构建 GEO 查询参数(距离升序 & 多查预留)
            GeoRadiusCommandArgs geoArgs = RedisGeoCommands.GeoRadiusCommandArgs.newGeoRadiusArgs()
                    .includeDistance().sortAscending().limit(dto.getPageSize() * 3);

            // step-2 构造查询范围(中心点 & 半径)
            Distance distance = new Distance(dto.getRadius(), Metrics.KILOMETERS);
            Circle circle = new Circle(new Point(dto.getLongitude(), dto.getLatitude()), distance);

            // step-3 执行 GEO 查询
            GeoResults<GeoLocation<Object>> geoResults = redisTemplate.opsForGeo().radius(KEY_STORE_GEO, circle, geoArgs);
            if (geoResults == null || geoResults.getContent().isEmpty()) {
                break;
            }

            //  step-4 跳过上一页已处理的门店(从 dto.lastStoreId 之后开始)
            List<GeoResult<GeoLocation<Object>>> unprocessedGeoResults = filterProcessedGeoResults(
                    geoResults.getContent(),
                    dto.getLastStoreId() != null ? dto.getLastStoreId().toString() : null,
                    dto.getLastDistance());
            if (CollUtil.isEmpty(unprocessedGeoResults)) {
                break;
            }

            // step-5 提取本次查询的商家ID和游标信息
            List<String> storeIds = unprocessedGeoResults.stream().map(i -> i.getContent().toString()).toList();
            GeoResult<GeoLocation<Object>> lastGeoResult = unprocessedGeoResults.get(unprocessedGeoResults.size() - 1);
            nextStoreId = lastGeoResult.getContent().toString();
            nextDistance = lastGeoResult.getDistance().getValue();

            // step-6 批量查询缓存中门店数据(Hash 批量获取, 减少 IO)
            List<Object> storeHashList = redisTemplate.opsForHash()
                    .multiGet(KEY_STORE_HASH, storeIds.stream().map(id -> (Object) id).toList());

            // step-7 数据过滤(非空 & 行业) & 转换为 DTO
            List<StoreCacheDTO> filteredStores = storeHashList.stream()
                    .filter(Objects::nonNull)
                    .map(this::convertHashToStoreCacheDTO)
                    .filter(Objects::nonNull)
                    .filter(i -> matchIndustry(i, dto.getIndustryId()))
                    .toList();

            // 8. 补充到结果列表(不超过 dto.pageSize)
            int remaining = dto.getPageSize().intValue() - stores.size();
            if (filteredStores.size() > remaining) {
                // 超出所需数量截取前 remaining 条
                stores.addAll(filteredStores.subList(0, remaining));
                // 更新游标为当前结果最后一个门店(确保下一页准确跳过)
                String lastStoreId = stores.get(stores.size() - 1).getId();
                nextDistance = getStoreDistance(redisTemplate.opsForGeo(), lastStoreId, dto.getLongitude(), dto.getLatitude());
                hasMore = true;

            } else {
                // 未超出所需数量全部加入
                stores.addAll(filteredStores);
                // 本次 GEO 查询结果是否达到 limit 数量
                hasMore = unprocessedGeoResults.size() >= dto.getPageSize() * 3;
            }
        }

        // step-9 组装返回结果
        MiniMerchantListVO vo = new MiniMerchantListVO();
        vo.setNextDistance(nextDistance);
        vo.setPageSize(stores.size());
        vo.setHasMore(hasMore);
        vo.setStores(stores);
        if (nextStoreId != null) {
            vo.setNextStoreId(Long.valueOf(nextStoreId));
        }

        return vo;
        */
        return null;
    }


    @Override
    public CursorQueryVO<StoreCacheDTO> queryNearbyStores(CursorQueryDTO dto, Long industryId) {
        int startIndex = (dto.getCursor() != null && dto.getCursor() >= 0 ? dto.getCursor() : 0);

        String geoKey;
        if (ObjUtil.isNotNull(industryId)) {
            geoKey = KEY_PREFIX_STORE_GEO_INDUSTRY + industryId;
        } else {
            geoKey = KEY_STORE_GEO;
        }

        Circle circle = initSearchCircle(dto);
        GeoRadiusCommandArgs geoArgs = GeoRadiusCommandArgs.newGeoRadiusArgs().sortAscending();

        List<GeoResult<GeoLocation<Object>>> geoResultContent = getNearbyStoreIds(geoKey, circle, geoArgs);
        if (CollUtil.isEmpty(geoResultContent)) {
            return null;
        }
        int totalSize = geoResultContent.size();
        if (startIndex >= totalSize) {
            CursorQueryVO<StoreCacheDTO> vo = new CursorQueryVO<>();
            vo.setRecords(List.of());
            vo.setTotal(totalSize);
            vo.setSize(dto.getPageSize());
            vo.setHasMore(false);
            vo.setNextCursor(null);
            return vo;
        }
        int endIndexExclusive = Math.min(startIndex + dto.getPageSize(), totalSize);

        Collection<Object> currentPageStoreIds = geoResultContent.subList(startIndex, endIndexExclusive)
                .stream()
                .map(i -> i.getContent().getName())
                .toList();

        List<Object> storeCaches = redisTemplate.opsForHash().multiGet(KEY_STORE_HASH, currentPageStoreIds);
        if (CollUtil.isEmpty(storeCaches)) {
            return null;
        }

        List<StoreCacheDTO> stores = new ArrayList<>();
        for (Object o : storeCaches) {
            stores.add(BeanUtil.toBean(o, StoreCacheDTO.class));
        }

        CursorQueryVO<StoreCacheDTO> vo = new CursorQueryVO<>();
        vo.setRecords(stores);
        vo.setTotal(totalSize);
        vo.setSize(dto.getPageSize());
        vo.setHasMore(endIndexExclusive < totalSize);
        vo.setNextCursor(vo.getHasMore() ? endIndexExclusive : null);

        return vo;
    }


    private Circle initSearchCircle(CursorQueryDTO dto) {
        return new Circle(new Point(dto.getLongitude(), dto.getLatitude()), new Distance(dto.getRadius(), Metrics.KILOMETERS));
    }


    private List<GeoResult<GeoLocation<Object>>> getNearbyStoreIds(String geoKey, Circle circle, GeoRadiusCommandArgs geoArgs) {
        GeoResults<GeoLocation<Object>> geoResult = redisTemplate.opsForGeo().radius(geoKey, circle, geoArgs);
        if (ObjUtil.isNull(geoResult)) {
            return null;
        }
        List<GeoResult<GeoLocation<Object>>> geoResultContent = geoResult.getContent();
        if (CollUtil.isEmpty(geoResultContent)) {
            return null;
        }
        return geoResultContent;
    }


    /**
     * 查询范围内行业过滤门店列表缓存
     *
     * @param dto 查询参数
     * @return 查询结果(距离升序门店列表缓存)
     */
    @Override
    public CursorQueryVO<MiniMerchantListVO> queryStoreByRadiusAndIndustry(MiniStoreQueryDTO dto) {
        CursorQueryVO<MiniMerchantListVO> cursorQueryVo = new CursorQueryVO<>();
        int startIndex = dto.getCursor() != null && dto.getCursor() >= 0 ? dto.getCursor() : 0;

        /* step-1 初始化查询条件 */
        Circle searchCircle = initSearchCircle(dto);
        String geoKey;
        if (dto.getIndustryId() != null) {
            geoKey = KEY_PREFIX_STORE_GEO_INDUSTRY + dto.getIndustryId();
        } else {
            geoKey = KEY_STORE_GEO;
        }
        GeoRadiusCommandArgs geoArgs = GeoRadiusCommandArgs.newGeoRadiusArgs().includeDistance().sortAscending();

        /* step-2 执行 GEO 查询 */
        List<GeoResult<GeoLocation<Object>>> geoResultContent = getNearbyStoreIds(geoKey, searchCircle, geoArgs);
        if (CollUtil.isEmpty(geoResultContent)) {
            return null;
        }

        /* step-3 计算分页信息 */
        int totalSize = geoResultContent.size();
        int endIndexExclusive = Math.min(startIndex + dto.getPageSize(), totalSize);
        boolean hasMore = endIndexExclusive < totalSize;
        Integer nextCursor = hasMore ? endIndexExclusive : null;
        Collection<Object> currentPageStoreIds = geoResultContent.subList(startIndex, endIndexExclusive)
                .stream()
                .map(i -> i.getContent().getName())
                .toList();

        /* step-4 获取门店信息缓存 */
        List<Object> storeCaches = redisTemplate.opsForHash().multiGet(KEY_STORE_HASH, currentPageStoreIds);
        if (CollUtil.isEmpty(storeCaches)) {
            return null;
        }

        /* step-5 组装返回数据 */
        List<MiniMerchantListVO> storeVos = new ArrayList<>();
        int i = 0;
        for (Object o : storeCaches) {
            MiniMerchantListVO storeVo = new MiniMerchantListVO();
            StoreCacheDTO storeCacheDto = BeanUtil.toBean(o, StoreCacheDTO.class);
            BeanUtil.copyProperties(storeCacheDto, storeVo);
            storeVo.setStoreId(storeCacheDto.getId());
            storeVo.setStoreName(storeCacheDto.getName());
            storeVo.setStorePhone(storeCacheDto.getPhone());
            storeVo.setStoreLogo(storeCacheDto.getLogoUrl());
            storeVo.setMerchantLogo(storeCacheDto.getMerchantLogo());
            storeVo.setDistance(geoResultContent.get(startIndex + i).getDistance().getValue());
            storeVo.setStoreAddress(replaceLocationSeparator(storeCacheDto.getAddressDetail()));
            storeVo.setBusinessStatus(BusinessStatusEnum.getByValue(storeCacheDto.getBusinessStatus()));

            storeVos.add(storeVo);
            i++;
        }

        cursorQueryVo.setHasMore(hasMore);
        cursorQueryVo.setTotal(totalSize);
        cursorQueryVo.setRecords(storeVos);
        cursorQueryVo.setNextCursor(nextCursor);
        cursorQueryVo.setSize(dto.getPageSize());
        cursorQueryVo.setPageNum(dto.getPageNum());
        return cursorQueryVo;
    }


    /**
     * 根据门店ID获取门店缓存
     *
     * @param storeId 门店ID
     * @return 门店缓存
     */
    @Override
    public StoreCacheDTO getStoreById(String storeId) {
        Object cacheData = redisTemplate.opsForHash().get(KEY_STORE_HASH, storeId);
        if (cacheData == null) {
            return null;
        }
        return BeanUtil.toBean(cacheData, StoreCacheDTO.class);
    }


    /**
     * private
     * 扫描指定前缀门店缓存key
     *
     * @param keyPattern key匹配模式
     * @return 匹配的key列表
     */
    private List<String> scanKeys(String keyPattern) {
        List<String> deleteKeys = new ArrayList<>();
        ScanOptions scanOptions = ScanOptions.scanOptions().match(keyPattern).count(100).build();

        try {
            redisTemplate.execute((RedisCallback<Object>) connection -> {
                try (Cursor<byte[]> cursor = connection.keyCommands().scan(scanOptions)) {
                    while (cursor.hasNext()) {
                        byte[] keyBytes = cursor.next();
                        if (keyBytes != null) {
                            String deleteKey = new String(keyBytes, StandardCharsets.UTF_8);
                            if (StrUtil.isNotEmpty(deleteKey)) {
                                deleteKeys.add(deleteKey);
                            }
                        }
                    }
                } catch (Exception e) {
                    log.error("门店缓存key扫描失败", e);
                }

                return null;
            });
        } catch (Exception e) {
            log.error("门店缓存key扫描失败", e);
        }

        return deleteKeys;
    }


    /**
     * 跳过上一页已处理的 GEO 结果
     *
     * @param geoResults   GEO 查询结果(距离升序)
     * @param lastStoreId  上次处理的最后门店ID
     * @param lastDistance 上次处理的最后门店距离
     * @return 未处理的 GEO 结果
     */
    private List<GeoResult<GeoLocation<Object>>> filterProcessedGeoResults(
            List<GeoResult<GeoLocation<Object>>> geoResults, String lastStoreId, Double lastDistance) {
        // 首次查询返回所有结果(lastStoreId 为 null)
        if (lastStoreId == null) {
            return geoResults;
        }
        // 找到 lastStoreId 对应的索引, 从索引+1 开始保留未处理数据
        int startIndex = 0;
        for (int i = 0; i < geoResults.size(); i++) {
            GeoResult<GeoLocation<Object>> result = geoResults.get(i);
            String storeId = result.getContent().toString();
            double distance = result.getDistance().getValue();
            // 双重校验, 避免 ID 重复或距离精度问题
            if (lastStoreId.equals(storeId) && Math.abs(distance - lastDistance) < 1e-6) {
                startIndex = i + 1;
                break;
            }
        }
        return geoResults.subList(startIndex, geoResults.size());
    }


    /**
     * 过滤查询结果中的行业分类
     *
     * @param dto              缓存查询门店结果
     * @param targetIndustryId 目标行业分类ID
     * @return 是否匹配
     */
    private boolean matchIndustry(StoreCacheDTO dto, Long targetIndustryId) {
        if (targetIndustryId == null) {
            // 无行业筛选全部保留
            return true;
        }
        return targetIndustryId.equals(dto.getIndustryId());
    }


    /**
     * 获取给定地理坐标与门店之间距离
     *
     * @param ops         Geo 操作类
     * @param lastStoreId 最后门店ID
     * @param lng         经度
     * @param lat         纬度
     * @return 门店距离
     */
    private Double getStoreDistance(GeoOperations<String, Object> ops,
                                    String lastStoreId,
                                    Double lng,
                                    Double lat) {
        try {
            Distance distance = ops.distance(KEY_STORE_GEO, new Point(lng, lat), lastStoreId, Metrics.KILOMETERS);
            return distance != null ? distance.getValue() : 0.00;
        } catch (Exception e) {
            return 0.00;
        }
    }


    private String replaceLocationSeparator(String address) {
        int index = address.lastIndexOf(",");
        if (index != -1 && index < address.length() - 1) {
            return address.substring(index + 1);
        }
        return "";
    }


}