import { redirect } from "react-router";
import { Strategy } from "remix-auth/strategy";
import setupNewUser from "~/modules/authentication/services/setupNewUser.server";
import { FeatureFlagService } from "~/modules/featureFlags/featureFlag";
import { UserService } from "~/modules/users/user";
import type { User } from "~/modules/users/users.types";

// Local-only login bypass. Production uses GitHub OAuth (see githubStrategy);
// this strategy is registered OVER the "github" name (see ./index.ts) so the
// signup page's own "sign up with GitHub" button signs you in without an OAuth
// app while developing.
const DEV_EMAIL = "dev@localhost";

// Flags gated in the UI. Every dev login also picks up any flags created in
// the DB, so the local super admin always sees every gated feature.
const KNOWN_FLAGS = ["HAS_ADJUDICATION", "HAS_CODEBOOKS", "HAS_PROMPT_LIBRARY"];

async function findOrCreateDevUser(): Promise<User> {
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

  return user;
}

export default class LocalDevStrategy extends Strategy<User, never> {
  name = "local-dev";

  constructor() {
    super(async () => {
      throw new Error("LocalDevStrategy has no verify step");
    });
  }

  async authenticate(request: Request): Promise<User> {
    const url = new URL(request.url);

    // First leg: the signup page POSTs to the authentication action, where a
    // real strategy would redirect to the provider. Skip the provider and go
    // straight to upstream's callback route, which calls authenticate again,
    // commits the session, and honors returnTo/onboarding.
    if (!url.pathname.startsWith("/auth/callback")) {
      throw redirect("/auth/callback/github");
    }

    return findOrCreateDevUser();
  }
}
