<template>
	<div class="shadow mx-[30px] pages-preview">
		<div
			v-for="(widget, index) in pageData"
			:key="widget.id"
			:class="{
				'cursor-pointer': !widget?.disabled,
			}"
			class="relative"
			@click="handleClick(widget, index)"
		>
			<div
				:class="{
					'widget-selected': index === modelValue,
					'widget-hoverable': !widget?.disabled,
				}"
				class="absolute inset-0 pointer-events-none"
			></div>
			<slot>
				<component :is="widgets[widget?.name]?.content" :key="widget.id" :content="widget.content" :styles="widget.styles" />
			</slot>
		</div>
		<slot name="footer" />
	</div>
</template>
<script lang="ts" setup>
import widgets from '../widgets';
import type { PropType } from 'vue';

defineProps({
	pageData: {
		type: Array as PropType<any[]>,
		default: () => [],
	},
	modelValue: {
		type: Number,
		default: 0,
	},
});

const emit = defineEmits<{
	(event: 'update:modelValue', value: number): void;
}>();

const handleClick = (widget: any, index: number) => {
	if (widget.disabled) return;
	emit('update:modelValue', index);
};
</script>

<style lang="scss" scoped>
.pages-preview {
	background-color: #f8f8f8;
	width: 360px;
	height: 585px;
	color: #333;
	
	.widget-hoverable {
		@apply border-2 border-dashed border-[#dcdfe6] z-[100];
	}
	
	.widget-selected {
		@apply border-2 border-solid border-primary z-[101];
		box-shadow: 0 0 0 2px rgba(var(--color-primary), 0.1);
	}
}
</style>
