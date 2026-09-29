export function WebsiteConceptPreview({ kind = "consulting" }: { kind?: "consulting" | "startup" }) {
  if (kind === "startup") return (
    <div className="wl-mini wl-mini-startup" aria-hidden="true">
      <div className="wl-mini-nav"><b>◒ orbit</b><span>Product &nbsp; How it works</span><i>Get in touch ↗</i></div>
      <div className="wl-mini-startup-copy"><small>A LITTLE LESS CHAOS.</small><strong>Make room<br />for your best work.</strong><p>One calm space for projects, plans, and the people behind them.</p><em>Explore Orbit ↗</em></div>
      <div className="wl-mini-board"><div className="wl-mini-sidebar">◒<br /><span>Overview<br />Projects<br />My tasks</span></div><div className="wl-mini-tasks"><b>Brand launch <span>↗</span></b><p>Good work starts with a clear plan.</p><div><article><small>TO DO</small><i>Website direction</i><i>Gather inspiration</i></article><article><small>IN PROGRESS</small><i>Visual identity<span>● ● ●</span></i><i>Homepage copy</i></article><article><small>READY</small><i>Project brief <span>✓</span></i></article></div></div></div>
    </div>
  );
  return (
    <div className="wl-mini wl-mini-consulting" aria-hidden="true">
      <div className="wl-mini-nav"><b>FIELDWORK<span>ADVISORY</span></b><span>Our approach &nbsp; Services</span><i>Let’s talk ↗</i></div>
      <div className="wl-mini-consulting-body"><div><small>CLARITY. THEN MOMENTUM.</small><strong>A clearer path<br />to what’s next.</strong><p>Thoughtful strategy for businesses<br />ready to move forward.</p><em>Find your direction ↗</em></div><div className="wl-architecture"><span /><span /><span /><span /></div></div>
      <div className="wl-mini-bottom"><span>01 &nbsp; Business strategy</span><span>02 &nbsp; Operations</span><span>03 &nbsp; Growth planning</span></div>
    </div>
  );
}
