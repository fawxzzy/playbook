export const generatedFilesInSyncRule = {
    id: 'generatedFilesInSync',
    description: 'Fail when a configured generator input changes but none of its generated outputs change.',
    check: ({ failure }) => failure.id === 'generatedFilesInSync',
    policy: {
        id: 'generatedFilesInSync',
        description: 'Require generated files to be regenerated and committed in the same change as their inputs.'
    },
    explanation: 'A committed generated file that was not regenerated after its inputs changed is stale: it no longer matches its source, and the next check that rebuilds it fails. This rule only suits generators whose output always changes when an input changes; otherwise an input edit that leaves the output identical fails for no reason.',
    remediation: [
        'Run the generator named in the fix (or the one that owns the listed outputs).',
        'Commit the regenerated output files in the same change as the input edit.'
    ]
};
//# sourceMappingURL=generatedFilesInSyncRule.js.map