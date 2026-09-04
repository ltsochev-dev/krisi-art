import * as migration_20260823_155423_initial from './20260823_155423_initial'
import * as migration_20260823_162244_media_enabled from './20260823_162244_media_enabled'
import * as migration_20260824_094733_skills from './20260824_094733_skills'
import * as migration_20260824_102718_contacts_fields from './20260824_102718_contacts_fields'
import * as migration_20260824_113648_testimonials from './20260824_113648_testimonials'
import * as migration_20260824_115206_testimonials_published from './20260824_115206_testimonials_published'
import * as migration_20260824_123751_pages from './20260824_123751_pages'
import * as migration_20260824_144215_gallery_subtitle from './20260824_144215_gallery_subtitle'
import * as migration_20260824_155112_orderable_albums_artworks from './20260824_155112_orderable_albums_artworks'
import * as migration_20260824_193612_orderable_artworks_per_album from './20260824_193612_orderable_artworks_per_album'
import * as migration_20260825_200000_orderable_testimonials from './20260825_200000_orderable_testimonials'
import * as migration_20260827_071502_invoicing from './20260827_071502_invoicing'
import * as migration_20260827_075943_invoice_language from './20260827_075943_invoice_language'
import * as migration_20260827_080440_invoice_legal_note_en from './20260827_080440_invoice_legal_note_en'
import * as migration_20260904_132850_media_alt_optional from './20260904_132850_media_alt_optional'

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
  {
    up: migration_20260824_123751_pages.up,
    down: migration_20260824_123751_pages.down,
    name: '20260824_123751_pages',
  },
  {
    up: migration_20260824_144215_gallery_subtitle.up,
    down: migration_20260824_144215_gallery_subtitle.down,
    name: '20260824_144215_gallery_subtitle',
  },
  {
    up: migration_20260824_155112_orderable_albums_artworks.up,
    down: migration_20260824_155112_orderable_albums_artworks.down,
    name: '20260824_155112_orderable_albums_artworks',
  },
  {
    up: migration_20260824_193612_orderable_artworks_per_album.up,
    down: migration_20260824_193612_orderable_artworks_per_album.down,
    name: '20260824_193612_orderable_artworks_per_album',
  },
  {
    up: migration_20260825_200000_orderable_testimonials.up,
    down: migration_20260825_200000_orderable_testimonials.down,
    name: '20260825_200000_orderable_testimonials',
  },
  {
    up: migration_20260827_071502_invoicing.up,
    down: migration_20260827_071502_invoicing.down,
    name: '20260827_071502_invoicing',
  },
  {
    up: migration_20260827_075943_invoice_language.up,
    down: migration_20260827_075943_invoice_language.down,
    name: '20260827_075943_invoice_language',
  },
  {
    up: migration_20260827_080440_invoice_legal_note_en.up,
    down: migration_20260827_080440_invoice_legal_note_en.down,
    name: '20260827_080440_invoice_legal_note_en',
  },
  {
    up: migration_20260904_132850_media_alt_optional.up,
    down: migration_20260904_132850_media_alt_optional.down,
    name: '20260904_132850_media_alt_optional',
  },
]
