'use client'

/**
 * Reports a page view, once per browser session.
 *
 * **View tracking is client-side** because a `<meta>`-scraping preview bot
 * (Slack, WhatsApp, Signal) fetches the HTML but never runs an effect, so link
 * unfurls do not inflate the counter.
 *
 * Shared by the file list and the photo gallery: they are two presentations of
 * one document, and a view of either is a view of it. The endpoint is keyed on
 * the UUID even when the visitor arrived by a vanity slug — the slug is an
 * address, the UUID is the identity.
 */
import { useEffect, useRef } from 'react'

export const useCommissionView = (uuid: string): void => {
  /**
   * Belt to `sessionStorage`'s braces: React runs effects twice in development
   * under Strict Mode, and a ref is the only guard that survives that in a tab
   * where storage is unavailable.
   */
  const tracked = useRef(false)

  useEffect(() => {
    /**
     * An empty UUID is the opt-out, used by the file list when it renders
     * underneath a gallery that has already reported the view. A hook cannot be
     * called conditionally, so the condition is expressed in the argument.
     */
    if (!uuid) {
      return
    }

    const storageKey = `commission-view:${uuid}`

    /**
     * `sessionStorage` throws outright in some private-browsing and
     * cookies-blocked configurations rather than returning null, so every access
     * is guarded. Losing the guard only means the view is reported again on a
     * remount, and the endpoint dedupes by IP and user-agent inside a
     * thirty-minute window anyway — so the failure mode is a duplicate request
     * that changes nothing, not a broken page.
     */
    try {
      if (window.sessionStorage.getItem(storageKey)) {
        tracked.current = true
      }
    } catch {
      // Storage unavailable; the ref and the server-side dedupe cover it.
    }

    if (tracked.current) {
      return
    }

    tracked.current = true

    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // As above.
    }

    // Fire and forget: nothing on the page depends on the answer, and a failed
    // view count must never surface as an error to the visitor.
    void fetch(`/api/commissions/${encodeURIComponent(uuid)}/track`, {
      body: '{}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).catch(() => {
      // Ignored on purpose.
    })
  }, [uuid])
}
