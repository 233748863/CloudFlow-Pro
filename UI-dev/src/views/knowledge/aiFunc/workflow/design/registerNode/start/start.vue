<template>
	<div class="node-title !bg-green-500" ref="myNode">
		<SvgIcon name="local-start" :size="20" />
		<span class="node-name"><span></span></span>
	</div>
</template>

<script setup lang="ts">
import variables from '/@/assets/styles/variables.module.scss';
import SvgIcon from '/@/components/SvgIcon/index.vue';

const props = defineProps({
	properties: {
		type: Object,
		default: null,
	},
});
let myNode = ref(null);

onMounted(() => {
	let borderColor = variables.dragNodeBorderColor;
	if (props.properties.frontend_status == '0') {
		borderColor = variables.dangerColor;
	}
	myNode.value.style.border = `1px solid ${borderColor}`; //stroke边框
});
</script>
