import type { AcademicEvent } from './academic-calendar'

// Add only explicitly approved school events here. Never import private reference files.
export const ACADEMIC_EVENTS: readonly AcademicEvent[] = [
  { id: 'orientation-2026', title: 'Student orientation', start: '2026-08-31', end: '2026-08-31', category: 'term' },
  { id: 'classes-start-2026', title: 'Classes start', start: '2026-09-01', end: '2026-09-01', category: 'term' },
  { id: 'mid-autumn-2026', title: 'Mid-Autumn Festival holiday', start: '2026-09-25', end: '2026-09-27', category: 'holiday' },
  { id: 'national-day-2026', title: 'National Day holiday', start: '2026-10-01', end: '2026-10-07', category: 'holiday' },
  { id: 'midterms-2026', title: 'Midterm examinations', start: '2026-11-04', end: '2026-11-06', category: 'exam' },
  { id: 'charity-fair-2026', title: 'Charity fair', start: '2026-11-13', end: '2026-11-13', category: 'event', audience: 'Middle school' },
  { id: 'social-practice-2026', title: 'Social practice', start: '2026-11-26', end: '2026-11-26', category: 'event', audience: 'Grades 5–9' },
  { id: 'new-year-show-2026', title: 'New Year show', start: '2026-12-31', end: '2026-12-31', category: 'event', audience: 'Grades 7–9' },
  { id: 'finals-2027', title: 'Final examinations', start: '2027-01-11', end: '2027-01-13', category: 'exam' },
  { id: 'parent-meeting-2027', title: 'Parent meeting', start: '2027-01-22', end: '2027-01-22', category: 'parents', audience: 'Elementary and middle school' },
  { id: 'winter-holiday-2027', title: 'Student winter holiday', start: '2027-01-23', end: '2027-02-21', category: 'holiday' },
]
