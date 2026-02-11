<template>
	<el-button class="w-1 h-4 !ml-0" :text="!isPlaying" :icon="isPlaying ? 'VideoPause' : 'VideoPlay'" @click="togglePlayPause" type="primary">
	</el-button>
	<audio ref="audioElement" preload="auto" style="display: none"></audio>
</template>

<script setup>
import {genTts} from "/@/api/knowledge/aiGen";
import {ref} from 'vue';
import {useMessage} from '/@/hooks/message';

// 接收传入的文本属性
const props = defineProps({
  text: {
    type: String,
    required: true
  }
});

// 定义状态变量
const isPlaying = ref(false); // 控制音频是否正在播放
const audioElement = ref(null); // 引用 audio 元素
const audioSrc = ref(null); // 存储生成的音频 URL
const isLocked = ref(false); // 按钮锁控制，防止重复点击

// 切换播放/暂停的主函数
const togglePlayPause = () => {
  if (isLocked.value) return; // 如果按钮已锁定，直接返回
  isLocked.value = true; // 锁定按钮，防止重复点击

  if (isPlaying.value) {
    pauseAudio(); // 如果正在播放，则暂停
  } else {
    playAudio(props.text); // 如果未播放，则生成或播放���频
  }
};

// 播放音频的函数
const playAudio = (text) => {
  if (audioSrc.value) {
    resumeAudio(); // 如果音频已生成，则直接恢复播放
  } else {
    genTts(text).then((res) => {
      const audioBlob = base64ToBlob(res.data, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);
      audioSrc.value = audioUrl; // 存储生成的音频 URL
      handleAudioPlayPause(audioElement, audioUrl); // 处理音频的播放和暂停
    }).catch((error) => {
      if (typeof error === 'object' && error !== null && 'msg' in error) {
        useMessage().error(error.msg);
      } else {
        useMessage().error('An error occurred');
      }
    })
    .finally(() => {
      isLocked.value = false; // 操作完成后释放锁
    });
  }
};

// 恢复播放音频的函数
const resumeAudio = () => {
  if (audioElement.value && audioElement.value.paused) {
    audioElement.value.play().then(() => {
      isPlaying.value = true; // 更新状态为播放中
    }).catch(error => {
      console.error("恢复播放音频时出错:", error); // 捕获并打印错误
    }).finally(() => {
      isLocked.value = false; // 操作完成后释放锁
    });
  }
};

// 暂停音频的函数
const pauseAudio = () => {
  if (audioElement.value && !audioElement.value.paused) {
    audioElement.value.pause(); // 暂停音频
    isPlaying.value = false; // 更新状态为暂停
    isLocked.value = false; // 释放锁
  }
};

// 处理音频播放和暂停的核心函数
const handleAudioPlayPause = (audioRef, src) => {
  if (audioRef.value) {
    if (!audioRef.value.paused && audioRef.value.src === src) {
      audioRef.value.pause(); // 如果正在播放且 URL 相同，则暂停
      isPlaying.value = false; // 更新状态为暂停
      isLocked.value = false; // 释放锁
    } else {
      audioRef.value.src = src; // 设置音频 URL
      audioRef.value.load(); // 重新加载音频
      audioRef.value.onloadedmetadata = () => {
        audioRef.value.play().then(() => {
          isPlaying.value = true; // 更新状态为播放中
        }).catch(error => {
          console.error("播放音频时出错:", error); // 捕获并打印错误
        }).finally(() => {
          isLocked.value = false; // 操作完成后释放锁
        });
      };
    }
  }
};

// 将 base64 编码转换为 Blob 对象的辅助函数
function base64ToBlob(base64, fileType) {
  const byteCharacters = atob(base64); // 解码 base64 字符串
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i); // 将字符转换为字节
  }
  const byteArray = new Uint8Array(byteNumbers); // 创建字节数组
  return new Blob([byteArray], {type: fileType}); // 创建并返回 Blob 对象
}
</script>
