/**
 * The 404 for an invoice URL that resolves to nothing.
 *
 * The one page in this route group that is still bilingual, and for a reason that
 * is the mirror image of why the invoice itself is not: an invoice knows who it was
 * written for, and a 404 does not. There is no document to read a language off, so
 * it says both.
 *
 * The copy says nothing about *why* it is missing. A deleted draft, a typo and a
 * fabricated UUID are indistinguishable here on purpose: the response must not tell
 * someone probing for invoices whether they got close.
 */
import React from 'react'

import { INVOICE_PROSE } from '@/lib/invoicing/labels'

export default function InvoiceNotFound() {
  return (
    <div className="missing">
      <h1>
        {INVOICE_PROSE.notFoundTitle.bg} · {INVOICE_PROSE.notFoundTitle.en}
      </h1>
      <p>
        {INVOICE_PROSE.notFoundBody.bg} · {INVOICE_PROSE.notFoundBody.en}
      </p>
    </div>
  )
}
