package cn.joywon.poco.knowledge.config;

import org.apache.tika.Tika;
import org.apache.tika.config.TikaConfig;
import org.apache.tika.detect.Detector;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.Parser;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

/**
 * tika解析配置
 *
 * @author poco
 * @date 2024/3/14
 */
@Configuration(proxyBeanMethods = false)
public class TikaConfiguration {

	/**
	 * tika配置
	 * @return Tika bean
	 * @throws Exception 例外
	 */
	@Bean
	public Tika tika() throws Exception {
		ClassPathResource resource = new ClassPathResource("tika-config.xml");
		TikaConfig config = new TikaConfig(resource.getInputStream());
		Detector detector = config.getDetector();
		Parser autoDetectParser = new AutoDetectParser(config);
		return new Tika(detector, autoDetectParser);
	}

}
