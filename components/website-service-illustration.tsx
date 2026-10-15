export function WebsiteServiceIllustration({ kind }: { kind: "responsive" | "delivery" }) {
  if (kind === "responsive") {
    return (
      <svg className="wl-faq-art" viewBox="0 0 560 180" role="img" aria-label="A coordinated website design across desktop and mobile screens">
        <rect width="560" height="180" fill="#e3e9dc" />
        <circle cx="405" cy="82" r="130" fill="#d5dfcb" />
        <circle cx="97" cy="193" r="100" fill="#edf0e6" />
        <path d="M0 150h560M85 0v180M473 0v180" stroke="#bccbb1" strokeOpacity=".4" />
        <rect x="122" y="32" width="270" height="140" rx="9" fill="#53654c" opacity=".12" />
        <rect x="115" y="24" width="270" height="140" rx="9" fill="#fffefa" stroke="#9dad93" />
        <path d="M115 45h270" stroke="#d3daca" />
        <g fill="#a0ad96"><circle cx="127" cy="35" r="2" /><circle cx="135" cy="35" r="2" /><circle cx="143" cy="35" r="2" /></g>
        <rect x="214" y="31" width="73" height="7" rx="3.5" fill="#edf0e6" />
        <rect x="131" y="57" width="37" height="5" rx="2" fill="#355341" />
        <path d="M301 60h18m9 0h16m9 0h15" stroke="#b4bea9" strokeWidth="3" strokeLinecap="round" />
        <text x="131" y="88" fill="#2b4332" fontFamily="Georgia,serif" fontSize="17">Your next chapter.</text>
        <text x="131" y="107" fill="#2b4332" fontFamily="Georgia,serif" fontSize="17">Thoughtfully built.</text>
        <path d="M132 119h122m-122 7h93" stroke="#bec7b5" strokeWidth="3" strokeLinecap="round" />
        <rect x="131" y="137" width="62" height="13" rx="3" fill="#355341" />
        <path d="M140 144h26m8 0h8" stroke="#edf2e5" strokeWidth="2" strokeLinecap="round" />
        <path d="M282 148V103a36 36 0 0 1 72 0v45Z" fill="#d5dfcb" />
        <path d="m288 148 0-25 18-8v33m4 0v-47l18-8v55m4 0V80l18-8v76" fill="#98ae87" />
        <rect x="360" y="58" width="69" height="119" rx="12" fill="#53654c" opacity=".12" />
        <rect x="353" y="51" width="69" height="119" rx="12" fill="#fffefa" stroke="#8e9f83" strokeWidth="1.5" />
        <rect x="373" y="58" width="29" height="4" rx="2" fill="#cad4c0" />
        <path d="M363 77h28m-28 8h44" stroke="#355341" strokeWidth="3" strokeLinecap="round" />
        <rect x="363" y="95" width="49" height="35" rx="5" fill="#d5dfcb" />
        <path d="m370 130v-13l10-4v17m4 0v-23l10-4v27m4 0V99l9-4v35" fill="#98ae87" />
        <path d="M363 140h40" stroke="#c2cbb9" strokeWidth="3" strokeLinecap="round" />
        <rect x="363" y="149" width="31" height="8" rx="2" fill="#355341" />
        <circle cx="105" cy="98" r="12" fill="#fffefa" stroke="#c1cdb6" /><path d="m100 98 3 3 6-6" fill="none" stroke="#547248" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg className="wl-faq-art" viewBox="0 0 560 180" role="img" aria-label="Website delivery milestones: brief, design, review, and launch">
      <rect width="560" height="180" fill="#e5e5f0" />
      <circle cx="127" cy="55" r="133" fill="#dbdcea" />
      <circle cx="515" cy="214" r="119" fill="#edeef6" />
      <path d="M0 150h560M85 0v180M473 0v180" stroke="#babdd4" strokeOpacity=".4" />
      <path d="M115 83h330" stroke="#9a9fbf" strokeWidth="1.5" strokeDasharray="4 5" />
      {[115, 225, 335, 445].map((x, index) => (
        <g key={x}>
          <rect x={x - 28} y="58" width="58" height="58" rx="13" fill="#585e8b" opacity=".1" />
          <rect x={x - 30} y="53" width="58" height="58" rx="13" fill={index === 3 ? "#515987" : "#fafaff"} stroke={index === 3 ? "#515987" : "#b5bad2"} />
          <text x={x - 1} y="136" textAnchor="middle" fill="#454e71" fontFamily="Arial,sans-serif" fontSize="11">{["Brief", "Design", "Review", "Launch"][index]}</text>
        </g>
      ))}
      <g fill="none" stroke="#737da0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M105 68h14l7 7v22h-21Zm14 0v8h7m-16 7h10m-10 6h10" />
        <rect x="210" y="69" width="28" height="25" rx="3" /><path d="M210 77h28m-18 0v17m5-11h8m-8 5h6" />
        <circle cx="334" cy="82" r="13" /><path d="m328 82 4 4 9-10" />
      </g>
      <g fill="none" stroke="#f4f4ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M431 83v13h26V83m-13 4V67m-7 7 7-7 7 7" /></g>
      <circle cx="467" cy="51" r="9" fill="#fafaff" stroke="#b5bad2" /><path d="m463 51 3 3 5-6" fill="none" stroke="#6675a2" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
