"use client";

/* eslint-disable @next/next/no-img-element -- Local previews use blobs and saved covers use short-lived signed URLs. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { accountSessionEvent, accountSessionKey, legacyAccountEmailKey } from "@/lib/account-session";
import { validateWorkCover, validateWorkDetails, workCategories, workCoverAccept, type WorkCategory, type WorkDetails } from "@/lib/my-works";
import styles from "@/app/account/my-works/my-works.module.css";

type Cover = { url: string; name: string; file?: File };
type LocalWork = WorkDetails & { id: string; cover: Cover; revision: number };
type SavedProject = WorkDetails & {
  id: string;
  coverUrl?: string | null;
  revision: number;
};

function savedProjectToWork(project: SavedProject): LocalWork {
  return {
    id: project.id,
    title: project.title,
    category: project.category,
    description: project.description,
    revision: project.revision,
    cover: { url: project.coverUrl ?? "", name: "Saved project cover" }
  };
}

function PictureIcon({ plus = false }: { plus?: boolean }) {
  return <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="8" width="36" height="32" rx="5" stroke="currentColor" strokeWidth="1.5" /><circle cx="16" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="m8 34 10-10 7 7 6-7 9 10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />{plus ? <path d="M35 2v10m-5-5h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}</svg>;
}

export function MyWorks({ localPreview }: { localPreview: boolean }) {
  const router = useRouter();
  const [works, setWorks] = useState<LocalWork[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedWork, setSelectedWork] = useState<LocalWork | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<WorkCategory>("Humanoid");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<Cover | null>(null);
  const [checkingCover, setCheckingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const formDialog = useRef<HTMLDialogElement>(null);
  const viewDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const urls = useRef(new Set<string>());
  const draftUrl = useRef<string | null>(null);
  const selectionVersion = useRef(0);

  function releaseUrl(url: string | null) {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  }

  function resetDraft() {
    selectionVersion.current += 1;
    releaseUrl(draftUrl.current);
    draftUrl.current = null;
    setCover(null);
    setCheckingCover(false);
    setTitle("");
    setCategory("Humanoid");
    setDescription("");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  useEffect(() => {
    const allocatedUrls = urls.current;
    function clearForAccountChange() {
      selectionVersion.current += 1;
      for (const url of allocatedUrls) URL.revokeObjectURL(url);
      allocatedUrls.clear();
      draftUrl.current = null;
      setWorks([]);
      setCover(null);
      setSelectedWork(null);
      setFormOpen(false);
      setTitle("");
      setCategory("Humanoid");
      setDescription("");
      setError("");
      setStatus("");
      setSaving(false);
      setCheckingCover(false);
      router.refresh();
    }
    function handleStorage(event: StorageEvent) {
      if (!event.key || event.key === accountSessionKey || event.key === legacyAccountEmailKey) clearForAccountChange();
    }
    window.addEventListener(accountSessionEvent, clearForAccountChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      selectionVersion.current += 1;
      for (const url of allocatedUrls) URL.revokeObjectURL(url);
      allocatedUrls.clear();
      window.removeEventListener(accountSessionEvent, clearForAccountChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [router]);

  useEffect(() => {
    if (localPreview) return;
    let active = true;
    setStatus("Restoring your private projects…");
    fetch("/api/eais/projects", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => null) as { projects?: SavedProject[]; error?: string } | null;
        if (!response.ok) throw new Error(result?.error || "Unable to restore your projects.");
        return Array.isArray(result?.projects) ? result.projects : [];
      })
      .then((projects) => {
        if (!active) return;
        setWorks(projects.map(savedProjectToWork));
        setStatus(projects.length ? "Restored from your account." : "Your private workspace is ready.");
      })
      .catch((loadError) => {
        if (!active) return;
        const message = loadError instanceof Error ? loadError.message : "Unable to restore your projects.";
        setError(message);
        setStatus(message);
      });
    return () => { active = false; };
  }, [localPreview]);

  useEffect(() => {
    if (formOpen && !formDialog.current?.open) formDialog.current?.showModal();
    if (!formOpen && formDialog.current?.open) formDialog.current.close();
  }, [formOpen]);

  useEffect(() => {
    if (selectedWork && !viewDialog.current?.open) viewDialog.current?.showModal();
    if (!selectedWork && viewDialog.current?.open) viewDialog.current.close();
  }, [selectedWork]);

  useEffect(() => {
    if (!formOpen && !selectedWork) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [formOpen, selectedWork]);

  function openForm(button: HTMLButtonElement) {
    trigger.current = button;
    resetDraft();
    setStatus("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    resetDraft();
    requestAnimationFrame(() => {
      const focusTarget = trigger.current?.isConnected
        ? trigger.current
        : document.querySelector<HTMLButtonElement>("[data-my-works-add]");
      focusTarget?.focus();
    });
  }

  async function chooseCover(file: File | undefined) {
    if (!file) return;
    const version = ++selectionVersion.current;
    releaseUrl(draftUrl.current);
    draftUrl.current = null;
    setCover(null);
    setCheckingCover(false);
    const validationError = validateWorkCover(file);
    setError(validationError ?? "");
    if (validationError) return;

    const url = URL.createObjectURL(file);
    urls.current.add(url);
    draftUrl.current = url;
    setCheckingCover(true);
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (version !== selectionVersion.current) { releaseUrl(url); return; }
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Unreadable image");
      setCover({ url, name: file.name, file });
    } catch {
      releaseUrl(url);
      if (version === selectionVersion.current) {
        draftUrl.current = null;
        setError("This image could not be opened. Choose another JPG, PNG, WebP, or GIF.");
      }
    } finally {
      if (version === selectionVersion.current) setCheckingCover(false);
    }
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cover || !cover.file || checkingCover || saving) { setError("Choose a cover image before adding your project."); return; }
    const result = validateWorkDetails({ title, category, description });
    if (!result.ok) { setError(result.error); return; }
    const projectId = crypto.randomUUID();

    if (localPreview) {
      const work = { ...result.details, id: projectId, cover, revision: 0 };
      setWorks((current) => [work, ...current]);
      // Transfer the draft URL to the card before resetting the form.
      draftUrl.current = null;
      setStatus(`“${work.title}” added to this tab. It has not been uploaded or published.`);
      closeForm();
      return;
    }

    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.set("projectId", projectId);
      body.set("mutationId", crypto.randomUUID());
      body.set("title", result.details.title);
      body.set("category", result.details.category);
      body.set("description", result.details.description);
      body.set("draft", "{}");
      body.set("progress", "{}");
      body.set("cover", cover.file);
      const response = await fetch("/api/eais/projects", { method: "POST", body });
      const payload = await response.json().catch(() => null) as { project?: SavedProject; error?: string } | null;
      if (!response.ok || !payload?.project) throw new Error(payload?.error || "The project could not be saved.");
      releaseUrl(cover.url);
      draftUrl.current = null;
      const work = savedProjectToWork(payload.project);
      setWorks((current) => [work, ...current.filter((candidate) => candidate.id !== work.id)]);
      setStatus(`“${work.title}” saved privately to your account.`);
      closeForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The project could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProject(work: LocalWork) {
    if (localPreview) {
      releaseUrl(work.cover.url);
      setWorks((current) => current.filter((item) => item.id !== work.id));
      setStatus(`“${work.title}” removed from this tab.`);
      return;
    }

    setStatus(`Removing “${work.title}”…`);
    try {
      const response = await fetch(`/api/eais/projects/${encodeURIComponent(work.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutationId: crypto.randomUUID(), expectedRevision: work.revision })
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The project could not be removed.");
      setWorks((current) => current.filter((item) => item.id !== work.id));
      setStatus(`“${work.title}” removed from your private workspace.`);
    } catch (removeError) {
      setStatus(removeError instanceof Error ? removeError.message : "The project could not be removed.");
    }
  }

  return (
    <div data-my-works-page className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Account navigation">
          <Link href="/account">Account</Link><span aria-hidden="true">/</span><span aria-current="page">My Works</span>
          <Link className={styles.exploreLink} href="/agentech-products/eais">Explore EAIS <span aria-hidden="true">↗</span></Link>
        </nav>

        <header className={styles.header}>
          <div><p className={styles.eyebrow}>YOUR PERSONAL PROJECT SPACE</p><h1>My Works</h1><p className={styles.intro}>A home for the things you’ve built.</p></div>
          <button data-my-works-add className={styles.primaryAction} type="button" onClick={(event) => openForm(event.currentTarget)} aria-haspopup="dialog"><span aria-hidden="true">+</span> Add a project</button>
        </header>

        <aside className={styles.prototypeNote} aria-label="Prototype information">
          <span className={styles.noteMark} aria-hidden="true">i</span>
          <div><strong>{localPreview ? "Local development preview" : "Private project workspace"}<span className={styles.noteDivider}>·</span>{localPreview ? "Current tab only" : "Saved to your account"}</strong><p>{localPreview ? "Images and project details stay in this page’s memory. Nothing is uploaded, saved to your account, or published to EAIS. Refreshing or leaving this page clears them." : "Saved privately to your account. Your projects return when you sign in again and are never added to the public EAIS showcase automatically."}</p></div>
        </aside>

        <section aria-labelledby="my-projects-heading">
          <div className={styles.sectionHeader}><div><h2 id="my-projects-heading">Your projects <span data-my-works-count>{works.length}</span></h2><p>Your finished robot projects, collected in one place.</p></div><span className={styles.privateLabel}>Personal workspace</span></div>
          <p data-my-works-status className={styles.status} role="status">{status}</p>
          {works.length === 0 ? (
            <div data-my-works-empty className={styles.emptyState}>
              <div className={styles.emptyArtwork}><span /><span /><div><PictureIcon plus /></div></div>
              <p className={styles.eyebrow}>START WITH SOMETHING YOU MADE</p>
              <h3>Your next chapter starts here.</h3>
              <p>Bring a finished robot project into view.<br />Choose a cover, give it a name, and tell its story.</p>
              <button type="button" className={styles.primaryAction} onClick={(event) => openForm(event.currentTarget)} aria-haspopup="dialog">Add your first project <span aria-hidden="true">↗</span></button>
              <small>{localPreview ? "No projects added in this tab yet." : "No private projects saved yet."}</small>
            </div>
          ) : (
            <div data-my-works-grid className={styles.workGrid}>
              {works.map((work) => <article data-my-works-card key={work.id} className={styles.workCard}>
                <button className={styles.coverButton} type="button" onClick={(event) => { trigger.current = event.currentTarget; setSelectedWork(work); }} aria-label={`View ${work.title}`} aria-haspopup="dialog">
                  {/* A browser-only blob URL cannot be served through the image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={work.cover.url} alt={`Cover of ${work.title}`} />
                  <span className={styles.localBadge}>{localPreview ? "Local preview" : "Private"}</span>
                </button>
                <div className={styles.cardCopy}><p className={styles.eyebrow}>{work.category}</p><h3>{work.title}</h3><p className={styles.cardDescription}>{work.description || "A finished project, ready for its story."}</p><div className={styles.cardActions}><button type="button" onClick={(event) => { trigger.current = event.currentTarget; setSelectedWork(work); }} aria-haspopup="dialog">View project <span aria-hidden="true">↗</span></button><button type="button" onClick={() => void removeProject(work)} aria-label={`Remove ${work.title}`}>Remove</button></div></div>
              </article>)}
            </div>
          )}
        </section>

        <dialog ref={formDialog} data-my-works-form className={styles.dialog} aria-labelledby="add-project-title" aria-describedby="add-project-note" onClose={closeForm}>
          <form onSubmit={addProject} className={styles.form}>
            <div className={styles.dialogHeader}><div><p className={styles.eyebrow}>MY WORKS</p><h2 id="add-project-title">Add a project</h2></div><button type="button" className={styles.closeButton} aria-label="Close project form" onClick={() => formDialog.current?.close()}>×</button></div>
            <p id="add-project-note" className={styles.formIntro}>{localPreview ? "Preview a finished project in this tab. No files are uploaded." : "Save a finished project privately to your account. It will not be published to EAIS."}</p>
            <label className={styles.fieldLabel} htmlFor="project-cover">Cover image <span>Required</span></label>
            <div className={styles.coverPicker}>
              {cover ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={cover.url} alt="Selected cover preview" /></> : <div className={styles.coverPlaceholder}><PictureIcon /><strong>{checkingCover ? "Opening image…" : "Let your work make the first impression."}</strong><span>JPG, PNG, WebP, or GIF · Up to 10 MB</span></div>}
              <input ref={fileInput} id="project-cover" type="file" accept={workCoverAccept} aria-describedby="cover-help" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void chooseCover(file); }} />
              <label htmlFor="project-cover" className={styles.chooseImage}>{cover ? "Change image" : "Choose image"}</label>
            </div>
            <p id="cover-help" className={styles.coverHelp}>{cover ? cover.name : localPreview ? "Choose an image from your device. It stays in this tab." : "Choose an image from your device. It will be stored privately with this project."}</p>
            <div className={styles.formFields}>
              <label className={styles.fieldLabel} htmlFor="project-title">Project title <span>Required</span><input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What did you build?" required maxLength={80} /></label>
              <label className={styles.fieldLabel} htmlFor="project-category">Robot category<select id="project-category" value={category} onChange={(event) => setCategory(event.target.value as WorkCategory)}>{workCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            <label className={styles.fieldLabel} htmlFor="project-description">The project story <span>Optional</span><textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does it do, and what did you learn making it?" maxLength={600} rows={3} /></label>
            <p className={styles.characterCount}>{description.length}/600</p>
            {error ? <p data-my-works-error className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.formFooter}><button type="button" className={styles.secondaryAction} onClick={() => formDialog.current?.close()} disabled={saving}>Cancel</button><button type="submit" className={styles.primaryAction} disabled={checkingCover || saving}>{saving ? "Saving…" : localPreview ? "Add to this tab" : "Save privately"} <span aria-hidden="true">↗</span></button></div>
          </form>
        </dialog>

        <dialog ref={viewDialog} data-my-works-view className={`${styles.dialog} ${styles.viewDialog}`} aria-labelledby="view-project-title" onClose={() => { setSelectedWork(null); requestAnimationFrame(() => trigger.current?.focus()); }}>
          {selectedWork ? <><div className={styles.dialogHeader}><p className={styles.eyebrow}>{selectedWork.category} · {localPreview ? "LOCAL PREVIEW" : "PRIVATE PROJECT"}</p><button type="button" className={styles.closeButton} aria-label="Close project preview" onClick={() => viewDialog.current?.close()}>×</button></div>{/* eslint-disable-next-line @next/next/no-img-element */}<img className={styles.viewImage} src={selectedWork.cover.url} alt={`Cover of ${selectedWork.title}`} /><div className={styles.viewCopy}><h2 id="view-project-title">{selectedWork.title}</h2><p>{selectedWork.description || "No project story added yet."}</p><small>{localPreview ? "Only in this tab. Not uploaded or published." : "Saved privately to your account. Not published to EAIS."}</small></div></> : null}
        </dialog>
      </div>
    </div>
  );
}
