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
import { loader } from "../containers/serveStorage.route";

describe("serveStorage.route loader", () => {
  beforeEach(async () => {
    await clearDocumentDB();
  });

  const makeArgs = (splat: string, cookieHeader: string) =>
    ({
      request: new Request(`http://localhost/storage/${splat}`, {
        headers: { cookie: cookieHeader },
      }),
      params: { "*": splat },
    }) as any;

  it("serves the file for a project the user can view", async () => {
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
    const splat = `${project._id}/preAnalysis/${sessionId}/session.json`;
    const buffer = Buffer.from(
      JSON.stringify({
        transcript: [{ _id: "1", text: "Hello" }],
        leadRole: "Tutor",
      }),
    );

    const storage = getStorageAdapter();
    await storage.upload({
      file: { buffer, size: buffer.length, type: "application/json" },
      uploadPath: `storage/${splat}`,
    });

    try {
      const response = (await loader(
        makeArgs(splat, cookieHeader),
      )) as Response;

      expect(response.headers.get("content-type")).toBe("application/json");
      const body = await response.json();
      expect(body.leadRole).toBe("Tutor");
      expect(body.transcript).toHaveLength(1);
    } finally {
      await fse.remove(`storage/${project._id}`);
      await fse.remove(`tmp/storage/${project._id}`);
    }
  });

  it("rejects a path containing traversal sequences", async () => {
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
      loader(
        makeArgs(`${project._id}/../other-project/file.txt`, cookieHeader),
      ),
    ).rejects.toThrow(/invalid request path/i);
  });

  it("rejects a path containing double-encoded traversal sequences", async () => {
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
      loader(
        makeArgs(
          `${project._id}/%252e%252e/other-project/file.txt`,
          cookieHeader,
        ),
      ),
    ).rejects.toThrow(/invalid request path/i);
  });

  it("denies a user who cannot view the project", async () => {
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
      loader(
        makeArgs(`${project._id}/preAnalysis/session/file.json`, cookieHeader),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
