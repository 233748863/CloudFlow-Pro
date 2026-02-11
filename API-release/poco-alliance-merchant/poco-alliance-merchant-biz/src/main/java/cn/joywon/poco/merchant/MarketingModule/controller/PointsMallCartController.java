package cn.joywon.poco.merchant.MarketingModule.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequiredArgsConstructor
@Tag(name = "积分商城购物车管理")
@RequestMapping("/marketing/cart")
public class PointsMallCartController {
}