import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { fileAccessUrl } from "../api/fileLinks";
import { DownloadButton } from "../components/DownloadButton";
import { PdfReader } from "../components/PdfReader";
import { Message } from "../components/ui";

export default function ResourcePreview() {
  const { id = "", fileId = "" } = useParams();
  return <Preview key={`${id}/${fileId}`} id={id} fileId={fileId} />;
}

function Preview({ id, fileId }: { id: string; fileId: string }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const refreshed = useRef(false);
  const {
    data,
    dataUpdatedAt,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["preview", id, fileId],
    queryFn: async ({ signal }) => {
      const access = await api.previewFile(fileId, id, signal);
      return { ...access, url: fileAccessUrl(access.url) };
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const handleLoadError = useCallback(
    (cause: unknown) => {
      const status = (cause as { status?: number } | null)?.status;
      const possiblyExpired =
        status === 401 ||
        status === 403 ||
        status === 410 ||
        (data && Date.parse(data.expires_at) <= Date.now());
      if (possiblyExpired && !refreshed.current) {
        refreshed.current = true;
        void refetch();
      } else setLoadFailed(true);
    },
    [data, refetch],
  );

  function retry() {
    refreshed.current = false;
    setLoadFailed(false);
    void refetch();
  }

  let preview;
  if (isPending || isFetching) preview = <Message title="正在获取预览…" busy />;
  else if (isError || loadFailed)
    preview = (
      <Message
        title={isError ? error.message : "暂时无法加载附件预览。"}
        action={
          <button type="button" className="button" onClick={retry}>
            重试
          </button>
        }
      />
    );
  else if (data.content_type === "application/pdf")
    preview = (
      <PdfReader key={dataUpdatedAt} url={data.url} onError={handleLoadError} />
    );
  else if (data.content_type.startsWith("image/"))
    preview = (
      <img
        className="image-preview"
        src={data.url}
        alt={data.filename}
        onError={handleLoadError}
      />
    );
  else preview = <Message title="此格式可通过下载查看。" />;

  return (
    <article className="standard-page preview-page">
      <Link to={`/resources/${encodeURIComponent(id)}`} className="text-link">
        返回资料详情
      </Link>
      <div className="preview-header">
        <h1>{data?.filename ?? "附件预览"}</h1>
        {data && <DownloadButton resourceId={id} fileId={fileId} />}
      </div>
      {preview}
    </article>
  );
}
