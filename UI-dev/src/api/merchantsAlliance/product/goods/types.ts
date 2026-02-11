import type { FormRules } from 'element-plus'

export enum TypeMapper {
  PHYSICAL = '实物商品',
  SERVICE = '服务商品',
}

export enum StatusMapper {
  DRAFT = '草稿',
  PUBLISHED = '已发布',
  ARCHIVED = '已归档',
}

// 定义 attributes 的类型
export interface ProductAttributes {
  [key: string]: string
}

export interface SalesTrendItem {
  day: string
  sales: number
  percentage: number
}

// 类型定义
export interface ProductStats {
  favorites: number
  views: number
  sales: number
  avgPrice: string
}

export interface Product extends IGoodsFormData {
  id: string
  createdTime: string
  categoryName: string
  stats?: ProductStats
  rating?: number
  reviewCount?: number
}

export interface DetailDescriptionItem {
  type: 'DESCRIBE' | 'ATTRIBUTE'
  name: string
  label?: string
  value?: {
    project: string
    quantity: string
  }[]
}

export interface IGoodsFormData {
  id?: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  brandId: string
  categoryId: string
  /** 商品描述 */
  description?: string
  type: 'PHYSICAL' | 'SERVICE'
  mainImage: string
  detailImages: any[]
  /** 商品详情描述 */
  detailDescription: DetailDescriptionItem[]
  tags: any[]
  attributes: {
    label: string
    values: string[]
  }[]
  sortWeight: number
  skus: ISkus[]
  idempotencyKey: string
}

export interface ISkus {
  id?: string
  skuName: string
  skuCode: string
  price: number
  originalPrice: number
  stock: number
  warningStock: number
  specAttributes: Record<string, string>
  skuImage: string
  weight: number
  volume: number
  marketingConfig: string
  enabled: '0' | '1'
  sortWeight: number
  productId?: string
}

// 辅助验证函数
const validateStatus = (rule: any, value: string, callback: Function) => {
  const enums = ['DRAFT', 'PUBLISHED', 'ARCHIVED']
  if (!enums.includes(value)) {
    callback(new Error('状态必须是 DRAFT / PUBLISHED / ARCHIVED 之一'))
  } else {
    callback()
  }
}

const validateProductType = (rule: any, value: string, callback: Function) => {
  const enums = ['PHYSICAL', 'SERVICE']
  if (!enums.includes(value)) {
    callback(new Error('类型必须是 PHYSICAL / SERVICE 之一'))
  } else {
    callback()
  }
}

const validateNumericString = (rule: any, value: string, callback: Function) => {
  if (value && !/^-?\d+(\.\d+)?$/.test(value)) {
    callback(new Error('请输入有效的数字'))
  } else {
    callback()
  }
}

const validateSpecAttributes = (rule: any, value: Record<string, string>, callback: Function) => {
  const keys = Object.keys(value)
  keys.forEach((key) => {
    if (!value[key]) {
      callback(new Error(`请选择规格属性 ${key}`))
    }
  })
  callback()
}

// 主表单验证规则
export const formRules: FormRules<IGoodsFormData> = {
  name: [
    { required: true, message: '请输入商品名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' },
  ],
  status: [
    { required: true, message: '请选择商品状态', trigger: 'change' },
    { validator: validateStatus, trigger: 'change' },
  ],
  categoryId: [{ required: true, message: '请选择商品分类', trigger: 'change' }],
  description: [
    { required: true, message: '请输入商品描述', trigger: 'blur' },
    { min: 2, max: 200, message: '长度在 2 到 200 个字符', trigger: 'blur' },
  ],
  type: [
    { required: true, message: '请选择商品类型', trigger: 'change' },
    { validator: validateProductType, trigger: 'change' },
  ],
  mainImage: [
    { required: true, message: '请上传商品主图', trigger: 'change' },
    { type: 'string', message: '主图格式不正确', trigger: 'change' },
  ],
  detailImages: [{ type: 'array', message: '详情图片格式不正确', trigger: 'change' }],
  tags: [{ type: 'array', message: '标签格式不正确', trigger: 'change' }],
  attributes: [
    { required: true, message: '请输入商品属性', trigger: 'blur' },
    { type: 'array', min: 1, message: '请输入商品属性', trigger: 'blur' }
  ],
  sortWeight: [{ validator: validateNumericString, trigger: 'blur' }],
  skus: [
    { required: true, message: '请至少添加一个SKU', trigger: 'blur' },
    { type: 'array', min: 1, message: '请至少添加一个SKU', trigger: 'blur' },
  ],
}

// SKU 子表单验证规则（在循环渲染 SKU 时使用）
export const skuRules: FormRules<ISkus> = {
  skuName: [
    { required: true, message: '请输入SKU名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' },
  ],
  skuCode: [
    { required: true, message: '请输入SKU编码', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' },
  ],
  price: [
    { required: true, message: '请输入销售价格', trigger: 'blur' },
    { type: 'number', min: 0, message: '销售价格不能小于0', trigger: 'blur' },
  ],
  originalPrice: [
    { required: true, message: '请输入原价', trigger: 'blur' },
    { type: 'number', min: 0, message: '原价不能小于0', trigger: 'blur' },
  ],
  stock: [
    { required: true, message: '请输入库存', trigger: 'blur' },
    { type: 'number', min: 0, message: '库存不能小于0', trigger: 'blur' },
  ],
  warningStock: [
    { required: true, message: '请输入预警库存', trigger: 'blur' },
    { type: 'number', min: 0, message: '预警库存不能小于0', trigger: 'blur' },
  ],
  specAttributes: [{ required: true, validator: validateSpecAttributes, message: '规格属性格式不正确', trigger: 'blur' }],
  skuImage: [{ type: 'string', message: 'SKU图片格式不正确', trigger: 'change' }],
  weight: [{ validator: validateNumericString, trigger: 'blur' }],
  volume: [{ validator: validateNumericString, trigger: 'blur' }],
  marketingConfig: [{ type: 'string', message: '营销配置格式不正确', trigger: 'blur' }],
  enabled: [{ pattern: /^[01]$/, message: '启用状态格式不正确', trigger: 'change' }],
  sortWeight: [{ validator: validateNumericString, trigger: 'blur' }],
  productId: [{ type: 'number', message: '商品ID必须是数字', trigger: 'blur' }],
}
