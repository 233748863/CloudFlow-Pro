package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.collection.CollUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.PlatformModule.service.LbsParseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@Validated
@Tag(name = "LBS解析")
@RequiredArgsConstructor
@RequestMapping("/platform/lbs")
public class LbsParseController {

    private final LbsParseService lbsParseService;

    /**
     * LBS解析接口
     *
     * @param address 地址信息
     * @return 解析结果
     */
    @GetMapping("/parse/address")
    @Operation(summary = "LBS解析接口")
    public R<Map<String, String>> lbsParse(@RequestParam String address) {
        Map<String, String> locationMap = lbsParseService.lbsParse(address);
        if (CollUtil.isEmpty(locationMap)) {
            return R.failed("解析地址失败");
        }
        return R.ok(locationMap);
    }

}