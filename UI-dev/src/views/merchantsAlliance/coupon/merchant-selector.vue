<template>
	<el-dialog v-model="show" destroy-on-close draggable>
		<template #header>
			<div class="flex gap4">
				<div class="text-2xl font-bold">选择商家</div>
				<div>
					<el-input v-model="params.name" placeholder="请输入商家名称" />
				</div>
			</div>
		</template>
		<div class="flex flex-wrap gap4 justify-center">
			<div
				v-for="item in merchantOpts"
				:key="item.id"
				:class="selected.some((one: any) => one.id === item.id) ? '!bg-#eff6ff !b-#3b82f6' : ''"
				class="w80 b-2 b-solid b-#ccc rd-2 p3 flex justify-between cursor-pointer"
				@click="selectThis(item)"
			>
				<div class="flex gap2 items-center">
					<img :src="item.logoUrl" class="w10 h10 rd-2" />
					<div class="text-lg font-bold">{{ item.merchantName }}</div>
				</div>
				<div class="w10 flex justify-end">
					<el-icon v-show="selected.some((one: any) => one.id === item.id)" class="font-bold text-2xl text-#3b82f6"><Check /></el-icon>
				</div>
			</div>
			<div class="w80"></div>
			<div class="w80"></div>
			<div class="w80"></div>
			<div class="w80"></div>
		</div>
		<template #footer>
			<div>
				<div class="mb">
					<el-pagination :page-size="params.pageSize" :total="total" background layout="prev, pager, next" @current-change="onPageChange" />
				</div>
				<div class="flex justify-between items-center">
					<div>已选择 {{ selected.length }} 个商家</div>
					<el-button type="primary" size="default" @click="confirm">确 定</el-button>
				</div>
			</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { merchantOptsApi } from '/@/api/merchantsAlliance/coupon/coupon'
import { IMerchantPageParams } from '/@/api/merchantsAlliance/coupon/types'

const show = ref(false)
const merchantOpts = ref([])
const selected = ref<any[]>([])
const params = ref<IMerchantPageParams>({ enable: true, businessStatus: [], name: '', page: 1, pageSize: 10 })
const total = ref(0)

const emit = defineEmits(['updateSelectedMerchant'])

const loadMerchant = async () => {
	const newParams = params.value
	let requestParams: Partial<IMerchantPageParams> = {}
	Object.keys(newParams).forEach((key: string) => {
		const thisKey = key as keyof IMerchantPageParams
		if (newParams[thisKey] != null && newParams[thisKey] != '') {
			requestParams = Object.assign(requestParams, { [thisKey]: newParams[thisKey] })
		}
	})

	requestParams['businessStatus'] = []
	const resp = await merchantOptsApi(requestParams)
	if (resp.code === 0) {
		merchantOpts.value = resp.data.records
		total.value = resp.data.total
	}
}

const onPageChange = (page: number) => {
	params.value.page = page
	loadMerchant()
}

const openDialog = (merchants: any[]) => {
	selected.value = merchants
	loadMerchant()
	show.value = true
}

const selectThis = (merchant: any) => {
	const has = selected.value.some((item: any) => item.id === merchant.id)
	if (has) {
		selected.value = selected.value.filter((item: any) => item.id !== merchant.id)
	} else {
		selected.value.push(merchant)
	}
}

const confirm = () => {
	emit('updateSelectedMerchant', selected.value)
	show.value = false
}

defineExpose({ openDialog })
</script>

<style scoped lang="scss"></style>
