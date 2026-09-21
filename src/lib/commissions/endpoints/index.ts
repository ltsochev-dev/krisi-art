/**
 * The commission REST surface.
 *
 * All seven are collection endpoints, so they are served by the existing Payload
 * catch-all at `src/app/(payload)/api/[...slug]/route.ts` and need no new Next
 * route files. Two of them are public; five are for editors.
 *
 * Custom endpoints are **unauthenticated by default** in Payload, so each
 * editor-only handler checks `req.user` itself — there is no collection access
 * control standing in front of these. See `guardEditor` in `./shared`.
 *
 * | Path                                    | Who     | Purpose                          |
 * | --------------------------------------- | ------- | -------------------------------- |
 * | `POST /:id/upload-url`                  | editors | issue a presigned `PUT`          |
 * | `POST /:id/files`                       | editors | register an uploaded object      |
 * | `POST /:id/thumbnails`                  | editors | build missing gallery previews   |
 * | `PATCH /:id/files/:fileId`              | editors | rename a file for the client     |
 * | `DELETE /:id/files/:fileId`             | editors | drop a row and its object        |
 * | `POST /:uuid/track`                     | public  | record a page view               |
 * | `POST /:uuid/download/:fileId`          | public  | issue a presigned `GET`          |
 *
 * The public two are keyed on the **UUID** and the editor five on the numeric
 * document **id**. That asymmetry is deliberate: the client only ever holds a
 * UUID, and the admin panel only ever holds an id, so neither has to be
 * translated into the other and no public route takes a guessable identifier.
 */
import type { Endpoint } from 'payload'

import { deleteCommissionFileEndpoint } from './delete-file'
import { downloadCommissionFileEndpoint } from './download'
import { registerCommissionFileEndpoint } from './register-file'
import { generateThumbnailsEndpoint } from './thumbnails'
import { trackCommissionViewEndpoint } from './track'
import { updateCommissionFileLabelEndpoint } from './update-label'
import { uploadUrlEndpoint } from './upload-url'

export const commissionEndpoints: Endpoint[] = [
  uploadUrlEndpoint,
  registerCommissionFileEndpoint,
  generateThumbnailsEndpoint,
  updateCommissionFileLabelEndpoint,
  deleteCommissionFileEndpoint,
  trackCommissionViewEndpoint,
  downloadCommissionFileEndpoint,
]
