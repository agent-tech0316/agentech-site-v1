"use client";

import Image from "next/image";
import { useState } from "react";
import { MASTER_MOTOR_MARKERS, type MasterMotorView } from "@/lib/master-motor-map";

function formatRange(minimum: number, maximum: number, unit: string) {
  return `${minimum > 0 ? "+" : ""}${minimum}${unit} to ${maximum > 0 ? "+" : ""}${maximum}${unit}`;
}

function visibleSdkControlText(value: string) {
  return value.replaceAll(".teach", "");
}

type RobotJointViewProps = {
  view: MasterMotorView;
  label: string;
  imageSrc: string;
  activeJoint: string | null;
  showTooltip: boolean;
  selectedJoint: string | null;
  setHoveredJoint: (joint: string | null) => void;
  setSelectedJoint: (joint: string | null) => void;
};

function RobotJointView({
  view,
  label,
  imageSrc,
  activeJoint,
  showTooltip,
  selectedJoint,
  setHoveredJoint,
  setSelectedJoint
}: RobotJointViewProps) {
  const markers = MASTER_MOTOR_MARKERS;
  const activeMarker = markers.find((marker) => marker.runtimeJoint === activeJoint) ?? null;

  return (
    <div className="overflow-hidden border border-[#d8d3ca] bg-[#fbfaf7] shadow-[0_16px_42px_rgba(75,63,45,0.12)]">
      <div className="flex items-center justify-between border-b border-[#e2ded6] bg-[#fbfaf7] px-4 py-3">
        <h3 className="font-interface text-lg font-semibold tracking-[-0.02em] text-[#171717]">{label}</h3>
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1a73e8]">{markers.length} joints</span>
      </div>
      <div className="relative mx-auto aspect-[2/3] w-full max-w-[520px] bg-[#fbfaf7] bg-[linear-gradient(rgba(26,115,232,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(26,115,232,0.05)_1px,transparent_1px)] bg-[size:32px_32px]">
        <Image src={imageSrc} alt={`Clean ${label.toLowerCase()} of AgiBot X2 with yellow feet`} fill sizes="(max-width: 1024px) 92vw, 520px" className="object-contain" priority={false} />
        {markers.map((marker) => {
          const active = marker.runtimeJoint === activeJoint;
          const position = marker.positions[view];
          return (
        <button
          key={marker.runtimeJoint}
          type="button"
          aria-label={`${marker.displayName}, ${marker.jointNumber}`}
          aria-pressed={marker.runtimeJoint === selectedJoint}
          title={marker.displayName}
              onMouseEnter={() => setHoveredJoint(marker.runtimeJoint)}
              onMouseLeave={() => setHoveredJoint(null)}
              onFocus={() => setHoveredJoint(marker.runtimeJoint)}
              onBlur={() => setHoveredJoint(null)}
              onClick={() => setSelectedJoint(selectedJoint === marker.runtimeJoint ? null : marker.runtimeJoint)}
          className={`absolute z-10 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6f8fb2] bg-[#fbfaf7]/95 shadow-[0_0_0_2px_rgba(251,250,247,0.8),0_2px_5px_rgba(67,73,82,0.2)] transition before:absolute before:inset-[2px] before:rounded-full before:border before:border-[#9bb7d4]/75 after:absolute after:inset-[4px] after:rounded-full after:bg-[#1a73e8] focus-visible:z-30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1a73e8]/25 ${active ? "scale-125 border-[#155fc0] shadow-[0_0_0_3px_rgba(26,115,232,0.18),0_3px_8px_rgba(47,55,66,0.26)] after:bg-[#155fc0]" : "hover:scale-125 hover:border-[#155fc0] hover:shadow-[0_0_0_3px_rgba(26,115,232,0.14),0_3px_8px_rgba(47,55,66,0.22)] hover:after:bg-[#155fc0]"}`}
          style={{ left: `${position.xPercent}%`, top: `${position.yPercent}%` }}
        />
          );
        })}
        {activeMarker && showTooltip ? (
          <div
            role="tooltip"
            aria-live="polite"
            className={`pointer-events-none absolute z-40 w-56 -translate-y-1/2 border border-[#68717c] bg-[#222426]/95 p-3 text-left shadow-[0_18px_42px_rgba(35,32,28,0.3)] backdrop-blur-sm ${activeMarker.positions[view].xPercent > 50 ? "-translate-x-[calc(100%+1rem)]" : "translate-x-4"}`}
            style={{ left: `${activeMarker.positions[view].xPercent}%`, top: `${activeMarker.positions[view].yPercent}%` }}
          >
            <div className="flex items-center gap-2">
              <span className="bg-[#62b0ff] px-2 py-0.5 text-[10px] font-black text-[#16191d]">{activeMarker.jointNumber}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#c3cad1]">{activeMarker.group}</span>
            </div>
            <p className="font-interface mt-2 text-base font-semibold text-white">{activeMarker.displayName}</p>
            <p className="mt-1 break-all font-mono text-[10px] font-bold text-[#62b0ff]">{activeMarker.runtimeJoint}</p>
            <div className="mt-2 border-t border-[#4a4d50] pt-2 text-[11px] leading-5 text-[#ecebe7]">
              <p><strong>Degrees:</strong> {formatRange(activeMarker.officialLimit.minimumDegrees, activeMarker.officialLimit.maximumDegrees, "°")}</p>
              <p><strong>Runtime:</strong> {formatRange(activeMarker.runtimeLimit.minimumRadians, activeMarker.runtimeLimit.maximumRadians, " rad")}</p>
            </div>
            <div className="mt-2 border-t border-[#4a4d50] pt-2">
              {activeMarker.sdkControl ? (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#c3cad1]">{activeMarker.sdkControl.label}</p>
                  <p data-master-sdk-function-visible="true" className="mt-1 font-mono text-[10px] font-bold text-[#62b0ff]">{visibleSdkControlText(activeMarker.sdkControl.functionName)}</p>
                  <code data-master-sdk-example-visible="true" className="mt-1 block whitespace-normal break-words text-[9px] leading-4 text-white">{visibleSdkControlText(activeMarker.sdkControl.example)}</code>
                </>
              ) : (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#c3cad1]">SDK function</p>
                  <p className="mt-1 text-[10px] leading-4 text-white">No direct public joint-adjustment function.</p>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MasterMotorMap() {
  const [selected, setSelected] = useState<{ joint: string; view: MasterMotorView } | null>(null);
  const [hovered, setHovered] = useState<{ joint: string; view: MasterMotorView } | null>(null);
  const active = hovered ?? selected;
  const selectedJoint = selected?.joint ?? null;

  return (
    <section
      data-master-motor-map-theme="warm-neutral"
      className="mt-6 overflow-hidden border border-[#d8d3ca] bg-[#eeece7] shadow-[0_26px_70px_rgba(75,63,45,0.12)]"
      aria-labelledby="master-motor-map-title"
    >
      <div className="relative overflow-hidden border-b border-[#d8d3ca] bg-[#eeece7] px-5 py-7 sm:px-7">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-2/5 opacity-50 sm:block bg-[linear-gradient(135deg,transparent_48%,rgba(26,115,232,0.1)_49%,rgba(26,115,232,0.1)_50%,transparent_51%)] bg-[size:28px_28px]" />
        <p className="relative text-[10px] font-bold uppercase tracking-[0.28em] text-[#1a73e8]">Master joint reference</p>
        <div className="mt-2">
          <div className="relative">
            <h2 id="master-motor-map-title" className="text-3xl font-semibold tracking-tight text-[#171717] sm:text-4xl">Find every motor on Master.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#62615d]">Hover, focus, or tap any of the 16 arm-and-head joints to see its name and movement limits beside the motor. The same joints are mapped on both views.</p>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden p-5 sm:p-7">
        <svg aria-hidden="true" viewBox="0 0 1000 900" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full fill-none stroke-[#1a73e8] opacity-20">
          <path d="M0 58 H42 L62 78 V160" className="stroke-[1.2]" />
          <path d="M1000 58 H958 L938 78 V160" className="stroke-[1.2]" />
          <path d="M0 842 H42 L62 822 V740" className="stroke-[1.2]" />
          <path d="M1000 842 H958 L938 822 V740" className="stroke-[1.2]" />
          <path d="M18 245 V395 L30 407 V555" className="stroke-[0.8] opacity-70" />
          <path d="M982 245 V395 L970 407 V555" className="stroke-[0.8] opacity-70" />
          <path d="M475 0 V22 L488 35 H512 L525 22 V0" className="stroke-[1]" />
          <circle cx="62" cy="160" r="3" className="fill-[#1a73e8] stroke-none" />
          <circle cx="938" cy="160" r="3" className="fill-[#1a73e8] stroke-none" />
          <circle cx="30" cy="407" r="2.5" className="fill-[#1a73e8] stroke-none" />
          <circle cx="970" cy="407" r="2.5" className="fill-[#1a73e8] stroke-none" />
        </svg>
        <div className="relative z-10 grid gap-5 lg:grid-cols-2">
          <RobotJointView
            view="front"
            label="Front View"
            imageSrc="/assets/robotics/agibot-x2-sketch-front.png"
            activeJoint={active?.joint ?? null}
            showTooltip={active?.view === "front"}
            selectedJoint={selectedJoint}
            setHoveredJoint={(joint) => setHovered(joint ? { joint, view: "front" } : null)}
            setSelectedJoint={(joint) => setSelected(joint ? { joint, view: "front" } : null)}
          />
          <RobotJointView
            view="back"
            label="Back View"
            imageSrc="/assets/robotics/agibot-x2-sketch-back.png"
            activeJoint={active?.joint ?? null}
            showTooltip={active?.view === "back"}
            selectedJoint={selectedJoint}
            setHoveredJoint={(joint) => setHovered(joint ? { joint, view: "back" } : null)}
            setSelectedJoint={(joint) => setSelected(joint ? { joint, view: "back" } : null)}
          />
        </div>
        <div className="relative z-10 mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#62615d]">
          <span><span className="relative mr-2 inline-block h-3 w-3 rounded-full border border-[#9bb7d4] bg-[#fbfaf7] align-[-2px] after:absolute after:inset-[3px] after:rounded-full after:bg-[#1a73e8]" />Motor location</span>
          <span><span className="relative mr-2 inline-block h-3 w-3 rounded-full border border-[#fbfaf7] bg-[#fbfaf7] align-[-2px] shadow-[0_0_0_3px_rgba(26,115,232,0.2)] after:absolute after:inset-[3px] after:rounded-full after:bg-[#155fc0]" />Active motor</span>
        </div>
        <div className="relative z-10 mt-5 border border-[#d8d3ca] border-l-2 border-l-[#1a73e8] bg-[#fbfaf7] p-4 text-xs leading-5 text-[#62615d]">
          <strong className="font-interface block text-sm text-[#171717]">Reference information only</strong>
          Hover or focus a motor to see its limits. Click to pin the information box on touch devices. Published limits are not a command, trajectory, or guarantee that every pose is collision-free.
        </div>
      </div>
    </section>
  );
}
