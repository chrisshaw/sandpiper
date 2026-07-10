// Not a storage adapter — loaded via the same app/adapters.js auto-import as
// ../llmProviders (see that file for how the hook works).
//
// Locally there is no GitHub OAuth app, so this re-registers the "github"
// strategy name on upstream's authenticator with a local strategy that signs
// in a dev super admin. remix-auth's Authenticator stores strategies in a
// name-keyed map, so the later use() call wins; importing the authenticator
// first guarantees upstream's registrations already ran. Guards: app:prod
// leaves NODE_ENV unset (real deployments must set NODE_ENV=production), and
// configuring a real GITHUB_CLIENT_ID disables the bypass so actual OAuth can
// still be exercised locally.
import { authenticator } from "~/modules/authentication/authentication.server";
import LocalDevStrategy from "./localDevStrategy";

if (process.env.NODE_ENV !== "production" && !process.env.GITHUB_CLIENT_ID) {
  authenticator.use(new LocalDevStrategy(), "github");
}
