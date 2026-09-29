"use client";

import { useEffect, useState } from "react";

export function ConceptInquiry({ startup = false }: { startup?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [submitted, setSubmitted] = useState(false);
  return <form className="concept-form" onSubmit={event => { event.preventDefault(); setSubmitted(true); }} onChange={() => setSubmitted(false)}><label>Your name<input autoComplete="off" name="demoName" placeholder="Use an example name" required maxLength={100} /></label><label>Email<input name="demoEmail" type="email" placeholder="example@example.com" required maxLength={254} /></label><label>{startup ? "What are you working on?" : "What would you like to work on?"}<textarea name="demoMessage" placeholder="Try the demo with fictional details." rows={3} required maxLength={1000} /></label><button type="submit" disabled={!ready}>{startup ? "Try the inquiry form" : "Start a conversation"} ↗</button><noscript><p>Please enable JavaScript to try this demonstration.</p></noscript><p className="concept-form-note">Demonstration only. Please use fictional details. Nothing is stored or sent.</p><p role="status" aria-live="polite">{submitted ? "Demo complete. Your inquiry has not been sent or saved. Want a website like this? Use the Agentech link above." : ""}</p></form>;
}

const boards = {
  launch: [["Write the story", "Gather inspiration"], ["Shape the homepage", "Refine the identity"], ["Agree the brief"]],
  content: [["Outline the next article", "Collect team ideas"], ["Edit the launch note", "Review the visuals"], ["Plan this week"]]
};

export function ConceptBoard() {
  const [active, setActive] = useState<"launch" | "content">("launch");
  return <div className="concept-board"><div className="concept-board-top"><span>◒ <b>Your workspace</b></span><span className="concept-board-label">INTERACTIVE CONCEPT</span></div><div className="concept-board-controls" role="group" aria-label="Example projects"><button aria-pressed={active === "launch"} onClick={() => setActive("launch")}>Brand launch</button><button aria-pressed={active === "content"} onClick={() => setActive("content")}>Content calendar</button></div><div className="concept-board-columns">{["To do", "In progress", "Ready"].map((column,index) => <div key={column}><h3><span className={`concept-status-${index}`} />{column}<small>{boards[active][index].length}</small></h3>{boards[active][index].map((task,i) => <article key={task}><small>{["CREATIVE", "WEBSITE", "PLANNING"][index]}</small><h4>{task}</h4><div><span className="concept-task-avatar">{["A", "J", "M"][i % 3]}</span><span>{index === 2 ? "✓ Ready to share" : "Add your next step"}</span></div></article>)}</div>)}</div><p className="concept-board-foot">Try switching projects. This sample interface does not save data.</p></div>;
}
