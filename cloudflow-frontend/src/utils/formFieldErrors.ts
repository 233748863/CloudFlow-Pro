const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export const getFormFieldErrors = (error: unknown): Record<string, string> => {
  const record = asRecord(error);
  if (!record) return {};
  const response = asRecord(asRecord(record.response)?.data) || asRecord(record.data) || record;
  const fields = response.errors ?? response.fieldErrors ?? asRecord(response.data)?.fieldErrors;
  const entries = Array.isArray(fields)
    ? fields.map((field) => { const item = asRecord(field); return [item?.field, item?.message]; })
    : Object.entries(asRecord(fields) || {});
  return Object.fromEntries(entries.filter((entry): entry is [string, string] =>
    typeof entry[0] === 'string' && Boolean(entry[0]) && typeof entry[1] === 'string' && Boolean(entry[1])));
};
