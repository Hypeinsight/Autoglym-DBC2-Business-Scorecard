import { useEffect, useState } from 'react'
import { commentaryBlocks, campaigns } from '@/data/commentary'
import type { CommentaryItem } from '@/types'
import { fetchCommentaryEdits, saveCommentaryText } from '@/lib/apiClient'

const kindLabel: Record<CommentaryItem['kind'], { text: string; cls: string }> = {
  highlight: { text: 'Highlight', cls: 'text-up' },
  lowlight: { text: 'Lowlight', cls: 'text-down' },
  opportunity: { text: 'Optimisation Opportunity', cls: 'text-neutral' },
}

/** "Mar 2026 – ongoing" - computed from the campaign's start offset and the
 *  currently selected As At month, so it always reflects the latest month
 *  instead of a hardcoded date going stale. */
function campaignDateLabel(asAtMonth: string, startedMonthsAgo: number): string {
  const [year, month] = asAtMonth.split('-').map(Number)
  const start = new Date(year, month - 1 - startedMonthsAgo, 1)
  const label = start.toLocaleString('en-AU', { month: 'short', year: 'numeric' })
  return `${label} – ongoing  |  Still active at time of reporting`
}

interface Props {
  /** Currently selected "As At" month ('YYYY-MM') - edits save against this month. */
  asAtMonth: string
}

/** One click-to-edit text block - click to edit inline, blur/Enter to save, Escape to cancel. */
function EditableText({
  fieldKey,
  text,
  className,
  multiline,
  onSaved,
}: {
  fieldKey: string
  text: string
  className: string
  multiline?: boolean
  onSaved: (fieldKey: string, value: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => setDraft(text), [text])

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed === '' || trimmed === text) {
      setIsEditing(false)
      setDraft(text)
      return
    }
    setIsSaving(true)
    try {
      onSaved(fieldKey, trimmed)
    } finally {
      setIsSaving(false)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    const Field = multiline ? 'textarea' : 'input'
    return (
      <Field
        autoFocus
        value={draft}
        disabled={isSaving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void commit()
          }
          if (e.key === 'Escape') {
            setDraft(text)
            setIsEditing(false)
          }
        }}
        rows={multiline ? 3 : undefined}
        className={`${className} w-full resize-none rounded border border-brand bg-card px-2 py-1 outline-none focus:ring-2 focus:ring-brand/30`}
      />
    )
  }

  return (
    <div
      className={`${className} cursor-pointer rounded px-0.5 -mx-0.5 transition-colors hover:bg-brand/[0.06]`}
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      {text}
    </div>
  )
}

/** Tab 2 - separate commentary layer. Not on the BSC face; not printed.
 *  Starting content is seeded sample text; any edit made here is saved per
 *  month and overrides the seed on future loads for that month. */
export function CommentaryTab({ asAtMonth }: Props) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchCommentaryEdits(asAtMonth).then((fetched) => {
      if (!cancelled) setEdits(fetched)
    })
    return () => {
      cancelled = true
    }
  }, [asAtMonth])

  function textFor(fieldKey: string, seedText: string): string {
    return edits[fieldKey] ?? seedText
  }

  async function handleSave(fieldKey: string, value: string) {
    setSaveError('')
    // Optimistic - update locally immediately, then persist.
    setEdits((prev) => ({ ...prev, [fieldKey]: value }))
    try {
      await saveCommentaryText(asAtMonth, fieldKey, value)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const monthLabel = new Date(`${asAtMonth}-01`).toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto my-6 max-w-page rounded-xl border border-line bg-card px-8 pb-8 pt-7 shadow-page">
      <div className="mb-6 border-b-2 border-ink pb-4">
        <div className="font-display text-[1.3rem] font-extrabold text-ink">Monthly Commentary - {monthLabel}</div>
        <div className="mt-1.5 text-[0.82rem] text-muted">
          Separate commentary layer
        </div>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg border border-down/25 bg-down/5 px-4 py-2.5 text-[0.8rem] text-down">{saveError}</div>
      )}

      {commentaryBlocks.map((block) => (
        <div key={block.id} className="mb-5 rounded-lg border border-line bg-paper px-5 py-[18px] shadow-card">
          <div className="mb-3.5 border-b border-line pb-2 font-display text-[0.72rem] font-bold uppercase tracking-[0.09em] text-ink">
            {block.title}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {block.items.map((item) => (
              <div key={item.id}>
                <div className={`mb-1.5 text-[0.66rem] font-bold uppercase tracking-[0.06em] ${kindLabel[item.kind].cls}`}>
                  {kindLabel[item.kind].text}
                </div>
                <EditableText
                  fieldKey={item.id}
                  text={textFor(item.id, item.text)}
                  multiline
                  className="border-l-2 border-line pl-2.5 text-[0.78rem] leading-relaxed text-ink/75"
                  onSaved={handleSave}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mb-5 rounded-lg border border-line bg-paper px-5 py-[18px] shadow-card">
        <div className="mb-3.5 border-b border-line pb-2 font-display text-[0.72rem] font-bold uppercase tracking-[0.09em] text-ink">
          Campaign Attribution - Active This Period
        </div>
        {campaigns.map((c) => (
          <div key={c.id} className="mb-3 rounded-lg border border-line bg-card px-5 py-4">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <EditableText
                fieldKey={`${c.id}-name`}
                text={textFor(`${c.id}-name`, c.name)}
                className="font-display text-[0.82rem] font-extrabold text-ink"
                onSaved={handleSave}
              />
              <EditableText
                fieldKey={`${c.id}-dates`}
                text={textFor(`${c.id}-dates`, campaignDateLabel(asAtMonth, c.startedMonthsAgo))}
                className="shrink-0 text-[0.7rem] font-semibold text-muted"
                onSaved={handleSave}
              />
            </div>
            <ul className="m-0 list-none p-0">
              {c.bullets.map((b) => (
                <li
                  key={b.id}
                  className="relative py-[3px] pl-3.5 before:absolute before:left-0 before:top-[5px] before:text-[0.65rem] before:text-brand before:content-['▸']"
                >
                  <EditableText
                    fieldKey={b.id}
                    text={textFor(b.id, b.text)}
                    className="text-[0.77rem] leading-snug text-ink/75"
                    onSaved={handleSave}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
