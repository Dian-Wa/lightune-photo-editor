import { describe, expect, it } from 'vitest';
import { cloneUserPreset, renameUserPreset, resolvePresetDefaultName } from './presets';
import { builtinPresets } from './presets';

describe('user preset management', () => {
  it('duplicates a preset as an independent user template', () => {
    const copy = cloneUserPreset(builtinPresets[0], 'copy-id', '2026-10-09T00:00:00.000Z');
    expect(copy.id).toBe('copy-id');
    expect(copy.name).toBe('清透自然 副本');
    expect(copy.source).toBe('manual');
    expect(copy.createdAt).toBe('2026-10-09T00:00:00.000Z');
  });

  it('renames without mutating the original preset', () => {
    const original = builtinPresets[0];
    const renamed = renameUserPreset(original, '我的清透', '2026-10-09T00:00:00.000Z');
    expect(renamed.name).toBe('我的清透');
    expect(renamed.updatedAt).toBe('2026-10-09T00:00:00.000Z');
    expect(original.name).toBe('清透自然');
  });

  it('keeps generated copy and rename names within the schema limit', () => {
    const longName = '很'.repeat(41);
    const copy = cloneUserPreset({ ...builtinPresets[0], name: '长'.repeat(40) }, 'copy-id', '2026-10-09T00:00:00.000Z');
    const renamed = renameUserPreset(builtinPresets[0], longName, '2026-10-09T00:00:00.000Z');
    expect(copy.name.length).toBeLessThanOrEqual(40);
    expect(copy.name.endsWith(' 副本')).toBe(true);
    expect(renamed.name.length).toBeLessThanOrEqual(40);
  });

  it('prefers the selected template name over a stale AI suggestion', () => {
    expect(resolvePresetDefaultName({ ...builtinPresets[0], name: '用户新名称' }, { name: '旧AI名称' })).toBe('用户新名称');
  });
});
