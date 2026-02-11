<template>
	<!-- 聊天输入框容器，固定在底部 -->
	<div class="sticky bottom-4 px-2 w-full">
		<!-- 上传文件/图片预览区域 -->
		<div
			v-if="(uploadedFiles.length > 0 || uploadedImages.length > 0) && isFileUploadAllowed"
			class="flex flex-wrap gap-2 px-4 mx-auto mb-2 w-full md:w-4/5"
		>
			<!-- 文件预览 -->
			<div
				v-for="(file, index) in uploadedFiles"
				:key="'file-' + index"
				class="flex items-center px-3 py-1.5 bg-gray-100 rounded-full shadow-sm dark:bg-gray-700"
			>
				<!-- PDF文件图标 -->
				<svg
					v-if="getFileExtension(file.name) === 'pdf'"
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 w-4 h-4 text-red-500 dark:text-red-400"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M14 3v4a1 1 0 0 0 1 1h4" />
					<path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
					<path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" />
					<path d="M17 18h2" />
					<path d="M20 15h-3v6" />
					<path d="M11 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1z" />
				</svg>

				<!-- Word文档图标 -->
				<svg
					v-else-if="['doc', 'docx'].includes(getFileExtension(file.name))"
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 w-4 h-4 text-blue-600 dark:text-blue-400"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M14 3v4a1 1 0 0 0 1 1h4" />
					<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
					<path d="M9 9l1 0" />
					<path d="M9 13l6 0" />
					<path d="M9 17l6 0" />
				</svg>

				<!-- Excel文件图标 -->
				<svg
					v-else-if="['xls', 'xlsx'].includes(getFileExtension(file.name))"
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 w-4 h-4 text-green-600 dark:text-green-400"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M14 3v4a1 1 0 0 0 1 1h4" />
					<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
					<path d="M8 11h8v7h-8z" />
					<path d="M8 15h8" />
					<path d="M11 11v7" />
				</svg>

				<!-- PowerPoint图标 -->
				<svg
					v-else-if="['ppt', 'pptx'].includes(getFileExtension(file.name))"
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 w-4 h-4 text-orange-500 dark:text-orange-400"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M14 3v4a1 1 0 0 0 1 1h4" />
					<path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
					<path d="M8 12h8" />
					<path d="M8 16h8" />
					<path d="M8 20h8" />
				</svg>

				<!-- 文本文件图标 -->
				<svg
					v-else-if="getFileExtension(file.name) === 'txt'"
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 w-4 h-4 text-gray-600 dark:text-gray-400"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M14 3v4a1 1 0 0 0 1 1h4" />
					<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
					<path d="M9 9h1" />
					<path d="M9 13h6" />
					<path d="M9 17h6" />
				</svg>

				<!-- 默认文件图标 -->
				<svg
					v-else
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 w-4 h-4 text-gray-500 dark:text-gray-400"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M14 3v4a1 1 0 0 0 1 1h4" />
					<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
				</svg>

				<span class="text-sm truncate max-w-[100px] text-gray-700 dark:text-gray-200">{{ file.originalFileName || file.name }}</span>
				<button @click="removeFile(index)" class="ml-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-4 h-4"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path stroke="none" d="M0 0h24v24H0z" fill="none" />
						<path d="M18 6l-12 12" />
						<path d="M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- 图片预览 -->
			<div
				v-for="(image, index) in uploadedImages"
				:key="'img-' + index"
				class="flex items-center px-3 py-1.5 bg-gray-100 rounded-full shadow-sm dark:bg-gray-700"
			>
				<img :src="baseURL + image.url" class="object-cover mr-2 w-4 h-4 rounded" />
				<span class="text-sm truncate max-w-[100px] text-gray-700 dark:text-gray-200">{{ image.name }}</span>
				<button @click="removeImage(index)" class="ml-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="w-4 h-4"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path stroke="none" d="M0 0h24v24H0z" fill="none" />
						<path d="M18 6l-12 12" />
						<path d="M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- 文件解析状态 -->
			<div v-if="isParsingFile || parseMessage" class="flex items-center mt-1 w-full text-sm text-blue-600 dark:text-blue-400">
				<svg v-if="isParsingFile" class="mr-2 w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<span>{{ parseMessage || '文件解析中，请稍候...' }}</span>
			</div>
		</div>

		<!-- 主要输入区域容器 -->
		<div class="flex justify-center items-center w-full">
			<label for="prompt" class="sr-only">Enter your prompt</label>

			<!-- 文本输入区域 - 改进设计的输入框 -->
			<div class="flex relative items-center w-full md:w-4/5">
				<input
					v-model="content"
					id="chat"
					type="text"
					@keydown.enter.prevent="onSendMessage"
					:placeholder="isParsingFile ? '文件解析中，请稍候...' : placeholder"
					:disabled="!isFinish || isParsingFile"
					class="px-4 py-3 pr-24 w-full h-14 text-base text-gray-900 bg-white rounded-full border shadow-sm transition-all duration-200 border-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 focus:outline-none hover:border-slate-300 dark:hover:border-gray-600"
				/>

				<!-- 功能按钮区域 - 改进了按钮的样式 -->
				<div class="flex absolute right-3 items-center space-x-2">
					<!-- 文件上传按钮 -->
					<button
						v-if="isFileUploadAllowed"
						:disabled="!isFinish"
						class="p-1.5 text-gray-500 rounded-full transition-colors duration-200 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
						type="button"
						@click="openFileUploadDialog"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							aria-hidden="true"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
							<path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
							<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
							<path d="M12 11v6"></path>
							<path d="M9.5 13.5l2.5 -2.5l2.5 2.5"></path>
						</svg>
					</button>

					<!-- 图片上传按钮 -->
					<button
						v-if="isFileUploadAllowed"
						:disabled="!isFinish"
						class="p-1.5 text-gray-500 rounded-full transition-colors duration-200 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
						type="button"
						@click="openImageUploadDialog"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							aria-hidden="true"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
							<path d="M15 8h.01"></path>
							<path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"></path>
							<path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"></path>
							<path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"></path>
						</svg>
					</button>

					<!-- MCP选择按钮 -->
					<button
						v-if="isMcpSelectionAllowed"
						:disabled="!isFinish"
						class="p-1.5 text-gray-500 rounded-full transition-colors duration-200 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
						type="button"
						@click="onOpenMcp"
					>
						<svg
							fill="currentColor"
							fill-rule="evenodd"
							class="w-5 h-5"
							style="flex: none; line-height: 1"
							viewBox="0 0 24 24"
							width="1em"
							xmlns="http://www.w3.org/2000/svg"
						>
							<title>ModelContextProtocol</title>
							<path
								d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"
							></path>
							<path
								d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"
							></path>
						</svg>
					</button>

					<!-- 添加功能按钮 - 仅在特定知识库显示 -->
					<button
						v-if="isAdvancedFeaturesAllowed"
						:disabled="!isFinish"
						class="p-1.5 text-gray-500 rounded-full transition-colors duration-200 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
						type="button"
						@click="onOpenDialog"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							aria-hidden="true"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
							<path d="M12 5l0 14"></path>
							<path d="M5 12l14 0"></path>
						</svg>
					</button>

					<!-- 语音输入按钮 -->
					<button
						:disabled="!isFinish"
						class="p-1.5 text-gray-500 rounded-full transition-colors duration-200 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
						type="button"
						@click="onOpenAudio"
					>
						<svg
							t="1723604425873"
							class="w-5 h-5"
							viewBox="0 0 1024 1024"
							version="1.1"
							xmlns="http://www.w3.org/2000/svg"
							p-id="4335"
							width="256"
							height="256"
						>
							<!-- 语音图标SVG路径 -->
							<path
								d="M483.363 517.9h-53.357v53.348h53.357V517.9z m-160.051 0v53.348h53.348V517.9h-53.348z m213.398 53.348h53.348V517.9H536.71v53.348z m160.051 0V517.9h-53.347v53.348h53.347z m-266.755 53.365v53.348h53.357v-53.348h-53.357z m-106.694 0l19.802 53.348h33.545v-53.348h-53.347z m213.398 53.348h53.348v-53.348H536.71v53.348z m-106.704 69.748l53.357 10.273v-26.674h-53.357v16.401z m106.704 5.514l53.348-8.576v-13.338H536.71v21.914z m106.704-75.262h38.922l14.425-53.348h-53.347v53.348zM536.71 464.553h-53.347V517.9h53.347v-53.347z m-106.704 0h-53.347V517.9h53.347v-53.347zM590.058 517.9h53.356v-53.347h-53.356V517.9zM483.363 624.613h53.347v-53.365h-53.347v53.365z m-53.357-53.365h-53.347v53.365h53.347v-53.365z m160.052 53.365h53.356v-53.365h-53.356v53.365z m-106.695 53.348v53.348h53.347v-53.348h-53.347z m-106.704 0v36.746l53.347 16.602v-53.348h-53.347z m213.399 53.348l53.356-17.449v-35.898h-53.356v53.347z m106.703-160.061v53.365l17.414-35.896v-17.469h-17.414zM536.71 464.553h53.348v-53.348H536.71v53.348z m160.051 0v-53.348h-53.347v53.348h53.347z m-213.398-53.347h-53.357v53.348h53.357v-53.348z m-160.051 0v53.348h53.348v-53.348h-53.348z m106.694-53.348h-53.347v53.348h53.347v-53.348z m106.704 0h-53.347v53.348h53.347v-53.348z m53.348 53.348h53.356v-53.348h-53.356v53.348z m-53.348-53.348h53.348v-53.347H536.71v53.347z m160.051 0v-53.347h-53.347v53.347h53.347z m-213.398-53.347h-53.357v53.347h53.357v-53.347z m-160.051 0v53.347h53.348v-53.347h-53.348z m106.694-53.347h-53.347v53.347h53.347V144.45z m106.704 53.347V144.45h-53.347v53.347h53.347z m53.348 0h53.356V144.45h-53.356v53.347z m0-53.347V91.103H536.71v53.347h53.348z m106.703 0l-53.347-53.347v53.347h53.347z m-213.398 0V91.103h-53.357v53.347h53.357zM363.58 104.846l-40.269 39.604h53.348V91.103l-13.079 13.743z m173.13-67.091h-53.347v53.348h53.347V37.755zM430.006 64.429l-26.674 13.337-26.673 13.337h53.347V64.429zM624.092 78.08l-34.034-13.65v26.674h53.356L624.092 78.08z"
								fill="currentColor"
								p-id="4336"
							></path>
							<path
								d="M847.257 554.738c0-16.934-5.533-27.965-15.551-27.965-10.938 0-15.568 11.031-15.568 27.965 0 162.92-169.403 303.777-306.166 303.777-155.836 0-305.77-152-305.77-304.184 0-16.934-9.233-21.527-15.098-21.527-6.42 0-16.427 5-16.427 21.934 0 175.906 151.252 320.232 323.128 335.746v72.512h-169.81c-16.952 0-30.667 5.609-30.667 18.281 0 11.824 13.715 15.365 30.667 15.365h367.953c16.953 0 30.667-2.951 30.667-15.346 0-13.283-13.714-18.301-30.667-18.301H526.499v-72.512c171.877-15.512 320.758-159.838 320.758-335.745zM509.972 769.383c118.547 0 214.644-96.125 214.644-214.645V248.12c0-118.537-96.097-214.644-214.644-214.644-118.546 0-214.644 96.106-214.644 214.644v306.619c0 118.519 96.097 214.644 214.644 214.644zM328.163 248.12c0-101.197 75.852-183.248 181.809-183.248 97.397 3.247 180.73 75.262 183.387 183.248v306.619c0 97.971-73.104 185.332-183.387 185.332-110.394 0-181.809-85.408-181.809-185.332V248.12z"
								fill="currentColor"
								p-id="4337"
							></path>
						</svg>
					</button>

					<!-- 联网搜索切换按钮 - 仅在特定知识库显示 -->
					<button
						v-if="isWebSearchAllowed"
						:disabled="!isFinish"
						class="p-1.5 rounded-full transition-colors duration-200 tooltip hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
						:class="{ 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-gray-700': isReasoningMode, 'text-gray-500': !isReasoningMode }"
						data-tip="联网搜索"
						type="button"
						@click="toggleReasoningMode"
					>
						<svg
							t="1739106263731"
							class="w-5 h-5"
							viewBox="0 0 1024 1024"
							version="1.1"
							xmlns="http://www.w3.org/2000/svg"
							p-id="4278"
							width="256"
							height="256"
						>
							<!-- 联网搜索图标SVG路径 -->
							<path
								d="M518.559767 990.705821a481.102936 481.102936 0 0 0 66.717634-5.439807C709.113009 877.10985 789.110171 705.435939 789.110171 512.0028s-79.997163-365.10705-203.83277-473.263214a481.102936 481.102936 0 0 0-66.717634-5.439807c141.914966 95.996595 237.431579 274.550262 237.431579 478.703021s-95.516612 382.546432-237.431579 478.703021zM498.400482 990.705821a483.182862 483.182862 0 0 1-66.397645-5.439807C307.847241 877.10985 227.850078 705.435939 227.850078 512.0028S307.847241 146.89575 432.002837 38.739586a483.182862 483.182862 0 0 1 66.717634-5.439807C356.485516 129.456368 260.968904 307.850041 260.968904 512.0028s95.516612 382.546432 237.431578 478.703021z"
								fill="currentColor"
								p-id="4279"
							></path>
							<path
								d="M512 805.272398a509.421931 509.421931 0 0 0-287.989785 88.956845c9.439665 7.199745 19.359313 13.919506 29.278961 20.479273a478.223038 478.223038 0 0 1 518.381614 0c9.919648-6.559767 19.839296-13.279529 29.278961-20.479273A509.421931 509.421931 0 0 0 512 805.272398zM512 218.573207A509.421931 509.421931 0 0 1 224.010215 129.616363c9.439665-7.199745 19.359313-13.919506 29.278961-20.31928A476.783089 476.783089 0 0 0 512 185.454382a476.783089 476.783089 0 0 0 259.190807-76.157299c9.919648 6.399773 19.839296 13.119535 29.278961 20.31928A509.421931 509.421931 0 0 1 512 218.573207zM6.737921 495.36339h984.125094v33.118825H6.737921z"
								fill="currentColor"
								p-id="4280"
							></path>
							<path
								d="M970.863725 285.130847a14.559484 14.559484 0 0 0-1.119961-2.239921v-0.799971l-1.279954-1.599944a15.999433 15.999433 0 0 0-26.879047 18.879331A478.863015 478.863015 0 0 1 512 990.865815c-175.993758 0-335.988083-104.956277-418.865143-246.871244a15.999433 15.999433 0 0 0-15.999433-11.039608 15.999433 15.999433 0 0 0-15.999432 15.999433 17.599376 17.599376 0 0 0 1.599943 7.199744A504.142119 504.142119 0 0 0 512 1023.984641a511.981841 511.981841 0 0 0 458.863725-738.853794zM63.055923 678.876881H64.015889A447.984111 447.984111 0 0 1 33.136985 512.0028 478.703021 478.703021 0 0 1 879.986948 205.933656a15.999433 15.999433 0 0 0 26.239069-20.159285v-1.919932A504.782096 504.782096 0 0 0 512 0.020959 511.981841 511.981841 0 0 0 0.018159 512.0028a555.98028 555.98028 0 0 0 31.998865 177.91369 16.799404 16.799404 0 0 0 33.118826-3.839864 15.999433 15.999433 0 0 0-2.079927-7.199745z"
								fill="currentColor"
								p-id="4281"
							></path>
							<path
								d="M927.985246 240.332436m-16.63941 0a16.63941 16.63941 0 1 0 33.278819 0 16.63941 16.63941 0 1 0-33.278819 0Z"
								fill="currentColor"
								p-id="4282"
							></path>
							<path d="M489.120811 11.220562h35.678735v993.56476h-35.678735z" fill="currentColor" p-id="4283"></path>
						</svg>
					</button>
				</div>
			</div>

			<!-- 发送按钮 -->
			<button
				type="submit"
				:disabled="!isFinish"
				@click="onSendMessage"
				class="p-2 ml-2 text-gray-500 bg-white rounded-full shadow-sm transition-all duration-200 hover:text-blue-600 hover:bg-blue-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-6 h-6"
					aria-hidden="true"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
					<path d="M10 14l11 -11"></path>
					<path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"></path>
				</svg>
			</button>
		</div>
	</div>

	<!-- 文件上传对话框 -->
	<el-dialog v-model="fileUploadDialogVisible" width="500px">
		<Upload
			ref="fileUploadRef"
			v-model="fileUrls"
			:file-size="1"
			:limit="1"
			:file-type="['doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx']"
			@change="handleFileUploadChange"
		/>
		<template #footer>
			<div class="flex gap-2 justify-end">
				<el-button @click="fileUploadDialogVisible = false">{{ $t('common.cancelButtonText') }}</el-button>
				<el-button type="primary" @click="confirmFileUpload">{{ $t('common.confirmButtonText') }}</el-button>
			</div>
		</template>
	</el-dialog>

	<!-- 图片上传对话框 -->
	<el-dialog v-model="imageUploadDialogVisible" width="500px">
		<Upload
			ref="imageUploadRef"
			v-model="imageUrls"
			:file-size="1"
			:limit="1"
			:file-type="['png', 'jpg', 'jpeg']"
			@change="handleImageUploadChange"
		/>
		<template #footer>
			<div class="flex gap-2 justify-end">
				<el-button @click="imageUploadDialogVisible = false">{{ $t('common.cancelButtonText') }}</el-button>
				<el-button type="primary" @click="confirmImageUpload">{{ $t('common.confirmButtonText') }}</el-button>
			</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Dataset, FileBase64 } from '../ts/index';
import Upload from '/@/components/Upload/index.vue';
import { useMessage } from '/@/hooks/message';
import { embedDocument } from '/@/api/knowledge/aiDocument';
import other from '/@/utils/other';

// 组件属性定义
const props = defineProps({
	selectedKnowledge: {
		type: Object as () => Dataset,
		required: true, // 当前选择的知识库，必填项
	},
	placeholder: {
		type: String,
		default: 'Your message...', // 输入框占位符，默认文本
	},
	messageContent: {
		type: String,
		default: '', // 消息内容，默认为空
	},
	isReasoningMode: {
		type: Boolean,
		default: false, // 推理模式状态，默认关闭
	},
	isFinish: {
		type: Boolean,
		default: true, // 是否完成生成，默认为true允许发送
	},
	loading: {
		type: Boolean,
		default: false, // 加载状态，防止在生成回答时发送新消息
	},
});

// 定义组件事件
const emit = defineEmits([
	'sendMessage',
	'openDialog',
	'openAudio',
	'openMcp',
	'toggleReasoningMode',
	'update:messageContent',
	'update:isReasoningMode',
	'fileUploaded',
	'imageUploaded',
]);

// 消息内容的响应式引用
const content = ref(props.messageContent);

// 文件上传相关引用和状态
const uploadedFiles = ref<{ name: string; url: string; originalFileName: string }[]>([]);
const uploadedImages = ref<{ name: string; url: string }[]>([]);

// 文件解析状态
const isParsingFile = ref(false);
const parseMessage = ref('');

// 获取 baseURL 从环境变量
const baseURL = import.meta.env.VITE_API_URL || '';

// 上传组件引用
const fileUploadRef = ref();
const imageUploadRef = ref();

// 对话框控制
const fileUploadDialogVisible = ref(false);
const imageUploadDialogVisible = ref(false);

// 上传后的URL
const fileUrls = ref('');
const imageUrls = ref('');

// 消息提示
const { error, success } = useMessage();

// 知识库ID相关计算属性
const isFileUploadAllowed = computed(() => ['0'].includes(props.selectedKnowledge?.id));
const isAdvancedFeaturesAllowed = computed(() => ['0', '-1', '-2', '-6'].includes(props.selectedKnowledge?.id));
const isWebSearchAllowed = computed(() => props.selectedKnowledge?.id === '-7');
const isMcpSelectionAllowed = computed(() => props.selectedKnowledge?.id === '-8');

// 与父组件的双向绑定 - 监听props变化更新本地状态
watch(
	() => props.messageContent,
	(newVal) => {
		content.value = newVal;
	}
);

// 监听本地状态变化更新父组件
watch(
	() => content.value,
	(newVal) => {
		emit('update:messageContent', newVal);
	}
);

// 打开文件上传对话框
const openFileUploadDialog = () => {
	if (!props.isFinish) return;
	fileUploadDialogVisible.value = true;
	fileUrls.value = '';
};

// 打开图片上传对话框
const openImageUploadDialog = () => {
	if (!props.isFinish) return;
	imageUploadDialogVisible.value = true;
	imageUrls.value = '';
};

// 处理文件上传变化
const handleFileUploadChange = (url: string) => {
	if (!url) return;
	fileUrls.value = url;
};

// 处理图片上传变化
const handleImageUploadChange = (url: string) => {
	if (!url) return;
	imageUrls.value = url;
};

// 确认文件上传
const confirmFileUpload = async () => {
	if (!fileUrls.value) {
		error('请先上传文件');
		return;
	}

	const urls = fileUrls.value.split(',');
	uploadedFiles.value = urls.map((url) => {
		return {
			name: other.getQueryString(url, 'fileName'),
			url: url,
			originalFileName: other.getQueryString(url, 'originalFileName'),
		};
	});

	// 发送文件URL给父组件
	if (uploadedFiles.value.length > 0) {
		const fileData: FileBase64 = {
			name: uploadedFiles.value[0].name,
			type: getFileExtension(uploadedFiles.value[0].name),
			size: 0,
			url: uploadedFiles.value[0].url,
		};

		fileUploadDialogVisible.value = false;

		// 设置解析状态
		isParsingFile.value = true;
		parseMessage.value = '文件解析中，请稍候...';

		try {
			// 调用文件解析API
			const response = await embedDocument({
				url: uploadedFiles.value[0].url,
				name: uploadedFiles.value[0].name,
			});

			if (response && response.ok) {
				success('文件解析成功');
				parseMessage.value = '';
				isParsingFile.value = false;
				emit('fileUploaded', fileData);
			} else {
				parseMessage.value = '文件解析失败，请重试';
				isParsingFile.value = false;
			}
		} catch (err) {
			parseMessage.value = '文件解析失败，请重试';
			isParsingFile.value = false;
		}
	}
};

// 确认图片上传
const confirmImageUpload = () => {
	if (!imageUrls.value) {
		error('请先上传图片');
		return;
	}

	const urls = imageUrls.value.split(',');
	uploadedImages.value = urls.map((url) => {
		// 使用URL对象和URLSearchParams来解析URL参数
		const urlObj = new URL(url, window.location.origin);
		const params = new URLSearchParams(urlObj.search);
		const fileName = params.get('fileName') || urlObj.pathname.split('/').pop() || 'unknown.image';

		return {
			name: fileName,
			file: new File([], fileName),
			url: url,
		};
	});

	// 发送图片URL给父组件
	if (uploadedImages.value.length > 0) {
		const imageData: FileBase64 = {
			name: uploadedImages.value[0].name,
			type: getFileExtension(uploadedImages.value[0].name),
			size: 0,
			url: uploadedImages.value[0].url,
		};
		emit('imageUploaded', imageData);
	}

	imageUploadDialogVisible.value = false;
};

// 移除上传的文件
const removeFile = (index: number) => {
	uploadedFiles.value.splice(index, 1);
	parseMessage.value = '';
	isParsingFile.value = false;
};

// 移除上传的图片
const removeImage = (index: number) => {
	uploadedImages.value.splice(index, 1);
};

// 发送消息方法
const onSendMessage = () => {
	if ((!content.value.length && uploadedFiles.value.length === 0 && uploadedImages.value.length === 0) || !props.isFinish || isParsingFile.value)
		return; // 如果消息为空且没有上传文件或未完成生成或文件正在解析则不发送

	// 发送消息（不需要再传递文件和图片，因为已在上传时单独发送）
	emit('sendMessage');
};

// 打开对话框方法 - 用于添加功能
const onOpenDialog = () => {
	if (!props.isFinish) return; // 如果未完成生成则不执行
	emit('openDialog');
};

// 打开语音输入方法
const onOpenAudio = () => {
	if (!props.isFinish) return; // 如果未完成生成则不执行
	emit('openAudio');
};

// 切换推理模式方法 - 用于联网搜索
const toggleReasoningMode = () => {
	if (!props.isFinish) return; // 如果未完成生成则不执行
	emit('update:isReasoningMode', !props.isReasoningMode);
};

// 打开MCP选择方法
const onOpenMcp = () => {
	if (!props.isFinish) return; // 如果未完成生成则不执行
	emit('openMcp');
};

// 辅助函数 - 获取文件扩展名
const getFileExtension = (fileName: string): string => {
	const parts = fileName.split('.');
	if (parts.length > 1) {
		return parts[parts.length - 1].toLowerCase();
	}
	return '';
};
</script>
