import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commandMetadata, getCommandMetadata } from './commandMetadata.js';

type CommandTruthFile = {
  commandTruth: Array<{
    name: string;
    lifecycle: string;
    role: string;
    discoverability: string;
    canonicalSequence: number | null;
    productFacing: boolean;
  }>;
  canonicalCommands: string[];
  compatibilityCommands: string[];
  utilityCommands: string[];
  bootstrapLadder: string[];
  remediationLoop: string[];
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const commandTruth = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/contracts/command-truth.json'), 'utf8')) as CommandTruthFile;

const LIFECYCLES = ['canonical', 'compatibility', 'utility', 'planned-reference'];
const ROLES = ['bootstrap', 'repo-intelligence', 'governance', 'remediation', 'compatibility', 'utility'];
const DISCOVERABILITY = ['primary', 'secondary', 'hidden-compatibility'];

const namesWhere = (predicate: (command: (typeof commandMetadata)[number]) => boolean): string[] =>
  commandMetadata.filter(predicate).map((command) => command.name).sort();

describe('command metadata truth invariants', () => {
  it('declares a unique name and a known lifecycle, role, and discoverability for every command', () => {
    const names = commandMetadata.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);

    for (const command of commandMetadata) {
      expect(LIFECYCLES, `${command.name} lifecycle`).toContain(command.lifecycle);
      expect(ROLES, `${command.name} role`).toContain(command.role);
      expect(DISCOVERABILITY, `${command.name} discoverability`).toContain(command.discoverability);
    }
  });

  it('keeps canonicalSequence unique, starting at 1, and limited to primary canonical commands', () => {
    const sequenced = commandMetadata.filter((command) => command.canonicalSequence !== null);
    const sequences = sequenced.map((command) => command.canonicalSequence as number).sort((a, b) => a - b);

    expect(new Set(sequences).size).toBe(sequences.length);
    expect(sequences[0]).toBe(1);
    for (const command of sequenced) {
      expect(command.lifecycle, `${command.name} lifecycle`).toBe('canonical');
      expect(command.discoverability, `${command.name} discoverability`).toBe('primary');
    }
  });

  it('keeps compatibility commands hidden and out of the canonical sequence', () => {
    for (const command of commandMetadata.filter((entry) => entry.lifecycle === 'compatibility')) {
      expect(command.role, `${command.name} role`).toBe('compatibility');
      expect(command.discoverability, `${command.name} discoverability`).toBe('hidden-compatibility');
      expect(command.canonicalSequence, `${command.name} canonicalSequence`).toBeNull();
    }
  });

  it('orders the canonical bootstrap ladder and remediation loop by canonicalSequence', () => {
    const bySequence = commandMetadata
      .filter((command) => command.canonicalSequence !== null)
      .sort((a, b) => (a.canonicalSequence as number) - (b.canonicalSequence as number))
      .map((command) => command.name);

    expect(commandTruth.bootstrapLadder).toEqual(bySequence.slice(0, commandTruth.bootstrapLadder.length));
    expect(commandTruth.bootstrapLadder).toEqual(['ai-context', 'ai-contract', 'context']);
    expect(commandTruth.remediationLoop).toEqual(['verify', 'plan', 'apply', 'verify']);
    for (const name of ['verify', 'plan', 'apply']) {
      expect(bySequence, `${name} sequence`).toContain(name);
    }
    expect(bySequence.indexOf('verify')).toBeLessThan(bySequence.indexOf('plan'));
    expect(bySequence.indexOf('plan')).toBeLessThan(bySequence.indexOf('apply'));
  });

  it('matches the committed docs/contracts/command-truth.json snapshot to command metadata', () => {
    expect(commandTruth.commandTruth.map((command) => command.name).sort()).toEqual(commandMetadata.map((command) => command.name).sort());

    for (const entry of commandTruth.commandTruth) {
      const source = getCommandMetadata(entry.name);
      expect(source, `${entry.name} exists in commandMetadata`).toBeDefined();
      expect(entry).toMatchObject({
        lifecycle: source?.lifecycle,
        role: source?.role,
        discoverability: source?.discoverability,
        canonicalSequence: source?.canonicalSequence,
        productFacing: source?.productFacing
      });
    }

    expect([...commandTruth.canonicalCommands].sort()).toEqual(namesWhere((command) => command.lifecycle === 'canonical'));
    expect([...commandTruth.compatibilityCommands].sort()).toEqual(namesWhere((command) => command.lifecycle === 'compatibility'));
    expect([...commandTruth.utilityCommands].sort()).toEqual(namesWhere((command) => command.lifecycle === 'utility'));
  });

  it('keeps the product-truth packaging commands live and canonical', () => {
    for (const name of ['ai-context', 'ai-contract', 'context', 'ask', 'docs']) {
      const command = getCommandMetadata(name);
      expect(command, `${name} metadata`).toBeDefined();
      expect(command?.lifecycle, `${name} lifecycle`).toBe('canonical');
      expect(command?.productFacing, `${name} productFacing`).toBe(true);
      expect(commandTruth.canonicalCommands, `${name} in canonicalCommands`).toContain(name);
    }
  });
});
