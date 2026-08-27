'use client'

import React from 'react'

/**
 * The only interactive thing on the invoice page, and the only reason it needs a
 * client boundary at all.
 *
 * `window.print()` rather than a generated PDF: every browser's print dialog
 * offers "Save as PDF", the print stylesheet in `../../app/(invoice)/invoice.css`
 * already lays the document out for A4, and the alternative is shipping a PDF
 * library or a headless Chromium into a portfolio site's container to reproduce
 * what the browser does natively.
 *
 * Rendered inside `.no-print`, so it is absent from the output it produces.
 */
export default function PrintButton({ label }: { label: string }) {
  return (
    <button onClick={() => window.print()} type="button">
      {label}
    </button>
  )
}
