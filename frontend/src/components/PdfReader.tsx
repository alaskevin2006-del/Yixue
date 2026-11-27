import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { Message } from "./ui";

GlobalWorkerOptions.workerSrc = workerUrl;

function PdfPage({
  pdf,
  page,
  width,
  zoom,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  zoom: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element || width < 1) return;
    let active = true;
    let render: RenderTask | undefined;

    async function draw() {
      if (!element) return;
      const sheet = await pdf.getPage(page);
      if (!active) return;
      const originalWidth = sheet.getViewport({ scale: 1 }).width;
      const displayScale = (Math.min(width / originalWidth, 1.35) * zoom) / 100;
      const display = sheet.getViewport({ scale: displayScale });
      const density = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(12_000_000 / (display.width * display.height)),
      );
      const pixels = sheet.getViewport({ scale: displayScale * density });
      element.width = Math.max(1, Math.round(pixels.width));
      element.height = Math.max(1, Math.round(pixels.height));
      element.style.width = `${Math.round(display.width)}px`;
      element.style.height = `${Math.round(display.height)}px`;
      render = sheet.render({ canvas: element, viewport: pixels });
      await render.promise;
      if (active) setResult("ready");
    }

    void draw().catch(() => {
      if (active) setResult("error");
    });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, width, zoom]);

  return (
    <>
      {result === "loading" && <Message title="正在渲染页面…" busy />}
      {result === "error" && (
        <Message title="这一页暂时无法显示，可以切换到其他页或下载文件。" />
      )}
      <canvas
        ref={canvas}
        hidden={result !== "ready"}
        role="img"
        aria-label={`PDF 第 ${page} 页`}
      />
    </>
  );
}

export function PdfReader({
  url,
  onError,
}: {
  url: string;
  onError: (error: unknown) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(0);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const task = getDocument({ url, useWasm: false });
    void task.promise
      .then((document) => {
        if (active) setPdf(document);
      })
      .catch((error: unknown) => {
        if (active) onError(error);
      });
    return () => {
      active = false;
      void task.destroy().catch(() => undefined);
    };
  }, [url, onError]);

  useEffect(() => {
    const area = stage.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pdf-reader panel">
      {pdf && (
        <div className="pdf-controls" aria-label="PDF 阅读工具栏">
          <button
            type="button"
            className="button"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            上一页
          </button>
          <span role="status">
            第 {page} / {pdf.numPages} 页
          </span>
          <button
            type="button"
            className="button"
            disabled={page === pdf.numPages}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </button>
          <select
            className="field"
            aria-label="预览缩放"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            <option value={75}>75%</option>
            <option value={100}>适合宽度</option>
            <option value={125}>125%</option>
            <option value={150}>150%</option>
            <option value={200}>200%</option>
          </select>
        </div>
      )}
      <div className="pdf-stage" ref={stage}>
        {!pdf && <Message title="正在加载 PDF…" busy />}
        {pdf && width > 0 && (
          <PdfPage key={page} pdf={pdf} page={page} width={width} zoom={zoom} />
        )}
      </div>
    </div>
  );
}
