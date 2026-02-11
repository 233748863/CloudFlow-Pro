<template>
	<el-dialog v-model="show" destroy-on-close draggable>
		<template #header>
			<div class="flex gap4">
				<div class="text-2xl font-bold">选择商品</div>
				<div>
					<el-input v-model="keyword" placeholder="请输入商品名称或编号" />
				</div>
			</div>
		</template>
		<div class="flex flex-wrap gap4 justify-center">
			<div
				v-for="item in goodsOpts"
				:key="item.skuId"
				:class="selected.some((one: any) => one.skuId === item.skuId) ? '!bg-#eff6ff !b-#3b82f6' : ''"
				class="w80 b-2 b-solid b-#ccc rd-2 p3 flex justify-between cursor-pointer"
				@click="selectThis(item)"
			>
				<div class="w100">
					<div class="flex gap2 mb3">
						<img :src="item.skuImage" class="w15 h15 rd-2" />
						<div class="h12 line-clamp-2 overflow-hidden">{{ item.skuName }}</div>
					</div>
					<div class="flex justify-between text-3.5">
						<div class="flex gap1">
							<span v-for="(attr, idx) in item.attributes" :key="idx" size="small"> {{ idx }}：{{ attr }} </span>
						</div>
						<div>
							{{
								item.price.toLocaleString('zh-CN', {
									style: 'currency',
									currency: 'CNY',
									minimumFractionDigits: 2,
									maximumFractionDigits: 2,
								})
							}}
						</div>
					</div>
				</div>
				<div class="w10 flex justify-end">
					<el-icon v-show="selected.some((one: any) => one.skuId === item.skuId)" class="font-bold text-2xl text-#3b82f6"><Check /></el-icon>
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
					<div>已选择 {{ selected.length }} 个商品</div>
					<el-button type="primary" size="default" @click="confirm">确 定</el-button>
				</div>
			</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { goodsOptsApi } from '/@/api/merchantsAlliance/coupon/coupon'
import { IGoodsPageParams, ISku } from '/@/api/merchantsAlliance/coupon/types'
import { Session } from '/@/utils/storage'

const show = ref(false)
const keyword = ref('')
const goodsOpts = ref([])
const selected = ref<ISku[]>([])
const params = ref<IGoodsPageParams>({ merchantId: Session.getTenant(), keyword: '', pageNum: 1, page: 1, pageSize: 10 })
const total = ref(0)

const emit = defineEmits(['updateSelectedGoods'])

const onPageChange = (page: number) => {
	params.value.page = page
	loadGoods()
}

const loadGoods = async () => {
	const newParams = params.value
	let requestParams: Partial<IGoodsPageParams> = {}
	Object.keys(newParams).forEach((key: string) => {
		const thisKey = key as keyof IGoodsPageParams
		if (newParams[thisKey] != null && newParams[thisKey] != '') {
			requestParams = Object.assign(requestParams, { [thisKey]: newParams[thisKey] })
		}
	})

	const resp = await goodsOptsApi(requestParams)
	if (resp.code === 0) {
		goodsOpts.value = resp.data.records.map((item: any) => ({
			skuId: item.skuId,
			skuName: item.skuName,
			skuImage: item.skuImage,
			attributes: item.attributes ? JSON.parse(item.attributes) : [],
			price: item.price,
		}))
	}
}

const openDialog = (skuList: ISku[]) => {
	selected.value = skuList
	loadGoods()
	show.value = true
}

const selectThis = (sku: ISku) => {
	const has = selected.value.some((item: ISku) => item.skuId === sku.skuId)
	if (has) {
		selected.value = selected.value.filter((item: ISku) => item.skuId !== sku.skuId)
	} else {
		selected.value.push(sku)
	}
}

const confirm = () => {
	emit('updateSelectedGoods', selected.value)
	show.value = false
}

defineExpose({ openDialog })
</script>
