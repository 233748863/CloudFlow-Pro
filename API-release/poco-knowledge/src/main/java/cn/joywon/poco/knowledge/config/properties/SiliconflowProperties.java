package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;
import lombok.experimental.FieldNameConstants;

/**
 * Siliconflow 平台接口
 *
 * @author poco
 * @date 2024/6/18
 * <p>
 */
@Data
@FieldNameConstants
public class SiliconflowProperties {

	private String imageUrl = "https://api.siliconflow.cn/v1/black-forest-labs/FLUX.1-schnell/text-to-image";

	private String audioUrl = "https://api.siliconflow.cn/v1/audio/transcriptions";

	private String audioModel = "iic/SenseVoiceSmall";

	private String apikey;

	private String prompt;

	private String image_size = "1024x1024";

	private int batch_size = 1;

	private int num_inference_steps = 20;

	private String seed;

}
