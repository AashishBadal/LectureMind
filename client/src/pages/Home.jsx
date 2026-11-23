import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, AudioLines, Network, Search, ShieldCheck, Sparkles } from 'lucide-react';

const STEPS = [
  { number: '01', title: 'Capture the room', body: 'Bring in a lecture recording or paste notes from class. Keep the original source close to the transcript.' },
  { number: '02', title: 'Build the structure', body: 'Turn a transcript into key concepts, a connected learning map, and timestamped passages.' },
  { number: '03', title: 'Follow the evidence', body: 'Ask questions within one lecture or across your library. Read the passages behind each answer.' }
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-copy">
          <div className="eyebrow"><span className="eyebrow-mark" /> A STUDY SYSTEM FOR REAL CLASSROOMS</div>
          <h1>One lecture ends.<br /><em>The learning keeps connecting.</em></h1>
          <p>LectureMind turns class recordings and notes into a searchable, source-linked knowledge space—so you can find the ideas that connect one lecture to the next.</p>
          <div className="home-actions"><Link to="/register" className="button-primary">Start your library <ArrowRight size={15} /></Link><Link to="/login" className="home-secondary-link">Already have an account <ArrowDownRight size={14} /></Link></div>
          <div className="home-proof"><span><ShieldCheck size={14} /> Your classes stay organized</span><i /><span>Evidence-linked answers</span></div>
        </div>
        <div className="home-preview" aria-label="Illustration of a connected lecture research workspace">
          <div className="preview-topbar"><span className="preview-brand"><i /> LECTUREMIND <b>/</b> RESEARCH</span><span className="preview-dots"><i /><i /><i /></span></div>
          <div className="preview-body">
            <div className="preview-kicker">LIBRARY QUESTION · 2 SOURCES</div>
            <div className="preview-question">How does fault tolerance relate to the consensus model?</div>
            <div className="preview-answer">Fault tolerance describes a system's ability to continue operating when components fail. The consensus model provides a way for distributed nodes to agree on shared state despite those failures.<b> [1] [2]</b></div>
            <div className="preview-citations">
              <div className="preview-source"><span>01</span><div><b>Distributed Systems · Week 04</b><small>“...continues to provide service even when one or more components fail...”</small></div><ArrowRight size={13} /></div>
              <div className="preview-source"><span>02</span><div><b>Consensus Protocols · Week 06</b><small>“...nodes must agree on a single value before committing the log...”</small></div><ArrowRight size={13} /></div>
            </div>
          </div>
          <div className="preview-footer"><span><span className="preview-pulse" /> SEMANTIC + KEYWORD RETRIEVAL</span><span>TRACEABLE SOURCES</span></div>
        </div>
      </section>

      <div className="home-rule"><span>CAPTURE</span><i /><span>STRUCTURE</span><i /><span>RESEARCH</span></div>

      <section className="home-method">
        <div className="home-section-intro"><div className="section-kicker">FROM RECORDING TO REASONING</div><h2>A connected record of what you learned.</h2><p>LectureMind gives classroom material structure and keeps every answer close to its source.</p></div>
        <div className="home-steps">
          {STEPS.map((step, index) => <article className="home-step" key={step.number}><span className="home-step-number">{step.number}</span><div className="home-step-icon">{index === 0 ? <AudioLines size={17} /> : index === 1 ? <Network size={17} /> : <Search size={17} />}</div><h3>{step.title}</h3><p>{step.body}</p></article>)}
        </div>
      </section>

      <section className="home-bottom-cta"><div><div className="section-kicker"><Sparkles size={13} /> YOUR PERSONAL LEARNING INDEX</div><h2>Build a better memory of every class.</h2></div><Link to="/register" className="button-primary">Create your workspace <ArrowRight size={15} /></Link></section>
    </div>
  );
}
