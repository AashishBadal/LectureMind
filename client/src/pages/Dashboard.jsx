import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLecturesApi, getSubjectsApi } from '../services/api';
import { ArrowDownRight, ArrowRight, AudioLines, BookOpen, Check, ChevronRight, CircleAlert, FileText, Network, Search, Sparkles, Upload } from 'lucide-react';

function dateLabel(value) {
  if (!value) return 'Date not set';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusLabel(lecture) {
  const status = lecture.processingStatus || lecture.status || 'PENDING';
  if (['COMPLETED', 'ANALYZED'].includes(status)) return ['Ready', 'ready'];
  if (status === 'TRANSCRIBED') return ['Transcript ready', 'transcribed'];
  if (status === 'FAILED') return ['Needs attention', 'failed'];
  if (['PROCESSING', 'TRANSCRIBING', 'ANALYZING'].includes(status)) return ['In progress', 'processing'];
  return ['Not processed', 'pending'];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([getLecturesApi(), getSubjectsApi()])
      .then(([lectureResult, subjectResult]) => {
        if (!mounted) return;
        setLectures(lectureResult?.lectures || []);
        setSubjects(subjectResult?.subjects || []);
      })
      .catch((err) => { if (mounted) setError(err.message || 'Unable to load your workspace.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const metrics = useMemo(() => {
    const transcriptCount = lectures.filter(item => item.hasTranscript).length;
    const mapCount = lectures.filter(item => item.hasLearningMap).length;
    const conceptCount = lectures.reduce((sum, item) => sum + (item.conceptCount || 0), 0);
    const hours = Math.round(lectures.reduce((sum, item) => sum + (item.duration || 0), 0) / 3600 * 10) / 10;
    return { transcriptCount, mapCount, conceptCount, hours, readiness: lectures.length ? Math.round(transcriptCount / lectures.length * 100) : 0 };
  }, [lectures]);

  const weeklyActivity = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = date.toDateString();
      return {
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        count: lectures.filter(item => new Date(item.createdAt || item.lectureDate).toDateString() === key).length,
        current: index === 6
      };
    });
  }, [lectures]);

  const latest = lectures.slice(0, 5);
  const focusQueue = lectures.filter(item => !item.hasTranscript || ['FAILED', 'PENDING', 'UPLOADED'].includes(item.status)).slice(0, 3);
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-mark" /> LEARNING INTELLIGENCE <span className="eyebrow-divider">/</span> {todayLabel.toUpperCase()}</div>
          <h1>Good to see you, {user?.name?.split(' ')[0] || 'scholar'}.</h1>
          <p>Your lectures are becoming a connected map of what you know.</p>
        </div>
        <div className="dashboard-actions">
          <Link to="/research" className="button-secondary"><Search size={15} /> Research Lab</Link>
          <Link to="/upload" className="button-primary"><Upload size={15} /> Add lecture</Link>
        </div>
      </header>

      {error && <div className="workspace-alert"><CircleAlert size={16} /> {error}</div>}

      <section className="metrics-strip" aria-label="Learning library metrics">
        <article className="metric-cell"><span className="metric-label">LECTURES CAPTURED</span><strong>{loading ? '—' : lectures.length.toString().padStart(2, '0')}</strong><span className="metric-foot"><AudioLines size={13} /> {metrics.hours} hours of audio</span></article>
        <article className="metric-cell"><span className="metric-label">SUBJECTS</span><strong>{loading ? '—' : subjects.length.toString().padStart(2, '0')}</strong><span className="metric-foot"><BookOpen size={13} /> Active learning spaces</span></article>
        <article className="metric-cell"><span className="metric-label">CONCEPTS MAPPED</span><strong>{loading ? '—' : metrics.conceptCount.toString().padStart(2, '0')}</strong><span className="metric-foot"><Network size={13} /> Across {metrics.mapCount} knowledge maps</span></article>
        <article className="metric-cell metric-readiness"><div className="metric-ready-top"><span className="metric-label">TRANSCRIPT COVERAGE</span><span>{loading ? '—' : `${metrics.readiness}%`}</span></div><div className="readiness-track"><i style={{ width: `${loading ? 0 : metrics.readiness}%` }} /></div><span className="metric-foot"><Check size={13} /> {metrics.transcriptCount} of {lectures.length} lectures have transcripts</span></article>
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel recent-panel">
          <div className="panel-heading">
            <div><div className="section-kicker">YOUR LIBRARY</div><h2>Recent lectures</h2></div>
            <Link to="/lectures" className="text-link">View all <ArrowRight size={14} /></Link>
          </div>
          {loading ? (
            <div className="dashboard-loading">Loading your lecture library…</div>
          ) : latest.length ? (
            <div className="recent-table">
              {latest.map((lecture, index) => {
                const [label, tone] = statusLabel(lecture);
                return (
                  <Link to={`/lectures/${lecture.id}`} className="recent-row" key={lecture.id}>
                    <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="row-main"><strong>{lecture.title}</strong><small>{lecture.subject?.code || lecture.subject?.name || 'Personal library'} <i /> {dateLabel(lecture.lectureDate || lecture.createdAt)}</small></span>
                    <span className={`status-label status-${tone}`}><i />{label}</span>
                    <ChevronRight className="row-chevron" size={16} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty-library"><BookOpen size={21} /><strong>Your library starts with a lecture.</strong><span>Bring in a recording or paste notes to create your first study source.</span><Link to="/upload" className="text-link">Add your first lecture <ArrowRight size={14} /></Link></div>
          )}
          <div className="library-footer"><span>{lectures.length} sources in your library</span><span>Updated just now</span></div>
        </section>

        <div className="dashboard-rail">
          <section className="dashboard-panel activity-panel">
            <div className="panel-heading panel-heading-compact"><div><div className="section-kicker">LAST SEVEN DAYS</div><h2>Study activity</h2></div><span className="activity-icon"><AudioLines size={15} /></span></div>
            <div className="activity-chart" role="img" aria-label="Lecture uploads over the last seven days">
              {weeklyActivity.map((day) => <div className="activity-day" key={day.label}><div className="activity-bar-wrap"><i className={day.current ? 'is-today' : ''} style={{ height: `${day.count ? Math.min(100, 24 + day.count * 25) : 7}%` }} /></div><span>{day.label}</span></div>)}
            </div>
            <div className="activity-caption"><span>{weeklyActivity.reduce((sum, day) => sum + day.count, 0)} lectures added</span><ArrowDownRight size={14} /></div>
          </section>

          <section className="focus-panel">
            <div className="focus-topline"><span className="section-kicker">NEXT IN YOUR WORKFLOW</span><Sparkles size={15} /></div>
            {focusQueue.length ? (
              <>
                <h2>Finish processing</h2>
                <p>These sources are not ready for cross-lecture research yet.</p>
                {focusQueue.map(lecture => <Link className="focus-item" key={lecture.id} to={`/lectures/${lecture.id}`}><span><FileText size={14} /></span><strong>{lecture.title}</strong><ChevronRight size={14} /></Link>)}
              </>
            ) : (
              <><h2>Your library is in good shape.</h2><p>All captured lectures have transcripts. Ask Research Lab to connect ideas across them.</p><Link to="/research" className="focus-cta">Open Research Lab <ArrowRight size={14} /></Link></>
            )}
          </section>
        </div>
      </div>

      <section className="research-banner">
        <div className="research-banner-mark"><Search size={17} /></div>
        <div className="research-banner-copy"><span className="section-kicker">A QUESTION CAN CROSS CLASSROOMS</span><h2>Find the ideas connecting your lectures.</h2><p>Ask one question. Search the indexed passages in your accessible lecture library and follow every answer back to its source.</p></div>
        <Link to="/research" className="button-primary">Open Research Lab <ArrowRight size={15} /></Link>
      </section>
    </div>
  );
}
