'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button, toast, useConfig, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ALLOWED_COMMISSION_MIME_TYPES,
  isAllowedCommissionMimeType,
  isDisplayableImage,
  MAX_COMMISSION_FILE_BYTES,
} from '@/lib/commissions/constants'
import type { Commission } from '@/payload-types'

/**
 * The uploader for a commission's private files.
 *
 * A `ui` field, so it holds no value and writes nothing through the form. Every
 * mutation goes to the custom endpoints on the collection, which are the only
 * code allowed to touch the `files` array — see the note at the top of
 * `@/collections/Commissions`. Each endpoint answers with the whole array as it
 * now stands, so the list below is always the server's version of the truth
 * rather than something reconstructed here.
 *
 * Three things in here are less obvious than they look, and each is commented
 * where it happens: why the upload is an `XMLHttpRequest` and not a `fetch`,
 * why a `PUT` that fails with status `0` is a CORS problem rather than a
 * signing problem, and why a label is saved through its own endpoint instead of
 * through the form.
 */

type CommissionFileRow = NonNullable<Commission['files']>[number]

/** A file the artist has picked but that has not finished its round trip yet. */
type QueuedUpload = {
  error: null | string
  file: File
  label: string
  /** 0–1, driven by `xhr.upload.onprogress`. */
  progress: number
  status: 'done' | 'failed' | 'putting' | 'queued' | 'registering' | 'signing'
  uid: string
}

/**
 * Thrown when the bytes reached S3 but the row could not be written. This is
 * the only failure that leaves an object in the bucket with nothing owning it,
 * so it is reported differently from every other error.
 */
class OrphanedObjectError extends Error {}

/**
 * Thrown on the endpoints' 503, meaning `S3_COMMISSIONS_BUCKET` is unset. Its
 * own class rather than a substring match on the message, so the queue can stop
 * on it without depending on the wording the server happens to use.
 */
class StorageUnavailableError extends Error {}

/**
 * Mirrors `MAX_LABEL_LENGTH` in `@/lib/commissions/endpoints/update-label`.
 * Enforced there for real; repeated here only so the field stops accepting
 * characters rather than letting the artist type into a 400.
 */
const MAX_LABEL_LENGTH = 200

const STATUS_LABELS: Record<QueuedUpload['status'], string> = {
  done: 'Done',
  failed: 'Failed',
  putting: 'Uploading',
  queued: 'Waiting',
  registering: 'Saving',
  signing: 'Preparing',
}

const formatBytes = (value: null | number | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '—'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }

  return `${unit === 0 ? size : size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`
}

const formatUploadedAt = (value: null | string | undefined): string => {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleString(undefined, {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
}

/**
 * The document the edit view already loaded, narrowed to the array we render.
 *
 * `useDocumentInfo().data` is the saved document that the server rendered this
 * page from, kept up to date by the provider on every save — so seeding the
 * list from it costs no request at all. A `GET /api/commissions/<id>?depth=0`
 * would work equally well but would re-fetch a document that is already in
 * memory. (`data` is the 3.88 replacement for `savedDocumentData`, which is
 * deprecated and slated for removal in v4; do not switch back to it.)
 */
const readRows = (data: unknown): CommissionFileRow[] => {
  const files = (data as null | Partial<Commission> | undefined)?.files

  return Array.isArray(files) ? files : []
}

/** Best-effort message out of a Payload/REST error body. */
const messageFrom = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body: unknown = await response.json()
    const message = (body as { errors?: { message?: string }[]; message?: string } | null)?.message
    const nested = (body as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message

    return message ?? nested ?? fallback
  } catch {
    return fallback
  }
}

const styles = {
  bar: {
    background: 'var(--theme-elevation-100)',
    borderRadius: '999px',
    height: '4px',
    marginTop: 'calc(var(--base) / 4)',
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    background: 'var(--theme-success-500)',
    height: '100%',
    transition: 'width 120ms linear',
  },
  dropZone: {
    alignItems: 'center',
    border: '1px dashed var(--theme-elevation-250)',
    borderRadius: 'var(--style-radius-s)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--base) / 3)',
    padding: 'var(--base)',
    textAlign: 'center',
    transition: 'background 120ms ease, border-color 120ms ease',
  },
  dropZoneActive: {
    background: 'var(--theme-elevation-50)',
    borderColor: 'var(--theme-success-500)',
  },
  error: {
    color: 'var(--theme-error-600)',
    fontSize: '0.75rem',
    marginTop: 'calc(var(--base) / 6)',
  },
  hint: {
    color: 'var(--theme-elevation-500)',
    fontSize: '0.8rem',
    lineHeight: 1.4,
  },
  labelInput: {
    background: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-elevation-800)',
    fontSize: '0.8rem',
    padding: 'calc(var(--base) / 5) calc(var(--base) / 3)',
    width: '100%',
  },
  meta: {
    color: 'var(--theme-elevation-500)',
    fontSize: '0.75rem',
  },
  name: {
    fontSize: '0.85rem',
    fontWeight: 600,
    overflowWrap: 'anywhere',
  },
  notice: {
    background: 'var(--theme-warning-50)',
    border: '1px solid var(--theme-warning-250)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-warning-750)',
    fontSize: '0.85rem',
    lineHeight: 1.4,
    marginBottom: 'calc(var(--base) / 2)',
    padding: 'calc(var(--base) / 2)',
  },
  row: {
    alignItems: 'flex-start',
    borderTop: '1px solid var(--theme-elevation-100)',
    display: 'flex',
    gap: 'calc(var(--base) / 2)',
    justifyContent: 'space-between',
    padding: 'calc(var(--base) / 2) 0',
  },
  rowMain: {
    minWidth: 0,
  },
  wrapper: {
    marginBottom: 'var(--base)',
  },
} satisfies Record<string, React.CSSProperties>

export const CommissionUploader: UIFieldClientComponent = () => {
  const { config } = useConfig()
  const { data, id, isInitializing } = useDocumentInfo()

  const [rows, setRows] = useState<CommissionFileRow[]>([])
  const [queue, setQueue] = useState<QueuedUpload[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  /**
   * The 503 body from the endpoints, meaning `S3_COMMISSIONS_BUCKET` is unset.
   * Held as inline text rather than raised as a toast: with several files in
   * the queue a toast per file would be a stack of identical notifications for
   * a condition nobody can fix from this screen.
   */
  const [storageError, setStorageError] = useState<null | string>(null)
  /**
   * Uncommitted label text, keyed by `fileId`. A key that is absent means the
   * row is showing the server's value — which is what makes reverting a failed
   * save a matter of deleting the key rather than remembering what was there.
   */
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({})
  const [savingLabels, setSavingLabels] = useState<Record<string, boolean>>({})
  /**
   * How far the preview backfill has got, or `null` when it is not running.
   * Doubles as the disabled flag for its button, so there is one piece of state
   * rather than two that can disagree.
   */
  const [previewProgress, setPreviewProgress] = useState<null | { done: number; total: number }>(
    null,
  )

  const inputRef = useRef<HTMLInputElement>(null)
  const seeded = useRef(false)

  const basePath = useMemo(
    () => `${config.serverURL ?? ''}${config.routes?.api ?? '/api'}/commissions`,
    [config.routes?.api, config.serverURL],
  )

  // Seed once from the document the page was rendered with. Afterwards the
  // endpoint responses own this state — they return the authoritative array and
  // the form is never the source for it.
  useEffect(() => {
    if (seeded.current || isInitializing) {
      return
    }

    seeded.current = true
    setRows(readRows(data))
  }, [data, isInitializing])

  const patchQueued = useCallback((uid: string, patch: Partial<QueuedUpload>) => {
    setQueue((current) => current.map((item) => (item.uid === uid ? { ...item, ...patch } : item)))
  }, [])

  /**
   * `PUT`s the bytes straight to S3.
   *
   * `XMLHttpRequest` rather than `fetch` for one reason only: `fetch` exposes no
   * upload progress. There is no event, no callback and no readable request
   * stream in any browser we support, so a progress bar for a 400MB file is
   * only possible through `xhr.upload.onprogress`.
   */
  const putBytes = useCallback(
    (url: string, file: File, contentType: string, onProgress: (fraction: number) => void) =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.open('PUT', url, true)

        /*
         * Exactly the string that was signed, not `file.type` read a second
         * time. The presigned URL covers the `Content-Type` header, so S3
         * compares this byte for byte against the value the signing endpoint
         * was given and answers 403 `SignatureDoesNotMatch` on any difference.
         * Passing the same variable through both calls is what guarantees they
         * agree.
         */
        xhr.setRequestHeader('Content-Type', contentType)

        // No cookies on this one. The presigned URL *is* the credential, and
        // sending any would break the signature and the CORS preflight both.
        xhr.withCredentials = false

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress(event.loaded / event.total)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(1)
            resolve()

            return
          }

          reject(new Error(`S3 rejected the upload (HTTP ${xhr.status}).`))
        }

        /*
         * If this fires with `xhr.status === 0` and nothing useful in
         * `responseText`, it is CORS — the bucket's `PUT` CORS rule, not the
         * signature. The browser deliberately withholds the real response from
         * a cross-origin request it could not validate, so a signing error and
         * a missing CORS rule look identical from here. This is by far the most
         * likely thing to go wrong with this component: check the bucket's CORS
         * configuration allows `PUT` from this origin and exposes `ETag` before
         * touching anything about the presigning.
         */
        xhr.onerror = () => {
          reject(
            new Error(
              'The browser blocked the upload before it reached S3. This is almost always the bucket’s CORS configuration (it must allow PUT from this origin), not the signed URL.',
            ),
          )
        }

        xhr.onabort = () => reject(new Error('The upload was cancelled.'))
        xhr.ontimeout = () => reject(new Error('The upload timed out.'))

        xhr.send(file)
      }),
    [],
  )

  /** Signs, uploads and registers a single file. Resolves to the new array. */
  const uploadOne = useCallback(
    async (item: QueuedUpload): Promise<CommissionFileRow[]> => {
      // The type is read once here and reused for both the signature and the
      // `PUT` header, so the two can never disagree. Browsers occasionally
      // report an empty `type`; the endpoint rejects that with a 400, which is
      // the right answer, but the pre-check below catches it before any request.
      const contentType = item.file.type

      patchQueued(item.uid, { error: null, progress: 0, status: 'signing' })

      const signResponse = await fetch(`${basePath}/${id}/upload-url`, {
        body: JSON.stringify({
          contentType,
          filename: item.file.name,
          size: item.file.size,
        }),
        // Payload authenticates the endpoint from its own cookie, which is not
        // sent on a same-origin `fetch` unless it is asked for explicitly.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (signResponse.status === 503) {
        throw new StorageUnavailableError(
          await messageFrom(signResponse, 'File storage is not configured on this server.'),
        )
      }

      if (!signResponse.ok) {
        throw new Error(await messageFrom(signResponse, 'Could not get an upload URL.'))
      }

      const { fileId, key, url } = (await signResponse.json()) as {
        fileId: string
        key: string
        url: string
      }

      patchQueued(item.uid, { status: 'putting' })

      await putBytes(url, item.file, contentType, (fraction) => {
        patchQueued(item.uid, { progress: fraction })
      })

      patchQueued(item.uid, { status: 'registering' })

      const registerResponse = await fetch(`${basePath}/${id}/files`, {
        body: JSON.stringify({
          fileId,
          key,
          ...(item.label.trim() ? { label: item.label.trim() } : {}),
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!registerResponse.ok) {
        // The bytes are in the bucket but no row owns them. Nothing here can
        // clean that up — the delete endpoint works from a row — so say so
        // plainly instead of reporting a generic failure.
        throw new OrphanedObjectError(
          await messageFrom(registerResponse, 'The file could not be saved to the commission.'),
        )
      }

      const { files } = (await registerResponse.json()) as { files: CommissionFileRow[] }

      return Array.isArray(files) ? files : []
    },
    [basePath, id, patchQueued, putBytes],
  )

  /**
   * Runs the queue one file at a time.
   *
   * Sequential on purpose: each file gets its own presigned URL and its own row
   * write, and two concurrent registrations would race on the same `files`
   * array. Serialising here means the last response is always the complete one.
   */
  const runQueue = useCallback(
    async (items: QueuedUpload[]) => {
      setIsUploading(true)

      try {
        for (const item of items) {
          try {
            const files = await uploadOne(item)

            setRows(files)
            patchQueued(item.uid, { progress: 1, status: 'done' })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'The upload failed.'

            patchQueued(item.uid, { error: message, status: 'failed' })

            // A 503 means nothing else in the queue can succeed either. It is
            // reported inline, once, and stops the run — a toast per queued
            // file would be a stack of identical notices about a server
            // setting nobody can change from this screen.
            if (error instanceof StorageUnavailableError) {
              setStorageError(message)
              break
            }

            if (error instanceof OrphanedObjectError) {
              toast.error(
                `${item.file.name}: uploaded to storage, but registering it failed — ${message} The file is now in the bucket with no record on this commission and has to be removed by hand.`,
              )
            } else {
              toast.error(`${item.file.name}: ${message}`)
            }
          }
        }
      } finally {
        setIsUploading(false)
      }
    },
    [patchQueued, uploadOne],
  )

  const addFiles = useCallback((picked: FileList | null) => {
    if (!picked || picked.length === 0) {
      return
    }

    const accepted: QueuedUpload[] = []

    for (const file of Array.from(picked)) {
      // Pre-checked here against the same constants the endpoint enforces, so
      // an obvious mistake costs no request and no presigned URL. The server
      // still checks; this is only for speed of feedback.
      if (!isAllowedCommissionMimeType(file.type)) {
        toast.error(
          `${file.name}: ${file.type || 'unknown type'} is not an accepted file type. Allowed: images, PDF and archives.`,
        )

        continue
      }

      if (file.size > MAX_COMMISSION_FILE_BYTES) {
        toast.error(
          `${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(MAX_COMMISSION_FILE_BYTES)} limit for a single file.`,
        )

        continue
      }

      accepted.push({
        error: null,
        file,
        label: '',
        progress: 0,
        status: 'queued',
        uid: `${file.name}-${file.size}-${Date.now()}-${accepted.length}`,
      })
    }

    if (accepted.length === 0) {
      return
    }

    setQueue((current) => [...current, ...accepted])
  }, [])

  const clearDraft = useCallback((fileId: string) => {
    setLabelDrafts(({ [fileId]: _dropped, ...rest }) => rest)
  }, [])

  /**
   * Commits one row's label through `PATCH .../files/:fileId`.
   *
   * Deliberately not gated on `storageError`: renaming touches no S3 object, so
   * the endpoint carries no 503 guard and this must keep working in a checkout
   * with no bucket configured.
   */
  const saveLabel = useCallback(
    async (row: CommissionFileRow) => {
      const draft = labelDrafts[row.fileId]

      if (draft === undefined) {
        return
      }

      const next = draft.trim()

      // Nothing to send. Dropping the draft is what returns the input to the
      // server value, so a no-op edit tidies itself up.
      if (next === (row.label ?? '').trim()) {
        clearDraft(row.fileId)

        return
      }

      setSavingLabels((current) => ({ ...current, [row.fileId]: true }))

      try {
        const response = await fetch(`${basePath}/${id}/files/${row.fileId}`, {
          // `null` clears the label; the endpoint takes a string or null and
          // nothing else.
          body: JSON.stringify({ label: next || null }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        })

        if (!response.ok) {
          toast.error(
            `${row.filename}: ${await messageFrom(response, 'The label could not be saved.')}`,
          )
          // Revert: the row keeps whatever the server still holds.
          clearDraft(row.fileId)

          return
        }

        const { files } = (await response.json()) as { files: CommissionFileRow[] }

        setRows(Array.isArray(files) ? files : [])
        clearDraft(row.fileId)
      } catch (error) {
        toast.error(
          `${row.filename}: ${error instanceof Error ? error.message : 'The label could not be saved.'}`,
        )
        clearDraft(row.fileId)
      } finally {
        setSavingLabels(({ [row.fileId]: _dropped, ...rest }) => rest)
      }
    },
    [basePath, clearDraft, id, labelDrafts],
  )

  /**
   * Photographs in this commission with no stored preview.
   *
   * Only the ones a browser can paint count — see `isDisplayableImage`. An
   * archive or a HEIC has nothing to preview and is not part of the backlog,
   * which matters because the count is what decides whether the button below
   * appears at all.
   */
  const missingPreviews = useMemo(
    () => rows.filter((row) => !row.thumbKey && isDisplayableImage(row.mimeType)).length,
    [rows],
  )

  /**
   * Builds the missing previews, a batch per request.
   *
   * The endpoint does `THUMBNAIL_BATCH` photographs per call and answers with
   * how many are left, so the loop is here rather than there: 220 downloads and
   * resizes in one request would outlast any proxy and throw away the work it
   * had done. Each response carries the whole `files` array, so the list
   * re-renders after every batch and the artist watches the backlog drain.
   *
   * It stops on `remaining: 0` and *also* on a pass that generated nothing,
   * which is what guarantees termination: a photo that cannot be resized comes
   * back round as pending every time, so "nothing was left to try" is the only
   * other honest end condition.
   */
  const buildPreviews = useCallback(async () => {
    const total = missingPreviews

    setPreviewProgress({ done: 0, total })

    let done = 0
    const failures = new Set<string>()

    try {
      for (;;) {
        const response = await fetch(`${basePath}/${id}/thumbnails`, {
          credentials: 'include',
          method: 'POST',
        })

        if (response.status === 503) {
          setStorageError(
            await messageFrom(response, 'File storage is not configured on this server.'),
          )

          return
        }

        if (!response.ok) {
          toast.error(await messageFrom(response, 'The previews could not be generated.'))

          return
        }

        const result = (await response.json()) as {
          errors?: string[]
          files?: CommissionFileRow[]
          generated?: number
          remaining?: number
        }

        if (Array.isArray(result.files)) {
          setRows(result.files)
        }

        for (const failure of result.errors ?? []) {
          failures.add(failure)
        }

        done += result.generated ?? 0
        setPreviewProgress({ done, total: Math.max(total, done) })

        if ((result.remaining ?? 0) <= 0 || (result.generated ?? 0) <= 0) {
          break
        }
      }

      if (failures.size > 0) {
        toast.error(
          `Generated ${done} preview${done === 1 ? '' : 's'}. ${failures.size} could not be resized — ${[...failures].slice(0, 3).join('; ')}`,
        )
      } else {
        toast.success(`Generated ${done} preview${done === 1 ? '' : 's'}.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The previews could not be generated.')
    } finally {
      setPreviewProgress(null)
    }
  }, [basePath, id, missingPreviews])

  const handleDelete = useCallback(
    async (row: CommissionFileRow) => {
      if (!window.confirm(`Delete “${row.filename}”? The file is removed from storage as well.`)) {
        return
      }

      try {
        const response = await fetch(`${basePath}/${id}/files/${row.fileId}`, {
          credentials: 'include',
          method: 'DELETE',
        })

        if (response.status === 503) {
          setStorageError(
            await messageFrom(response, 'File storage is not configured on this server.'),
          )

          return
        }

        if (!response.ok) {
          toast.error(
            `${row.filename}: ${await messageFrom(response, 'The file could not be deleted.')}`,
          )

          return
        }

        const { files } = (await response.json()) as { files: CommissionFileRow[] }

        setRows(Array.isArray(files) ? files : [])
        toast.success(`Deleted ${row.filename}.`)
      } catch (error) {
        toast.error(
          `${row.filename}: ${error instanceof Error ? error.message : 'The file could not be deleted.'}`,
        )
      }
    },
    [basePath, id],
  )

  /*
   * The upload endpoints attach a file to an existing document, so there has to
   * be one first. That ordering is not a UI nicety: it is what keeps the bucket
   * and the database in step. If bytes could be pushed before the row existed,
   * a create that then failed validation would leave an object in storage with
   * nothing to own it, nothing to bill it to and no way to find it again from
   * the admin panel.
   */
  if (!id) {
    return (
      <div style={styles.wrapper}>
        <p style={styles.hint}>
          Save the commission first. Files attach to a saved document, so the uploader appears once
          this one has an ID.
        </p>
      </div>
    )
  }

  const pending = queue.filter((item) => item.status !== 'done')

  return (
    <div style={styles.wrapper}>
      {storageError ? (
        <p role="alert" style={styles.notice}>
          {storageError} Uploads and deletions are unavailable until{' '}
          <code>S3_COMMISSIONS_BUCKET</code> is set on the server. Existing files are listed below
          but cannot be changed.
        </p>
      ) : null}

      <div
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          addFiles(event.dataTransfer?.files ?? null)
        }}
        style={isDragging ? { ...styles.dropZone, ...styles.dropZoneActive } : styles.dropZone}
      >
        <input
          accept={ALLOWED_COMMISSION_MIME_TYPES.join(',')}
          multiple
          onChange={(event) => {
            addFiles(event.target.files)
            // Cleared so picking the same file twice in a row still fires
            // `change` — the value is unchanged otherwise and the event never
            // arrives.
            event.target.value = ''
          }}
          ref={inputRef}
          style={{ display: 'none' }}
          type="file"
        />

        <Button
          buttonStyle="secondary"
          disabled={isUploading || Boolean(storageError)}
          onClick={() => inputRef.current?.click()}
          size="small"
        >
          Choose files
        </Button>

        <span style={styles.hint}>
          …or drop them here. Images, PDF and archives, up to{' '}
          {formatBytes(MAX_COMMISSION_FILE_BYTES)} each. Files go straight from this browser to
          private storage; they never pass through the server.
        </span>
      </div>

      {pending.length > 0 ? (
        <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
          {pending.map((item) => (
            <div key={item.uid} style={styles.row}>
              <div style={{ ...styles.rowMain, flex: 1 }}>
                <div style={styles.name}>{item.file.name}</div>
                <div style={styles.meta}>
                  {formatBytes(item.file.size)} · {STATUS_LABELS[item.status]}
                  {item.status === 'putting' ? ` ${Math.round(item.progress * 100)}%` : ''}
                </div>

                {item.status === 'queued' ? (
                  <input
                    aria-label={`Label for ${item.file.name}`}
                    onChange={(event) => patchQueued(item.uid, { label: event.target.value })}
                    placeholder="Optional label shown to the client"
                    style={{ ...styles.labelInput, marginTop: 'calc(var(--base) / 4)' }}
                    type="text"
                    value={item.label}
                  />
                ) : null}

                {item.status === 'putting' || item.status === 'registering' ? (
                  <div style={styles.bar}>
                    <div
                      style={{ ...styles.barFill, width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                ) : null}

                {item.error ? <div style={styles.error}>{item.error}</div> : null}
              </div>

              {item.status === 'queued' || item.status === 'failed' ? (
                <Button
                  buttonStyle="none"
                  onClick={() => setQueue((current) => current.filter((q) => q.uid !== item.uid))}
                  size="small"
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}

          <Button
            buttonStyle="primary"
            disabled={
              isUploading ||
              Boolean(storageError) ||
              !queue.some((item) => item.status === 'queued' || item.status === 'failed')
            }
            onClick={() => {
              void runQueue(
                queue.filter((item) => item.status === 'queued' || item.status === 'failed'),
              )
            }}
            size="small"
          >
            {isUploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      ) : null}

      <div style={{ marginTop: 'var(--base)' }}>
        <h4 style={{ fontSize: '0.85rem', margin: 0 }}>
          Delivered files {rows.length > 0 ? `(${rows.length})` : ''}
        </h4>

        {/*
         * Only shown when there is a backlog, which for a commission uploaded
         * from now on is never: `POST /:id/files` builds each preview as the
         * file is registered. This is for the albums that predate previews, and
         * for a photo whose resize failed at upload — pressing it again retries
         * exactly those.
         */}
        {missingPreviews > 0 || previewProgress ? (
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'calc(var(--base) / 3)',
              marginTop: 'calc(var(--base) / 3)',
            }}
          >
            <Button
              buttonStyle="secondary"
              disabled={isUploading || Boolean(previewProgress) || Boolean(storageError)}
              onClick={() => void buildPreviews()}
              size="small"
            >
              {previewProgress
                ? `Generating… ${previewProgress.done}/${previewProgress.total}`
                : `Generate previews (${missingPreviews})`}
            </Button>

            <span style={styles.hint}>
              {missingPreviews} photo{missingPreviews === 1 ? '' : 's'} in a gallery commission
              still {missingPreviews === 1 ? 'has' : 'have'} no small copy in storage, so the grid
              falls back to resizing on demand — which is slow and, on a large album, unreliable.
              This runs in batches and can be left to finish.
            </span>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p style={{ ...styles.hint, marginTop: 'calc(var(--base) / 4)' }}>
            Nothing uploaded yet.
          </p>
        ) : (
          rows.map((row) => {
            const draft = labelDrafts[row.fileId]
            const isDirty = draft !== undefined && draft.trim() !== (row.label ?? '').trim()
            const isSaving = Boolean(savingLabels[row.fileId])

            return (
              <div key={row.fileId} style={styles.row}>
                <div style={{ ...styles.rowMain, flex: 1 }}>
                  <div style={styles.name}>{row.filename}</div>
                  <div style={styles.meta}>
                    {formatBytes(row.filesize)} · uploaded {formatUploadedAt(row.uploadedAt)} ·{' '}
                    {row.downloadCount ?? 0} download
                    {(row.downloadCount ?? 0) === 1 ? '' : 's'}
                    {isSaving ? ' · saving label…' : ''}
                  </div>

                  <div
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      gap: 'calc(var(--base) / 4)',
                      marginTop: 'calc(var(--base) / 4)',
                    }}
                  >
                    <input
                      aria-label={`Label for ${row.filename}`}
                      disabled={isSaving}
                      maxLength={MAX_LABEL_LENGTH}
                      onChange={(event) => {
                        setLabelDrafts((current) => ({
                          ...current,
                          [row.fileId]: event.target.value,
                        }))
                      }}
                      /*
                       * Enter commits, Escape reverts, and blur does neither on
                       * purpose: blur also fires on the way to the Delete
                       * button beside it, which would put a rename request and
                       * a delete confirmation on screen at the same moment. The
                       * Save button appears only while the value is dirty, so
                       * there is always a visible way to commit.
                       */
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void saveLabel(row)
                        }

                        if (event.key === 'Escape') {
                          event.preventDefault()
                          clearDraft(row.fileId)
                        }
                      }}
                      placeholder="Optional label shown to the client"
                      style={styles.labelInput}
                      type="text"
                      value={draft ?? row.label ?? ''}
                    />

                    {isDirty ? (
                      <Button
                        buttonStyle="secondary"
                        disabled={isSaving}
                        onClick={() => void saveLabel(row)}
                        size="small"
                      >
                        Save
                      </Button>
                    ) : null}
                  </div>
                </div>

                <Button
                  buttonStyle="error"
                  disabled={isUploading || isSaving || Boolean(storageError)}
                  onClick={() => void handleDelete(row)}
                  size="small"
                >
                  Delete
                </Button>
              </div>
            )
          })
        )}
      </div>

      {/*
       * Why a label is saved from here rather than through the form.
       *
       * The `files` array carries `access: { update: () => false }`, and Payload
       * enforces that in `beforeValidate` by deleting the incoming value and
       * refilling it from the stored document (`getFallbackValue` →
       * `cloneDataFromOriginalDoc`) *before* it descends into the array's row
       * subfields. So a `PATCH /api/commissions/<id>` carrying `{ files: [...] }`
       * comes back 200 with the array silently reverted, and no per-subfield
       * carve-out on `label` can rescue it — the parent gate has already thrown
       * the rows away. Saving the document with the array field's label box
       * edited fails in exactly the same way, which is why that field is now
       * read-only in the collection.
       *
       * `PATCH .../files/:fileId` is the writable path: it runs
       * `payload.update` with `overrideAccess: true`, so it keeps the rule that
       * every mutation of the array goes through one of the endpoints. It has
       * no 503 guard, because renaming moves no bytes.
       */}
      <p style={{ ...styles.hint, marginTop: 'calc(var(--base) / 2)' }}>
        A label replaces the filename for the client. Press Enter or Save to store it, Escape to
        discard the edit. Renaming moves nothing in storage, so it works even while uploads are
        unavailable.
      </p>
    </div>
  )
}

export default CommissionUploader
