export function readMeetingEquipment(value?: string | null): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
    return typeof parsed === 'string' && parsed.trim() ? [parsed] : [];
  } catch {
    return [value];
  }
}
