import * as migration_20260823_155423_initial from './20260823_155423_initial';
import * as migration_20260823_162244_media_enabled from './20260823_162244_media_enabled';

export const migrations = [
  {
    up: migration_20260823_155423_initial.up,
    down: migration_20260823_155423_initial.down,
    name: '20260823_155423_initial',
  },
  {
    up: migration_20260823_162244_media_enabled.up,
    down: migration_20260823_162244_media_enabled.down,
    name: '20260823_162244_media_enabled'
  },
];
