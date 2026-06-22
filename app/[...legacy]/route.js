import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const EXPOSED_PREFIXES = ["css/", "js/", "pages/"];
const EXPOSED_FILES = new Set(["index.html", "landing.html", "test.html", "test-crud.js"]);

function getSafeRelativePath(segments) {
  const relativePath = segments.join("/");
  const normalized = path.posix.normalize(relativePath);
  if (normalized.startsWith("..") || normalized.includes("../")) return null;
  return normalized;
}

function isExposedPath(relativePath) {
  if (EXPOSED_FILES.has(relativePath)) return true;
  return EXPOSED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function injectRuntimeEnv(html) {
  const envScript = `<script>window.__ENV__=${JSON.stringify({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
  })};</script>`;
  return html.includes("</head>") ? html.replace("</head>", `${envScript}</head>`) : `${envScript}${html}`;
}

export async function GET(_request, context) {
  const { legacy: segments = [] } = await context.params;
  const relativePath = getSafeRelativePath(segments);

  if (!relativePath || !isExposedPath(relativePath)) {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = path.join(projectRoot, relativePath);
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    const fileBuffer = await fs.readFile(filePath);

    if (ext === ".html") {
      const html = injectRuntimeEnv(fileBuffer.toString("utf-8"));
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": mimeType, "Cache-Control": "no-store" },
      });
    }

    return new Response(fileBuffer, {
      status: 200,
      headers: { "Content-Type": mimeType, "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
