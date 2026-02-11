package cn.joywon.poco.knowledge.support.feign;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

/**
 * @author poco
 * @date 2024/4/15
 */
@FeignClient(contextId = "remoteTableInfoService", value = ServiceNameConstants.CODEGEN_SERVICE)
public interface RemoteTableInfoService {

    /**
     * 查询全部的数据源名称
     *
     * @return
     */
    @GetMapping("/dsconf/list")
    R<List<Map<String, Object>>> listDs();


    /**
     * 查询全部的表
     *
     * @param dsName DS 名称
     * @return {@link R }<{@link List }<{@link Map }>>
     */
    @GetMapping("/table/list/{dsName}")
    R<List<Map<String, Object>>> listTable(@PathVariable String dsName);

    /**
     * 查询表ddl
     *
     * @param dsName    数据源
     * @param tableName 表名
     * @return
     */
    @GetMapping("/table/ddl/{dsName}/{tableName}")
    R<String> listDDL(@PathVariable("dsName") String dsName, @PathVariable("tableName") String tableName);


    /**
     * 列表列
     *
     * @param dsName    DS 名称
     * @param tableName 表名称
     * @return {@link R }<{@link List }<{@link Map }<{@link String }, {@link Object }>>>
     */
    @GetMapping("/table/column/{dsName}/{tableName}")
    R<List<Map<String, Object>>> listColumn(@PathVariable("dsName") String dsName, @PathVariable("tableName") String tableName);


    /**
     * 执行 SQL
     *
     * @param dsName
     * @param sql    SQL格式
     * @return {@link R }
     */
    @GetMapping("/ext/execSQL")
    R execSQL(@RequestParam String dsName, @RequestParam String sql);

}
