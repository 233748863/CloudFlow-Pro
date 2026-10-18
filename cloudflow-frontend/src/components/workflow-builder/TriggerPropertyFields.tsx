import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Input, UserSelector } from '@/components/common';
import { LazyInput, LazyTextarea } from './LazyInput';
import { PropertySection, PropertySelect, type SemanticPropertyProps } from './SemanticPropertyFields';

const jsonText = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
const decodeLegacyText = (value: unknown) => typeof value === 'string'
  ? value.replace(/&(?:quot|lt|gt|amp|#39|#x27);/g, (entity) => ({ '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&#39;': "'", '&#x27;': "'" })[entity] ?? entity)
  : value;

const bodyObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const TriggerPropertyFields = ({ node, onChange }: SemanticPropertyProps) => {
  const props = node.props ?? {};
  const mode = props.triggerType ?? props.scriptType ?? 'GROOVY';
  const isTrigger = Boolean(props.triggerType);
  const isMessage = mode === 'MESSAGE';
  const isHttp = mode !== 'GROOVY' && mode !== 'JAVASCRIPT' && !isMessage;
  const bodyKey = isTrigger ? 'actionBody' : 'apiBody';
  const headerKey = isTrigger && (props.actionHeaders !== undefined || props.apiHeaders === undefined) ? 'actionHeaders' : 'apiHeaders';
  const rawBody = isTrigger ? props.actionBody : decodeLegacyText(props.apiBody);
  const body = bodyObject(rawBody);
  const [variable, setVariable] = useState('');
  const update = (changes: Record<string, unknown>) => onChange({ props: { ...props, ...changes } });
  const changeMode = (value: string) => {
    const next = { ...props };
    if (value === 'API' || value === 'GROOVY') {
      delete next.triggerType;
      delete next.callAsync;
      delete next.failStrategy;
      delete next.retryCount;
      delete next.timeoutSeconds;
      next.scriptType = value;
    } else {
      Object.assign(next, {
        triggerType: value,
        scriptType: 'API',
        actionUrl: props.actionUrl ?? decodeLegacyText(props.apiUrl) ?? '',
        actionMethod: props.actionMethod ?? props.apiMethod ?? 'POST',
        actionBody: props.actionBody ?? decodeLegacyText(props.apiBody) ?? '',
        callAsync: props.callAsync ?? true,
        retryCount: props.retryCount ?? 0,
        timeoutSeconds: props.timeoutSeconds ?? 10,
        failStrategy: props.failStrategy ?? 'BLOCK',
      });
    }
    onChange({ props: next });
  };

  const insertVariable = () => {
    const name = variable.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      toast.error('变量名以英文字母开头，只能包含字母、数字和下划线');
      return;
    }
    update({
      [bodyKey]: JSON.stringify({ ...body, [name]: '${' + name + '}' }, null, 2),
      ...(Array.isArray(props.allowedVariables) ? { allowedVariables: Array.from(new Set([...props.allowedVariables, name])) } : {}),
    });
  };

  return <PropertySection title="脚本与触发设置">
    <PropertySelect label="执行方式" value={mode}
      options={{ HTTP_CALLBACK: '调用外部 HTTP 接口', INNER_SERVICE: '调用已登记的内部服务', MESSAGE: '发送系统消息', API: 'HTTP API（原同步模式）', GROOVY: 'Groovy 脚本（沿用沙箱）' }}
      onChange={changeMode} />
    {mode === 'GROOVY' && <label className="grid gap-1 text-xs text-cf-body"><span>脚本内容</span>
      <LazyTextarea aria-label="Groovy 脚本内容" className="min-h-[112px] font-mono text-xs" value={decodeLegacyText(props.scriptContent) ?? ''}
        onChange={(value: string) => update({ scriptContent: value })} />
      <span className="text-[11px] text-cf-muted">保留现有沙箱及管理员启用开关；未启用时不能发布或执行。</span>
    </label>}
    {isHttp && <>
      <label className="grid gap-1 text-xs text-cf-body"><span>请求地址</span>
        <LazyInput aria-label="触发请求地址" placeholder="https://api.example.com/endpoint"
          value={isTrigger ? props.actionUrl ?? '' : decodeLegacyText(props.apiUrl) ?? ''}
          onChange={(value: string) => update({ [isTrigger ? 'actionUrl' : 'apiUrl']: value })} />
        <span className="text-[11px] leading-relaxed text-[var(--cf-chart-warning)]">上线前先配置 workflow.trigger.url.whitelist；空白名单拒绝全部请求。内网地址需明确登记，云元数据地址始终禁止，也不会跟随重定向。</span>
      </label>
      <PropertySelect label="请求方法" value={isTrigger ? props.actionMethod ?? 'POST' : props.apiMethod ?? 'POST'}
        options={{ GET: 'GET', POST: 'POST', PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DELETE' }}
        onChange={(value) => update({ [isTrigger ? 'actionMethod' : 'apiMethod']: value })} />
      <label className="grid gap-1 text-xs text-cf-body"><span>请求头（JSON 对象）</span>
        <LazyTextarea aria-label="触发请求头" className="font-mono text-xs" placeholder='{"Content-Type":"application/json","Authorization":"Bearer ..."}'
          value={jsonText(headerKey === 'apiHeaders' ? decodeLegacyText(props[headerKey]) : props[headerKey])}
          onChange={(value: string) => update({ [headerKey]: value })} />
        <span className="text-[11px] leading-relaxed text-cf-muted">敏感头加密保存，只显示末 4 位；保持掩码表示保留原密钥，删除该项表示移除。</span>
      </label>
    </>}
    {isMessage && <>
      <div className="grid gap-1"><span className="text-xs text-cf-body">消息接收人</span>
        <UserSelector value={Array.isArray(body.recipientIds) ? body.recipientIds.map(String) : []}
          onChange={(recipientIds) => update({ actionBody: { ...body, recipientIds } })} />
      </div>
      <label className="grid gap-1 text-xs text-cf-body"><span>消息标题</span>
        <LazyInput aria-label="触发消息标题" value={body.title ?? ''} onChange={(value: string) => update({ actionBody: { ...body, title: value } })} />
      </label>
      <label className="grid gap-1 text-xs text-cf-body"><span>消息正文</span>
        <LazyTextarea aria-label="触发消息正文" value={body.content ?? ''} onChange={(value: string) => update({ actionBody: { ...body, content: value } })} />
      </label>
    </>}
    {(isHttp || isMessage) && <>
      <label className="grid gap-1 text-xs text-cf-body"><span>请求体（JSON 对象）</span>
        <LazyTextarea aria-label="触发请求体" className="font-mono text-xs" value={jsonText(rawBody)} placeholder='{"amount":"${amount}"}'
          onChange={(value: string) => update({ [bodyKey]: value })} />
        <span className="text-[11px] text-cf-muted">变量写在字符串中，例如 {'"${amount}"'}；只替换变量，不执行表达式。</span>
      </label>
      <div className="flex items-center gap-2">
        <Input aria-label="插入的变量名" value={variable} placeholder="变量名，例如 amount" onChange={(event) => setVariable(event.target.value)} />
        <Button variant="outline" className="min-h-11 shrink-0" onClick={insertVariable}>插入字段</Button>
      </div>
      {isTrigger && <label className="grid gap-1 text-xs text-cf-body"><span>允许引用的变量名（逗号分隔）</span>
        <LazyInput aria-label="允许引用的变量名" value={Array.isArray(props.allowedVariables) ? props.allowedVariables.join(',') : ''}
          onChange={(value: string) => update({ allowedVariables: value.trim() ? value.split(',').map((name) => name.trim()).filter(Boolean) : undefined })} />
        <span className="text-[11px] text-cf-muted">未设置时仅允许当前流程中不以下划线开头的变量。</span>
      </label>}
    </>}
    {isTrigger ? <>
      <label className="flex min-h-11 items-center gap-2 text-xs text-cf-body"><input type="checkbox" checked={props.callAsync !== false}
        onChange={(event) => update({ callAsync: event.target.checked })} />异步调用（后台执行，完成后继续流程）</label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-cf-body"><span>失败重试（0—5 次）</span>
          <LazyInput aria-label="触发重试次数" type="number" min={0} max={5} step={1} value={String(props.retryCount ?? 0)} onChange={(value: string) => update({ retryCount: Number(value) })} />
        </label>
        <label className="grid gap-1 text-xs text-cf-body"><span>超时（1—60 秒）</span>
          <LazyInput aria-label="触发超时秒数" type="number" min={1} max={60} step={1} value={String(props.timeoutSeconds ?? 10)} onChange={(value: string) => update({ timeoutSeconds: Number(value) })} />
        </label>
      </div>
      <PropertySelect label="最终失败时" value={props.failStrategy ?? 'BLOCK'}
        options={{ BLOCK: '停止流程并告警', SKIP: '记录失败后继续', TO_DLQ: '进入死信队列后继续' }}
        description="死信队列保存失败请求，供管理员修复配置后重放；同步重试共用超时预算。"
        onChange={(value) => update({ failStrategy: value })} />
    </> : <label className="flex min-h-11 items-center gap-2 text-xs text-cf-body"><input type="checkbox" checked={props.continueOnError === true}
      onChange={(event) => update({ continueOnError: event.target.checked })} />出错时继续执行（原配置）</label>}
  </PropertySection>;
};
