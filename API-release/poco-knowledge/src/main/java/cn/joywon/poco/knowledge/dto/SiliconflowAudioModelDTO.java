package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * @author poco
 * @date 2024/10/1
 *
 * "model": "fishaudio/fish-speech-1.5", "input": "The text to generate audio for",
 * "voice": "fishaudio/fish-speech-1.5:alex", "response_format": "mp3", "sample_rate":
 * 32000, "stream": true, "speed": 1, "gain": 0
 */
@Data
public class SiliconflowAudioModelDTO {

	private String model;

	private String input;

	private String voice;

}
