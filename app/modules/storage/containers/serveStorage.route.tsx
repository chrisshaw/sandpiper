import fse from "fs-extra";
import requireAuth from "~/modules/authentication/helpers/requireAuth";
import ProjectAuthorization from "~/modules/projects/authorization";
import { ProjectService } from "~/modules/projects/project";
import getStorageAdapter from "../helpers/getStorageAdapter";
import type { Route } from "./+types/serveStorage.route";

// Fork-only route (see README.LOCAL.md). The LOCAL storage adapter's request()
// returns a relative "/storage/..." URL, but upstream has no route serving that
// path, so viewing a session 404s under LOCAL (S3 returns a presigned URL and
// never hits this). Serving the files here keeps upstream's storage.route and
// session viewer untouched. Validation and authorization mirror storage.route.

function extractProjectIdFromUrl(rawUrl: string): string {
  const decoded = decodeURIComponent(decodeURIComponent(rawUrl));
  const parts = decoded.split("/");

  if (parts[0] !== "storage" || !parts[1]) {
    throw new Error("Invalid request path");
  }

  if (parts.some((part) => part === ".." || part === ".")) {
    throw new Error("Invalid request path");
  }

  return parts[1];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireAuth({ request });

  const url = `storage/${params["*"]}`;
  const projectId = extractProjectIdFromUrl(url);

  const project = await ProjectService.findById(projectId);
  if (!project) {
    throw new Response("Not found", { status: 404 });
  }

  if (!ProjectAuthorization.canView(user, project)) {
    throw new Response("Forbidden", { status: 403 });
  }

  const storage = getStorageAdapter();
  const downloadedPath = await storage.download({ sourcePath: url });
  const buffer = await fse.readFile(downloadedPath);

  const contentType = url.endsWith(".json")
    ? "application/json"
    : "application/octet-stream";

  return new Response(buffer, { headers: { "content-type": contentType } });
}
