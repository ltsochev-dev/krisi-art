import * as migration_20260823_155423_initial from './20260823_155423_initial'
import * as migration_20260823_162244_media_enabled from './20260823_162244_media_enabled'
import * as migration_20260824_094733_skills from './20260824_094733_skills'
import * as migration_20260824_102718_contacts_fields from './20260824_102718_contacts_fields'
import * as migration_20260824_113648_testimonials from './20260824_113648_testimonials'
import * as migration_20260824_115206_testimonials_published from './20260824_115206_testimonials_published'

export const migrations = [
  {
    up: migration_20260823_155423_initial.up,
    down: migration_20260823_155423_initial.down,
    name: '20260823_155423_initial',
  },
  {
    up: migration_20260823_162244_media_enabled.up,
    down: migration_20260823_162244_media_enabled.down,
    name: '20260823_162244_media_enabled',
  },
  {
    up: migration_20260824_094733_skills.up,
    down: migration_20260824_094733_skills.down,
    name: '20260824_094733_skills',
  },
  {
    up: migration_20260824_102718_contacts_fields.up,
    down: migration_20260824_102718_contacts_fields.down,
    name: '20260824_102718_contacts_fields',
  },
  {
    up: migration_20260824_113648_testimonials.up,
    down: migration_20260824_113648_testimonials.down,
    name: '20260824_113648_testimonials',
  },
  {
    up: migration_20260824_115206_testimonials_published.up,
    down: migration_20260824_115206_testimonials_published.down,
    name: '20260824_115206_testimonials_published',
  },
]
