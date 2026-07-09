import { redirect } from "react-router";
import { FeatureFlagService } from "~/modules/featureFlags/featureFlag";
import { UserService } from "~/modules/users/user";
import sessionStorage from "../../../../sessionStorage";
import setupNewUser from "../services/setupNewUser.server";
import type { Route } from "./+types/devLogin.route";

// Local-only login bypass. Production uses GitHub OAuth (see githubStrategy);
// this route lets you sign in without an OAuth app while developing.
const DEV_EMAIL = "dev@localhost";

// Flags gated in the UI. Every dev login also picks up any flags created in
// the DB, so the local super admin always sees every gated feature.
const KNOWN_FLAGS = ["HAS_ADJUDICATION", "HAS_CODEBOOKS", "HAS_PROMPT_LIBRARY"];

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.NODE_ENV === "production") {
    throw redirect("/");
  }

  let user = await UserService.findOne({ email: DEV_EMAIL });

  if (!user) {
    user = await UserService.create({
      username: "dev",
      name: "Local Dev",
      email: DEV_EMAIL,
      role: "SUPER_ADMIN",
      isRegistered: true,
      registeredAt: new Date(),
      institution: "Local",
      userRole: "Researcher",
      useCases: ["Other"],
      termsAcceptedAt: new Date(),
      onboardingComplete: true,
    });
    await setupNewUser(user._id, "Local Dev's Workspace");
    user = (await UserService.findById(user._id))!;
  }

  const dbFlags = (await FeatureFlagService.find()).map((f) => f.name);
  const allFlags = [...new Set([...KNOWN_FLAGS, ...dbFlags])];
  user = (await UserService.updateById(user._id, { featureFlags: allFlags }))!;

  const session = await sessionStorage.getSession(
    request.headers.get("cookie"),
  );
  session.set("user", user);

  return redirect("/", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}
