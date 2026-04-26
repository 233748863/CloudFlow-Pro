# 鍓嶇閿欒澶勭悊鎸囧崡

鏈寚鍗椾粙缁嶅浣曚娇鐢ㄧ粺涓€鐨勯敊璇鐞嗗櫒鏉ュ鐞?API 閿欒銆?

## 姒傝堪

缁熶竴鐨勯敊璇鐞嗗櫒鎻愪緵浜嗕互涓嬪姛鑳斤細

1. **鑷姩閿欒鍒嗙被**锛氭牴鎹敊璇唬鐮佽嚜鍔ㄩ€夋嫨鍚堥€傜殑鎻愮ず鏂瑰紡
2. **鍙嬪ソ鐨勯敊璇彁绀?*锛氫负涓嶅悓绫诲瀷鐨勯敊璇彁渚涚敤鎴峰弸濂界殑鎻愮ず淇℃伅
3. **鐗规畩閿欒澶勭悊**锛氭敮鎸佸啿绐佽В鍐炽€佽繍琛屽疄渚嬭鍛婄瓑鐗规畩鍦烘櫙
4. **瀛楁绾у埆楠岃瘉**锛氭樉绀鸿〃鍗曞瓧娈电骇鍒殑楠岃瘉閿欒

## 蹇€熷紑濮?

### 1. 鍩烘湰鐢ㄦ硶

鏈€绠€鍗曠殑鐢ㄦ硶鏄湪 catch 鍧椾腑璋冪敤 `handleApiError`锛?

```typescript
import { handleApiError, ApiErrorResponse } from '@/utils/errorHandler';
import { AxiosError } from 'axios';
import request from '@/services/api/request';

try {
  const result = await request.post('/api/workflow/save', data);
  showSuccess('淇濆瓨鎴愬姛');
} catch (error) {
  handleApiError(error as AxiosError<ApiErrorResponse>);
}
```

### 2. 浣跨敤鍖呰鍣?

浣跨敤 `withErrorHandler` 鍙互璁╀唬鐮佹洿绠€娲侊細

```typescript
import { withErrorHandler, showSuccess } from '@/utils/errorHandler';

const handleSave = withErrorHandler(
  async () => {
    const result = await request.post('/api/workflow/save', data);
    showSuccess('淇濆瓨鎴愬姛');
    return result;
  },
  { customMessage: '淇濆瓨澶辫触' }
);

// 璋冪敤
await handleSave();
```

## 閿欒绫诲瀷澶勭悊

### 1. 鏉冮檺閿欒 (PERMISSION_DENIED)

鏉冮檺閿欒浼氳嚜鍔ㄦ樉绀哄弸濂界殑鎻愮ず锛屽寘鍚仈绯荤鐞嗗憳鐨勫缓璁€?

```typescript
// 鍚庣杩斿洖 403 鎴?code: 'PERMISSION_DENIED'
// 鑷姩鏄剧ず锛?
// "鎮ㄦ病鏈夋潈闄愭墽琛屾鎿嶄綔"
// "濡傞渶璁块棶姝ゅ姛鑳斤紝璇疯仈绯荤郴缁熺鐞嗗憳"
```

### 2. 璧勬簮鍐茬獊 (RESOURCE_CONFLICT)

澶勭悊瀵煎叆娴佺▼鏃剁殑鍚嶇О鍐茬獊绛夊満鏅細

```typescript
import { ConflictResolutionDialog } from '@/components/common/ConflictResolutionDialog';

const [showConflictDialog, setShowConflictDialog] = useState(false);
const [conflictData, setConflictData] = useState(null);

try {
  await request.post('/api/workflow/import', formData);
} catch (error) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const errorData = axiosError.response?.data;

  if (errorData?.code === 'RESOURCE_CONFLICT') {
    // 鏄剧ず鍐茬獊瑙ｅ喅瀵硅瘽妗?
    setConflictData({
      resourceName: errorData.data?.resourceName,
      message: errorData.message,
    });
    setShowConflictDialog(true);
  } else {
    handleApiError(axiosError);
  }
}

// 鍦?JSX 涓?
<ConflictResolutionDialog
  open={showConflictDialog}
  onClose={() => setShowConflictDialog(false)}
  resourceName={conflictData?.resourceName}
  message={conflictData?.message}
  onConfirm={(strategy, newName) => {
    // 浣跨敤閫夋嫨鐨勭瓥鐣ラ噸鏂板鍏?
    handleImportWithStrategy(strategy, newName);
  }}
/>
```

### 3. 杩愯瀹炰緥璀﹀憡 (RUNNING_INSTANCES_WARNING)

澶勭悊鐗堟湰鍥炴粴绛夋搷浣滄椂鐨勮繍琛屽疄渚嬭鍛婏細

```typescript
import { WarningConfirmDialog } from '@/components/common/WarningConfirmDialog';

const [showWarningDialog, setShowWarningDialog] = useState(false);
const [pendingAction, setPendingAction] = useState(null);

try {
  await request.post('/api/workflow/versions/rollback', data);
} catch (error) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const errorData = axiosError.response?.data;

  if (errorData?.code === 'RUNNING_INSTANCES_WARNING') {
    // 淇濆瓨寰呮墽琛岀殑鎿嶄綔
    setPendingAction(data);
    
    // 鏄剧ず璀﹀憡瀵硅瘽妗?
    setShowWarningDialog(true);
  } else {
    handleApiError(axiosError);
  }
}

// 鍦?JSX 涓?
<WarningConfirmDialog
  open={showWarningDialog}
  onClose={() => setShowWarningDialog(false)}
  title="杩愯瀹炰緥璀﹀憡"
  message="璇ユ祦绋嬫湁姝ｅ湪杩愯鐨勫疄渚?
  description="鍥炴粴鍙兘褰卞搷杩愯涓殑娴佺▼"
  confirmText="寮哄埗鍥炴粴"
  requireDoubleConfirm={true}
  onConfirm={() => {
    // 鎵ц寮哄埗鎿嶄綔
    handleForceRollback(pendingAction);
  }}
  severity="warning"
/>
```

### 4. 楠岃瘉閿欒 (INVALID_REQUEST)

鏄剧ず瀛楁绾у埆鐨勯獙璇侀敊璇細

```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

try {
  await request.post('/api/workflow/templates', formData);
} catch (error) {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  const errorData = axiosError.response?.data;

  if (errorData?.code === 'INVALID_REQUEST' && errorData.errors) {
    // 鎻愬彇瀛楁閿欒
    const errors: Record<string, string> = {};
    errorData.errors.forEach((err) => {
      errors[err.field] = err.message;
    });
    setFieldErrors(errors);
  }
  
  // 鍚屾椂鏄剧ず toast 鎻愮ず
  handleApiError(axiosError);
}

// 鍦ㄨ〃鍗曚腑鏄剧ず閿欒
<input name="name" />
{fieldErrors.name && (
  <span className="text-red-500 text-sm">{fieldErrors.name}</span>
)}
```

### 5. 妯℃澘姝ｅ湪浣跨敤 (TEMPLATE_IN_USE)

```typescript
// 鑷姩鏄剧ず锛?
// "璇ユā鏉挎鍦ㄨ浣跨敤锛屾棤娉曞垹闄?
// "褰撳墠鏈?5 涓祦绋嬫鍦ㄤ娇鐢ㄦ妯℃澘"
```

### 6. 涓嶆敮鎸佺殑鑺傜偣绫诲瀷 (UNSUPPORTED_NODE_TYPES)

```typescript
// 鑷姩鏄剧ず锛?
// "娴佺▼鍖呭惈涓嶆敮鎸佺殑鑺傜偣绫诲瀷"
// "涓嶆敮鎸佺殑鑺傜偣绫诲瀷锛歝ustomNode1銆乧ustomNode2"
```

## 楂樼骇閫夐」

### 闈欓粯妯″紡

鏌愪簺鍦烘櫙涓嬩笉闇€瑕佹樉绀洪敊璇彁绀猴紙濡傝疆璇€佸悗鍙颁换鍔★級锛?

```typescript
try {
  const result = await request.get('/api/workflow/status', { silent: true });
} catch (error) {
  // 閿欒琚潤榛樺鐞嗭紝涓嶄細鏄剧ず toast
  console.log('鐘舵€佹鏌ュけ璐?);
}
```

### 鑷畾涔夐敊璇秷鎭?

涓虹壒瀹氭搷浣滄彁渚涙洿鍙嬪ソ鐨勯敊璇彁绀猴細

```typescript
const handleDelete = withErrorHandler(
  async (id: string) => {
    await request.delete(`/api/workflow/templates/${id}`);
    showSuccess('妯℃澘鍒犻櫎鎴愬姛');
  },
  {
    customMessage: '鍒犻櫎妯℃澘澶辫触锛岃绋嶅悗閲嶈瘯',
  }
);
```

## 杈呭姪鍑芥暟

### showSuccess

鏄剧ず鎴愬姛鎻愮ず锛?

```typescript
import { showSuccess } from '@/utils/errorHandler';

showSuccess('鎿嶄綔鎴愬姛');
showSuccess('淇濆瓨鎴愬姛', '娴佺▼宸蹭繚瀛樺埌鑽夌绠?);
```

### showWarning

鏄剧ず璀﹀憡鎻愮ず锛?

```typescript
import { showWarning } from '@/utils/errorHandler';

showWarning('璇峰厛淇濆瓨娴佺▼');
showWarning('鏁版嵁鍙兘涓嶅畬鏁?, '閮ㄥ垎瀛楁鏈～鍐?);
```

### showInfo

鏄剧ず淇℃伅鎻愮ず锛?

```typescript
import { showInfo } from '@/utils/errorHandler';

showInfo('姝ｅ湪澶勭悊涓?);
showInfo('鏁版嵁鍚屾涓?, '棰勮闇€瑕?30 绉?);
```

## 鍚庣閿欒鍝嶅簲鏍煎紡

鍚庣搴旇杩斿洖浠ヤ笅鏍煎紡鐨勯敊璇搷搴旓細

```json
{
  "code": "RESOURCE_CONFLICT",
  "message": "娴佺▼鍚嶇О宸插瓨鍦?,
  "errors": [
    {
      "field": "name",
      "message": "鍚嶇О涓嶈兘涓虹┖",
      "rejectedValue": ""
    }
  ],
  "data": {
    "suggestions": ["閲嶅懡鍚?, "瑕嗙洊", "璺宠繃"],
    "usageCount": 5,
    "affectedWorkflows": ["workflow1", "workflow2"]
  },
  "timestamp": "2024-01-01T00:00:00",
  "path": "/api/workflow/import"
}
```

## 閿欒浠ｇ爜鍒楄〃

| 閿欒浠ｇ爜 | 璇存槑 | 澶勭悊鏂瑰紡 |
|---------|------|---------|
| `PERMISSION_DENIED` | 鏉冮檺涓嶈冻 | 鏄剧ず鍙嬪ソ鐨勬潈闄愭彁绀?|
| `RESOURCE_CONFLICT` | 璧勬簮鍐茬獊 | 鏄剧ず鍐茬獊瑙ｅ喅瀵硅瘽妗?|
| `RUNNING_INSTANCES_WARNING` | 杩愯瀹炰緥璀﹀憡 | 鏄剧ず璀﹀憡纭瀵硅瘽妗?|
| `INVALID_REQUEST` | 楠岃瘉閿欒 | 鏄剧ず瀛楁绾у埆鐨勯敊璇?|
| `TEMPLATE_IN_USE` | 妯℃澘姝ｅ湪浣跨敤 | 鏄剧ず浣跨敤鏁伴噺 |
| `UNSUPPORTED_NODE_TYPES` | 涓嶆敮鎸佺殑鑺傜偣绫诲瀷 | 鍒楀嚭涓嶆敮鎸佺殑绫诲瀷 |
| `RESOURCE_NOT_FOUND` | 璧勬簮涓嶅瓨鍦?| 鏄剧ず閫氱敤閿欒鎻愮ず |
| `INTERNAL_ERROR` | 鏈嶅姟鍣ㄩ敊璇?| 鏄剧ず閫氱敤閿欒鎻愮ず |

## 鏈€浣冲疄璺?

1. **濮嬬粓浣跨敤缁熶竴鐨勯敊璇鐞嗗櫒**锛氫笉瑕佺洿鎺ヤ娇鐢?`toast.error`锛岃€屾槸浣跨敤 `handleApiError`
2. **涓虹壒娈婂満鏅彁渚涜嚜瀹氫箟澶勭悊**锛氬鍐茬獊瑙ｅ喅銆佽繍琛屽疄渚嬭鍛婄瓑
3. **鏄剧ず瀛楁绾у埆鐨勯獙璇侀敊璇?*锛氬湪琛ㄥ崟涓樉绀哄叿浣撶殑瀛楁閿欒
4. **浣跨敤闈欓粯妯″紡澶勭悊鍚庡彴浠诲姟**锛氶伩鍏嶅共鎵扮敤鎴?
5. **鎻愪緵鍙嬪ソ鐨勯敊璇秷鎭?*锛氫娇鐢?`customMessage` 閫夐」

## 绀轰緥浠ｇ爜

瀹屾暣鐨勭ず渚嬩唬鐮佽鍙傝€冿細
- `src/utils/errorHandler.example.tsx` - 鍚勭浣跨敤鍦烘櫙鐨勭ず渚?
- `src/pages/VersionHistory.improved.tsx` - 瀹為檯搴旂敤绀轰緥

## 娉ㄦ剰浜嬮」

1. 閿欒澶勭悊鍣ㄤ細鑷姩澶勭悊 401锛堟湭鎺堟潈锛夊拰 503锛堟湇鍔′笉鍙敤锛夐敊璇?
2. 缃戠粶閿欒鍜岃秴鏃堕敊璇細鏄剧ず鐗瑰畾鐨勬彁绀轰俊鎭?
3. 鎵€鏈夐敊璇兘浼氳璁板綍鍒版帶鍒跺彴锛屼究浜庤皟璇?
4. 鐢熶骇鐜涓嬶紝閿欒浼氳涓婃姤鍒板悗绔棩蹇楁敹闆嗙郴缁?
