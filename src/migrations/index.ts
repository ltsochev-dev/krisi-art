import * as migration_20260823_155423_initial from './20260823_155423_initial';

export const migrations = [
  {
    up: migration_20260823_155423_initial.up,
    down: migration_20260823_155423_initial.down,
    name: '20260823_155423_initial'
  },
];
