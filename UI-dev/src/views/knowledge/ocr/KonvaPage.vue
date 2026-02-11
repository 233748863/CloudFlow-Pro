<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<el-container class="h-screen">
				<el-main class="p-0">
					<Splitpanes style="height: 100%">
						<Pane :size="70">
							<el-card class="h-full">
								<!-- Image Display -->
								<div class="relative w-full h-full">
									<div class="flex absolute top-0 left-0 z-20 items-center px-4 py-2 w-full bg-white bg-opacity-20">
										<el-button-group class="mr-4">
											<el-button @click="rotateImage(-90)" :icon="Refresh" circle></el-button>
											<el-button @click="zoomIn" :icon="ZoomIn" circle></el-button>
											<el-button @click="zoomOut" :icon="ZoomOut" circle></el-button>
										</el-button-group>
									</div>
									<div class="mt-12 w-full h-[calc(100%-3rem)]">
										<div class="flex relative justify-center items-center w-full h-full" @wheel.prevent="handleWheel">
											<img
												v-if="imageUrl"
												:src="baseURL + imageUrl"
												class="max-h-[80vh] w-auto transition-transform duration-200 transform-gpu"
												:style="{
													transform: `rotate(${rotation}deg) scale(${scale})`,
													transformOrigin: 'center center',
												}"
											/>
											<div v-else class="flex flex-col justify-center items-center h-full">
												<upload-img v-model:imageUrl="imageUrl" :fileType="['image/png']">
													<template #empty>
														<el-icon><Picture /></el-icon>
														<span>请上传底图</span>
													</template>
												</upload-img>

												<el-link
													v-if="isPreview"
													class="mt-4 w-full text-center"
													href="https://minio.poco.vip/oss/202412/1735479611.zip"
													target="_blank"
													>点击下载示例图</el-link
												>
											</div>
										</div>
									</div>
								</div>
							</el-card>
						</Pane>
						<Pane :size="30">
							<Splitpanes horizontal>
								<Pane :size="20">
									<el-card class="h-full">
										<ControlPanel
											@clearAll="clearImage"
											@saveData="saveData"
											@parseData="parseData"
											:isPreview="isPreview"
											:isParsing="isParsing"
											:hasImage="!!imageUrl"
										/>
									</el-card>
								</Pane>
								<Pane :size="80">
									<el-card class="overflow-auto h-full">
										<DataDisplay
											:markerList="markerList"
											:isPreview="isPreview"
											@addMarker="handleAddMarker"
											@removeMarker="handleRemoveMarker"
											@editMarker="handleEditMarker"
										/>
									</el-card>
								</Pane>
							</Splitpanes>
						</Pane>
					</Splitpanes>
				</el-main>

				<!-- Loading Animation -->
				<div v-if="isParsing" class="flex absolute inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
					<div class="flex justify-center items-center text-center">
						<span class="loading loading-ball loading-xs"></span>
						<span class="loading loading-ball loading-sm"></span>
						<span class="loading loading-ball loading-md"></span>
						<span class="loading loading-ball loading-lg"></span>
					</div>
				</div>
			</el-container>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Splitpanes, Pane } from 'splitpanes';
import { Refresh, ZoomIn, ZoomOut, Picture } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import 'splitpanes/dist/splitpanes.css';
import ControlPanel from './components/ControlPanel.vue';
import DataDisplay from './components/DataDisplay.vue';
import { putObj, getObj, parseObj } from '/@/api/knowledge/ocr';
import { Local } from '/@/utils/storage';

const route = useRoute();
const id = ref(route.query.id);
const isPreview = computed(() => route.query.preview === '1');

const imageUrl = ref<string | null>(null);
const rotation = ref(0);
const scale = ref(1);
const isParsing = ref(false);
const markerList = ref<any[]>([]);
const markerTemplate = ref<any[]>([]); // 存储标记模板

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const SCALE_FACTOR = 0.1;

// 添加模型选择的响应式变量
const selectedVisionModel = ref<any>(null);
const selectedChatModel = ref<any>(null);

function rotateImage(angle: number) {
	rotation.value = (rotation.value + angle + 360) % 360;
}

function handleWheel(event: WheelEvent) {
	if (!imageUrl.value) return;

	// deltaY 小于 0 表示向上滚动（放大），大于 0 表示向下滚动（缩小）
	const delta = -Math.sign(event.deltaY) * SCALE_FACTOR;
	const newScale = scale.value + delta;

	// 限制缩放范围
	if (newScale >= MIN_SCALE && newScale <= MAX_SCALE) {
		scale.value = newScale;
	}
}

function zoomIn() {
	const newScale = scale.value * 1.1;
	if (newScale <= MAX_SCALE) {
		scale.value = newScale;
	}
}

function zoomOut() {
	const newScale = scale.value / 1.1;
	if (newScale >= MIN_SCALE) {
		scale.value = newScale;
	}
}

function clearImage() {
	imageUrl.value = null;
	rotation.value = 0;
	scale.value = 1;
}

function handleAddMarker(marker: any) {
	markerList.value.push(marker);
}

function handleRemoveMarker(id: number) {
	const index = markerList.value.findIndex((marker) => marker.id === id);
	if (index !== -1) {
		markerList.value.splice(index, 1);

		// 重新编号
		markerList.value = markerList.value.map((marker, idx) => ({
			...marker,
			label: (idx + 1).toString(),
		}));
	}
}

async function saveData() {
	// 检查底图是否存在
	if (!imageUrl.value) {
		ElMessage.warning('请先上传底图');
		return;
	}

	// 检查是否有标记点
	if (markerList.value.length === 0) {
		ElMessage.warning('请至少添加一个标记点');
		return;
	}

	// 检查所有标记点是否都有名称和描述
	const incompleteMarker = markerList.value.find((marker) => !marker.name || !marker.description);
	if (incompleteMarker) {
		ElMessage.warning(`请完善标记点 ${incompleteMarker.label} 的信息`);
		return;
	}

	try {
		await putObj({
			id: id.value,
			imageResource: imageUrl.value,
			ocrMarked: JSON.stringify({
				markerList: markerList.value,
			}),
		});
		ElMessage.success('保存成功');
	} catch (error) {
		ElMessage.error('保存数据时出错');
	}
}

// 加载数据
async function loadData() {
	if (!id.value) {
		// 如果没有 id，清空所有数据
		clearAll();
		return;
	}

	try {
		const response = await getObj({ id: id.value });
		if (!response?.data?.[0]) {
			// 如果没有数据，清空所有数据
			clearAll();
			return;
		}

		const data = response.data[0];

		// 预览模式下只加载标记模板，不加载图片
		if (isPreview.value) {
			if (data.ocrMarked) {
				const ocrMarked = JSON.parse(data.ocrMarked);
				if (ocrMarked.markerList) {
					markerTemplate.value = ocrMarked.markerList;
					// 清空标记值，只保留结构
					markerList.value = ocrMarked.markerList.map((marker: any) => ({
						...marker,
						markedValue: '', // 清空标记值
					}));
				}
			}
		} else {
			// 非预览模式下加载完整数据
			if (data.imageResource) {
				imageUrl.value = data.imageResource;
			}
			if (data.ocrMarked) {
				const ocrMarked = JSON.parse(data.ocrMarked);
				if (ocrMarked.markerList) {
					markerList.value = ocrMarked.markerList;
				}
			}
		}
	} catch (error) {
		ElMessage.error('加载数据失败');
		// 加载失败时也清空所有数据
		clearAll();
	}
}

// 添加清空所有数据的函数
function clearAll() {
	imageUrl.value = null;
	rotation.value = 0;
	scale.value = 1;
	markerList.value = [];
	markerTemplate.value = [];
}

// 解析数据
async function parseData() {
	if (!imageUrl.value) {
		ElMessage.warning('请先上传图片');
		return;
	}

	selectedChatModel.value = Local.get(`selectedAiModel:Chat`);

	isParsing.value = true;
	try {
		// 从 imageUrl 中提取文件名
		const fileName = imageUrl.value.split('fileName=').pop();

		const response = await parseObj({
			id: id.value,
			visionModelName: selectedVisionModel.value?.name,
			chatModelName: selectedChatModel.value?.name,
			imageResource: fileName,
			ocrMarked: JSON.stringify({
				markers: markerTemplate.value,
				markerList: markerList.value,
			}),
		});

		if (response?.data) {
			// 解析返回的 JSON 字符串
			const parsedData = JSON.parse(response.data);
			console.log('Parsed response data:', parsedData);

			if (!parsedData.isContain) {
				ElMessage.warning('上传底图和目标数据类型图片不一致');
				return;
			}

			// 将解析结果与标记模板匹配
			markerList.value = markerTemplate.value.map((template: any) => {
				const value = parsedData[template.name] || ''; // 使用模板的 name 属性作为键
				return {
					...template,
					markedValue: value,
				};
			});

			ElMessage.success('解析完成');
		}
	} catch (error) {
		console.error('Parse error:', error);
		ElMessage.error('解析失败');
	} finally {
		isParsing.value = false;
	}
}

// 处理编辑标记
function handleEditMarker(updatedMarker: any) {
	const index = markerList.value.findIndex((marker) => marker.id === updatedMarker.id);
	if (index !== -1) {
		// 保持原有的其他属性（如果有的话）
		markerList.value[index] = {
			...markerList.value[index],
			name: updatedMarker.name,
			description: updatedMarker.description,
		};
	}
}

// 在组件挂载时加载数据
onMounted(() => {
	loadData();
});
</script>

<style scoped>
.el-main {
	padding: 0;
	overflow: hidden;
}

.el-card {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.splitpanes__pane {
	overflow: hidden;
}

img {
	max-width: 100%;
	object-fit: contain;
	margin: auto;
	will-change: transform;
}
</style>
