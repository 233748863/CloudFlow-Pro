<template>
	<div class="absolute ml-4 bg-white rounded-4 z-[101]">
		<ul class="bg-white shadow overflow-hidden sm:rounded-md max-w-sm mx-auto">
			<li
				class="border-t border-gray-200"
				@mousedown="
					mousedownFunc({
						type: 'exec',
						name: '调用大模型',
					})
				"
			>
				<div class="px-4 py-5 sm:px-6">
					<div class="flex items-center justify-between">
						<h3 class="text-lg leading-6 font-medium text-gray-900">调用大模型</h3>
						<p class="mt-1 max-w-2xl text-sm text-gray-500">Description for Item 2</p>
					</div>
					<div class="mt-4 flex items-center justify-between">
						<p class="text-sm font-medium text-gray-500">Status: <span class="text-red-600">Inactive</span></p>
						<a href="#" class="font-medium text-indigo-600 hover:text-indigo-500">Edit</a>
					</div>
				</div>
			</li>
			<li
				class="border-t border-gray-200"
				@mousedown="
					mousedownFunc({
						type: 'result',
						name: '结果调整',
					})
				"
			>
				<div class="px-4 py-5 sm:px-6">
					<div class="flex items-center justify-between">
						<h3 class="text-lg leading-6 font-medium text-gray-900">结果调整</h3>
						<p class="mt-1 max-w-2xl text-sm text-gray-500">Description for Item 2</p>
					</div>
					<div class="mt-4 flex items-center justify-between">
						<p class="text-sm font-medium text-gray-500">Status: <span class="text-red-600">Inactive</span></p>
						<a href="#" class="font-medium text-indigo-600 hover:text-indigo-500">Edit</a>
					</div>
				</div>
			</li>
		</ul>
	</div>
</template>
<script setup lang="ts">
import { randomNumber } from '/@/views/knowledge/aiFunc/workflow/design/utils';

const props = defineProps({
	lf: {
		type: Object,
	},
});

let dragRow = reactive({
	type: '',
}); //拖拽的行
let randomNum = ref(null);

const mousedownFunc = (val) => {
	let typeList = ['funcDesc', 'exec', 'startParallel', 'endParallel', 'result'];
	if (typeList.includes(val.type)) {
		dragRow = val;
		randomNum.value = randomNumber();
		props.lf.dnd.startDrag({
			type: val.type,
			text: val.name,
			id: randomNum.value,
		});
	}
};

onMounted(() => {
	props.lf.on('node:dnd-add', () => {
		if (dragRow.type == 'start') {
			props.lf.setProperties(randomNum.value, {
				frontend_status: '0', //0配置错误，1配置正常
			});
		} else if (dragRow.type == 'funcDesc') {
			props.lf.setProperties(randomNum.value, {
				name: dragRow.name,
				desc: '',
				frontend_status: '1',
			});
		} else if (dragRow.type == 'exec') {
			props.lf.setProperties(randomNum.value, {
				name: dragRow.name,
				desc: '',
				frontend_status: '1',
			});
		} else if (dragRow.type == 'startParallel') {
			props.lf.setProperties(randomNum.value, {
				name: dragRow.name,
				desc: '',
				frontend_status: '0',
			});
		} else if (dragRow.type == 'endParallel') {
			props.lf.setProperties(randomNum.value, {
				name: dragRow.name,
				desc: '',
				frontend_status: '0',
			});
		} else if (dragRow.type == 'result') {
			props.lf.setProperties(randomNum.value, {
				name: dragRow.name,
				desc: '',
				frontend_status: '0',
			});
		}
	});
});
</script>
