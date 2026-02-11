package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

@Data
public class VolcengineTtsProperties {

	// URL for the Text-to-Speech API endpoint
	private String apiUrl = "https://openspeech.bytedance.com/api/v1/tts";

	// Access token for authentication
	private String accessToken;

	// Application ID for the Volcengine service
	private String appId = "4456569928";

	// Cluster name for the TTS service
	private String cluster = "volcano_tts";

	// User ID for the Volcengine service
	private String uid = "388808087185088";

	// Type of voice to be used for TTS
	private String voice_type = "BV002";

	// Encoding format for the TTS output
	private String encoding = "mp3";

	// Speed ratio for the TTS output
	private float speed_ratio = 1;

	// Volume ratio for the TTS output
	private float volume_ratio = 1;

	// Pitch ratio for the TTS output
	private float pitch_ratio = 1;

	// Emotion to be used for the TTS output
	private String emotion = "happy";

}
