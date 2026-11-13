import * as engine from '@zachariahredfield/playbook-engine';
import { notesEmptyRule } from '../rules/verify/notesEmptyRule.js';
import { notesMissingRule } from '../rules/verify/notesMissingRule.js';
import { requireNotesOnChangesRule } from '../rules/verify/requireNotesOnChangesRule.js';
import { testsRequiredRule } from '../rules/verify/testsRequiredRule.js';
import { protectedDocGovernanceRule } from '../rules/verify/protectedDocGovernanceRule.js';
import { releaseVersionGovernanceRule } from '../rules/verify/releaseVersionGovernanceRule.js';
export const coreVerifyRules = [notesMissingRule, notesEmptyRule, requireNotesOnChangesRule, testsRequiredRule, protectedDocGovernanceRule, releaseVersionGovernanceRule];
// Each notice is printed once per process, to stderr only, so --json stdout stays byte-compatible.
const printedNotices = new Set();
const emitNotices = (notices) => {
    for (const notice of notices) {
        if (printedNotices.has(notice))
            continue;
        printedNotices.add(notice);
        console.error(`playbook: ${notice}`);
    }
};
const toVerifyRule = (rule) => ({
    id: rule.id,
    description: rule.description,
    check: ({ failure }) => (rule.matchesFailure ? Boolean(rule.matchesFailure(failure)) : failure.id === rule.id),
    policy: rule.policy,
    fix: rule.fix,
    explanation: rule.explanation,
    remediation: rule.remediation
});
const loadCatalog = async (cwd) => {
    try {
        const { config } = await Promise.resolve(engine.loadConfig(cwd));
        const catalog = engine.loadRuleCatalog(cwd, config);
        emitNotices(catalog.notices);
        return catalog;
    }
    catch (error) {
        emitNotices([`Plugin rules unavailable (${error instanceof Error ? error.message : String(error)}); using built-in rules only.`]);
        return undefined;
    }
};
/**
 * The one CLI entry to rule discovery. Everything is read through the engine rule catalog
 * (`engine.loadRuleCatalog`), the same path engine `verify`/`plan` execute. Plugin rules come first
 * (matching the previous precedence), then the CLI's built-in guidance rules. No other CLI module
 * may discover or import plugins.
 */
const loadRuleSources = async (cwd) => {
    const catalog = await loadCatalog(cwd);
    const pluginEntries = (catalog?.entries ?? []).filter((entry) => entry.source !== 'core');
    const guidance = [];
    const listing = [];
    const seen = new Set();
    const add = (rule, source) => {
        if (seen.has(rule.id))
            return;
        seen.add(rule.id);
        guidance.push(rule);
        listing.push({
            id: rule.id,
            description: rule.description,
            ...(rule.explanation ? { explanation: rule.explanation } : {}),
            source
        });
    };
    for (const entry of pluginEntries)
        add(toVerifyRule(entry.rule), entry.source);
    for (const rule of coreVerifyRules)
        add(rule, 'core');
    // Engine core rules without CLI guidance are listed, but never used to explain failures.
    for (const entry of catalog?.entries ?? []) {
        if (entry.source !== 'core' || seen.has(entry.rule.id))
            continue;
        seen.add(entry.rule.id);
        listing.push({
            id: entry.rule.id,
            description: entry.rule.description,
            ...(entry.rule.explanation ? { explanation: entry.rule.explanation } : {}),
            source: 'core'
        });
    }
    return { guidance, listing };
};
/** Rules used to explain, gate (policy) and fix reported verify failures. */
export const loadVerifyRules = async (cwd) => (await loadRuleSources(cwd)).guidance;
/** Every verify rule known to the engine and the CLI, tagged with where it came from. */
export const loadRuleListing = async (cwd) => (await loadRuleSources(cwd)).listing;
//# sourceMappingURL=loadVerifyRules.js.map