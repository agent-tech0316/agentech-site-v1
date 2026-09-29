"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HistoryBackButton } from "@/components/history-back-button";
import { getAccountSession } from "@/lib/account-session";
import { ServiceProfileLinks } from "@/components/service-profile-links";

type AccessProfileType = "developer" | "student" | "teacher" | "talent";

const profileOptions: Array<{
  type: AccessProfileType;
  label: string;
  headline: string;
  description: string;
  mark: string;
  styles: string;
}> = [
  {
    type: "developer",
    label: "Developer",
    headline: "Robot testing workspace",
    description: "Test robots, submit code, and manage supervised live viewing runs.",
    mark: "</>",
    styles: "bg-indigo-50 text-indigo-600"
  },
  {
    type: "student",
    label: "Student",
    headline: "Navi learning workspace",
    description: "Play with Navi, join courses, and track learning progress.",
    mark: "S",
    styles: "bg-sky-50 text-sky-600"
  },
  {
    type: "teacher",
    label: "Educator",
    headline: "Classroom control workspace",
    description: "Manage learners, course activity, and classroom access.",
    mark: "E",
    styles: "bg-emerald-50 text-emerald-600"
  },
  {
    type: "talent",
    label: "Talent",
    headline: "Portfolio and pathway workspace",
    description: "Build portfolios, program pathways, and talent records.",
    mark: "T",
    styles: "bg-amber-50 text-amber-600"
  }
];

const studentGradeOptions = [
  "Pre-K",
  "K",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
  "College",
  "Adult"
];

export default function CreateProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [profileType, setProfileType] = useState<AccessProfileType>("developer");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [monthlyCreditLimit, setMonthlyCreditLimit] = useState("0");
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentDob, setStudentDob] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [studentSex, setStudentSex] = useState("");
  const [studentSchoolInfo, setStudentSchoolInfo] = useState("");
  const [studentPreferredLocation, setStudentPreferredLocation] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const previewAccount = new URLSearchParams(window.location.search).get("previewAccount");
      if (previewAccount === "1") {
        setEmail("account.preview@agentech.local");
        return;
      }
    }

    const session = getAccountSession();
    if (!session?.email) {
      router.replace("/login?next=/account/create-profile");
      return;
    }
    setEmail(session.email);
  }, [router]);

  async function createProfile() {
    if (!email) return;

    setCreating(true);
    setMessage("");

    const response = await fetch("/api/account-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        profileType,
        username,
        displayName,
        monthlyCreditLimit,
        firstName: studentFirstName,
        lastName: studentLastName,
        dob: studentDob,
        grade: studentGrade,
        sex: studentSex,
        schoolInfo: studentSchoolInfo,
        preferredLocation: studentPreferredLocation
      })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setMessage(result?.error || "Unable to create profile.");
      setCreating(false);
      return;
    }

    router.push("/account");
  }

  return (
    <main className="account-white-page min-h-screen bg-[#f6f8fc] px-4 py-8 text-slate-950 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <HistoryBackButton fallbackHref="/account" className="text-sm font-bold text-[#2563eb]" />
          <p className="text-sm font-semibold text-slate-500">{email}</p>
        </div>

        <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] md:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2563eb]">New Profile</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Create profile access</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Create one profile at a time. Billing, credits, and account ownership stay on the main account dashboard.
            </p>
          </div>

          <ServiceProfileLinks />
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {profileOptions.map((option) => {
                const selected = profileType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => setProfileType(option.type)}
                    className={`rounded-2xl border bg-white p-4 text-left transition ${
                      selected
                        ? "border-[#2563eb] bg-[#f8fbff] ring-2 ring-[#bfdbfe]"
                        : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300"
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black ${option.styles}`}>
                        {option.mark}
                      </span>
                      <div>
                        <p className="text-sm font-black text-slate-950">{option.label}</p>
                        <p className="mt-1 text-xs font-bold text-[#2563eb]">{option.headline}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{option.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Username</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase())}
                    placeholder="example.username"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Display Name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={`${profileOptions.find((option) => option.type === profileType)?.label ?? "Profile"} Profile`}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </label>
              </div>

              {profileType === "student" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Student Information</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">First Name</span>
                      <input
                        value={studentFirstName}
                        onChange={(event) => setStudentFirstName(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Last Name</span>
                      <input
                        value={studentLastName}
                        onChange={(event) => setStudentLastName(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Date of Birth</span>
                      <input
                        type="date"
                        value={studentDob}
                        onChange={(event) => setStudentDob(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Grade</span>
                      <select
                        value={studentGrade}
                        onChange={(event) => setStudentGrade(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      >
                        <option value="">Select grade</option>
                        {studentGradeOptions.map((grade) => (
                          <option key={grade} value={grade}>
                            {grade}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Sex</span>
                      <select
                        value={studentSex}
                        onChange={(event) => setStudentSex(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      >
                        <option value="">Select</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                        <option value="prefer-not-to-say">Prefer not to say</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">School Info</span>
                      <input
                        value={studentSchoolInfo}
                        onChange={(event) => setStudentSchoolInfo(event.target.value)}
                        placeholder="School name or program"
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Preferred Location</span>
                      <input
                        value={studentPreferredLocation}
                        onChange={(event) => setStudentPreferredLocation(event.target.value)}
                        placeholder="Example: Irvine, Online"
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Monthly Credit Limit</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={monthlyCreditLimit}
                  onChange={(event) => setMonthlyCreditLimit(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-[#2f70c8] focus:ring-4 focus:ring-[#dbeafe]"
                />
                <span className="mt-2 block text-sm text-slate-600">This caps monthly profile spending. It does not reserve account credits.</span>
              </label>

              {message ? <p className="text-sm font-semibold text-red-600">{message}</p> : null}
              <button
                type="button"
                onClick={createProfile}
                disabled={creating}
                className="w-full rounded-full bg-[#2f70c8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245da7] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {creating ? "Creating..." : "Create Profile"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
