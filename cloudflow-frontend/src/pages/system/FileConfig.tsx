import React, { useState } from 'react';
import { HardDrive, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { listFileConfigs, saveFileConfig, removeFileConfig, testFileConfig } from '@/services/api/fileConfig';
import type { FileStorageConfig, FileStorageType } from '@/services/api/fileConfig';
import { getErrorMessage } from '@/utils/errorMessage';
import { useInfrastructurePage } from './_components/useInfrastructurePage';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';

const storageOptions = [
  { value: 'LOCAL', label: '本地存储' }, { value: 'OSS', label: '阿里云 OSS' },
  { value: 'MINIO', label: 'MinIO' }, { value: 'S3', label: 'Amazon S3' }, { value: 'COS', label: '腾讯云 COS' },
];
const emptyConfig = (): FileStorageConfig => ({
  configCode: '', configName: '', storageType: 'LOCAL', masterFlag: 0, maxFileSize: 52428800,
  signedUrlExpireSeconds: 300, accessPolicy: '0', status: 'ENABLED', basePath: 'upload',
});

export default function FileConfigPage() {
  const page = useInfrastructurePage(listFileConfigs, { pageNum: 1, pageSize: 10 });
  const [form, setForm] = useState<FileStorageConfig | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FileStorageConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const setField = <Key extends keyof FileStorageConfig>(key: Key, value: FileStorageConfig[Key]) =>
    setForm((current) => current ? { ...current, [key]: value } : current);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setFormError('');
    try {
      await saveFileConfig({ ...form, accessPolicy: '0' });
      setForm(null);
      page.refresh();
      toast.success('存储配置已保存');
    } catch (error) {
      setFormError(getErrorMessage(error, '保存失败'));
    } finally { setBusy(false); }
  };

  const test = async (config: FileStorageConfig) => {
    if (!config.configId || busy) return;
    setBusy(true);
    try {
      await testFileConfig(config.configId);
      toast.success('存储连接测试通过');
    } catch (error) { toast.error(getErrorMessage(error, '连接测试失败')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!removeTarget?.configId || busy) return;
    setBusy(true);
    try {
      await removeFileConfig(removeTarget.configId);
      setRemoveTarget(null);
      page.refresh();
      toast.success('存储配置已删除');
    } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
    finally { setBusy(false); }
  };

  const actions = (config: FileStorageConfig) => (
    <div className="flex flex-wrap gap-2">
      <PermissionGuard permissions={['system:file:config:edit']} hidden>
        <Button variant="outline" disabled={busy} onClick={() => { setForm({ ...config, secretKey: '' }); setFormError(''); }}>编辑</Button>
        <Button variant="outline" disabled={busy} onClick={() => void test(config)}>测试连接</Button>
      </PermissionGuard>
      <PermissionGuard permissions={['system:file:config:remove']} hidden>
        <Button variant="outline" disabled={busy || config.masterFlag === 1} onClick={() => setRemoveTarget(config)}>删除</Button>
      </PermissionGuard>
    </div>
  );

  return (
    <PermissionGuard permissions={['system:file:config:list']}>
      <div className="space-y-5">
        <InfrastructurePageHeader kicker="文件与存储" title="存储配置" description="切换主用配置只影响新上传文件，已有文件继续使用原存储位置。">
          <Button variant="outline" onClick={page.refresh} disabled={page.loading}><RefreshCw size={16} />刷新</Button>
          <PermissionGuard permissions={['system:file:config:add']} hidden>
            <Button onClick={() => { setForm(emptyConfig()); setFormError(''); }}><Plus size={16} />新增配置</Button>
          </PermissionGuard>
        </InfrastructurePageHeader>
        <div className="card flex items-start gap-3 p-4 text-sm text-cf-muted">
          <HardDrive size={20} className="shrink-0" />
          <p>对象存储始终使用私有访问；密钥加密保存且不回显。租户未设主用配置时使用平台默认存储。</p>
        </div>
        <TablePageLayout table={<>
          <div className="hidden md:block"><InnerTableSurface><table className="w-full text-sm">
            <thead><tr>{['配置', '存储类型', '主用', '状态', '文件上限', '操作'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
            <tbody>
              {page.loading || page.error || page.rows.length === 0
                ? <InfrastructureTableStateRow colSpan={6} loading={page.loading} title={page.error || (page.loading ? '加载中' : '暂无租户存储配置')} description="新增配置后可设为本租户主用存储。" />
                : page.rows.map((config) => <tr key={config.configId} className="border-t border-[var(--cf-border)]">
                  <td className="px-4 py-3"><div>{config.configName}</div><div className="text-xs text-cf-subtle">{config.configCode}</div></td>
                  <td className="px-4 py-3">{config.storageType}</td>
                  <td className="px-4 py-3">{config.masterFlag === 1 ? <InfrastructureBadge tone="success">主用</InfrastructureBadge> : '—'}</td>
                  <td className="px-4 py-3">{config.status === 'ENABLED' ? '启用' : '停用'}</td>
                  <td className="px-4 py-3">{(config.maxFileSize / 1048576).toFixed(1)} MiB</td>
                  <td className="px-4 py-3">{actions(config)}</td>
                </tr>)}
            </tbody>
          </table></InnerTableSurface></div>
          <div className="space-y-3 p-3 md:hidden" aria-live="polite">
            {page.loading || page.error || page.rows.length === 0 ? <p className="p-4 text-sm">{page.error || (page.loading ? '加载中' : '暂无租户存储配置')}</p> : page.rows.map((config) => (
              <article key={config.configId} className="card space-y-3 p-4">
                <h3 className="font-medium">{config.configName}</h3>
                <p className="text-sm text-cf-muted">{config.storageType} · {config.status === 'ENABLED' ? '启用' : '停用'}{config.masterFlag === 1 ? ' · 主用' : ''}</p>
                {actions(config)}
              </article>
            ))}
          </div>
        </>} pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize}
          onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))}
          onPageSizeChange={(pageSize) => page.setQuery({ pageNum: 1, pageSize })} />} />
        <BaseDialog open={form !== null} title={form?.configId ? '编辑存储配置' : '新增存储配置'} onClose={() => { if (!busy) setForm(null); }} width="wide">
          {form && <form onSubmit={(event) => void save(event)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">配置编码<Input required maxLength={50} value={form.configCode} onChange={(event) => setField('configCode', event.target.value)} /></label>
              <label className="space-y-2 text-sm">配置名称<Input required maxLength={100} value={form.configName} onChange={(event) => setField('configName', event.target.value)} /></label>
              <div className="space-y-2 text-sm"><span>存储类型</span><InfrastructureSelect aria-label="存储类型" value={form.storageType} options={storageOptions} onValueChange={(value) => setField('storageType', value as FileStorageType)} /></div>
              <div className="space-y-2 text-sm"><span>状态</span><InfrastructureSelect aria-label="配置状态" value={form.status} options={[{ value: 'ENABLED', label: '启用' }, { value: 'DISABLED', label: '停用' }]} onValueChange={(value) => setField('status', value as FileStorageConfig['status'])} /></div>
              <label className="space-y-2 text-sm">基础路径<Input maxLength={300} value={form.basePath || ''} placeholder="upload" onChange={(event) => setField('basePath', event.target.value)} /></label>
              <label className="space-y-2 text-sm">单文件上限（字节）<Input required type="number" min={1} step={1} value={form.maxFileSize} onChange={(event) => setField('maxFileSize', Number(event.target.value))} /></label>
              <label className="space-y-2 text-sm">允许的扩展名<Input maxLength={1000} placeholder="例如 pdf,jpg；留空使用系统白名单" value={form.allowedExtensions || ''} onChange={(event) => setField('allowedExtensions', event.target.value)} /></label>
              <label className="space-y-2 text-sm">签名有效期（秒）<Input required type="number" min={1} max={3600} step={1} value={form.signedUrlExpireSeconds} onChange={(event) => setField('signedUrlExpireSeconds', Number(event.target.value))} /></label>
              {form.storageType !== 'LOCAL' && <>
                <label className="space-y-2 text-sm">服务端点<Input required maxLength={300} placeholder="https://..." value={form.endpoint || ''} onChange={(event) => setField('endpoint', event.target.value)} /></label>
                <label className="space-y-2 text-sm">区域<Input required maxLength={50} value={form.region || ''} onChange={(event) => setField('region', event.target.value)} /></label>
                <label className="space-y-2 text-sm">桶名<Input required maxLength={100} value={form.bucket || ''} onChange={(event) => setField('bucket', event.target.value)} /></label>
                <label className="space-y-2 text-sm">访问域名<Input maxLength={300} value={form.domain || ''} onChange={(event) => setField('domain', event.target.value)} /></label>
                <label className="space-y-2 text-sm">AccessKey<Input required autoComplete="off" maxLength={200} value={form.accessKey || ''} onChange={(event) => setField('accessKey', event.target.value)} /></label>
                <label className="space-y-2 text-sm">SecretKey<Input type="password" autoComplete="new-password" required={!form.configId} maxLength={256} placeholder={form.configId ? '留空保留已保存密钥' : '填写存储访问密钥'} value={form.secretKey || ''} onChange={(event) => setField('secretKey', event.target.value)} /></label>
              </>}
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.masterFlag === 1} onChange={(event) => setField('masterFlag', event.target.checked ? 1 : 0)} />设为本租户主用存储</label>
            <label className="block space-y-2 text-sm">备注<Input maxLength={500} value={form.remark || ''} onChange={(event) => setField('remark', event.target.value)} /></label>
            {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存配置'}</Button></div>
          </form>}
        </BaseDialog>
        <BaseDialog open={removeTarget !== null} title="删除存储配置" onClose={() => { if (!busy) setRemoveTarget(null); }} footer={<><Button variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>取消</Button><Button disabled={busy} onClick={() => void remove()}>确认删除</Button></>}>
          <p>确认删除“{removeTarget?.configName}”？仍有文件引用的配置将被服务器拒绝删除。</p>
        </BaseDialog>
      </div>
    </PermissionGuard>
  );
}
