<template>
  <div class="overflow-y-auto py h100">
    <el-form
      ref="couponFormRef"
      :model="form"
      :rules="rules"
      class="h-full"
      label-position="top"
      require-asterisk-position="right"
    >
      <div class="flex gap4 px h-full bg-#fff">
        <div class="h-full max-w250 flex flex-col flex-1 rd-2 shadow-lg bg-#fff">
          <div class="p6">
            <div class="text-xl mb2">{{ $t('coupon.form.basicInfo') }}</div>
            <div class="flex gap4">
              <div class="flex flex-1 flex-col max-w-3xl">
                <el-form-item :label="$t('coupon.name')" prop="name">
                  <el-input v-model="form.name" :placeholder="$t('coupon.placeholder.couponName')" />
                </el-form-item>
                <el-form-item :label="$t('coupon.form.summary')" prop="summary">
                  <el-input v-model="form.summary" :rows="2" maxlength="100" type="textarea" />
                </el-form-item>
              </div>
              <div class="flex w50">
                <el-form-item :label="$t('coupon.form.logoUrl')" prop="logoUrl">
                  <ImageUpload v-model:image-url="form.logoUrl" border-radius="10%">
                    <template #empty>
                      <el-icon><Plus /></el-icon>
                    </template>
                  </ImageUpload>
                </el-form-item>
              </div>
            </div>
          </div>
          <el-divider />
          <div class="px8">
            <div class="text-xl mb2">{{ $t('coupon.form.offerSettings') }}</div>
            <div class="flex gap4 h24">
              <el-form-item :label="$t('coupon.form.couponType')" class="w65" prop="type">
                <el-select v-model="form.type" :placeholder="$t('coupon.placeholder.couponType')" clearable>
                  <el-option v-for="item in couponType" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item
                v-if="form.type === 'CASH'"
                :label="$t('coupon.form.discountAmount')"
                class="w65"
                prop="discountAmount"
              >
                <el-input-number v-model="form.discountAmount" :min="0" :precision="2" />
              </el-form-item>
              <template v-if="form.type === 'DISCOUNT'">
                <el-form-item :label="$t('coupon.form.discountRate')" class="w65" prop="discountRate">
                  <el-input-number v-model="form.discountRate" :max="1" :min="0.01" :step="0.01" />
                </el-form-item>
                <el-form-item :label="$t('coupon.form.maxDeductibleAmount')" class="w65" prop="maxDeductibleAmount">
                  <el-input-number v-model="form.maxDeductibleAmount" :min="0" />
                </el-form-item>
              </template>
            </div>
          </div>
          <el-divider />
          <div class="px8">
            <div class="text-xl mb2">{{ $t('coupon.form.expirationSetting') }}</div>
            <div class="flex gap4 h24">
              <el-form-item :label="$t('coupon.form.validityTypes')" class="w65" prop="validityType">
                <el-select v-model="form.validityType" clearable>
                  <el-option v-for="item in validityType" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item
                v-if="form.validityType === 'FIXED_DATE_RANGE'"
                :label="$t('coupon.form.validRangeTime')"
                class="w85"
                prop="validRangeTime"
              >
                <el-date-picker
                  v-model="form.validRangeTime"
                  :end-placeholder="$t('coupon.placeholder.end')"
                  :range-separator="$t('coupon.placeholder.rangeSeparator')"
                  :start-placeholder="$t('coupon.placeholder.start')"
                  type="datetimerange"
                  value-format="YYYY-MM-DD HH:mm:ss"
                />
              </el-form-item>
              <el-form-item
                v-if="form.validityType === 'DYNAMIC_DAYS'"
                :label="$t('coupon.form.validDaysFromReceive')"
                class="w65"
                prop="validDaysFromReceive"
              >
                <el-input-number v-model="form.validDaysFromReceive" :min="0" />
              </el-form-item>
            </div>
          </div>
          <el-divider />
          <div class="px8">
            <div class="text-xl mb2">{{ $t('coupon.form.restrictionsUse') }}</div>
            <div class="flex gap4">
              <el-form-item :label="$t('coupon.form.totalQuantity')" class="w65" prop="totalQuantity">
                <el-input-number v-model="form.totalQuantity" :min="1" />
              </el-form-item>
              <el-form-item :label="$t('coupon.form.receiveLimitPerUser')" class="w65" prop="receiveLimitPerUser">
                <el-input-number v-model="form.receiveLimitPerUser" :min="1" />
              </el-form-item>
              <el-form-item :label="$t('coupon.form.minSpendAmount')" class="w65" prop="minSpendAmount">
                <el-input-number v-model="form.minSpendAmount" :min="0" :precision="2" />
              </el-form-item>
            </div>
            <el-form-item :label="$t('coupon.form.description')" class="max-w240" prop="description">
              <el-input v-model="form.description" :rows="2" type="textarea" />
            </el-form-item>
          </div>
          <el-divider />
          <div class="p6 pt0">
            <div class="text-xl mb2">{{ $t('coupon.form.merchants') }}</div>
            <div class="flex gap4">
              <div>
                <el-form-item :label="$t('coupon.form.rebateRate')" class="w65" prop="rebateRate">
                  <el-input-number
                    v-model="form.rebateRate"
                    :max="100"
                    :min="0"
                    :placeholder="$t('coupon.placeholder.rebateRate')"
                  />
                </el-form-item>
                <el-button class="b-2 b-dashed b-#e8eaee w65 mt" icon="plus" @click="showMerchantSelector">
                  {{ $t('coupon.button.selectCouponIssuer') }}
                </el-button>
                <div v-show="showTips" class="text-#f56c6c my1">请{{ $t('coupon.button.selectCouponIssuer') }}</div>
              </div>
              <div class="b-2 b-dashed b-#e8eaee w100 rd-2 p2">
                <div class="text-#666">已选择的发券商家（{{ state.merchants.length }}家）：</div>
                <div class="flex flex-wrap gap2">
                  <el-tag
                    v-for="merchant in form.merchants"
                    :key="merchant"
                    type="primary"
                    closable
                    @close="removeThisMerchant(merchant)"
                  >
                    {{ state.merchants.find((one: IMerchant) => one.id === merchant)?.merchantName }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col w120 gap4">
          <div class="rd-2 bg-#fff p6 shadow-lg">
            <div class="text-xl mb2">{{ $t('coupon.form.applicableStores') }}</div>
            <div>
              <el-form-item :label="$t('coupon.storeScope')">
                <el-select v-model="form.scope">
                  <el-option :label="$t('coupon.option.allStore')" value="MERCHANT_OWN" />
                  <el-option :label="$t('coupon.option.selectedStore')" value="STORE" />
                </el-select>
              </el-form-item>
              <div v-if="form.scope === 'STORE'">
                <el-button class="b-2 b-dashed b-#e8eaee w100 mb" icon="plus" @click="showStoreSelector">
                  {{ $t('coupon.button.selectStore') }}
                </el-button>
                <div class="flex flex-col gap1 max-h-50 overflow-y-auto">
                  <div v-for="store in state.storeList" :key="store.id" class="rd-2 px4 py2 w100 bg-#f7f7f7">
                    <div class="flex justify-between">
                      <div class="line-clamp-1">{{ store.name }}</div>
                      <div class="w10 flex justify-end cursor-pointer" @click="removeThisStore(store.id)">
                        <el-icon>
                          <Close />
                        </el-icon>
                      </div>
                    </div>
                    <div class="line-clamp-1">{{ store.address }}</div>
                  </div>
                </div>
                <div class="text-#6b99cb">已选择 {{ form.storeIds.length }} 个门店</div>
              </div>
            </div>
          </div>
          <div class="rd-2 bg-#fff p6 shadow-lg">
            <div class="text-xl mb2">{{ $t('coupon.form.applicableProducts') }}</div>
            <div>
              <el-form-item :label="$t('coupon.goodsScope')">
                <el-select v-model="state.applicableProducts">
                  <el-option :label="$t('coupon.option.allGoods')" :value="0" />
                  <el-option :label="$t('coupon.option.selectedGoods')" :value="1" />
                </el-select>
              </el-form-item>
              <div v-if="state.applicableProducts === 1">
                <el-button class="b-2 b-dashed b-#e8eaee w100 mb" icon="plus" @click="showProductSelector">
                  {{ $t('coupon.button.selectGoods') }}
                </el-button>
                <div v-if="state.skuList.length > 0" class="overflow-y-auto flex flex-col gap1 max-h-50">
                  <div v-for="sku in state.skuList" :key="sku.skuId" class="rd-2 px4 py2 w100 bg-#f7f7f7">
                    <div class="flex justify-between">
                      <div class="line-clamp-1">{{ sku.skuName }}</div>
                      <div class="w10 flex justify-end cursor-pointer" @click="removeThisGoods(sku.skuId)">
                        <el-icon>
                          <Close />
                        </el-icon>
                      </div>
                    </div>

                    <div class="flex justify-between">
                      <div class="flex gap1">
                        <span v-for="(attr, idx) in sku?.attributes" :key="idx">{{ idx }}：{{ attr }}</span>
                      </div>
                      <div>
                        {{
                          sku.price.toLocaleString('zh-CN', {
                            style: 'currency',
                            currency: 'CNY',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="text-#6b99cb">已选择 {{ form.skuIds.length }} 个商品</div>
              </div>
            </div>
          </div>
          <div class="rd-2 bg-#fff p6 shadow-lg">
            <div class="text-xl mb2">{{ $t('coupon.form.couponStatus') }}</div>
            <div>
              <el-form-item :label="$t('coupon.form.couponStatus')" prop="couponStatus">
                <el-select v-model="form.couponStatus">
                  <el-option :label="$t('coupon.option.enabled')" :value="1" />
                  <el-option :label="$t('coupon.option.disabled')" :value="0" />
                </el-select>
              </el-form-item>
            </div>
            <el-form-item>
              <div class="w100 mt20 flex">
                <el-button class="w80" size="large" type="primary" @click="submit">
                  {{ $t('coupon.button.createCoupon') }}
                </el-button>
                <el-button class="w80" size="large" @click="reset">{{ $t('coupon.button.reset') }}</el-button>
              </div>
            </el-form-item>
          </div>
        </div>
      </div>
    </el-form>

    <store-selector ref="storeSelectorRef" @update-selected-store="updateSelectedStore" />
    <product-selector ref="productSelectorRef" @update-selected-goods="updateSelectedGoods" />
    <merchant-selector ref="merchantSelectorRef" @update-selected-merchant="updateSelectedMerchant" />
  </div>
</template>

<script setup lang="ts">
import { addCouponApi } from '/@/api/merchantsAlliance/coupon/coupon'
import { ICouponForm, IMerchant, ISku, IStore } from '/@/api/merchantsAlliance/coupon/types'
import { useDict } from '/@/hooks/dict'
import mittBus from '/@/utils/mitt'
import { Session } from '/@/utils/storage'
import MerchantSelector from '/@/views/merchantsAlliance/coupon/merchant-selector.vue'
import ProductSelector from '/@/views/merchantsAlliance/coupon/product-selector.vue'
import StoreSelector from '/@/views/merchantsAlliance/coupon/store-selector.vue'

import { ElMessage, FormInstance, FormRules } from 'element-plus'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()

const ImageUpload = defineAsyncComponent(() => import('/@/components/Upload/Image.vue'))

const { coupon_type: couponType, coupon_validity_type: validityType } = useDict('coupon_type', 'coupon_validity_type')

const couponFormRef = ref<FormInstance>()

const storeSelectorRef = ref()
const productSelectorRef = ref()
const merchantSelectorRef = ref()

const showTips = ref(false)

const form = reactive<ICouponForm>({
  name: '',
  summary: '',
  description: '',
  logoUrl: '',
  type: '',
  scope: '',
  discountAmount: null,
  discountRate: null,
  maxDeductibleAmount: 0,
  minSpendAmount: 0,
  totalQuantity: 0,
  validityType: '',
  validStartTime: '',
  validEndTime: '',
  validRangeTime: [],
  validDaysFromReceive: 0,
  receiveLimitPerUser: 1,
  rebateRate: 0,
  merchantId: Session.getTenant(),
  storeIds: [] as string[],
  skuIds: [] as string[],
  merchants: [] as string[],
  couponStatus: null,
})

const rules = reactive<FormRules<ICouponForm>>({
  name: [
    { required: true, message: '请输入优惠券名称', trigger: ['blur', 'change'] },
    { min: 2, max: 50, message: '长度在2到50个字符', trigger: ['blur', 'change'] },
  ],
  summary: [{ max: 100, message: '不能超过100个字符', trigger: 'blur' }],
  logoUrl: [{ required: true, message: '请上传优惠券LOGO', trigger: 'change' }],
  type: [{ required: true, message: '请选择优惠券类型', trigger: 'change' }],
  discountAmount: [
    {
      required: true,
      validator: (rule: any, value: number, callback: any) => {
        if (form.type === 'CASH' && (!value || value <= 0)) {
          callback(new Error('折扣金额必须大于0'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  discountRate: [
    {
      required: true,
      validator: (rule: any, value: number, callback: any) => {
        console.log('discountRate', value)
        if (form.type === 'DISCOUNT' && (!value || value <= 0 || value > 1)) {
          callback(new Error('折扣比例必须在0~1之间'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  maxDeductibleAmount: [
    {
      required: true,
      validator: (rule: any, value: number, callback: any) => {
        if (form.type === 'DISCOUNT' && (!value || value <= 0)) {
          callback(new Error('最高抵扣金额必须大于0'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  validityType: [{ required: true, message: '请选择有效期类型', trigger: 'change' }],
  validRangeTime: [
    {
      required: true,
      validator: (rule: any, value: string[], callback: any) => {
        if (form.validityType == 'FIXED_DATE_RANGE' && !value.length) {
          callback(new Error('请选择优惠券有效期的开始日期和结束日期'))
        } else {
          callback()
        }
      },
      trigger: ['change', 'blur'],
    },
  ],
  validDaysFromReceive: [
    { required: true, message: '请填写有效期天数', trigger: ['change', 'blur'] },
    { type: 'number', min: 1, message: '有效期天数必须大于0', trigger: ['change', 'blur'] },
  ],
  totalQuantity: [
    { required: true, message: '请输入发券总量', trigger: 'blur' },
    { type: 'number', message: '必须大于0', trigger: ['blur', 'change'] },
  ],
  receiveLimitPerUser: [
    { required: true, message: '请输入每用户限领数量', trigger: 'blur' },
    { type: 'number', min: 1, message: '必须大于0', trigger: 'blur' },
  ],
  minSpendAmount: [{ type: 'number', min: 0, message: '不能为负数', trigger: 'blur' }],
  description: [{ max: 500, message: '不能超过500个字符', trigger: 'blur' }],
  rebateRate: [{ type: 'number', min: 0, message: '返利比例必须在0-100之间', trigger: ['blur', 'change'] }],
  couponStatus: [
    { required: true, message: '请选择优惠券状态', trigger: ['change', 'blur'] },
    { type: 'number', message: '优惠券状态必须为1或0', trigger: ['change', 'blur'] },
  ],
  merchants: [{ required: true, message: '', trigger: ['blur', 'change'] }],
})

const state = reactive({
  applicableStores: 0,
  applicableProducts: 0,
  skuList: [] as ISku[],
  storeList: [] as IStore[],
  merchants: [] as IMerchant[],
})

const showStoreSelector = () => storeSelectorRef.value.openDialog(state.storeList)

const showProductSelector = () => productSelectorRef.value.openDialog(state.skuList)

const showMerchantSelector = () => merchantSelectorRef.value.openDialog(state.merchants)

const updateSelectedStore = (stores: IStore[]) => {
  state.storeList = stores
  form.storeIds = state.storeList.map((item: IStore) => item.id)
}

const updateSelectedGoods = (goods: ISku[]) => {
  state.skuList = goods
  form.skuIds = state.skuList.map((item: ISku) => item.skuId)
}

const updateSelectedMerchant = (merchants: IMerchant[]) => {
  state.merchants = merchants
  form.merchants = state.merchants.map((item: IMerchant) => item.id)

  showTips.value = form.merchants.length <= 0
}

const removeThisStore = (id: string) => {
  state.storeList = state.storeList.filter((store: IStore) => store.id !== id)
  form.storeIds = state.storeList.map((item: IStore) => item.id)
}

const removeThisGoods = (id: string) => {
  state.skuList = state.skuList.filter((sku: ISku) => sku.skuId !== id)
  form.skuIds = state.skuList.map((item: ISku) => item.skuId)
}

const removeThisMerchant = (id: string) => {
  state.merchants = state.merchants.filter((merchant: IMerchant) => merchant.id !== id)
  form.merchants = state.merchants.map((item: IMerchant) => item.id)

  showTips.value = form.merchants.length <= 0
}

const reset = () => {
  couponFormRef.value?.resetFields()

  state.skuList = [] as ISku[]
  state.storeList = [] as IStore[]
  state.merchants = [] as IMerchant[]
}

const submit = async () => {
  await couponFormRef.value?.validate(async (valid, fields) => {
    if (form.merchants.length <= 0) {
      showTips.value = true

      return
    }

    if (valid) {
      if (form.type === 'DISCOUNT' && form.discountRate != null && form.discountRate > 0) {
        delete form.discountAmount
      }

      if (form.type === 'CASH') {
        delete form.discountRate
        delete form.maxDeductibleAmount
      }

      if (form.validityType === 'FIXED_DATE_RANGE') {
        form.validStartTime = form.validRangeTime[0]
        form.validEndTime = form.validRangeTime[1]

        delete form.validRangeTime
        delete form.validDaysFromReceive
      }

      const resp = await addCouponApi(form)
      if (resp.code === 0) {
        ElMessage.success({
          message: t('coupon.message.success'),
          onClose: () => {
            // 关闭标签页
            reset()
            mittBus.emit('onCurrentContextmenuClick', { contextMenuClickId: 1, ...route })
          },
        })
      } else {
        ElMessage.error(resp.msg ?? t('coupon.message.error'))
      }
    } else {
      console.log('errors submit', fields)
    }
  })
}
</script>
