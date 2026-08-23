/**
 * Cache invalidation hooks.
 *
 * The frontend read helpers wrap their Payload queries in `unstable_cache` with
 * the tags from `@/lib/content/cache-tags`. These factories are the write side:
 * attach them to a collection or global and any admin edit drops the matching
 * cache entries.
 *
 * Two deliberate choices:
 *
 * 1. `revalidateTag` is called inside try/catch. Payload writes also happen
 *    outside a Next request scope — `onInit`, integration tests, seed scripts —
 *    where `revalidateTag` throws. A failed cache bust must never fail the write
 *    that triggered it.
 * 2. Every hook honours `req.context.disableRevalidate`, so a bulk operation can
 *    opt out and invalidate once at the end instead of once per document.
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

import { revalidateTag } from 'next/cache'

import type { CacheTag } from '@/lib/content/cache-tags'

const revalidate = (tags: readonly CacheTag[]): void => {
  for (const tag of tags) {
    try {
      // 'max' gives stale-while-revalidate with the longest stale window, so a
      // visitor mid-request never blocks on a regeneration triggered by an edit.
      revalidateTag(tag, 'max')
    } catch {
      // Outside a request scope (onInit, tests, CLI). Nothing to invalidate.
    }
  }
}

export const revalidateCollection =
  (...tags: CacheTag[]): CollectionAfterChangeHook =>
  ({ doc, req: { context } }) => {
    if (!context.disableRevalidate) {
      revalidate(tags)
    }

    return doc
  }

export const revalidateCollectionDelete =
  (...tags: CacheTag[]): CollectionAfterDeleteHook =>
  ({ doc, req: { context } }) => {
    if (!context.disableRevalidate) {
      revalidate(tags)
    }

    return doc
  }

export const revalidateGlobal =
  (...tags: CacheTag[]): GlobalAfterChangeHook =>
  ({ doc, req: { context } }) => {
    if (!context.disableRevalidate) {
      revalidate(tags)
    }

    return doc
  }
