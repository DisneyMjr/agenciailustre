import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export async function openPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loading = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    cMapUrl: "/pdf-resources/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdf-resources/standard_fonts/",
    wasmUrl: "/pdf-resources/wasm/",
    iccUrl: "/pdf-resources/iccs/",
    useWasm: false,
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  if (pdf.numPages > 20) {
    await loading.destroy();
    throw Error("Use um PDF de até 20 páginas.");
  }
  return Object.assign(pdf, { destroy: () => loading.destroy() });
}
export const bytesFrom64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export function bytesTo64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export async function sha(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function downloadFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export type Evidence = {
  document: { id: string; title: string; pdf_sha256: string };
  manifest: Record<string, string | number | null>;
  manifest_json: string;
  manifest_sha256: string;
  pdf: string;
  drawing: string | null;
  events: unknown[];
};
/** A visual copy plus receipt, with preserved source and manifest attached. No PAdES claim. */
export async function receiptPdf(e: Evidence) {
  const source = bytesFrom64(e.pdf);
  if (
    (await sha(source)) !== e.document.pdf_sha256 ||
    (await sha(new TextEncoder().encode(e.manifest_json))) !== e.manifest_sha256
  )
    throw Error("A integridade dos arquivos não confere.");
  const { PDFDocument } = await import("pdf-lib"),
    result = await PDFDocument.create(),
    pdf = await openPdf(source);
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i),
        natural = p.getViewport({ scale: 1 }),
        viewport = p.getViewport({
          scale: Math.min(1.6, 1600 / natural.width),
        }),
        canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await p.render({ canvas, viewport }).promise;
      const image = await result.embedJpg(canvas.toDataURL("image/jpeg", 0.9));
      result.addPage([natural.width, natural.height]).drawImage(image, {
        x: 0,
        y: 0,
        width: natural.width,
        height: natural.height,
      });
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await pdf.destroy();
  }
  let canvas = document.createElement("canvas");
  canvas.width = 1190;
  canvas.height = 1684;
  let ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1190, 1684);
  ctx.fillStyle = "#29113e";
  ctx.fillRect(0, 0, 1190, 170);
  ctx.fillStyle = "#ead8ff";
  ctx.font = "bold 45px sans-serif";
  ctx.fillText("Ilustre · Comprovante de assinatura", 70, 85);
  ctx.font = "23px sans-serif";
  ctx.fillText("Assinatura eletrônica por conta e senha do portal", 70, 132);
  let y = 225;
  const receiptPages: HTMLCanvasElement[] = [];
  const nextReceiptPage = () => {
    receiptPages.push(canvas);
    canvas = document.createElement("canvas");
    canvas.width = 1190;
    canvas.height = 1684;
    ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1190, 1684);
    y = 100;
  };
  const line = (text: string, size = 25, color = "#29113e") => {
    const write = (row: string) => {
      if (y > 1530) nextReceiptPage();
      ctx.font = `${size}px sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(row, 70, y, 1030);
      y += 35;
    };
    ctx.font = `${size}px sans-serif`;
    let row = "";
    for (const word of text.split(/\s+/)) {
      if (ctx.measureText(row + word).width > 1030 && row) {
        write(row);
        row = "";
      }
      row += word + " ";
    }
    if (row) write(row);
  };
  const m = e.manifest;
  line("Documento: " + e.document.title, 29);
  y += 12;
  line("Identificador: " + e.document.id, 23);
  line("Assinante declarado: " + m.signer_name);
  line("Conta: " + m.account_name);
  line("E-mail da conta: " + m.signer_email);
  line("Data registrada pelo servidor (UTC): " + m.signed_at, 23);
  line("Confirmação: senha da conta no portal.");
  line(
    "Forma de assinatura: " +
      (m.method === "drawn" ? "desenhada" : "nome digitado"),
  );
  y += 18;
  if (y > 1300) nextReceiptPage();
  if (e.drawing) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Error("Imagem da assinatura inválida."));
      img.src = "data:image/png;base64," + e.drawing;
    });
    ctx.drawImage(image, 70, y, 650, 166);
    y += 185;
  } else {
    ctx.font = "italic 48px Georgia,serif";
    ctx.fillStyle = "#4b266d";
    ctx.fillText(String(m.signer_name).slice(0, 70), 70, y, 1030);
    y += 65;
  }
  if (y > 1400) nextReceiptPage();
  line("SHA-256 do PDF original:", 23);
  ctx.font = "19px monospace";
  ctx.fillText(e.document.pdf_sha256, 70, y, 1030);
  y += 50;
  line("SHA-256 do registro da assinatura:", 23);
  ctx.font = "19px monospace";
  ctx.fillText(e.manifest_sha256, 70, y, 1030);
  y += 55;
  line(String(m.consent), 22);
  y += 16;
  line(
    "Este comprovante não utiliza certificado ICP-Brasil, selo PAdES ou carimbo de tempo de autoridade independente.",
    22,
    "#684a7b",
  );
  line(
    "A cópia visual pode diferir em tamanho e hash do original. O PDF original e o registro JSON estão anexados a este arquivo. Confira a integridade pelo portal da Ilustre.",
    22,
    "#684a7b",
  );
  receiptPages.push(canvas);
  for (const c of receiptPages) {
    const image = await result.embedPng(c.toDataURL("image/png"));
    result
      .addPage([595, 842])
      .drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  }
  await result.attach(source, "original-preservado.pdf", {
    mimeType: "application/pdf",
    description: "PDF original preservado; confira seu SHA-256 no comprovante.",
  });
  await result.attach(
    new TextEncoder().encode(JSON.stringify(e, null, 2)),
    "comprovante.json",
    {
      mimeType: "application/json",
      description: "Registro eletrônico e arquivos originais para conferência.",
    },
  );
  result.setTitle(e.document.title + " · comprovante");
  result.setProducer("Agência Ilustre · assinatura eletrônica sem certificado");
  return result.save();
}
