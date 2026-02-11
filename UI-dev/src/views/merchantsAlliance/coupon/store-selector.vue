<template>
	<el-dialog v-model="show" destroy-on-close draggable>
		<template #header>
			<div class="flex gap4">
				<div class="text-2xl font-bold">选择门店</div>
				<div>
					<el-input v-model="keyword" placeholder="请输入门店名称或编号" />
				</div>
			</div>
		</template>
		<div class="flex flex-wrap gap4 justify-center">
			<div
				v-for="item in filter"
				:key="item.id"
				:class="selected.some((one: any) => one.id === item.id) ? '!bg-#eff6ff !b-#3b82f6' : ''"
				class="w80 cursor-pointer b-2 b-solid b-#ccc rd-2 p3 flex justify-between"
				@click="selectThis(item)"
			>
				<div>
					<div>{{ item.name }}</div>
					<div>{{ item.address }}</div>
				</div>
				<el-icon v-show="selected.some((one: any) => one.id === item.id)" class="font-bold text-2xl text-#3b82f6"><Check /></el-icon>
			</div>
			<div class="w80"></div>
			<div class="w80"></div>
			<div class="w80"></div>
			<div class="w80"></div>
		</div>
		<template #footer>
			<div class="flex justify-between items-center">
				<div>已选择 {{ selected.length }} 个门店</div>
				<el-button type="primary" size="default" @click="confirm">确 定</el-button>
			</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { storeOptsApi } from '/@/api/merchantsAlliance/coupon/coupon'
import { Session } from '/@/utils/storage'

const show = ref(false)
const keyword = ref('')
const selected = ref<any[]>([])
const storeOpts = ref([])

const emit = defineEmits(['updateSelectedStore'])

const loadStoreOpts = async () => {
	const resp = await storeOptsApi(Session.getTenant())
	if (resp.code === 0) {
		storeOpts.value = resp.data.records
	}
}

const openDialog = (stores: any[]) => {
	selected.value = stores
	loadStoreOpts()
	show.value = true
}

const filter = computed(() => {
	return storeOpts.value.filter((item: any) => {
		return item.name.includes(keyword.value)
	})
})

const selectThis = (store: any) => {
	const has = selected.value.some((item: any) => item.id === store.id)
	if (has) {
		selected.value = selected.value.filter((item: any) => item.id !== store.id)
	} else {
		selected.value.push(store)
	}
}

const confirm = () => {
	emit('updateSelectedStore', selected.value)
	show.value = false
}

defineExpose({ openDialog })
</script>
