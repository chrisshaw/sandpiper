import fse from "fs-extra";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { ProjectService } from "~/modules/projects/project";
import getStorageAdapter from "~/modules/storage/helpers/getStorageAdapter";
import { TeamService } from "~/modules/teams/team";
import { UserService } from "~/modules/users/user";
import "~/storageAdapters/local";
import clearDocumentDB from "../../../../test/helpers/clearDocumentDB";
import loginUser from "../../../../test/helpers/loginUser";
import { action } from "../containers/storage.route";

describe("storage.route action - REQUEST_STORAGE", () => {
  beforeEach(async () => {
    await clearDocumentDB();
  });

  const makeRequest = (url: string, cookieHeader: string) =>
    new Request("http://localhost/api/storage", {
      method: "POST",
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({ intent: "REQUEST_STORAGE", payload: { url } }),
    });

  it("returns the file contents for a project the user can view", async () => {
    const team = await TeamService.create({ name: "Team" });
    const user = await UserService.create({
      username: "test_user",
      teams: [{ team: team._id, role: "ADMIN" }],
    });
    const project = await ProjectService.create({
      name: "Project",
      createdBy: user._id,
      team: team._id,
    });
    const cookieHeader = await loginUser(user._id);

    const sessionId = new Types.ObjectId();
    const url = `storage/${project._id}/preAnalysis/${sessionId}/session.json`;
    const buffer = Buffer.from(
      JSON.stringify({
        transcript: [{ _id: "1", text: "Hello" }],
        leadRole: "Tutor",
      }),
    );

    const storage = getStorageAdapter();
    await storage.upload({
      file: { buffer, size: buffer.length, type: "application/json" },
      uploadPath: url,
    });

    try {
      const result = (await action({
        request: makeRequest(url, cookieHeader),
      } as any)) as { file: { transcript: unknown[]; leadRole: string } };

      expect(result.file.leadRole).toBe("Tutor");
      expect(result.file.transcript).toHaveLength(1);
    } finally {
      await fse.remove(`storage/${project._id}`);
      await fse.remove(`tmp/storage/${project._id}`);
    }
  });

  it("rejects a URL containing double-encoded path traversal sequences", async () => {
    const team = await TeamService.create({ name: "Team" });
    const user = await UserService.create({
      username: "test_user",
      teams: [{ team: team._id, role: "ADMIN" }],
    });
    const project = await ProjectService.create({
      name: "Project",
      createdBy: user._id,
      team: team._id,
    });
    const cookieHeader = await loginUser(user._id);

    await expect(
      action({
        request: makeRequest(
          `storage/${project._id}/%252e%252e/other-project/file.txt`,
          cookieHeader,
        ),
      } as any),
    ).rejects.toThrow(/invalid request path/i);
  });

  it("rejects a URL containing path traversal sequences", async () => {
    const team = await TeamService.create({ name: "Team" });
    const user = await UserService.create({
      username: "test_user",
      teams: [{ team: team._id, role: "ADMIN" }],
    });
    const project = await ProjectService.create({
      name: "Project",
      createdBy: user._id,
      team: team._id,
    });
    const cookieHeader = await loginUser(user._id);

    await expect(
      action({
        request: makeRequest(
          `storage/${project._id}/../other-project/file.txt`,
          cookieHeader,
        ),
      } as any),
    ).rejects.toThrow(/invalid request path/i);
  });

  it("rejects a URL for a project the user cannot access", async () => {
    const team = await TeamService.create({ name: "Team" });
    const owner = await UserService.create({
      username: "owner",
      teams: [{ team: team._id, role: "ADMIN" }],
    });
    const project = await ProjectService.create({
      name: "Project",
      createdBy: owner._id,
      team: team._id,
    });

    const outsider = await UserService.create({
      username: "outsider",
      teams: [],
    });
    const cookieHeader = await loginUser(outsider._id);

    await expect(
      action({
        request: makeRequest(
          `storage/${project._id}/preAnalysis/session/file.txt`,
          cookieHeader,
        ),
      } as any),
    ).rejects.toThrow(/permission/i);
  });
});
