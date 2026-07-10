#!/usr/bin/env node
/**
 * Local billing bootstrap.
 *
 * Sandpiper's billing system assumes a hosted deployment: a default BillingPlan
 * row exists (seeded by migrations), every team is assigned one, and credits are
 * metered because UPchieve fronts the LLM bill. A local or self-hosted install
 * has none of that, and the app fails in two places:
 *
 *   1. estimateCost throws "No billing plan found" with no plan assigned, which
 *      blocks run creation entirely.
 *   2. Once a team's credits reach zero, LLM.checkBalance throws
 *      InsufficientCreditsError before every model call.
 *
 * When you point Sandpiper at your own LLM account you already pay the provider
 * directly, so there is nothing to meter. This grants each team a markup-free
 * plan and a credit balance large enough that enforcement never fires, while
 * leaving spend tracking intact — a markupRate of 1 means the recorded cost
 * equals what your provider actually charges you.
 *
 * Idempotent. Re-run any time to top credits back up.
 *
 *   node localMode/bin/quickstart.js        # runs this, then starts everything
 *   node_modules/.bin/tsx -r dotenv/config localMode/seedBilling.ts
 */
// Deliberately avoids the TeamBillingService facade: importing it pulls in the
// queue module, which opens a Redis connection and logs a scary "[queues] Redis
// error" here, since this runs before Redis is up.
import { initializeDatabase } from "../app/lib/database";
import { BillingPlanService } from "../app/modules/billing/billingPlan";
import applyBillingCredit from "../app/modules/billing/services/applyBillingCredit.server";
import { TeamBillingBalanceService } from "../app/modules/billing/teamBillingBalance";
import { TeamBillingPlanService } from "../app/modules/billing/teamBillingPlan";
import { TeamService } from "../app/modules/teams/team";
import { UserService } from "../app/modules/users/user";

const PLAN_NAME = "Local development (no markup)";

// Far above any plausible local spend, so `balance <= 0` never trips.
const TARGET_CREDITS = 1_000_000;

async function ensureDefaultPlan() {
  const existing = await BillingPlanService.findDefault();

  if (!existing) {
    const plan = await BillingPlanService.create({
      name: PLAN_NAME,
      markupRate: 1,
      isDefault: true,
    });
    console.log(
      `✓ Created default billing plan "${plan.name}" (markupRate: 1)`,
    );
    return plan;
  }

  if (existing.markupRate !== 1) {
    console.warn(
      `! Default plan "${existing.name}" has markupRate ${existing.markupRate}. ` +
        `Reported spend will be ${existing.markupRate}x what your provider charges.`,
    );
  } else {
    console.log(`✓ Default billing plan "${existing.name}" already present`);
  }

  return existing;
}

async function grantCredits(teamId: string, addedBy: string) {
  const billingBalance = await TeamBillingBalanceService.findByTeam(teamId);
  const balance = billingBalance?.availableBalance ?? 0;

  if (balance >= TARGET_CREDITS) {
    console.log(`  · team ${teamId} already holds ${balance} credits`);
    return;
  }

  const amount = TARGET_CREDITS - balance;
  await applyBillingCredit({
    teamId,
    amount,
    addedBy,
    note: "Local development credits",
    source: "local-dev",
    idempotencyKey: `local-dev-topup:${teamId}:${amount.toFixed(6)}`,
  });
  console.log(`  · topped team ${teamId} up to ${TARGET_CREDITS} credits`);
}

async function main() {
  await initializeDatabase();

  const plan = await ensureDefaultPlan();

  const teamIds = await TeamService.findAllIds();
  if (teamIds.length === 0) {
    console.log(
      "\nNo teams yet. Sign in once to create your workspace, then re-run to grant credits.",
    );
    return;
  }

  const [superAdmin] = await UserService.find({
    match: { role: "SUPER_ADMIN" },
  });
  if (!superAdmin) {
    console.warn("! No SUPER_ADMIN user found; skipping credit top-up.");
    return;
  }

  console.log(`\nBootstrapping ${teamIds.length} team(s):`);
  for (const teamId of teamIds) {
    if (!(await TeamBillingPlanService.getEffectivePlan(teamId))) {
      await TeamBillingPlanService.assignPlan(teamId, plan._id);
      await TeamBillingBalanceService.ensureInitialized(teamId, 0);
      console.log(`  · assigned "${plan.name}" to team ${teamId}`);
    }
    await grantCredits(teamId, superAdmin._id);
  }

  console.log("\n✓ Local billing ready.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Local billing bootstrap failed:", error);
    process.exit(1);
  });
