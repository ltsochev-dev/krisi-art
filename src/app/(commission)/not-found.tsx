/**
 * The 404 for a commission or album URL that resolves to nothing.
 *
 * The copy says nothing about *why*. A deleted document, a link the artist has
 * not enabled yet, one whose expiry has passed and a fabricated UUID or slug are
 * indistinguishable here on purpose: the response must not tell someone probing
 * for links whether they got close, and must not confirm to a client with an
 * expired link that the address was ever valid. The one hint offered is the
 * useful one — ask for a new link.
 *
 * Shared by both routes, at the group root next to the layout, so the wording
 * cannot drift into being more specific on one of them than on the other.
 */
import React from 'react'

export default function CommissionNotFound() {
  return (
    <div className="missing">
      <h1>This link is not available</h1>
      <p>
        If you were expecting something here, please get in touch with whoever sent you the link for
        an up-to-date one.
      </p>
    </div>
  )
}
