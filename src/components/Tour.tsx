import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'

const SEEN = 'hw-tour-seen'

export const tourSeen = () => {
  try {
    return localStorage.getItem(SEEN) === '1'
  } catch {
    return true
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(SEEN, '1')
  } catch {
    // A private window can refuse; the guide simply offers itself again.
  }
}

interface Step {
  /** Where the step happens; the guide moves there itself. */
  route?: string
  /** What to light up. Left out for a step shown in the middle of the screen. */
  target?: string
  title: string
  body: string
  /** Skipped for a reader who is not signed in as an editor. */
  editorOnly?: boolean
  /** Only the person who hands out permissions sees this one. */
  adminOnly?: boolean
}

const STEPS: Step[] = [
  {
    title: 'A quick tour',
    body: 'Classboard holds the homework, the timetable and the class files. This takes about a minute, and you can leave it at any point.',
  },
  {
    route: '#/',
    target: '[data-tour="day-head"]',
    title: 'The day you are looking at',
    body: 'Today opens on today. The arrows step one day back or forward, and the Today button brings you home again.',
  },
  {
    route: '#/',
    target: '[data-tour="due-list"]',
    title: 'What has to be handed in',
    body: 'On today this lists everything due the next school day — the weekend and the national holidays are skipped. On any other day it lists that day’s own work.',
  },
  {
    route: '#/',
    target: '[data-tour="calendar"]',
    title: 'The month at a glance',
    body: 'A star marks a test, and a dot marks a project or a longer piece of homework, in its subject’s colour. Green days are school days, sand days are weekends and holidays. Tap any day to read it on the left.',
  },
  {
    route: '#/',
    target: '[data-tour="message"]',
    title: 'The message for the group',
    body: 'Classboard writes the WeChat message for you: the homework, the reminders and any timetable change. Press Copy, then paste it into the group. Week gives the Sunday preview instead.',
    editorOnly: true,
  },
  {
    route: '#/schedule',
    target: '[data-tour="slots"]',
    title: 'The timetable',
    body: 'Pick a day here and its lessons appear below with their bell times. Tap a lesson to swap it with another one — the same day or a different day — or to cancel it, either just for that day or every week from now on.',
    editorOnly: true,
  },
  {
    route: '#/schedule',
    target: '[data-tour="slots"]',
    title: 'The timetable',
    body: 'Pick a day here and its lessons appear below with their bell times. Any change the teacher makes shows up here, and in the group message.',
  },
  {
    route: '#/materials',
    target: '[data-tour="files"]',
    title: 'Files and notes',
    body: 'Review materials, worksheets and notes live here, grouped by subject, so nobody has to scroll back through the chat to find them.',
  },
  {
    route: '#/post',
    target: '[data-tour="form"]',
    title: 'Adding homework',
    body: 'Pick the type and the subject, write what has to be done, and set the dates. EE, EC and Math open to show their classes. Posting it updates the day’s list, the calendar and the group message at once.',
    editorOnly: true,
  },
  {
    route: '#/people',
    target: '[data-tour="people"]',
    title: 'Who may post',
    body: 'Everyone signs up with their own email, and a new account can only read. Make someone an editor here and they can post homework, change the timetable and upload files.',
    adminOnly: true,
  },
  {
    target: '[data-tour="help"]',
    title: 'That is everything',
    body: 'Open this guide again from here whenever you need it.',
  },
]

/** The first element matching the selector that is actually on screen. */
const findTarget = (sel: string) =>
  [...document.querySelectorAll<HTMLElement>(sel)].find((el) => el.offsetParent !== null || el === document.body) ?? null

interface Rect { top: number; left: number; width: number; height: number }

export default function Tour({ editor, admin, onClose }: { editor: boolean; admin: boolean; onClose: () => void }) {
  const steps = STEPS.filter((s) => (!s.editorOnly || editor) && (!s.adminOnly || admin))
    // The timetable has an editor version and a reader version; keep one.
    .filter((s, i, all) => !(s.title === 'The timetable' && all.some((o, j) => j < i && o.title === 'The timetable')))
  const [n, setN] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const step = steps[n]
  const cardRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    markSeen()
    onClose()
  }, [onClose])

  // Move to the step's page, wait for it to render, then light up its target.
  useEffect(() => {
    let alive = true
    if (step.route && !location.hash.startsWith(step.route)) location.hash = step.route
    if (!step.target) {
      setRect(null)
      return
    }
    const look = (tries: number) => {
      if (!alive) return
      const el = findTarget(step.target!)
      if (!el) {
        // The page may still be rendering; give it a few frames, then skip the step.
        if (tries > 0) return void setTimeout(() => look(tries - 1), 80)
        return setRect(null)
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // Measure once the scroll has started and again once it has finished, so a
      // quick Next during the animation still leaves the hole in the right place.
      for (const wait of [60, 320, 700]) {
        setTimeout(() => {
          if (!alive) return
          const r = el.getBoundingClientRect()
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        }, wait)
      }
    }
    look(10)
    return () => {
      alive = false
    }
  }, [step])

  // Keep the hole on the element while the page moves under it.
  useLayoutEffect(() => {
    if (!step.target) return
    const measure = () => {
      const el = findTarget(step.target!)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') setN((i) => Math.min(i + 1, steps.length - 1))
      if (e.key === 'ArrowLeft') setN((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, steps.length])

  const pad = 8
  const hole = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null

  // The card parks at the foot of the screen, or at the top when the lit element
  // is down there. Fixed corners keep it on screen whatever the element's size.
  const cardStyle: React.CSSProperties = {}
  if (hole) {
    const roomBelow = window.innerHeight - (hole.top + hole.height)
    if (roomBelow >= 210 || hole.top < 210) cardStyle.bottom = 16
    else cardStyle.top = 16
  }

  const last = n === steps.length - 1

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guide">
      <div className="tour-shade" onClick={close} />
      {hole && <div className="tour-hole" style={hole} />}
      <div className={`tour-card ${hole ? '' : 'middle'}`} style={cardStyle} ref={cardRef}>
        <div className="tour-step">Step {n + 1} of {steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="link-btn" onClick={close}>Skip</button>
          <div className="tour-buttons">
            {n > 0 && <button className="btn-quiet" onClick={() => setN(n - 1)}>Back</button>}
            <button className="btn-primary" onClick={() => (last ? close() : setN(n + 1))}>
              {last ? 'Done' : 'Next'}
              {!last && <Icon name="right" size={16} stroke={2.4} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
