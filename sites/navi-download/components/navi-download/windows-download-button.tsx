"use client";

import { useState } from "react";

import releases from "./releases.json";

function WindowsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 3h9v9H2zm11 0h9v9h-9zM2 14h9v9H2zm11 0h9v9h-9z" transform="translate(0 -1)" />
    </svg>
  );
}

function DownloadArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 4v15m-6-6 6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WindowsDownloadButton({
  buttonClassName,
  labelClassName,
  source = false,
}: {
  buttonClassName: string;
  labelClassName: string;
  source?: boolean;
}) {
  const release = source ? releases.source : releases.windows;
  const filename = release.filename;
  const partUrls = release.parts;
  const statusId = source ? "source-download-status" : "windows-download-status";
  const [status, setStatus] = useState("Available now");
  const [downloading, setDownloading] = useState(false);

  async function downloadInstaller() {
    setDownloading(true);
    setStatus("Preparing download…");

    try {
      const parts = await Promise.all(
        partUrls.map(async (url) => {
          const downloadUrl = window.location.hostname === "www.agent-tech.ai"
            ? url.replace("/downloads/", "/download/app-files/")
            : url;
          const response = await fetch(downloadUrl);
          if (!response.ok) throw new Error(`Download part failed: ${response.status}`);
          return response.arrayBuffer();
        }),
      );
      const blob = new Blob(parts, { type: source ? "application/zip" : "application/vnd.microsoft.portable-executable" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setStatus("Download started");
    } catch {
      setStatus("Download failed · Try again");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button type="button" className={buttonClassName} onClick={downloadInstaller} disabled={downloading} aria-describedby={statusId}>
        <span aria-hidden="true">{source ? <DownloadArrow /> : <WindowsIcon />}</span><span>{downloading ? "Preparing download" : source ? "Download source ZIP · v9.14" : "Download for Windows"}</span><DownloadArrow />
      </button>
      <span className={labelClassName} id={statusId} aria-live="polite">
        {source ? "Source + README" : "Windows"} <span aria-hidden="true">·</span> {status}
      </span>
    </>
  );
}
