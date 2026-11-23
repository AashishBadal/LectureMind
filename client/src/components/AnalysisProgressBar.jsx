import React from 'react';
import { Sparkles, Loader2, CheckCircle2, Clock, Coins, Layers, Brain, GitFork, BookOpen, UploadCloud, Mic } from 'lucide-react';

export const DEFAULT_ANALYSIS_STAGES = [
  {
    id: 1,
    name: 'Transcript Grounding',
    shortName: 'Grounding',
    icon: BookOpen,
    description: 'Analyzing lecture tokens, speaker diarization, and chronological anchors...'
  },
  {
    id: 2,
    name: 'Academic Synthesis',
    shortName: 'Summary',
    icon: Brain,
    description: 'Synthesizing comprehensive academic summary, core thesis, and executive takeaways...'
  },
  {
    id: 3,
    name: 'Concept Extraction',
    shortName: 'Concepts',
    icon: Layers,
    description: 'Extracting atomic domain concepts, formal definitions, and Bloom taxonomy levels...'
  },
  {
    id: 4,
    name: 'Knowledge Mapping',
    shortName: 'Relations',
    icon: GitFork,
    description: 'Constructing relational knowledge graph, prerequisites, and learning pathways...'
  }
];

export const TRANSCRIPTION_STAGES = [
  {
    id: 1,
    name: 'Uploading Audio File',
    shortName: 'Upload',
    icon: UploadCloud,
    description: 'Streaming audio bytes and validating acoustic signature on backend...'
  },
  {
    id: 2,
    name: 'Gemini File API Ingestion',
    shortName: 'Ingestion',
    icon: Sparkles,
    description: 'Ingesting recording into Gemini Multimodal File Store for acoustic parsing...'
  },
  {
    id: 3,
    name: 'Speech Diarization',
    shortName: 'Diarization',
    icon: Mic,
    description: 'Identifying lecturer voices, technical terminology, and speech tokens...'
  },
  {
    id: 4,
    name: 'Timestamp Alignment',
    shortName: 'Alignment',
    icon: Clock,
    description: 'Structuring chronological dialogue segments and precise intervals...'
  }
];

export default function AnalysisProgressBar({
  progress = 0,
  currentStageIndex = 0,
  stages = DEFAULT_ANALYSIS_STAGES,
  elapsedSeconds = 0,
  lectureTitle = '',
  durationSeconds = null,
  requiredCredits = null,
  isComplete = false
}) {
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const activeStage = stages[Math.min(currentStageIndex, stages.length - 1)] || stages[0];

  const durationMinutes = durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : null;

  const formatElapsed = (sec) => {
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    if (mins > 0) {
      return `${mins}m ${remainingSec.toString().padStart(2, '0')}s`;
    }
    return `${remainingSec}s`;
  };

  return (
    <div className="surface rounded-xl p-5 sm:p-6 border border-slate-200/80 dark:border-teal-500/30 bg-gradient-to-br from-white via-slate-50/80 to-teal-50/30 dark:from-slate-900/90 dark:via-slate-900/95 dark:to-slate-950 shadow-xl shadow-slate-200/60 dark:shadow-teal-950/20 space-y-5 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-600 dark:text-teal-400">
            {isComplete ? (
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            ) : (
              <Sparkles className="h-4 w-4 animate-pulse text-cyan-600 dark:text-cyan-400" />
            )}
            {!isComplete && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300">
                Gemini Academic Engine
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">• Deep Lecture Analysis</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate max-w-md sm:max-w-lg mt-0.5">
              {lectureTitle ? `Analyzing: ${lectureTitle}` : 'Processing Lecture Analysis...'}
            </h3>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span className="font-mono">{formatElapsed(elapsedSeconds)}</span>
          </div>
          <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-teal-500/15 border border-teal-500/30 font-mono text-sm font-bold text-teal-700 dark:text-teal-300">
            <span>{clampedProgress}%</span>
          </div>
        </div>
      </div>

      {/* Dynamic Stage Banner */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Stage {Math.min(currentStageIndex + 1, stages.length)} of {stages.length}:
            </span>
            <span className="text-teal-600 dark:text-teal-400 font-medium">
              {isComplete ? 'Analysis Completed Successfully' : activeStage.name}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
            {isComplete ? 'Rendering study assets' : 'Do not close this tab'}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed min-h-[1.5rem]">
          {isComplete
            ? 'All lecture concepts, comprehensive summary, and relational graph generated!'
            : activeStage.description}
        </p>
      </div>

      {/* Progress Bar Track */}
      <div className="space-y-2">
        <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-300/80 dark:border-slate-700/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400 transition-all duration-500 ease-out relative shadow-sm shadow-teal-500/40"
            style={{ width: `${clampedProgress}%` }}
          >
            {/* Shimmer line */}
            <div className="absolute inset-0 bg-white/25 animate-pulse rounded-full" />
          </div>
        </div>
      </div>

      {/* Multi-Stage Step Pipeline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {stages.map((stg, idx) => {
          const isDone = isComplete || idx < currentStageIndex;
          const isActive = !isComplete && idx === currentStageIndex;
          const isPending = !isComplete && idx > currentStageIndex;

          return (
            <div
              key={stg.id || idx}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                isDone
                  ? 'bg-teal-50/80 dark:bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-300'
                  : isActive
                  ? 'bg-cyan-50 dark:bg-cyan-500/15 border-cyan-400/60 dark:border-cyan-400/50 text-cyan-800 dark:text-cyan-200 ring-1 ring-cyan-400/30'
                  : 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-600 dark:text-cyan-400 shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-500 dark:text-slate-600 font-mono shrink-0">
                    {idx + 1}
                  </div>
                )}
                <span className={`text-xs font-semibold truncate ${isActive ? 'text-slate-900 dark:text-slate-100 font-bold' : ''}`}>
                  {stg.shortName || stg.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Metadata Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-4 flex-wrap">
          {durationMinutes && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
              Recording Duration: <strong className="text-slate-700 dark:text-slate-200">{durationMinutes} mins</strong>
            </span>
          )}
          {requiredCredits !== null && requiredCredits !== undefined && (
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <Coins className="h-3 w-3 text-amber-500 dark:text-amber-400" />
              Required Credits: <strong className="text-amber-800 dark:text-amber-200">{requiredCredits} Credits</strong>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">(1 credit / 10 mins)</span>
            </span>
          )}
        </div>
        <span className="text-slate-400 dark:text-slate-500 text-[10px]">
          Academic Observatory Pipeline v2.6
        </span>
      </div>
    </div>
  );
}

