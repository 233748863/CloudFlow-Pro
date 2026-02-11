package cn.joywon.poco.merchant.PlatformModule.service;

import com.alibaba.fastjson.JSONObject;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
@RefreshScope
public class LbsParseService {

    @Value("${joywon.ma.lbs.key}")
    private String lbsKey;

    @Value("${joywon.ma.lbs.policy}")
    private String policy;

    @Value("${joywon.ma.lbs.url}")
    private String lbsUrl;

    private final RestTemplate restTemplate;

    public LbsParseService(@Qualifier("httpsRestTemplate") RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /**
     * LBS解析地址
     *
     * @param address 地址信息
     * @return 解析结果
     */
    public Map<String, String> lbsParse(String address) {
        Map<String, String> paramsMap = Map.of(
                "address", address,
                "key", lbsKey,
                "policy", policy);
        ResponseEntity<String> response = restTemplate.getForEntity(lbsUrl, String.class, paramsMap);
        if (response.getStatusCode().is2xxSuccessful()) {
            return parseLbsResponse(response.getBody());
        }
        return null;
    }

    /**
     * 解析xBS返回结果
     *
     * @param data LBS返回数据
     * @return 解析结果
     */
    private static Map<String, String> parseLbsResponse(String data) {
        JSONObject jsonData = JSONObject.parseObject(data);
        // 获取JSON对象中的"result"对象
        JSONObject jsonResult = jsonData.getJSONObject("result");
        JSONObject locationJson = jsonResult.getJSONObject("location");
        String lng = locationJson.getString("lng");
        String lat = locationJson.getString("lat");
        // 获取JSON对象中的"ad_info"对象
        JSONObject adJson = jsonResult.getJSONObject("ad_info");
        String adCode = adJson.getString("adcode");
        return Map.of("longitude", lng, "latitude", lat, "regionCode", adCode);
    }

}