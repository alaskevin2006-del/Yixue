import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api } from "../api/client";
import { fileAccessUrl } from "../api/fileLinks";

export function DownloadButton({
  resourceId,
  fileId,
}: {
  resourceId: string;
  fileId: string;
}) {
  const download = useMutation({
    async mutationFn() {
      const file = await api.downloadFile(fileId, resourceId);
      const link = document.createElement("a");
      link.href = fileAccessUrl(file.url);
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
    },
  });

  return (
    <div className="download-action">
      <button
        type="button"
        className="button"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        <Download size={17} aria-hidden="true" />
        {download.isPending ? "准备下载…" : "下载"}
      </button>
      {download.isError && (
        <p role="alert" className="error-text">
          {download.error.message}
        </p>
      )}
    </div>
  );
}
