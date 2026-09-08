/**
 * The 404 for a commission URL that resolves to nothing.
 *
 * The copy says nothing about *why*. A deleted commission, a link the artist has
 * not enabled yet, one whose expiry has passed and a fabricated UUID are
 * indistinguishable here on purpose: the response must not tell someone probing
 * for links whether they got close, and must not confirm to a client with an
 * expired link that the UUID was ever valid. The one hint offered is the useful
 * one — ask the artist for a new link.
 */
import React from 'react'

export default function CommissionNotFound() {
  return (
    <div className="missing">
      <h1>This link is not available</h1>
      <p>
        If you were expecting files here, please get in touch with the artist for an up-to-date
        link.
      </p>
    </div>
  )
}
