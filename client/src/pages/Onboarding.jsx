import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  GraduationCap,
  BookOpen,
  Search,
  Briefcase,
  Compass,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Building2,
  Brain,
  MessageSquare,
  HelpCircle,
  Zap,
  Target,
  Sun,
  Moon
} from 'lucide-react';

const ROLES = [
  {
    id: 'STUDENT',
    title: 'Student',
    description: 'Attending lectures, summarizing courses, and studying for exams.',
    icon: GraduationCap,
    badge: 'Popular'
  },
  {
    id: 'TEACHER',
    title: 'Educator / Teacher',
    description: 'Teaching courses, managing subjects, and sharing lecture materials.',
    icon: BookOpen
  },
  {
    id: 'RESEARCHER',
    title: 'Researcher / Academic',
    description: 'Synthesizing knowledge across talks, seminars, and lecture recordings.',
    icon: Search
  },
  {
    id: 'OTHER',
    title: 'Professional / Self-Learner',
    description: 'Continuous learning, tech conferences, and professional development.',
    icon: Compass
  }
];

const FIELDS_OF_STUDY = [
  'Computer Science & AI',
  'Engineering',
  'Medicine & Healthcare',
  'Business & Economics',
  'Natural Sciences & Physics',
  'Mathematics & Statistics',
  'Law & Public Policy',
  'Humanities & Social Sciences'
];

const ACADEMIC_LEVELS = [
  { id: 'High School', label: 'High School' },
  { id: 'Undergraduate', label: 'Undergraduate (Bachelor\'s)' },
  { id: 'Graduate', label: 'Graduate (Master\'s / Postgrad)' },
  { id: 'Doctoral', label: 'Doctoral (PhD / Postdoc)' },
  { id: 'Professional', label: 'Professional / Working' }
];

const PRIMARY_GOALS = [
  {
    id: 'EXAM_PREP',
    title: 'Exam preparation & revision',
    description: 'Extract key concepts, test comprehension, and review fast before exams.',
    icon: Target
  },
  {
    id: 'SUMMARIZATION',
    title: 'Audio lecture summarization',
    description: 'Turn recorded classroom audio into structured timestamped summaries.',
    icon: Zap
  },
  {
    id: 'RESEARCH',
    title: 'Cross-lecture Research Lab',
    description: 'Query across all semester lectures using semantic & keyword search.',
    icon: Sparkles
  },
  {
    id: 'TEACHING',
    title: 'Course & Subject management',
    description: 'Organize lecture notes, manage student invites, and distribute resources.',
    icon: BookOpen
  }
];

const AI_TONES = [
  {
    id: 'CONCISE',
    title: 'Concise & High-Yield',
    description: 'Straight to the point with bulleted takeaways and essential definitions.',
    icon: Zap
  },
  {
    id: 'BALANCED',
    title: 'Balanced & Educational',
    description: 'Clear, well-rounded explanations that balance depth with readability.',
    icon: Brain
  },
  {
    id: 'IN_DEPTH',
    title: 'In-Depth & Rigorous',
    description: 'Deep technical nuance, proofs, theoretical background, and edge cases.',
    icon: MessageSquare
  },
  {
    id: 'SOCRATIC',
    title: 'Socratic & Guided',
    description: 'Guides understanding with conceptual hints and thought-provoking questions.',
    icon: HelpCircle
  }
];

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, completeOnboarding } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');
  const targetDestination = redirectUrl || '/dashboard';

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form State initialized from current user values if any
  const [role, setRole] = useState(user?.role || 'STUDENT');
  const [institution, setInstitution] = useState(user?.institution || '');
  const [fieldOfStudy, setFieldOfStudy] = useState(user?.fieldOfStudy || 'Computer Science & AI');
  const [customField, setCustomField] = useState('');
  const [academicLevel, setAcademicLevel] = useState(user?.academicLevel || 'Undergraduate');
  const [primaryGoal, setPrimaryGoal] = useState(user?.primaryGoal || 'EXAM_PREP');
  const [aiTonePreference, setAiTonePreference] = useState(user?.aiTonePreference || 'BALANCED');

  const selectedField = customField.trim() ? customField.trim() : fieldOfStudy;

  const handleNext = () => {
    setError('');
    if (step < 3) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    setError('');
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    const payload = {
      role,
      institution: institution.trim() || null,
      fieldOfStudy: selectedField || null,
      academicLevel,
      primaryGoal,
      aiTonePreference
    };

    const result = await completeOnboarding(payload);
    setIsSubmitting(false);

    if (result.success) {
      navigate(targetDestination, { replace: true });
    } else {
      setError(result.error || 'Failed to complete profile setup. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6">
      {/* Top Bar with Brand & Theme Switcher */}
      <div className="flex items-center justify-between pb-6 max-w-2xl w-full mx-auto">
        <div className="brand-lockup">
          <span className="brand-symbol"><BookOpen size={17} strokeWidth={1.8} /></span>
          <span className="brand-name">Lecture<span>Mind</span></span>
        </div>
        <div className="flex items-center gap-2">
          {user?.onboardingCompleted && (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn-secondary button-small text-xs"
            >
              Exit to Dashboard
            </button>
          )}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="icon-button"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      <div className="max-w-2xl w-full mx-auto space-y-6">

        {/* Progress Bar & Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/40">
            <Sparkles className="w-3 h-3" />
            <span>Profile Personalization • Step {step} of 3</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-sans text-slate-900 dark:text-slate-100 tracking-tight">
            {step === 1 && `Welcome, ${user?.name?.split(' ')[0] || 'Scholar'}`}
            {step === 2 && 'Tell us about your background'}
            {step === 3 && 'Tune your AI learning assistant'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            {step === 1 && 'Select how you plan to use LectureMind so we can adapt your workspace.'}
            {step === 2 && 'Help our Gemini AI ground lecture concepts in your specific academic context.'}
            {step === 3 && 'Choose your primary learning goals and preferred AI tutor explanation depth.'}
          </p>

          {/* Stepper indicator dots */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-8 bg-teal-600 dark:bg-teal-400'
                    : s < step
                    ? 'w-4 bg-teal-400/60 dark:bg-teal-700'
                    : 'w-3 bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Card Container */}
        <div className="surface rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">

          {/* ──────── STEP 1: ROLE / PERSONA ──────── */}
          {step === 1 && (
            <div className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Choose your primary role
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const isSelected = role === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`text-left p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between ${
                        isSelected
                          ? 'border-teal-600 dark:border-teal-400 bg-teal-50/50 dark:bg-teal-950/20 ring-2 ring-teal-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`p-2 rounded-lg ${
                            isSelected
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            <Icon size={18} />
                          </span>
                          {r.badge && (
                            <span className="text-[9px] uppercase font-mono tracking-wider font-semibold px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300">
                              {r.badge}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {r.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {r.description}
                        </p>
                      </div>

                      <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                          {isSelected ? 'Selected' : 'Click to select'}
                        </span>
                        {isSelected && <CheckCircle2 size={14} className="text-teal-600 dark:text-teal-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──────── STEP 2: ACADEMIC CONTEXT ──────── */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Institution */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#636c61] dark:text-[#a0aba0]">
                  <Building2 size={13} />
                  <span>College, University, or Organization</span>
                  <span className="text-[10px] lowercase text-[#9aa095] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Stanford University, MIT, Tribhuvan University, Self-study"
                  className="input text-xs"
                />
              </div>

              {/* Field of Study */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#636c61] dark:text-[#a0aba0]">
                  Field of Study or Major
                </label>
                <div className="flex flex-wrap gap-2">
                  {FIELDS_OF_STUDY.map((field) => {
                    const isSelected = fieldOfStudy === field && !customField;
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() => {
                          setFieldOfStudy(field);
                          setCustomField('');
                        }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600 font-semibold shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {field}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={customField}
                  onChange={(e) => setCustomField(e.target.value)}
                  placeholder="Or enter a specific major / subject..."
                  className="input text-xs mt-2"
                />
              </div>

              {/* Academic Level */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Current Academic Stage
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ACADEMIC_LEVELS.map((level) => {
                    const isSelected = academicLevel === level.id;
                    return (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => setAcademicLevel(level.id)}
                        className={`text-left text-xs px-3.5 py-2.5 rounded-xl border flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-600 dark:border-teal-400 text-slate-900 dark:text-slate-100 font-semibold ring-2 ring-teal-500/20'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span>{level.label}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-teal-600 dark:text-teal-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ──────── STEP 3: AI PERSONALIZATION ──────── */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Primary Goal */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  What is your primary goal with LectureMind?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PRIMARY_GOALS.map((goal) => {
                    const Icon = goal.icon;
                    const isSelected = primaryGoal === goal.id;
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => setPrimaryGoal(goal.id)}
                        className={`text-left p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-teal-600 dark:border-teal-400 bg-teal-50/50 dark:bg-teal-950/20 ring-2 ring-teal-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <Icon size={16} className={isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'} />
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {goal.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {goal.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Tutor Tone */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  How should your Gemini AI Tutor explain concepts?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {AI_TONES.map((tone) => {
                    const Icon = tone.icon;
                    const isSelected = aiTonePreference === tone.id;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => setAiTonePreference(tone.id)}
                        className={`text-left p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-teal-600 dark:border-teal-400 bg-teal-50/50 dark:bg-teal-950/20 ring-2 ring-teal-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Icon size={15} className={isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'} />
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {tone.title}
                            </span>
                          </div>
                          {isSelected && <CheckCircle2 size={14} className="text-teal-600 dark:text-teal-400" />}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {tone.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="btn-secondary"
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Step 1: Persona
              </span>
            )}

            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving preferences...</span>
                </>
              ) : step === 3 ? (
                <>
                  <span>Complete setup</span>
                  <Sparkles size={14} />
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}

